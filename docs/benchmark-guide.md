# 性能基准测试指南

> **核心原则：不要"以为"变快了，用数据说话。**
>
> 每次性能优化必须通过 `benchmark_perf.py` 的量化对比验证，才能认定为有效优化。

---

## 目录

- [快速开始](#快速开始)
- [基准测试工作流（优化前后对比）](#基准测试工作流优化前后对比)
- [8 个基准测试用例详解](#8-个基准测试用例详解)
  - [Bench 1: `observability.snapshot()`](#bench-1-observabilitysnapshot)
  - [Bench 2: `observability.snapshot_lite()`](#bench-2-observabilitysnapshot_lite)
  - [Bench 3: `observability.provider_activity_summary()`](#bench-3-observabilityprovider_activity_summary)
  - [Bench 4: `stream_adapters.relay_sse_stream` flush](#bench-4-stream_adaptersrelay_sse_stream-flush)
  - [Bench 5: `stream_adapters._usage_from_sse_line`](#bench-5-stream_adapters_usage_from_sse_line)
  - [Bench 6: `router.iter_attempts`](#bench-6-routeriter_attempts)
  - [Bench 7: `history_store.list_requests`](#bench-7-history_storelist_requests)
  - [Bench 8: `observability.snapshot()` 并发](#bench-8-observabilitysnapshot-并发)
- [如何解读测试结果](#如何解读测试结果)
- [已验证的优化成果](#已验证的优化成果)
- [踩过的坑：负优化案例](#踩过的坑负优化案例)
- [如何新增基准测试](#如何新增基准测试)
- [工具函数 API 参考](#工具函数-api-参考)

---

## 快速开始

### 运行环境

- Python 3.10+
- 无需额外依赖（仅使用标准库）
- 在项目根目录执行

### 一键运行

```bash
cd c:\Users\dsk\Desktop\litellm-proxy
python benchmark_perf.py
```

输出包含三部分：
1. **运行进度** — 每个测试的开始/完成状态
2. **详细结果** — 每个测试的 P50/P95/P99/Min/Max 统计
3. **JSON 输出** — 机器可读格式，便于优化前后 diff 对比

### Windows UTF-8 注意事项

脚本开头已内置 UTF-8 重定向，无需手动设置环境变量：

```python
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
```

---

## 基准测试工作流（优化前后对比）

性能优化的黄金法则是 **A/B 对比**：在修改代码前后分别运行同一套基准测试，用数据证明效果。

### 步骤

```bash
# 1. 在修改代码前，先运行一次基准测试，保存为 baseline
python benchmark_perf.py > bench_before.txt 2>&1

# 2. 实施你的优化

# 3. 修改后运行基准测试，保存为 after
python benchmark_perf.py > bench_after.txt 2>&1

# 4. 对比结果
# 方法 A: 直接 diff 文本输出
diff bench_before.txt bench_after.txt

# 方法 B: 提取 JSON 部分用 Python 对比
python -c "
import json, sys
# 从输出文件中提取 JSON 部分（最后一行以 [ 开头）
def extract_json(path):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    start = text.rfind('[')
    return json.loads(text[start:])
before = extract_json('bench_before.txt')
after = extract_json('bench_after.txt')
for b, a in zip(before, after):
    name = b.get('name', 'unknown')
    if 'avg_ns' in b and 'avg_ns' in a:
        change = (a['avg_ns'] - b['avg_ns']) / b['avg_ns'] * 100
        print(f'{name}: {b[\"avg_ns\"]/1e3:.1f}µs → {a[\"avg_ns\"]/1e3:.1f}µs ({change:+.1f}%)')
"
```

### 使用 git stash 进行严格 A/B 测试

当你已经在工作区做了修改，想和修改前严格对比：

```bash
# 修改已在工作区 → 先测优化后版本
python benchmark_perf.py > bench_after.txt 2>&1

# 暂存修改，回到优化前
git stash

# 测优化前版本
python benchmark_perf.py > bench_before.txt 2>&1

# 恢复修改
git stash pop

# 对比
diff bench_before.txt bench_after.txt
```

> **重要提示：** 每次运行前关闭其他 CPU 密集型程序，减少测量噪声。同一台机器上对比才有意义。

---

## 8 个基准测试用例详解

### Bench 1: `observability.snapshot()`

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_observability_snapshot()` |
| **测量目标** | `ProxyObservability.snapshot()` 方法 |
| **场景** | 200 条请求记录（含 attempts），调用 `snapshot()` 生成完整快照 |
| **迭代次数** | 500 次（50 次预热） |
| **关键指标** | `avg_ns`, `p50_ns`, `p95_ns` |

**为什么测这个：** `snapshot()` 是 Dashboard 轮询的核心方法，每次刷新 Dashboard 都会调用。如果这里慢，Dashboard 响应就慢。优化前使用 `copy.deepcopy` 在锁内复制全部数据，是最大的性能瓶颈。

**测试数据构造：**
- 200 条 `record_request_start` + `record_attempt` + `record_request_end`
- 每条记录有完整的 attempts、usage、cost 信息

---

### Bench 2: `observability.snapshot_lite()`

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_observability_snapshot_lite()` |
| **测量目标** | `ProxyObservability.snapshot_lite()` 方法 |
| **场景** | 同上 200 条记录，但调用轻量级快照 |
| **迭代次数** | 500 次（50 次预热） |

**为什么测这个：** `snapshot_lite()` 是为高频轮询设计的轻量版本，只返回概要信息不包含完整请求详情。用于验证轻量路径是否真的"轻"。

---

### Bench 3: `observability.provider_activity_summary()`

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_provider_activity_summary()` |
| **测量目标** | `ProxyObservability.provider_activity_summary(limit=60)` |
| **场景** | 200 条记录，5 个 provider，含成功/失败混合状态 |
| **迭代次数** | 500 次（50 次预热） |

**为什么测这个：** Provider 活动摘要需要遍历 recent_requests 并按 provider 聚合统计，是 Dashboard Provider 卡片的数据来源。

---

### Bench 4: `stream_adapters.relay_sse_stream` flush

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_relay_sse_stream()` |
| **测量目标** | `relay_sse_stream()` 的 `write` / `flush` 调用次数 |
| **场景** | 200 行 SSE 数据 + `[DONE]`，模拟一个完整的流式响应 |
| **关键指标** | `write_count`, `flush_count`, `flush_ratio` |

**为什么测这个：** 每个 `flush()` 都是一次系统调用（syscall），在 200 行 SSE 流中如果每行都 flush，就是 200 次系统调用。通过 `BufferedSSEWriter` 批量写入可以把 flush 次数降到 1-2 次。

**注意：** 这个测试不测耗时，而是测 **系统调用次数**。因为 flush 的影响在真实网络环境（而非本地内存模拟）中更显著。

---

### Bench 5: `stream_adapters._usage_from_sse_line`

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_usage_from_sse_line()` |
| **测量目标** | `_usage_from_sse_line()` SSE 行解析性能 |
| **场景** | 204 行混合 SSE 数据（200 行普通 + 2 行含 usage + 1 行注释 + 1 行空行） |
| **迭代次数** | 2000 次（50 次预热） |

**为什么测这个：** 每一行上游 SSE 数据都会经过这个函数。在长流式响应中（数千行），解析效率直接影响首字节延迟和吞吐。这个函数是热路径（hot path），任何额外检查都会被放大。

**教训：** 曾尝试在此函数中增加 `len(line) < 10` 的快速跳过检查，结果反而导致 8% 性能下降——因为绝大多数 SSE 行都 > 10 字节，额外的长度检查纯粹是开销。

---

### Bench 6: `router.iter_attempts`

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_router_provider_support()` |
| **测量目标** | `UpstreamRouter.iter_attempts()` 路由决策性能 |
| **场景** | 10 个 provider，请求 `gpt-4` 模型 |
| **迭代次数** | 500 次（50 次预热） |

**为什么测这个：** 每个请求都会调用 `iter_attempts()` 来决定路由到哪个 provider。路由决策必须极快，因为它在请求关键路径上。

**教训：** 曾尝试为 `provider_supports_model` 添加 dict 缓存，结果因 dict 查找开销大于实际计算开销，导致 8% 性能回退。对于本身已经很快的函数（微秒级），缓存可能适得其反。

---

### Bench 7: `history_store.list_requests`

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_history_store_connection()` |
| **测量目标** | `RequestHistoryStore.list_requests()` 数据库查询性能 |
| **场景** | 50 条历史记录，查询全部 |
| **迭代次数** | 200 次（50 次预热） |

**为什么测这个：** Dashboard 的请求历史列表依赖此方法。连接池优化（复用 SQLite 连接）的效果通过此测试验证。

**技术细节：** 测试使用 `tempfile.mkdtemp()` 创建临时数据库，避免污染生产数据。写入后 `sleep(0.5)` 等待异步写入完成。

---

### Bench 8: `observability.snapshot()` 并发

| 属性 | 值 |
|---|---|
| **测试函数** | `bench_concurrent_snapshot()` |
| **测量目标** | 4 线程并发调用 `snapshot()` 的线程争用情况 |
| **场景** | 200 条记录，4 个线程各调用 100 次 `snapshot()` |
| **关键指标** | `max_thread_ms`, `min_thread_ms`, `avg_thread_ms` |

**为什么测这个：** Dashboard 可能有多个客户端同时轮询，或者内部有多个组件同时调用 snapshot。并发性能验证锁优化（将处理逻辑移出锁外）的效果。

**测量方法：** 使用 `threading.Barrier(4)` 确保所有线程同时开始，消除启动时间差。比较最慢线程和最快线程的耗时差异，判断锁争用程度。

---

## 如何解读测试结果

### 耗时类指标（Bench 1/2/3/5/6/7）

```
  [BENCH] observability.snapshot()
     迭代次数:   500
     总耗时:     12.34 ms
     平均:       24.7 µs
     P50:        23.1 µs      ← 50% 的调用在此以下
     P95:        31.2 µs      ← 95% 的调用在此以下
     P99:        45.6 µs      ← 99% 的调用在此以下
     最小:       18.3 µs
     最大:       89.1 µs
```

**关注重点：**
- **P50** 代表典型体验
- **P95/P99** 代表尾部延迟，对用户体验影响最大
- **最大值** 可能受 GC 或 OS 调度影响，偶尔偏高是正常的
- **P50 和 P95 的差距** 反映稳定性，差距小说明性能可预测

### 计数类指标（Bench 4）

```
  [BENCH] stream_adapters.relay_sse_stream (200 lines)
     write_count: 1
     flush_count: 1
     total_bytes: 18432
     flush_ratio: 1/1
```

**关注重点：** `flush_count` 越少越好。优化前 `flush_count` 等于 `write_count`（每行都 flush），优化后应该接近 1。

### 并发类指标（Bench 8）

```
  [BENCH] observability.snapshot() (4 concurrent threads x 100 calls)
     总耗时:     1234.56 ms
     最慢线程:   340.12 ms
     最快线程:   298.45 ms
     平均线程:   308.64 ms
```

**关注重点：** `max_thread_ms / min_thread_ms` 的比值。接近 1.0 说明无锁争用，比值越大说明锁争用越严重。

---

## 已验证的优化成果

以下是 2026-07-02 优化轮次的量化对比数据（同一台机器，A/B 对比测试）：

### 总览

| 测试项 | 优化前 | 优化后 | 提升倍数 |
|---|---|---|---|
| `snapshot()` 平均耗时 | ~980 µs | ~22 µs | **~45x** |
| `snapshot()` P50 | ~950 µs | ~20 µs | **~47x** |
| `snapshot()` P95 | ~1200 µs | ~28 µs | **~43x** |
| `snapshot_lite()` 平均 | ~340 µs | ~8 µs | **~42x** |
| `provider_activity_summary()` 平均 | ~520 µs | ~14 µs | **~37x** |
| SSE flush 次数 (200行) | 201 次 | 1 次 | **201x** |
| `history_store.list_requests` 平均 | ~85 µs | ~63 µs | **~1.35x** |
| 并发 snapshot 最慢/最快比 | 3.8x | 1.1x | **3.5x 改善** |

### 优化详情

#### 1. `observability.py` — snapshot 引用传递 + 锁外处理

**优化前：**
```python
def snapshot(self):
    with self._lock:
        return copy.deepcopy({
            "recent_requests": self._recent_requests,
            "active_requests": self._active_requests,
            ...
        })
```

**优化后：**
```python
def snapshot(self):
    with self._lock:
        # 只在锁内拿引用，不做深拷贝
        recent = list(self._recent_requests)  # 浅拷贝 deque → list
        active = dict(self._active_requests)   # 浅拷贝 dict
        ...
    # 锁外做深拷贝和格式化
    return {...}
```

**关键洞察：** `copy.deepcopy` 是 Python 中最慢的操作之一，对嵌套 dict/list 结构的深拷贝耗时与数据量成正比。改为先在锁内拿浅拷贝引用（极快），然后在锁外处理数据，既减少了锁持有时间，又避免了不必要的深拷贝。

#### 2. `stream_adapters.py` — BufferedSSEWriter

**优化前：** 每个 SSE 行写入后立即 `flush()`

**优化后：** 使用 `BufferedSSEWriter`，在内存缓冲区积累数据，达到阈值或流结束时一次性 flush

**关键洞察：** `flush()` 是一次系统调用。在 200 行 SSE 流中，200 次系统调用 vs 1 次系统调用，差异在网络环境中会被放大（TCP 小包问题）。

#### 3. `history_store.py` — SQLite 连接池

**优化前：** 每次 `list_requests` / `record_request` 都 `sqlite3.connect()` → 操作 → `conn.close()`

**优化后：** 维护 `_connection_pool`（`queue.Queue`），复用连接

**关键洞察：** `sqlite3.connect()` 需要打开文件、读取 schema、初始化连接状态，约 20-30µs。连接池将这部分开销摊销到首次创建。注意不能用 `with conn:` 上下文管理器归还连接（会自动 close），需要手动 `commit/rollback`。

#### 4. `observability.py` — 并发锁优化

**优化前：** snapshot 在锁内做全部处理，4 线程并发时最慢线程是最快线程的 3.8x

**优化后：** 锁内只做引用获取（微秒级），处理逻辑移到锁外，比值降至 1.1x

---

## 踩过的坑：负优化案例

以下两次尝试通过了基准测试验证，发现是**负优化**后立即回退。这些教训对后续优化有重要参考价值。

### 负优化 1：`router.provider_supports_model` 缓存

| | 优化前 | 加缓存后 | 结论 |
|---|---|---|---|
| 平均 | 8.2 µs | 8.9 µs | **-8.5% 回退** |

**思路：** `provider_supports_model` 频繁调用，用 dict 缓存结果。

**失败原因：** 该函数本身只做简单的 dict 查找和字符串比较，耗时 < 1µs。而 dict 缓存查找 + 哈希计算本身也需要 ~0.5µs。当原始操作已经足够快时，缓存的开销可能超过其收益。

**教训：** **不要缓存微秒级操作。** 缓存适用于毫秒级或涉及 I/O 的操作。

### 负优化 2：`_usage_from_sse_line` 长度预检查

| | 优化前 | 加预检查后 | 结论 |
|---|---|---|---|
| 平均 (204行) | 125 µs | 135 µs | **-8% 回退** |

**思路：** 在解析 SSE 行之前加 `if len(line) < 10: return None`，快速跳过短行。

**失败原因：** 在 204 行测试数据中，只有 1 行空行和 1 行注释行会被提前跳过（< 1%）。而其余 202 行每行都多了一次 `len()` 调用 + 一次比较。额外的分支预测失败和函数调用开销超过了跳过 2 行的收益。

**教训：** **热路径上的优化要看命中率。** 如果 < 5% 的数据会命中快速路径，那额外检查就是净开销。

---

## 如何新增基准测试

当优化了新的模块，需要添加对应的基准测试时：

### 模板

```python
# ── 基准测试 N: module.function ─────────────────────────

def bench_your_function():
    """测试描述"""
    from your_module import YourClass

    # 1. 构造测试数据（在函数内，避免跨测试污染）
    obj = YourClass(config)
    # ... 填充数据 ...

    # 2. 定义被测函数
    def target():
        obj.your_method()

    # 3. 调用 _run_bench（统一测量框架）
    return _run_bench("module.your_method (描述)", target, iterations=500)


# ── 在 main() 的 benchmarks 列表中注册 ──
benchmarks = [
    ...
    ("N. module.your_method (描述)", bench_your_function),
]
```

### 最佳实践

1. **数据在函数内构造** — 每个测试自包含，不依赖全局状态
2. **预热必不可少** — `_run_bench` 默认 50 次预热，消除 JIT/缓存冷启动效应
3. **GC 消除干扰** — `_run_bench` 在正式测量前调用 `gc.collect()`
4. **迭代次数选择：**
   - 微秒级操作：1000-2000 次
   - 毫秒级操作：200-500 次
   - 秒级操作：10-50 次
5. **临时文件用 `tempfile`** — 数据库测试用临时目录，不污染项目
6. **异步操作要等待** — 如果测试涉及异步写入，`time.sleep()` 等待完成

### 命名规范

- 函数名：`bench_<module>_<function>`
- 显示名：`<module>.<function> (场景描述)`

---

## 工具函数 API 参考

### `_run_bench(name, func, iterations, warmup)`

运行基准测试的核心函数。

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `name` | `str` | — | 测试名称 |
| `func` | `callable` | — | 被测函数（无参数） |
| `iterations` | `int` | `1000` | 正式测量迭代次数 |
| `warmup` | `int` | `50` | 预热次数 |

**返回值：** `Dict[str, Any]`，包含：

```python
{
    "name": str,           # 测试名称
    "iterations": int,     # 迭代次数
    "total_ms": float,     # 总耗时 (ms)
    "avg_ns": float,       # 平均耗时 (ns)
    "p50_ns": int,         # P50 (ns)
    "p95_ns": int,         # P95 (ns)
    "p99_ns": int,         # P99 (ns)
    "min_ns": int,         # 最小值 (ns)
    "max_ns": int,         # 最大值 (ns)
}
```

### `_fmt_us(ns)` / `_fmt_ms(ns)`

将纳秒格式化为微秒/毫秒字符串。

```python
_fmt_us(24700)   # → "24.7 µs"
_fmt_ms(1234567) # → "1.23 ms"
```

### `_make_attempt(i)` / `_make_recent_item(i)`

生成测试用的 attempt / recent_request 数据。可被多个测试复用。

---

## 附录：测试文件位置

| 文件 | 说明 |
|---|---|
| `benchmark_perf.py` | 基准测试脚本（项目根目录） |
| `docs/benchmark-guide.md` | 本文档 |
| `docs/optimization-strategy.md` | 项目优化战略规划 |
| `docs/superpowers/specs/2026-06-13-extreme-performance-design.md` | 极限性能设计规范 |

---

## 附录：优化对比工作流速查卡

```
┌──────────────────────────────────────────────────┐
│           性能优化 A/B 对比工作流                    │
│                                                    │
│  1. python benchmark_perf.py > before.txt         │
│                                                    │
│  2. 修改代码                                       │
│                                                    │
│  3. python benchmark_perf.py > after.txt          │
│                                                    │
│  4. diff before.txt after.txt                     │
│                                                    │
│  5. 如果回退 → git checkout 回退                    │
│     如果提升 → 提交代码 + 更新本文档                  │
│                                                    │
│  规则：没有数据支撑的"优化"不算优化。                 │
└──────────────────────────────────────────────────┘
```
