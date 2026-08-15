# LiteLLM Proxy — 开发修复报告

合并来源：
- 外部 AI 审计报告（CRITICAL 6 + HIGH 18 + MEDIUM 27）
- 本机二轮补充扫描（`AUDIT_FINDINGS_SUPPLEMENT.md`，15 项）
- 逐条代码核验（`AUDIT_VERIFICATION.md`）

修复基线：**567 tests passed**（修复前全量绿色）。

---

## 一、修复决策总览

每项标注：✅本次修复 / ⏸️暂缓（附理由）/ ❌非问题（核验驳回）

### CRITICAL
| 编号 | 问题 | 决策 | 说明 |
|---|---|---|---|
| C1 | report_success 清零失败计数 | ⏸️ | 设计取舍，改为衰减需重新验证 failover 语义且可能破坏现有冷却行为；单独设计评审后处理 |
| C2 | null arguments TypeError | ✅ | L193 加 `TypeError` 捕获，一行 |
| C3 | 空 choices 崩溃 | ✅ | L173 加守卫（L511 本就安全，无需改） |
| C4 | max() 合并 token usage | ⏸️ | 主流 provider 均累计型，假设正确；加文档注释说明约束 |
| C5 | audit prune 非原子 | ✅ | tmp + `os.replace` 原子替换 |
| C6 | SQLite 连接池双取 | ❌ | 核验驳回：`queue.Queue.get_nowait` 取出即移除，不可能双取 |

### HIGH
| 编号 | 问题 | 决策 | 说明 |
|---|---|---|---|
| H1 | 全局变量非原子交换 | ❌ | 热路径走 `RuntimeContext` 快照，非撕裂读 |
| H2/H3/H4 | admin/发现回调绕过快照 | ⏸️ | 低影响；统一加锁需较大改造，单独处理 |
| H5 | patrol early return 残留 running | ✅ | early return 前复位 running 标志 |
| H6/H7 | router TOCTOU / 静态缓存竞态 | ⏸️ | 低影响（perf 缓存/顺序偏差），暂缓 |
| H8 | prefetch 线程泄漏 | ❌ | 核验驳回：有 read_timeout 兜底，非永久阻塞 |
| H9 | SSE 错误处理器挂起 | ⏸️ | 结构脆弱但触发窄；改进需重构收尾，暂缓 |
| H10 | tool arguments 双发 | ❌ | 核验驳回：有 `_arguments_streamed`/`_already_streamed` 守卫 |
| H11 | finish_reason 硬编码 | ❌ | 核验驳回：Responses 格式无 finish_reason 字段 |
| H12 | 嵌套加锁死锁 | ❌ | 核验驳回：`_migrated_to` 单向前向指针，无 ABAA |
| H13 | config_manager.reload 未加锁 | ✅ | 包入 `_commit_lock` |
| H14/H15 | 审计锁内 I/O / 全表扫描 | ⏸️ | 性能项，单独优化迭代 |
| H16 | proxy 凭据明文入 stdout | ✅ | 新增 `mask_proxy_url`，日志脱敏 |
| H17 | SSRF admin proxy 测试 | ❌ | 核验驳回：admin 鉴权 + 经由指定代理，属预期功能 |
| H18 | pool manager DCL 竞态 | ❌ | 核验驳回：cleared PoolManager 仍可用，影响良性 |

### 二轮补充（N 系列）
| 编号 | 问题 | 决策 | 说明 |
|---|---|---|---|
| N1 | Anthropic 分支默认 model 硬编码 | ✅ | 改空串，与 chat/responses 分支一致 |
| N2 | Anthropic 发现用 Bearer | ❌ | **复审驳回**：router 对 Anthropic 请求也统一用 Bearer，Anthropic 官方接受 Bearer；改为 x-api-key 反而与请求路径不一致 |
| N3 | same_key_retries 当布尔用 | ⏸️ | 循环化需重写 compat_retry 的 CachedHTTPError/transport 语义，回归风险高；当前单次重试安全，测试均 count=1；单独迭代 |
| N4 | union 发现 8s 预算失效 | ⏸️ | 性能项，需重构 executor 退出策略 |
| N5 | _active 无 TTL sweeper | ⏸️ | 真实但低影响；加后台 sweeper 需谨慎，单独迭代 |
| N6 | config 解析失败静默 | ✅ | 失败时 print 警告 |
| N7 | "." reasoning 占位符 | ⏸️ | 有意兼容处理，改动可能影响 provider 行为，暂缓 |
| N8 | deepseek 名硬编码 | ⏸️ | 改 base_url 识别需调研，暂缓 |
| N9 | request_dispatcher 空壳 | ⏸️ | 死代码，清理留待重构 |
| N10–N15 | 诊断丢弃/by_model/PORT int/count_tokens/stream 死分支/models 未鉴权 | ⏸️/❌ | 低优先或设计如此 |

---

## 二、本次修复清单（8 项）

### F1 (C2) `protocol_adapters.py` L193 — TypeError on null arguments
```python
# before
except json.JSONDecodeError:
    args = {}
# after
except (json.JSONDecodeError, TypeError):
    args = {}
```
与同文件 L114（流式）、L670（chat→anthropic）已捕获两者保持一致。

### F2 (C3) `protocol_adapters.py` L173 — 空 choices 守卫
```python
# before
choice = upstream_resp["choices"][0]
msg = choice["message"]
# after
choices = upstream_resp.get("choices") or []
choice = choices[0] if choices else {}
msg = choice.get("message") or {}
```
与 L511 `openai_chat_response_to_responses_response` 的安全模式一致。上游返回错误响应（无 choices）时不再 500，转由上层错误处理。

### F3 (C5) `audit_store.py` `_prune_locked` — 原子替换
```python
# 写临时文件 → os.replace 原子替换，避免截断后崩溃丢数据
tmp = self.path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    f.writelines(lines[-self.max_records:])
os.replace(tmp, self.path)
```
与 `config_manager._write_overlay` 已采用的原子模式一致。

### F4 (H16) `proxy_utils.py` 新增 `mask_proxy_url` + 三处日志调用脱敏
```python
def mask_proxy_url(url: str) -> str:
    """Mask credentials in a proxy URL for logging."""
    # http://user:pass@host:port → http://***@host:port
```
替换 `chat.py` L54 / `responses.py` L51 / `sse2json.py` L4521 的 `attempt.proxy_url`。
上游请求仍用真实 proxy_url（仅日志脱敏）。

### F5 (H13) `config_manager.py` `reload()` — 加锁
```python
def reload(self, base_config):
    with self._commit_lock:
        self.base_config = copy.deepcopy(base_config or {})
        self.overlay = self._read_overlay()
        self.config = self._normalized_merged()
        return self.config
```
`_commit_lock` 为 RLock，与 `_locked_overlay`/`_commit_overlay` 一致，无死锁风险。

### F6 (N1) `sse2json.py` L4451 — Anthropic 默认 model 改空串
```python
# before
original_model = req.get("model", "deepseek-v4-flash")
# after
original_model = req.get("model", "")
```
与 `chat.py` L12 / `responses.py` L10 一致。漏传 model 时不再静默替换为特定 DeepSeek 模型，
转而走 "No provider supports model ''" → 400（与 chat/responses 一致）。

### F7 (N6) `config_loader.py` L644 / L681 — 解析失败打印警告
```python
except Exception as e:
    print(f"[config] WARNING: failed to parse {path}: {type(e).__name__}: {e}; falling back to defaults", flush=True)
```
不再完全静默，运维可知配置未加载。

### F8 (H5) `sse2json.py` L1499-1501 — patrol early return 复位 running
```python
if in_flight > 0:
    print(f"[proxy] patrol round interrupted: request in flight", flush=True)
    _patrol_probe_schedule["running"] = False
    _patrol_probe_schedule["last_result"] = "interrupted"
    _patrol_probe_schedule["last_summary"] = "interrupted: request in flight"
    _patrol_probe_schedule["last_run_duration_s"] = round(time.time() - _round_start, 1)
    return
```
避免 running=True 永久残留阻塞后续手动触发。

---

## 三、暂缓项的理由

- **C1 / N3**：均为行为语义改动，需重新验证 failover/retry 语义且现有测试依赖当前行为；
  强行修改回归风险高于收益，留待专项设计评审。
- **H2/H3/H4/H6/H7**：低影响并发竞态（admin/发现/perf 缓存），统一加锁改造范围大，单独迭代。
- **H9/H14/H15/N4/N5**：结构/性能改进，非崩溃与安全问题，单独优化迭代。
- **N7/N8**：涉及 provider 兼容性行为，改动需调研影响面。
- **N2**：复审驳回——router 对 Anthropic 上游请求也用 `Authorization: Bearer`（Anthropic 官方接受），
  发现路径与之**一致**；若单方面改发现路径为 x-api-key 反而造成不一致。

---

## 四、验证计划
1. 修复前全量 `pytest tests/ -q` → **567 passed**（基线）。
2. 每批修复后跑相关测试子集 + 全量。
3. 最终全量 `pytest tests/ -q` 必须 **全绿**。

---

## 五、最终验证结果（2026-07-06）

### 修复落地（8 项）
| 编号 | 文件 | 改动 |
|---|---|---|
| F1 (C2) | `protocol_adapters.py` L190-196 | `except (json.JSONDecodeError, TypeError)` + `fn.get("arguments") or "{}"` |
| F2 (C3) | `protocol_adapters.py` L173-174 | 空 choices 守卫 `(upstream_resp.get("choices") or [{}])[0]` + `choice.get("message") or {}` |
| F3 (C5) | `audit_store.py` `_prune_locked` | tmp + `os.replace` 原子替换 |
| F4 (H16) | `proxy_utils.py` 新增 `mask_proxy_url`；`sse2json.py` 3 处日志调用 | `http://user:pass@host` → `http://***@host` |
| F5 (H13) | `config_manager.py` `reload()` | 包入 `_commit_lock`（RLock） |
| F6 (N1) | `sse2json.py` L4451 | 默认 model `"deepseek-v4-flash"` → `""` |
| F7 (N6) | `config_loader.py` L644 / L686 | 解析失败 print 警告（不再静默） |
| F8 (H5) | `sse2json.py` L1499-1501 | patrol early return 前复位 `running`/`last_result` |

### 新增回归测试（14 条）
- `tests/test_audit_store.py`（4 条）— C5 原子 prune / 保留最新 N 条 / 无 .tmp 残留 / 阈值下不触发
- `tests/test_proxy_utils.py::TestMaskProxyUrl`（6 条）— H16 凭据脱敏各场景
- `tests/test_conversions.py::RobustnessRegressionTests`（3 条）— C2 null/malformed arguments、C3 空 choices
- `tests/test_anthropic_proxy.py`（1 条）— N1 缺 model 时 canonical_model 为空

### 测试结果
```
修复前基线:  567 passed
修复后全量:  581 passed   (+14 新回归测试，0 回归)
py_compile:  ALL COMPILE OK（8 个改动文件）
```

### 复审驳回（非问题，未改）
- **N2**：router 对 Anthropic 上游请求也统一用 `Authorization: Bearer`（Anthropic 官方接受 Bearer），
  发现路径与之**一致**；单改发现路径为 x-api-key 反而制造不一致。

### 暂缓（附理由，留待专项迭代）
C1 / N3（行为语义改动，回归风险高于收益）· H2-H4/H6-H7（低影响并发，需较大改造）·
H9/H14/H15/N4/N5（结构/性能改进）· N7/N8（provider 兼容性需调研）· N9（死代码清理）。
详见报告第三节。

