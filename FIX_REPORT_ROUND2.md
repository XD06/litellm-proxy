# LiteLLM Proxy — 第二轮修复报告（新发现批次）

输入：第三方模型对新发现问题的报告（NC1-NC4 / NH1-NH11 / NM1-NM15 / NL1-NL8）。
处理方式：逐条对照源码核验 → 标注是否真实、是否已被上轮修复 → 修复真实未修项 → 全量测试。

基线：上轮结束 **581 passed**。本轮结束 **590 passed**（+9 新回归测试，0 回归）。

---

## 一、核验与修复决策

### 已被上轮修复 / 非问题（无需再改）
| 编号 | 结论 | 说明 |
|---|---|---|
| NM15 | ✅上轮已修 | Anthropic 默认 model 已改为 `""`（上轮 F6/N1） |
| NL8 | ⚪死代码 | `request_dispatcher.py` 空壳，上轮已记录为 N9，非 bug |
| NH7 | ⚪设计决策 | router 对所有 provider 统一用 `Authorization: Bearer`（含 Anthropic，官方接受 Bearer），与上轮 N2 复审一致；单改会制造不一致 |

### 本轮修复（15 项）

| 编号 | 问题 | 文件 | 改动 |
|---|---|---|---|
| NC1 | Slowloris — 请求体读取无 socket 超时 | `sse2json.py` `setup()` | `self.request.settimeout(_client_socket_timeout_s())`（默认 60s，可配 `server.client_socket_timeout_s`） |
| NC2 | DEBUG_LOG 原始 Authorization 落盘 | `sse2json.py` `log_request_detail` | 新增 `_redact_headers_for_log`，敏感头值脱敏后再写盘 |
| NC3 | retry_after_s 无上限 | `scheduler_policy.py` L152 | `min(int(retry_after_s), MAX_CONFIGURED_COOLDOWN_S)`（86400s 封顶） |
| NC4 | `m["role"]` 直接索引 KeyError | `protocol_adapters.py` L41 | 改 `m.get("role","")`，与其它转换一致 |
| NH1 | snapshot 浅拷贝 → 迭代竞态 | `observability.py` `snapshot()` | `copy.deepcopy(self._counters)` 在锁内 |
| NH2 | clear/delete 无 rollback → 连接池中毒 | `history_store.py` 3 处 except | 归还连接前 `conn.rollback()` |
| NH3 | write_loop 静默吞 DB 错误 | `history_store.py` `_write_loop` | 新增 `_write_failures` 计数 + 限频 print |
| NH4 | LIKE 通配符注入 | `history_store.py` | 新增 `_escape_like`，`LIKE ? ESCAPE '\\'`，`%`/`_` 转义 |
| NH8 | `_trigger_patrol_now` TOCTOU | `sse2json.py` | 新增 `_PATROL_TRIGGER_LOCK`，check-and-set 原子化 + `_bg` 异常兜底复位 |
| NH9 | `_http_error_details` e.read() 失败误判 | `sse2json.py` | `e.read()` 包 try/except，失败回退空 body，保住 status/headers |
| NH10 | `process_request` submit 失败 socket 泄漏 | `sse2json.py` | submit 包 try/except，失败 `shutdown_request` |
| NH11 | executor 无界队列 OOM | `sse2json.py` | `_active` 计数 + `_max_active`（=max_workers*4）上限，超限直接拒连 |
| NM11 | `PROXY_PORT=abc` 启动崩溃 | `config_loader.py` | 新增 `_env_int`，非数字回退默认 + 警告 |
| NM13 | `_timeout` int 截断浮点 | `upstream_client.py` | `int(...)` → `float(...)`，返回类型 `-> float` |
| NM14 | open_stream 错误体无上限 OOM | `upstream_client.py` | `resp.read(65536)` 封顶 64KiB |

### 暂缓（附理由）
| 编号 | 理由 |
|---|---|
| NH5 | thinking 块缺 signature：Anthropic API 对请求中 thinking 块要求**原始** signature，伪造同样被拒；OpenAI 格式不保留 signature，转换天然有损。需调研是否应直接丢弃 thinking 块（与 NH6 取舍联动），属 provider 语义改动，需真实 API 集成验证，单独迭代 |
| NH6 | Chat→Responses 丢弃 reasoning_content：Responses reasoning 输入项语义需对照 OpenAI Responses API 验证，风险同上 |
| NH7 | Bearer 统一覆盖：见上，设计决策 |
| NM1-NM10 | 多为路由/tool_choice/overlay 行为语义改动（如 NM2 阶梯强制 3600、NM3 transient_fails 累积、NM4-6 tool_choice 映射、NM10 overlay 烘焙），需逐项设计评审，单独迭代 |
| NM12 | forward_client_headers 是显式 allowlist，由运维配置；非默认泄漏 |
| NL1-NL7 | 低优先（子串匹配/O(n²)/file 块/流式硬编码等），留待优化迭代 |

---

## 二、新增回归测试（9 条）
- `tests/test_scheduler_policy.py::RetryAfterClampTests`（3 条）— NC3 retry_after 钳制
- `tests/test_conversions.py::RobustnessRegressionTests.test_nc4_missing_role_does_not_crash`（1 条）— NC4
- `tests/test_history_store.py::test_nh4_like_wildcards_are_escaped`（1 条）— NH4 `%`/`_` 字面化
- `tests/test_debug_log_redaction.py`（4 条）— NC2 头脱敏（含端到端写盘校验）

---

## 三、最终验证（2026-07-06）

```
本轮基线:   581 passed
本轮全量:   590 passed   (+9 新回归测试, 0 回归)
py_compile: ALL COMPILE OK（7 个改动文件）
```

两轮累计修复 **23 项**（上轮 8 + 本轮 15），累计新增回归测试 **23 条**，全量 **590 passed**。
