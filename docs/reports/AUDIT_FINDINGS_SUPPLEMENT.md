# LiteLLM Proxy — 补充扫描发现（审计报告之外）

核验方式：实际通读 config_loader / model_registry / scheduler_policy / usage_accounting /
format_adapters / request_routes / request_dispatcher / model_discovery_queue / proxy_utils /
chat / responses / upstream_client / sse2json(主要分支) / observability / admin_routes 等模块。
以下均为审计报告未提及、经代码确认的问题。

图例：🔴中高 · 🟡低中 · ⚪低/卫生

---

## 🔴 中高

### N1. Anthropic 分支默认 model 硬编码 "deepseek-v4-flash"
`sse2json.py` L4451：
```python
original_model = req.get("model", "deepseek-v4-flash")
```
对比 `chat.py` L12 `req.get("model", "")`、`responses.py` L10 `req.get("model", "")` 均默认空串。
当客户端发 `/v1/messages` 但漏传 `model` 字段时，Anthropic 分支会**静默替换成一个特定的 DeepSeek 模型**，
可能导致路由到不存在的模型或错误 provider。Anthropic 官方 API 要求 model 必填，应返回 400 而非静默替换。
**不一致 + 潜在错误路由。**

### N2. 模型发现对 Anthropic provider 用 Bearer 鉴权 → 必然 401
`model_registry.py` L954（`fetch_one`）：
```python
headers["Authorization"] = f"Bearer {key}"
```
对所有 provider 统一用 `Authorization: Bearer`。而 Anthropic 的 `/v1/models` 需要 `x-api-key` 头。
结果：Anthropic provider 的模型发现**永远 401 失败**，只能靠 `static_models` 兜底或一直显示 error 状态。
实际请求转发时 `router._build_attempt_details` 会按格式选正确头，但**发现路径没有**。建议按 provider 格式选鉴权头。

### N3. same_key_retries 配置被当作布尔用（语义不匹配）
`sse2json.py` L2574-2582 `_same_key_retries_for_transient_errors()` 返回 0–3 的**计数**：
```python
return max(0, min(int(value), 3))
```
但三个 compat_retry 调用方（L3176、L3254、L3466）都只重试**一次**：
```python
if same_key_retries > 0 and _is_same_key_retryable_http(...):
    ...  # 仅一次重试，无论 same_key_retries=1/2/3
```
用户配 `retry.same_key_retries=3` 期望重试 3 次，实际只重试 1 次。函数名/返回值与行为不符。

---

## 🟡 低中

### N4. union 模型发现的 8s 预算未真正生效
`model_registry.py` L1069-1116：
```python
with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, ...)) as ex:
    futs = {ex.submit(fetch_one, p): p for p in providers_list}
    end = time.time() + 8.0
    for fut, p in list(futs.items()):
        remaining = max(0.0, end - time.time())
        if remaining <= 0:
            break                       # 仅跳出收集循环
        fut.result(timeout=remaining)
```
`break` 只退出结果收集，`with ... as ex` 退出时 `shutdown(wait=True)` 仍会**等待所有已提交任务完成**
（每个 fetch_one 内部 `timeout_s=6`）。慢 provider 场景实际阻塞 `ceil(N/4)*6s`，8s 预算形同虚设。

### N5. `_active` 无 TTL 清理（孤儿条目残留）
`observability.py` L43 `self._active = {}`，L253 `record_request_start` 加入，L382 `record_request_end` 移除。
若请求线程异常退出未走到 `record_request_end`（如 `daemon_threads=True` 被 abrupt 终止、流式中途进程信号），
条目**永久残留**，`requests_in_flight` 计数永久偏高，且无后台 sweeper 回收。审计 MEDIUM 提及，**确认属实**。

### N6. config 文件解析失败静默回退默认配置
`config_loader.py` L644 与 L681：
```python
except Exception:
    pass    # 静默回退到默认配置
```
`config.json` / `runtime_config.json` JSON 损坏时无任何日志，直接用默认配置（含占位符 key `"your key"`）。
注：zero-config 机制会用环境变量覆盖占位符 provider，所以未必真用占位符启动，但**用户完全不知配置没加载**。
审计 MEDIUM 提及，**确认属实**，建议至少打印一条警告。

### N7. "." reasoning 占位符注入对话历史
`sse2json.py` L3095-3097 `_force_chat_reasoning_content_if_needed`：
```python
if msg.get("reasoning_content") is None or msg.get("reasoning_content") == "":
    msg["reasoning_content"] = "."
```
以及 `protocol_adapters.py` L97/L123 同样注入 `"."`。当 provider 要求 reasoning_content 时，
对历史 assistant 消息注入单字符占位。这是有意的兼容处理，但 `"."` 会进入上游上下文，
可能影响模型行为/计费。审计 MEDIUM 提及，**确认属实**，建议用空对象/显式标记替代。

### N8. `_anthropic_upstream_requires_thinking` 按 provider 名硬编码 "deepseek"
`sse2json.py` L3106：
```python
return bool(pcfg.get("force_anthropic_thinking", False)) or getattr(attempt, "provider", "") == "deepseek"
```
名为 "deepseek" 的 provider 强制 thinking。若用户把 DeepSeek 类 provider 命名为别的（如 "ds" / "deepseek-official"），
则不触发；反之叫 "deepseek" 的非 DeepSeek provider 会被强制 thinking。**应改用配置开关或 base_url 识别**。

---

## ⚪ 低 / 代码卫生

### N9. request_dispatcher.py 是空壳
`request_dispatcher.py` L35 `pass`、L42 `pass`——`dispatch_request` 与 `RequestDispatcher.dispatch` 均未实现。
实际分发逻辑内联在 chat.py / responses.py / sse2json.py。属未完成重构的死代码，建议删除或补实现。

### N10. `_DIAGNOSTIC_QUEUE` 满时静默丢弃诊断
`sse2json.py` L88 `queue.Queue(maxsize=1000)`，L2889 `_DIAGNOSTIC_QUEUE.put((path, line), block=False)`，
满时抛 `queue.Full` 被 L2890 `except Exception: return` 吞掉。高负载下诊断日志无声丢失。
诊断是 best-effort，可接受，但建议计数丢弃量并暴露到 metrics。

### N11. by_model 计数器随客户端输入增长（修正审计"by_* 无界增长"说法）
`observability.py` L252 `self._inc_dict(self._counters["by_model"], model or "")`。
`by_model` 以客户端传入的 model 字符串为 key，**若客户端发任意字符串可无界增长**。
但 `by_error_type` / `by_failure_reason` / `by_attempt_http_status` / `by_status` / `by_endpoint` /
`by_client_format` / `by_provider`（嵌套 `by_upstream_format` 仅 3 种）均为**有限集**。
审计"by_* 字典无界增长永不裁剪"**过于宽泛**——实质只有 `by_model` 有此风险，且需恶意/异常客户端输入。

### N12. PROXY_PORT 等环境变量 int() 无保护
`config_loader.py` L375 `int(os.environ["PROXY_PORT"])`、L377 `int(os.environ["PROXY_MAX_WORKERS"])`——
非数字时启动直接 `ValueError` 崩溃，无 try/except。运维误配时错误信息不友好。

### N13. count_tokens 估算极粗
`sse2json.py` L4413-4417：
```python
text = json.dumps(req)
est_tokens = max(1, len(text) // 4)
```
把整个请求 JSON（含 system / tools / metadata / 字段名）都按 char/4 估算，且 Anthropic 官方有专门 count_tokens 接口。
有意近似，但偏差大，可能误导客户端的上下文预算决策。

### N14. `payload["stream"]` 三元分支为死代码
`chat.py` L75、`sse2json.py` L4542：
```python
payload["stream"] = is_stream if attempt.upstream_format in (CHAT, RESPONSES, ANTHROPIC) else False
```
`(CHAT, RESPONSES, ANTHROPIC)` 已涵盖全部三种支持格式，`else False` 永不可达。无副作用，但属误导性代码。

### N15. `/v1/models` 未鉴权
`sse2json.py` L3741-3751 `GET /v1/models` 直接返回模型列表（含 union 能力），无鉴权。
模型名一般不算敏感，但会泄露已配置的模型范围。与 OpenAI 行为一致，**设计如此**，仅提示。

---

## 审计 MEDIUM 项的补充核验

| 审计 MEDIUM 说法 | 核验结论 |
|---|---|
| 配置解析错误静默回退默认 | ✅ 属实（N6） |
| Admin key 走 query string 泄露 | 🟡 **默认关闭**。`_allow_query_admin_key()` 默认 False（L2461），需显式 `server.allow_query_admin_key=true` 才开启。审计定级偏高 |
| 假 reasoning 占位符 "." | ✅ 属实（N7） |
| observability by_* 无界增长 | 🔶 **过宽**。仅 `by_model` 有风险（N11） |
| Orphaned _active 无 TTL | ✅ 属实（N5） |
| delete_requests 绕过 writer queue 锁致记录复活 | ⚪ 未在本轮完整核验，但 `history_store` 写入走 writer 线程 + queue，`clear()` 先 drain，与审计描述有出入，建议单独复核 |

---

## 优先级建议（结合上一份核验）

| 优先级 | 编号 | 问题 | 修复 |
|---|---|---|---|
| 1 | N2 | Anthropic 模型发现用错鉴权头 | 按格式选 `x-api-key` / `Bearer` |
| 2 | N1 | Anthropic 分支默认 model 硬编码 | 改为空串 + 缺 model 时 400 |
| 3 | N3 | same_key_retries 当布尔用 | 按计数循环重试，或改配置语义为布尔 |
| 4 | C2(上份) | null arguments TypeError | 一行：加 TypeError 捕获 |
| 5 | C5(上份) | audit prune 非原子 | tmp + os.replace |
| 6 | H16(上份) | proxy 凭据明文入 stdout | mask proxy_url |
| 7 | N5 | _active 无 TTL | 加后台 sweeper 或启动时重建 |
| 8 | N6 | 配置解析失败静默 | 至少 print 警告 |
