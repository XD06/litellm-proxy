# 性能审查报告（只读审查，未改动任何代码）

> 审查日期：2026-07-21
> 审查范围：路由选择、格式转换、健康检测、前端刷新、数据保存/读取
> 审查方式：静态代码走查（read-only），关键结论已回到真实代码行核对
> 入口/主体：`sse2json.py`（HTTP 服务 + 三层健康线程）、`router.py`、`stream_adapters.py`、`history_store.py`、`dashboard_src/src/app.js`

---

## 一、总体结论

这是一个成熟度较高的项目：请求历史写入用异步队列、前端有 in-flight 防护 + 签名跳过 + morphdom 增量渲染、健康探测有 chunk-sleep 与 ProbeCoordinator 串行化保护、SQLite 用 WAL、list/timeseries 已消除 N+1 attempts 查询。**没有发现会直接“打挂”服务的致命 bug**（如死循环忙等、无界队列、热路径同步阻塞磁盘）。

但存在若干**在规模变大（provider/key 多、历史库大、并发高、多个 dashboard 常开）后会明显放大**的性能问题，集中在两条主线：

1. **锁竞争主线**：`router.py` 用单把 `threading.Lock` 同时服务“请求热路径选路”和“后台/管理端全量快照”，且快照被高频且重复地触发。
2. **重复计算/全量扫描主线**：多处“本可缓存/本可用 SQL 聚合”的逻辑，改为每次请求/每次轮询/每次启动做全量 Python 端遍历。

下面按严重程度给出清单，每条都标注了真实代码位置。

| 级别 | 数量 | 典型代表 |
|---|---|---|
| 严重（P1） | 3 | 启动全表扫描重建计数器；每 5s 轮询重复 2× 全量快照/聚合；审计日志每次写都全量读文件 |
| 中等（P2） | 8 | 选路热路径持锁做 SHA256+配置查询；每请求重建候选无缓存；默认逐 token flush；session 每次保存都 prune；写队列逐条提交；overlay 提交锁内重活；timeseries SELECT *；前端每轮深度序列化 |
| 轻微（P3） | 7 | 若干无界字典缓慢增长、重复 SHA256、前端 memo 无界、健康分双线程重复计算等 |

---

## 二、架构与数据流速览（便于定位）

```
Client ──HTTP──> sse2json.Handler
                    │ request_routes 分类 (chat/responses/anthropic)
                    ▼
                 router.iter_attempts()  ← 单把 threading.Lock
                    │ (provider+key 选择, 冷却, 兼容性熔断)
                    ▼
                 upstream_client (urllib3 流式/非流式)
                    ▼
       stream_adapters (6 个 SSE 转换器) / protocol_adapters (非流式)
                    ▼
       observability(内存计数+recent deque) → history_store(SQLite 异步写)

后台 daemon 线程：idle-health-checker / patrol-health-checker /
                 health-score-updater(15s) / router-state-saver(60s)
                 → 都会调用 router.snapshot() + provider_health_scores()

前端 dashboard：5s 轮询 /-/admin/metrics + provider-activity + health/scores
               + router/snapshot（每轮 4 个核心请求）
```

**关键交汇点**：`router._lock`（[router.py#L145](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L145)）既被请求线程的 `_select_key` 持有，又被 `snapshot()` 持有；而 `snapshot()` 被后台线程 + 前端轮询高频触发——这是本项目最主要的锁争用来源。

---

## 三、严重问题（P1）

### P1-1　启动时全表扫描 + Python 端逐行聚合重建计数器

- 位置：[history_store.py `rebuild_counters` L866-L943](file:///c:/Users/dsk/Desktop/litellm-proxy/history_store.py#L866-L943)，由 [observability.py `_restore_counters_from_history` L90-L103](file:///c:/Users/dsk/Desktop/litellm-proxy/observability.py#L90-L103) 在进程启动时调用。
- 问题：
  ```python
  requests = conn.execute("SELECT * FROM requests").fetchall()   # 全表、全列
  for row in requests: ...                                        # Python 端逐行累加
  attempts = conn.execute("SELECT * FROM attempts").fetchall()    # 全表、全列
  for row in attempts: ...                                        # Python 端逐行分组
  ```
  两次无条件 `SELECT *` 把**整个历史库**（默认保留 30 天，可达数万~数十万行）读进内存，再在 Python 端做计数/求和/分组。这些聚合完全可以用 SQL 的 `COUNT/SUM/GROUP BY` 在库内完成。
- 影响：启动耗时与内存峰值随历史规模**线性增长**；高流量库在冷启动/重启/热加载重建 observability 时会有明显停顿。
- 触发：每次进程启动（`observability.history.enabled=true` 时）。
- 严重原因：这是“全量、全列、Python 聚合”三重叠加，是全项目里最典型的可量化性能坑。

### P1-2　每 5s 轮询重复 2× 全量 `snapshot()` 与 2× 全量 `provider_activity_summary()`

- 位置（管理端各自独立重算）：
  - `/-/admin/router/snapshot` → [admin_routes.py L181-L185](file:///c:/Users/dsk/Desktop/litellm-proxy/admin_routes.py#L181-L185) → `ROUTER.snapshot()`
  - `/-/admin/provider-activity` → [admin_routes.py L238-L252](file:///c:/Users/dsk/Desktop/litellm-proxy/admin_routes.py#L238-L252) → `provider_activity_summary()`
  - `/-/admin/health/scores` → [admin_routes.py L263-L271](file:///c:/Users/dsk/Desktop/litellm-proxy/admin_routes.py#L263-L271) → **又一次** `ROUTER.snapshot()` + `provider_health_scores()`，而后者内部 [observability.py#L884](file:///c:/Users/dsk/Desktop/litellm-proxy/observability.py#L884) **再一次** 调用 `provider_activity_summary()`
- 前端轮询：[app.js `refreshRuntimeData` L1668-L1673](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L1668-L1673) 每 5s 并发拉取上述 4 个核心端点。
- 问题：**单次 5s 轮询周期内**，`ROUTER.snapshot()` 被算 2 次、`provider_activity_summary()`（复制并扫描最多 200 条 recent + 200 条 probe 事件）被算 2 次。`snapshot()` 每次都要 `with self._lock` 遍历全部 provider×key（[router.py#L648-L732](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L648-L732)），而这把锁正是请求选路 `_select_key` 用的同一把锁。
- 叠加：后台 `health-score-updater`（15s）+ `router-state-saver`（60s）也各自再算一遍（见 [sse2json.py#L393-L412](file:///c:/Users/dsk/Desktop/litellm-proxy/sse2json.py#L393-L412)）。
- 影响：provider/key 数量多 + 多个 dashboard 常开时，后台聚合与请求选路争用 `router._lock`，推高选路 P99 延迟；CPU 被重复聚合浪费一倍。
- 严重原因：这是“热路径锁 + 高频 + 冗余 2×”的组合，是并发下最容易被感知的抖动源。

### P1-3　审计日志每次写入都全量 `readlines()` 判断裁剪

- 位置：[audit_store.py `record` L36-L74](file:///c:/Users/dsk/Desktop/litellm-proxy/audit_store.py#L36-L74) → 每次 `record()` 末尾调 [`_prune_locked` L138-L156](file:///c:/Users/dsk/Desktop/litellm-proxy/audit_store.py#L138-L156)。
- 问题：
  ```python
  with open(self.path, "r", encoding="utf-8") as f:
      lines = f.readlines()          # 每次写入后都把整个审计文件读进内存
  if len(lines) <= self.max_records: # 仅为判断是否超限
      return
  ```
  `max_records` 上限可到 10000，意味着每一次管理操作都要把最多 1 万行 JSON 读进内存来判断“要不要裁剪”。`list()`（[L120-L136](file:///c:/Users/dsk/Desktop/litellm-proxy/audit_store.py#L120-L136)）也是每次全量 `readlines`，且每次 `record` 都 `open/close` 文件。
- 影响：审计文件越大，每次 admin 写越慢，O(N) I/O。
- 触发：每次管理员改配置/触发巡检等写操作。
- 严重原因：写放大随文件线性增长，且已内存维护了 `deque(maxlen)`，磁盘全读其实可避免（可按计数节流或追加行计数）。相较 P1-1/P1-2，因 admin 写频率较低，属“严重清单里偏轻”的一条。

---

## 四、中等问题（P2）

### 路由选择

**P2-1　`_select_key` 在全局锁内做 SHA-256 + 配置深查，且 trace 关闭时仍构建 safe_key**
- 位置：[router.py `_select_key` L1319-L1386](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L1319-L1386)。
- 问题：整段 key 循环在 `with self._lock` 内，循环体每次都：`_hash_key_short()`（SHA-256）+ `_mask_key()` 构建 `safe_key` 字典（L1349-1357，**无条件构建，即使 `routing_trace is None`**），并调用 `model_registry.key_supports_provider_model()`（内部还有一次 `key_fingerprint` SHA-256 + 多层 dict 查询，[model_registry.py#L877-L938](file:///c:/Users/dsk/Desktop/litellm-proxy/model_registry.py#L877-L938)）。这些纯 CPU 工作都发生在**全局锁内**，拉长持锁时间、加剧与 `snapshot()` 的争用。
- 影响：provider 多 key + 高并发时选路串行化。SHA-256 本身很快，主要成本是“持锁做本可锁外做的事”。

**P2-2　每请求重建候选列表，`resolve_provider_model_candidates` / `provider_supports_model` 无记忆化**
- 位置：[router.py `iter_attempts` L169-L340](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L169-L340)、[`_select_provider_items` L1066-L1153](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L1066-L1153)。
- 问题：每个请求都重新遍历所有 provider、判断 enabled、算 `provider_supports_model`、对每个 provider 调 `resolve_provider_model_candidates`（遍历 variants + 排序 + 扫描所有 key 的 model_map / 能力表，[model_registry.py#L778-L832](file:///c:/Users/dsk/Desktop/litellm-proxy/model_registry.py#L778-L832)）。这些结果只随“配置版本”变化，在两次配置变更之间对同一 `canonical_model` 完全相同，却每请求重算。
- 备注：代码里 `_provider_supports_with_cache` 已被改成直通（[L737-L748](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L737-L748) 注释“cache removed after benchmark”），说明曾尝试过缓存但因当时基准回退。可考虑按“配置 revision”做失效式缓存。

### 格式转换

**P2-3　默认 flush 策略导致逐 token 系统调用（latency/throughput 权衡）**
- 位置：策略 [sse2json.py `_stream_flush_policy` L2771-L2778](file:///c:/Users/dsk/Desktop/litellm-proxy/sse2json.py#L2771-L2778)（默认返回 `(0,0)`）；写出器 [stream_adapters.py `BufferedSSEWriter` L67-L102](file:///c:/Users/dsk/Desktop/litellm-proxy/stream_adapters.py#L67-L102)；转换器创建 `bwfile` 于 [sse2json.py#L4612-L4614](file:///c:/Users/dsk/Desktop/litellm-proxy/sse2json.py#L4612-L4614) 与 [#L4983-L4985](file:///c:/Users/dsk/Desktop/litellm-proxy/sse2json.py#L4983-L4985)。
- 已核实：转换器确实收到的是 `bwfile`（BufferedSSEWriter）。当配置未设 `stream_flush_interval_ms/stream_flush_bytes` 时 `_batch_mode=False`，于是每个 chunk 的 `write_chunk`（[L1963-L1972](file:///c:/Users/dsk/Desktop/litellm-proxy/stream_adapters.py#L1963-L1972)、[L2273-L2282](file:///c:/Users/dsk/Desktop/litellm-proxy/stream_adapters.py#L2273-L2282)）里的 `.flush()` 都会落到真实 socket flush，即**每 token 一次 send syscall**。
- 客观评价：这对**实时性是正向的**（SSE 就是要尽快吐字），且已设 `TCP_NODELAY`；`BufferedSSEWriter` 提供了 opt-in 批量。属于“高并发下 CPU/syscall 开销”的权衡项，不是纯粹 bug。**高并发部署可通过设置 `routing.stream_flush_interval_ms`（如 20-50ms）显著降低 syscall**。此外每个 SSE 事件用两次 `wfile.write()`（event 行 + data 行，见 [L401-L403](file:///c:/Users/dsk/Desktop/litellm-proxy/stream_adapters.py#L401-L403)）可合并为一次。

**P2-4　Responses 会话 `save()` 每次都 `_prune_locked`，且每次操作新建/关闭 SQLite 连接**
- 位置：[session_store.py `save` L62-L114](file:///c:/Users/dsk/Desktop/litellm-proxy/conversion_core/session_store.py#L62-L114)（L113 无条件 prune）、[`_prune_locked` L236-L258](file:///c:/Users/dsk/Desktop/litellm-proxy/conversion_core/session_store.py#L236-L258)、[`_connect/_connection` L216-L234](file:///c:/Users/dsk/Desktop/litellm-proxy/conversion_core/session_store.py#L216-L234)。
- 问题：每次持久化 Responses 会话都在全局 `RLock` 下执行 `DELETE 过期 + COUNT(*) + 条件 DELETE + SUM(payload) + 循环 DELETE`，且每次 `save/load` 都 `sqlite3.connect()` 新连接并重设 PRAGMA、用完关闭（无连接池）。
- 影响：仅影响使用 Responses `store`/`previous_response_id` 的链路；该链路高并发时被 prune 串行化 + 反复建连拖慢。可改为“按计数/时间节流 prune”并复用连接。

### 健康检测

**P2-5　`router.snapshot()` 每 ~5-15s 持热路径锁做全量遍历**
- 位置：[router.py `snapshot` L648-L732](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L648-L732)。见 P1-2，这里单列是因为即使不谈冗余，单次 snapshot 也在请求锁内对全部 provider×key 逐把算 `_hash_key_short`/`_mask_key`/`resolve_proxy_url`。provider/key 越多，持锁越久。

**P2-6　`_update_health_scores` 被 15s 与 60s 两个线程重复调用**
- 位置：[sse2json.py `_start_state_autosave` L393-L401](file:///c:/Users/dsk/Desktop/litellm-proxy/sse2json.py#L393-L401) 与 [`_start_health_score_updater` L404-L412](file:///c:/Users/dsk/Desktop/litellm-proxy/sse2json.py#L404-L412)。
- 问题：60s 窗口内 `_update_health_scores()`（= `snapshot()` + `provider_health_scores()`）被触发 5 次（15s×4 + 60s×1），且与 P1-2 前端触发叠加。可合并为单一节流源。

### 数据保存/读取

**P2-7　异步写队列逐条提交，无批量事务**
- 位置：[history_store.py `_write_loop` L192-L227](file:///c:/Users/dsk/Desktop/litellm-proxy/history_store.py#L192-L227)。
- 问题：每次只 `get()` 一条，`_connection()` 出栈即 `commit()`（[L141-L151](file:///c:/Users/dsk/Desktop/litellm-proxy/history_store.py#L141-L151)），队列积压时仍逐条 commit，每次 commit 触发一次 WAL 提交。可在 `_write_loop` 里 drain 一批（如 ≤100 条）合并为单事务。
- 缓解现状：默认 async（请求线程不阻塞）、`synchronous=NORMAL`+WAL、队列有界（满则丢并计数），因此影响是“高吞吐下写延迟叠加”，非阻塞请求。

**P2-8　`_locked_overlay` 在 RLock 内做 deepcopy + 全量 normalize + 磁盘写**
- 位置：[config_manager.py `_locked_overlay` L62-L78](file:///c:/Users/dsk/Desktop/litellm-proxy/config_manager.py#L62-L78) → [`_normalized_config_for_overlay` L1090-L1128](file:///c:/Users/dsk/Desktop/litellm-proxy/config_manager.py#L1090-L1128)。
- 问题：每个 admin 写操作在 `_commit_lock` 内串行完成：`deepcopy(overlay)` → 变更 → 裁剪 tombstone → 写盘 → `deepcopy(base_config)` + `_deep_merge` + `_normalize_config`（遍历所有 provider 归一化）。批量修改 provider 时 admin 请求排队，延迟线性叠加。
- 备注：串行化是**正确的**（防丢更新），问题是锁内做了 deepcopy/normalize/磁盘 I/O 这些重活；可将 normalize 移出锁或按需增量。

**P2-9　`timeseries()` / 计数类查询 `SELECT *` 后 Python 端处理**
- 位置：[history_store.py `timeseries` L992-L1031](file:///c:/Users/dsk/Desktop/litellm-proxy/history_store.py#L992-L1031)。
- 问题：`SELECT * FROM requests WHERE finished_at ...` 取全列后在 Python 端分桶，实际只用到 `finished_at/status_code/duration_ms/first_byte_ms/model/cost/tokens` 等少数列。窗口内请求多时传输/解析浪费。（`list_requests` 已做 attempts 批量加载，较好。）

### 前端刷新

**P2-10　每轮 5s 轮询做深度 `JSON.stringify` 签名**
- 位置：[app.js `runtimeSignature` L114-L143](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L114-L143)、[`applyRuntimeCore` L1618-L1638](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L1618-L1638)。
- 问题：每次轮询对 metrics/providerActivity/healthScores/routerSnapshot 四大对象递归遍历 + 排序 key + `JSON.stringify` 生成签名以决定是否跳过渲染。provider/key 多时该签名计算本身随数据量线性增长（虽然它避免了更贵的 morphdom，属“两害相权”的优化，但签名成本本身可优化，如用后端返回的 version/etag）。

**P2-11　`renderTrafficChart` 最近桶匹配 O(recent × buckets)**
- 位置：[app.js `renderTrafficChart` L2685-L2701](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L2685-L2701)。
- 问题：桶无 token 数据但有 recent 请求时，对每个 recent 请求线性扫描所有桶找最近者。7d 范围 168 桶 × 数百 recent 请求 → 每次渲染上万次比较，可用双指针/二分优化（桶与请求都已按时间有序）。

---

## 五、轻微问题（P3）

- **P3-1 `_compatibility_state` 缓慢无界增长**：[router.py#L150](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L150)，以 6 元组为 key，仅在对应 attempt 成功时清除（[report_success L342-L357](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L342-L357)）；长期运行 + 多模型/格式组合且从不成功的条目不会回收。
- **P3-2 `ProbeCoordinator._failure_counts` 无界 + 线性扫描**：[probe_coordinator.py#L19、L60-L63](file:///c:/Users/dsk/Desktop/litellm-proxy/probe_coordinator.py#L19-L63)，`record_success` 用列表推导遍历整个字典找匹配。正常使用会被成功清理，长期持续失败才膨胀。
- **P3-3 每 attempt 重复算 `_key_fingerprint`（SHA-256）**：`_compatibility_available`（[L462-L471](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L462-L471)）与 `iter_attempts` yield 时（[L338](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L338)）各算一次同一 key 的指纹，可复用。
- **P3-4 前端 `_modelCapabilityItemsCache` 无界**：[app.js#L5738-L5748](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L5738-L5748)，key 含 `state.data.version`；version 在配置/静态刷新时递增（非每 5s，见 [L1578](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L1578)/[L1884](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L1884)），旧版本条目不清理，长时间挂着会缓慢累积。
- **P3-5 usage_accounting 每次定价解析都试 `load_local()`**：[usage_accounting.py#L301-L304](file:///c:/Users/dsk/Desktop/litellm-proxy/usage_accounting.py#L301-L304)，provider 无定价时每次都尝试从磁盘重载 AA 索引（有 try/except 兜底）。
- **P3-6 审计 `list()` 全量 readlines + `record` open/close**：见 [audit_store.py#L120-L136](file:///c:/Users/dsk/Desktop/litellm-proxy/audit_store.py#L120-L136)（与 P1-3 同源，读侧）。
- **P3-7 `routing_trace.snapshot()` deepcopy / `routing_explain._copy_value` 递归拷贝**：[routing_trace.py#L37-L39](file:///c:/Users/dsk/Desktop/litellm-proxy/routing_trace.py#L37-L39)、[routing_explain.py#L159-L164](file:///c:/Users/dsk/Desktop/litellm-proxy/routing_explain.py#L159-L164)，仅在请求详情/解释的后处理路径，非热路径。

---

## 六、各子系统小结

| 子系统 | 结论 | 主要风险点 |
|---|---|---|
| 路由选择 | 逻辑正确，热路径有可优化的持锁与重算 | P2-1 持锁 SHA256/配置查询；P2-2 每请求重建候选无缓存；P1-2 与 snapshot 争锁 |
| 格式转换 | 6 转换器结构清晰，无热路径正则重编译/无 O(N²) 实体 | P2-3 默认逐 token flush（可调优）；P2-4 会话 prune-on-save + 无连接池 |
| 健康检测 | 三层机制设计良好（chunk-sleep、无忙等、有序列化保护、有界 deque） | P1-2/P2-5/P2-6 快照与聚合被高频重复触发并与请求锁争用 |
| 前端刷新 | 已有大量优化（in-flight、签名跳过、morphdom、分页、AbortController） | P2-10 每轮深度序列化；P2-11 图表 O(N×M)；P3-4 memo 无界 |
| 数据保存/读取 | 异步写、WAL、批量 attempts 加载到位 | P1-1 启动全表扫描；P1-3 审计写全读文件；P2-7 逐条 commit；P2-8 overlay 锁内重活 |

---

## 七、修复优先级建议（仅建议，未改动代码）

按“投入产出比 + 风险”排序：

1. **P1-1**：把 `rebuild_counters` 改为 SQL 聚合（`COUNT/SUM/GROUP BY`），或对历史库大小设上限/分页重建。→ 直接缩短启动时间、削峰内存。
2. **P1-2 + P2-5 + P2-6**：为 `snapshot()` / `provider_health_scores()` 增加**短 TTL 缓存（如 2-3s）**或在管理端一次请求内复用同一份 snapshot；后台 15s/60s 线程与前端共用同一缓存源。→ 直接降低 `router._lock` 争用与重复 CPU。
3. **P1-3**：审计裁剪改为“基于内存行计数节流”，避免每次 record 全量 `readlines`。
4. **P2-2**：按“配置 revision”对 `_select_provider_items`/`resolve_provider_model_candidates` 结果做失效式缓存（注意此前回退过，需带基准）。
5. **P2-1**：把 `_hash_key_short/_mask_key/safe_key` 构建移出锁、且仅在 `routing_trace is not None` 时构建；`key_supports_provider_model` 的纯查询尽量锁外做。
6. **P2-7**：`_write_loop` 批量 drain 合并事务。
7. **P2-3**：文档/默认建议高并发场景设置 `stream_flush_interval_ms`；合并每事件的两次 write。
8. 其余 P2/P3 视资源择机处理；P3 多为“长期运行缓慢增长”，可加简单上限或定期清理。

---

## 八、审查方法与可信度说明

- 本报告所有“严重/中等”结论均已回到源码对应行核对（含 `sse2json.py` 转换器确实使用 `BufferedSSEWriter`、`admin_routes.py` 端点确实各自重算 snapshot/聚合、`state.data.version` 递增频率等关键点）。
- 未运行基准压测；“严重/中等/轻微”是基于复杂度与触发频率的**静态评估**，实际数值影响取决于部署规模（provider/key 数、历史库大小、并发、常开 dashboard 数）。
- 全程**只读**，未修改任何源代码；本文件为新增的审查报告文档。

---

## 九、修复状态更新（2026-07-27，聚焦“保存/响应”链路）

> 本节为原审查（2026-07-21）之后的落地修复记录。按“代码为唯一真实源”原则，逐条回到当前源码核对——**原审查报告的多数结论此刻已过时**（代码已优化到审查快照之后）。

### 9.1 本次实际改动（热加载“保存”链路的重复磁盘扫描）

原审查的 P1-1/P1-3 只覆盖“冷启动”一次性开销；核对代码后发现更贴合用户关注的“每次保存”场景的浪费点：**每次 admin 保存都走 `_apply_runtime_config` 全量重建，其中 3 个持久化 store 会在构造时重扫磁盘，随后立即被内存态覆盖**——纯空转。按代码库既有的 `migrate_state_from` / `migrate_counters_from` 模式统一修复：

| 组件 | 改动 | 效果 |
|---|---|---|
| [observability.py `__init__`](file:///c:/Users/dsk/Desktop/litellm-proxy/observability.py#L69) | 新增 `restore_history` 开关；热加载传 `False` | 跳过 SQLite 全表 `COUNT/SUM/GROUP BY`，改由 `migrate_counters_from` 搬运内存计数 |
| [audit_store.py `__init__`](file:///c:/Users/dsk/Desktop/litellm-proxy/audit_store.py#L28) | 新增 `load_tail` 开关 + [`migrate_state_from`](file:///c:/Users/dsk/Desktop/litellm-proxy/audit_store.py#L39) | 跳过重读 JSONL 审计尾部 |
| [conversion_diagnostics.py `__init__`](file:///c:/Users/dsk/Desktop/litellm-proxy/conversion_diagnostics.py#L111) | 新增 `load_existing` 开关 + [`migrate_state_from`](file:///c:/Users/dsk/Desktop/litellm-proxy/conversion_diagnostics.py#L138) | 跳过逐行计数（最多 `retained_files × max_file_bytes`） |
| [sse2json.py `_apply_runtime_config`](file:///c:/Users/dsk/Desktop/litellm-proxy/sse2json.py#L1920) | 捕获 `old_audit`；三 store 传 `flag=(old is None)` 并在热加载时调 `migrate_state_from` | 冷启动仍从磁盘恢复，仅热加载路径跳过冗余 I/O |
| [dashboard_src/src/app.js](file:///c:/Users/dsk/Desktop/litellm-proxy/dashboard_src/src/app.js#L120)（构建至 `dashboard/app.js`） | 新增 `POST_CONFIG_MUTATION_DOMAINS`；保存后后台刷新不再重复下载 `/-/admin/config`；修复 `mergeRefreshArgs` 合并语义（全量刷新占优，只多刷不漏刷） | 保存后省去一次冗余 config 拉取，且合并去抖不会误收窄刷新域 |

### 9.2 原审查项的当前状态（核对当前代码）

| 原编号 | 结论 | 依据 |
|---|---|---|
| P1-1 观测计数器全表扫描 | ✅ 热加载已消除 | 见 9.1；`restore_history` 仅冷启动为真 |
| P1-2 每 5s 轮询 2× `snapshot()` | ✅ 已缓解 | [router.py `snapshot`](file:///c:/Users/dsk/Desktop/litellm-proxy/router.py#L779) 已带 **0.75s TTL 缓存**（`_snapshot_cache`），同周期内二次调用命中缓存 |
| P1-3 审计每次 `record` 全量 `readlines` | ✅ 已修 | [audit_store.py `_prune_locked`](file:///c:/Users/dsk/Desktop/litellm-proxy/audit_store.py#L167) 改用内存 `_line_count`，不再每次读全文件 |
| P2-1 `snapshot` 锁内 SHA256/构建 safe_key | ✅ 已修 | `snapshot()` 改用预计算的 `_snapshot_provider_metadata`，锁内不再逐 key 做哈希 |
| P2-2 每请求重建候选无缓存 | ✅ 已修 | router 已引入 `_provider_support_cache` / `_provider_model_candidates_cache` / `_key_candidate_cache`（按 `models_version` 失效） |
| P2-8 `_locked_overlay` 锁内磁盘写 | ⚪ 非热点 | [`_write_overlay`](file:///c:/Users/dsk/Desktop/litellm-proxy/config_manager.py#L1222) 正常路径为 `tempfile+os.replace`（**无 fsync**），fsync 仅出现在 Docker `EBUSY` 回退与 `clear_overlay`；串行化本身为防丢更新的正确取舍 |
| P2-3 / P2-7 / P2-9 / P2-10 / P2-11 / P3-* | ⚪ 暂缓 | 多为“可调优参数”或“长期运行缓慢增长”，非保存/响应热路径的高性价比项，风险高于收益 |

### 9.3 验证

全量测试通过：`python -m pytest tests/` → **807 passed, 542 subtests passed**；`dashboard_src` 前端 **23 个 node 测试全通过**；`vite build` 重建 `dashboard/app.js` + `node --check dashboard/app.js` 通过。向后兼容未破坏（新增均为带默认值的 keyword-only 参数）。
