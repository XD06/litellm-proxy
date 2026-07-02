# LiteLLM Proxy 功能特性全景文档

> 本文档全面、详细地记录 LiteLLM Proxy 的所有功能特性、能力边界和技术特点。
> 更新日期：2026-07-03

---

## 目录

- [1. 项目定位](#1-项目定位)
- [2. 三格式互转引擎](#2-三格式互转引擎)
- [3. 智能路由系统](#3-智能路由系统)
- [4. 故障转移与冷却策略](#4-故障转移与冷却策略)
- [5. 流式处理能力](#5-流式处理能力)
- [6. 非流式处理能力](#6-非流式处理能力)
- [7. 模型管理系统](#7-模型管理系统)
- [8. 配置系统](#8-配置系统)
- [9. 可观测性系统](#9-可观测性系统)
- [10. Web 控制台](#10-web-控制台)
- [11. Admin API](#11-admin-api)
- [12. 安全特性](#12-安全特性)
- [13. 并发安全与运行时一致性](#13-并发安全与运行时一致性)
- [14. 部署能力](#14-部署能力)
- [15. 零配置模式](#15-零配置模式)
- [16. 兼容性能力](#16-兼容性能力)
- [17. 测试体系](#17-测试体系)
- [18. 已知限制](#18-已知限制)

---

## 1. 项目定位

LiteLLM Proxy 是一个基于 Python 的**格式感知 LLM API 代理**，位于 LLM 客户端和多个上游 LLM 供应商之间。

### 核心价值

| 价值 | 说明 |
|---|---|
| 一个端点，多个供应商 | 客户端只需访问一个 URL，代理自动路由到最佳供应商 |
| 格式自由 | 用 Anthropic 格式请求一个只支持 OpenAI 格式的供应商，反之亦然 |
| 弹性容错 | 跨供应商和密钥的自动故障转移，配合冷却策略 |
| 可观测性 | 完整请求历史、逐次尝试追踪、费用估算 |
| 零重启配置 | 控制台编辑直接写入运行时覆盖层，`config.json` 永不被修改 |

---

## 2. 三格式互转引擎

### 2.1 支持的 API 格式

| 格式 | 标识 | 客户端端点 | 典型客户端 |
|---|---|---|---|
| OpenAI Chat Completions | `chat_completions` | `POST /v1/chat/completions` | OpenAI SDK、Cherry Studio |
| OpenAI Responses | `responses` | `POST /v1/responses`、`POST /openai/v1/responses` | OpenAI SDK (Responses API) |
| Anthropic Messages | `anthropic_messages` | `POST /anthropic/v1/messages`、`POST /v1/messages` | Claude Code、Anthropic SDK |

### 2.2 转换矩阵

代理支持任意两种格式之间的**双向转换**，共 6 条跨格式转换路径：

| 客户端格式 → 上游格式 | 流式 | 非流式 |
|---|:---:|:---:|
| Chat ↔ Responses | ✅ | ✅ |
| Chat ↔ Anthropic | ✅ | ✅ |
| Responses ↔ Anthropic | ✅ | ✅ |
| Chat → Chat（同格式直通） | ✅ | ✅ |
| Responses → Responses（同格式直通） | ✅ | ✅ |
| Anthropic → Anthropic（同格式直通） | ✅ | ✅ |

### 2.3 转换覆盖的内容

- **文本增量**：逐 chunk 文本流转换
- **推理/思考块**：`reasoning_content`（Chat）、`thinking` / `thinking_delta`（Anthropic）、`reasoning_summary_text`（Responses）之间的互转
- **工具调用**：`tool_calls`（Chat）、`tool_use`（Anthropic）、`function_call`（Responses）之间的互转
- **工具结果**：`tool` 角色消息（Chat）、`tool_result`（Anthropic）、`function_call_output`（Responses）之间的互转
- **使用量统计**：跨格式的 token 用量归一化

### 2.4 同格式直通优化

当客户端格式与上游格式相同时，代理跳过 JSON 转换：
- **流式**：`relay_sse_stream()` 逐行转发原始 SSE 字节，可选扫描 usage
- **非流式**：解析校验后转发上游原始 JSON（`validated` 模式），或重新序列化（`safe` 模式）

---

## 3. 智能路由系统

### 3.1 五种路由模式

| 模式 | 标识 | 行为 | 适用场景 |
|---|---|---|---|
| 优先级故障转移 | `priority_failover` | 按 priority 排序供应商，出错时故障转移 | **默认**，保护上游缓存命中、固定主供应商 |
| 轮询 | `round_robin` | 供应商之间公平轮询 | 主动均衡多供应商流量 |
| 加权轮询 | `weighted_rr` | 按 weight 权重轮询 | 按比例分摊流量 |
| 随机 | `random` | 同一请求内顺序稳定的随机 | 临时打散 |
| 自动 | `auto` | 基于健康分数动态调整优先级（每 15 秒） | 自适应场景 |

### 3.2 模型级路由

支持为每个 canonical model 配置专用路由：

```jsonc
"routes": {
  "deepseek-v4-flash": {
    "providers": [
      { "name": "opencode", "weight": 1, "priority": 100 },
      { "name": "deepseek", "weight": 1, "priority": 90 }
    ],
    "provider_select": "priority_failover"  // 可覆盖全局策略
  }
}
```

- 未在 `routes` 中配置的模型使用 `routing.default_provider_pool`
- route 中的 `priority` 覆盖 provider 自身的 `priority`
- `weight` 仅在 `weighted_rr` 模式下生效

### 3.3 格式感知路由

路由器优先选择与客户端格式相同的上游格式（native-first）：
1. 先尝试同格式供应商（native 层）
2. 同格式供应商不可用时，回退到跨格式供应商（fallback 层）
3. 避免在同一请求中重试相同的 `provider + key_index + upstream_format` 组合

### 3.4 模型能力过滤

- 基于 `provider_model_capabilities` 快照过滤不支持目标模型的供应商
- 安全归一化：大小写、vendor 前缀（`vendor/model`）、空格/下划线自动合并
- 手工 `provider_model_map` 优先级最高，覆盖自动发现
- `assume_supports_unknown_models` 控制未发现能力时的容错行为

### 3.5 健康分数系统

`auto` 模式下，后台每 15 秒计算一次供应商健康分数：
- 综合成功率、延迟、错误类型权重
- 动态调整供应商优先级
- 健康分数影响 `priority_failover` 中的排序

---

## 4. 故障转移与冷却策略

### 4.1 错误分类

| 错误类型 | 触发条件 | 默认冷却范围 | 默认冷却时间 | 是否禁用密钥 |
|---|---|---|---|:---:|
| `key_invalid` | HTTP 401/403 | key | 3600s | ✅ |
| `rate_limited` | HTTP 429 | key | 30s | ❌ |
| `quota_or_balance` | HTTP 402 | key | 3600s | ❌ |
| `server_error` | HTTP 5xx | key | 10s | ❌ |
| `network_error` | 超时/断开/连接失败 | key + provider | 10s | ❌ |
| `provider_compat` | 格式不兼容 | 无 | 0s | ❌ |
| `empty_visible_output` | 200 但无可视输出 | 无 | 0s | ❌ |
| `client_error` | HTTP 4xx（非上述） | key | 10s | ❌ |

### 4.2 可配置失败策略

每种错误类型的冷却行为均可通过 `retry.failure_policies` 自定义：

```jsonc
"failure_policies": {
  "network_error": {
    "cooldown_scope": "key_provider",  // none | key | provider | key_provider
    "cooldown_s": 10,
    "provider_cooldown_s": 10,
    "disables_key": false
  }
}
```

### 4.3 重试机制

- **总尝试次数上限**：`routing.max_attempts`（默认 6），跨供应商+密钥的总和
- **仅响应头前重试**：一旦向客户端发送任何字节（SSE headers），不再透明重试
- **候选去重**：同一 `provider + key_index + upstream_format` 不会在同一请求中重试
- **Retry-After 尊重**：429 响应的 `Retry-After` 头优先于配置冷却时间
- **密钥失效梯子**：同一密钥连续失败时，冷却时间按 `key_failure_ladder_s` 递增（默认 `[10, 60, 3600]`）

### 4.4 同密钥瞬时重试

对于瞬时错误（如 429、网络超时），支持同一密钥内重试，无需切换供应商：
- 由 `retry.same_key_retries`（默认 1）控制
- 适用于流式和非流式路径
- 重试不消耗 `max_attempts` 配额

### 4.5 工具选择自动降级

当上游返回 `tool_choice` 不支持的错误（HTTP 400/404）时：
1. 自动将 `tool_choice` 降级为 `auto`
2. 记录 `provider_compat` / `tool_choice_auto_retry`
3. 使用同一供应商+密钥重试
4. 不冷却密钥

### 4.6 空输出检测与重试

当上游返回 HTTP 200 但转换后无可视文本输出（如只有 `reasoning_content` 但 `content` 为空，且 `finish_reason=length`）时：
1. 记录 `empty_visible_output`（不冷却密钥）
2. 自动切换到下一个供应商重试
3. 避免将"推理截断但无可见回答"的响应当作成功返回给客户端

---

## 5. 流式处理能力

### 5.1 SSE 流式转换

6 个流式转换器覆盖全部跨格式路径：

| 转换器 | 客户端格式 | 上游格式 |
|---|---|---|
| `stream_openai_sse_to_anthropic` | Anthropic | Chat |
| `stream_openai_sse_to_responses` | Responses | Chat |
| `stream_anthropic_sse_to_openai_chat` | Chat | Anthropic |
| `stream_anthropic_sse_to_responses` | Responses | Anthropic |
| `stream_responses_sse_to_openai_chat` | Chat | Responses |
| `stream_responses_sse_to_anthropic` | Anthropic | Responses |

### 5.2 流式直通

`relay_sse_stream()` 用于同格式流式请求：
- 逐行转发原始 SSE 字节
- 可选扫描 usage 数据（`native_stream_usage: full`）或跳过解析（`off`）
- 首字节后切换读取超时（从 `first_token_timeout_s` 到 `read_timeout_s`）

### 5.3 流式预取

`prefetch_initial_stream_lines()` 在发送客户端响应头之前预读上游首条 SSE data 事件：
- 用于 `safe` 模式下验证上游连通性
- 支持保留 prelude 行（注释、空行）用于回放
- 可配置最大 prelude 行数和字节数上限
- 超时或超限时关闭上游连接，可在响应头前切换供应商

### 5.4 流式配置

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `routing.native_stream_mode` | `guarded` | 同格式流式：`safe`（等首事件）或 `guarded`（立即发头） |
| `routing.first_token_timeout_s` | 30 | 首个可输出事件的超时秒数 |
| `routing.read_timeout_s` | 120 | 流式读取超时秒数 |
| `routing.stream_flush_interval_ms` | 0 | SSE 刷新间隔（0=每 delta 刷新） |
| `routing.stream_flush_bytes` | 0 | SSE 刷新字节阈值（0=禁用） |
| `routing.stream_prefetch_max_lines` | 128 | 预取最大 prelude 行数 |
| `routing.stream_prefetch_max_bytes` | 65536 | 预取最大 prelude 字节数 |
| `observability.native_stream_usage` | `full` | 同格式直通 usage 扫描模式 |

### 5.5 客户端断连处理

- `BrokenPipeError`、`ConnectionResetError`、`ConnectionAbortedError` 记录为 499
- Windows 特有的 `OSError`（winerror 10053/10054/10058）也识别为客户端断连
- 客户端断连不触发供应商冷却
- 响应头已发送后的流式中断发送格式适当的终止事件

### 5.6 流式错误优雅关闭

所有 6 个流式适配器在错误处理中：
- 发送格式适当的终止事件（`[DONE]`、`message_stop`、`response.failed`）
- 客户端已断连时静默处理
- 返回 `None` 信号失败，不抛出二次异常

---

## 6. 非流式处理能力

### 6.1 非流式转换

`protocol_adapters.py` 实现完整的请求/响应双向转换：
- 请求转换：客户端格式 → 上游格式
- 响应转换：上游格式 → 客户端格式
- 覆盖文本、推理、工具调用、工具结果

### 6.2 非流式配置

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `routing.native_nonstream_mode` | `validated` | 同格式非流式：`safe`（重序列化）或 `validated`（转发原始 bytes） |

### 6.3 空输出检测

非流式响应转换后检测：
- Chat：`choices[].message.content` 为空且无 `tool_calls`
- Anthropic：`content[]` 中无 `text` 或 `tool_use` 类型的 block
- Responses：`output[]` 中无文本内容

检测到空输出时自动切换供应商重试。

---

## 7. 模型管理系统

### 7.1 模型映射层级

```
客户端模型名
  ↓ client_model_map（别名映射）
canonical model
  ↓ provider_model_map（供应商特定映射）
上游实际模型 ID
```

- `disable_client_model_map`：禁用客户端别名映射，原样传递
- `client_model_map`：全局别名映射
- `provider_model_map`：per-provider 的手工映射，优先级最高

### 7.2 模型发现

- **后台异步发现**：`model_discovery_queue.py` 在独立守护线程中逐个拉取每个启用供应商的 `/v1/models`
- **TTL 缓存**：成功的快照有 TTL，失败的供应商在慢节奏上重试
- **安全归一化**：大小写、vendor 前缀、空格/下划线自动合并
- **手工映射覆盖**：手工 `provider_model_map` 优先于自动发现

### 7.3 模型列表端点

`GET /v1/models` 支持两种策略：

| 策略 | 说明 |
|---|---|
| `first_healthy_provider` | 返回首个健康供应商的模型快照（默认） |
| `union` | 返回所有启用供应商的模型并集 |

- 只读取本地快照，不临时请求上游
- 快照随运行时状态保存，重启后立即可用

### 7.4 模型摘要预取

启动时后台预取模型摘要信息（如 context window 大小、定价等），用于控制台展示。

---

## 8. 配置系统

### 8.1 三层配置优先级

```
config.json（基础配置） → runtime_config.json（运行时覆盖） → 环境变量
```

- `config.json`：启动时读取一次，**永不写入**
- `runtime_config.json`：控制台/Admin API 写入的覆盖层
- 环境变量：最高优先级，覆盖一切

### 8.2 Tombstone 删除机制

通过控制台删除配置项时：
1. 覆盖层存储 `null` 墓碑标记
2. 合并时 `null` 值移除对应的基础配置项
3. 基础配置项也被移除时，墓碑自动修剪

### 8.3 RLock 序列化提交

所有配置变更通过 `_locked_overlay()` 在可重入锁下完成：
1. 深拷贝当前覆盖层
2. 修改副本
3. 修剪墓碑
4. 原子写入文件（temp file + `os.replace`）
5. 交换覆盖层引用
6. 重新合并生成最终配置

### 8.4 环境变量

| 变量 | 作用 |
|---|---|
| `PROXY_CONFIG_PATH` | 基础配置路径 |
| `PROXY_RUNTIME_CONFIG_PATH` | 运行时覆盖路径 |
| `PROXY_PORT` | 覆盖 `server.port` |
| `PROXY_MAX_WORKERS` | 覆盖 `server.max_workers` |
| `PROXY_LOG_DIR` | 覆盖日志目录 |
| `PROXY_ADMIN_KEY` | 覆盖管理员密钥 |
| `PROXY_PROVIDER_KEYS__name` | 覆盖单个供应商密钥（JSON 数组） |
| `OPENAI_API_KEY` | 零配置自动检测 |
| `DEEPSEEK_API_KEY` | 零配置自动检测 |

### 8.5 CLI 参数

```bash
litellm-proxy                              # 使用默认配置启动
litellm-proxy --init                       # 从模板创建 config.json
litellm-proxy --config my.json --port 8080 # 自定义配置和端口
litellm-proxy --host 0.0.0.0 --port 8080   # 自定义绑定地址和端口
```

### 8.6 供应商代理链

代理 URL 优先级：`key.proxy → provider.proxy → 全局 proxy → 直连`

支持两种写法：
- 简单：`"proxy": "http://127.0.0.1:10808"`
- 完整：`"proxy": {"http": "...", "https": "..."}`

---

## 9. 可观测性系统

### 9.1 请求历史

- **SQLite 持久化**：WAL 模式，`synchronous=NORMAL`
- **异步写入**：后台单线程写入队列，不阻塞请求线程
- **有界队列**：默认 1000 条，满时丢弃历史记录但不阻塞请求
- **保留期修剪**：默认 30 天自动清理
- **重启恢复**：从 SQLite 重建内存计数器

### 9.2 逐次尝试追踪

每个请求记录完整的 attempt 链路：
- 供应商名称、密钥（脱敏）、上游格式
- HTTP 状态码、错误类型、错误摘要
- 首字节延迟、总延迟
- 路由解释（为什么选了这些供应商）

### 9.3 指标系统

- 实时活跃请求追踪
- Per-provider/per-key 成功/失败计数
- 首字节延迟分布
- 供应商活动事件流
- Token 用量和费用估算

### 9.4 费用估算

- 支持 per-provider 和 per-model 的定价配置
- 单位：USD / 1M tokens
- 跨格式的 token 用量归一化
- 控制台实时显示费用

### 9.5 诊断日志

- JSONL 格式，stdlib 无额外依赖
- 记录错误分类、上游错误摘要、脱敏密钥
- 区分上游 HTTP 错误、格式兼容重试、请求转换错误、网络传输错误、代理内部异常
- **不记录**请求正文、响应正文或完整 API 密钥

### 9.6 审计日志

- JSONL 格式
- 记录所有 Admin API 变更操作
- 敏感字段自动脱敏（`key`、`keys`、`api_key`、`authorization`、`admin_key`、`bearer`、`sk-*` 前缀）
- 最多保留 1000 条（可配置）

---

## 10. Web 控制台

### 10.1 功能概览

| 功能 | 说明 |
|---|---|
| 供应商健康 | 实时健康卡片，延迟图表，冷却状态 |
| 供应商管理 | 添加/编辑供应商、密钥、代理设置、上游格式 |
| 路由配置 | 编辑路由模式、重试策略、失败策略、模型路由 |
| 请求历史 | 逐次尝试追踪、延迟分解、Token 用量、费用估算 |
| Playground | 内置 API 测试器，支持三种格式，SSE 流式 |
| 运行时覆盖 | 导出、验证或清除运行时覆盖配置 |
| 审计日志 | 管理员操作记录，敏感字段自动脱敏 |
| 模型定价 | 基于 Artificial Analysis 数据的模型定价查询 |

### 10.2 技术栈

- 原生 JS + Vite 构建
- morphdom 进行高效 DOM diff
- i18n 国际化支持
- 无前端框架依赖

### 10.3 Playground

- 支持 Chat Completions、Responses、Anthropic Messages 三种格式
- SSE 流式实时显示
- 模型选择器（搜索/过滤）
- 路由追踪条（显示供应商、密钥、格式、模型、尝试次数、延迟、Token 用量）
- 后端注入 `X-Route-*` 响应头

### 10.4 安全特性

- 登录门控：验证管理员密钥后才渲染控制台
- 密钥错误不短暂暴露应用界面
- `admin_key` 登录后通过 `history.replaceState` 从 URL 移除
- 刷新时显示中性检查状态而非登录表单

---

## 11. Admin API

所有管理端点位于 `/-/admin/*`，需要管理员密钥认证。

### 11.1 认证方式

| 方式 | 说明 |
|---|---|
| `X-Admin-Key` 头 | 推荐方式 |
| `Authorization: Bearer` 头 | 兼容方式 |
| `?admin_key=` 查询参数 | 需 `server.allow_query_admin_key=true`（默认关闭） |

认证使用 `hmac.compare_digest` 进行时序安全比较。

### 11.2 主要端点

| 端点 | 方法 | 功能 |
|---|---|---|
| `/-/admin/status` | GET | 供应商状态、健康、密钥可用性 |
| `/-/admin/requests` | GET | 请求历史列表 |
| `/-/admin/requests/clear` | POST | 清空请求历史 |
| `/-/admin/routing` | GET | 路由策略快照 |
| `/-/admin/config` | GET | 当前配置（脱敏） |
| `/-/admin/config/providers` | POST/PATCH/DELETE | 供应商增删改 |
| `/-/admin/config/routing` | PATCH | 路由配置修改 |
| `/-/admin/config/retry` | PATCH | 重试策略修改 |
| `/-/admin/config/models` | PATCH | 模型路由修改 |
| `/-/admin/config/overlay` | GET/DELETE | 覆盖层导出/清除 |
| `/-/admin/config/reload` | POST | 重新加载配置 |
| `/-/admin/models/refresh` | POST | 刷新模型发现 |
| `/-/admin/model-pricing` | GET | 批量模型定价查询 |
| `/-/admin/audit` | GET | 审计日志 |
| `/-/admin/health-scores` | GET | 健康分数详情 |

---

## 12. 安全特性

### 12.1 密钥安全

- 所有 API 响应和历史记录中密钥始终脱敏（`sk-xxx**xx` 格式）
- 日志中密钥截断显示（`log_key_mask` 可配置前缀和后缀位数）
- 审计日志自动脱敏敏感字段
- 请求正文**不记录**到历史或日志中

### 12.2 管理员认证

- `hmac.compare_digest` 时序安全比较
- 查询参数认证默认关闭（`server.allow_query_admin_key`）
- 登录后从 URL 移除 `admin_key`
- 绑定地址警告（`0.0.0.0` 时打印安全提示）

### 12.3 请求体大小限制

- `server.max_request_body_bytes`（默认 32 MiB）
- 超限返回 413
- 畸形 `Content-Length` 返回 400
- 0 禁用限制

### 12.4 诊断安全

- 诊断日志只保存 request_id、provider/model/format、错误分类、上游错误摘要和脱敏密钥
- 不保存请求正文
- 不保存完整 API 密钥
- `X-Route-*` 响应头不含完整密钥

---

## 13. 并发安全与运行时一致性

### 13.1 RuntimeContext 原子快照

```python
class RuntimeContext:
    __slots__ = ("config", "router", "upstream_client", "observability", "audit")
```

- 所有五个运行时对象捆绑为一个不可变 bundle
- 配置重载时原子交换 `RUNTIME` 引用
- 请求线程在入口处捕获一次快照，整个请求生命周期使用同一快照

### 13.2 线程级运行时存储

- `_set_request_rt(rt)` 将快照绑定到当前线程
- 模块级辅助函数通过 `_current_rt()` 访问同一快照
- 防止配置热加载期间辅助函数使用新 router/observability 而请求的 attempt 由旧 router 创建
- `_clear_request_rt()` 在请求结束后清理

### 13.3 配置覆盖序列化

- `RLock` 可重入锁保护完整的读-改-写-持久化-交换序列
- 深拷贝覆盖层副本，防止并发修改
- `temp file + os.replace` 原子写入
- 防止并发 Admin API 变更导致更新丢失

### 13.4 流式适配器错误安全

- 所有 6 个流式转换器在错误处理中 `try/except` 包裹
- 客户端已断连时静默处理
- 不抛出二次异常

---

## 14. 部署能力

### 14.1 Docker

| 特性 | 说明 |
|---|---|
| 基础镜像 | Python 3.12-slim |
| 多架构 | amd64 + arm64 |
| 权限降级 | gosu 切换到 `appuser` |
| 健康检查 | `docker-compose.yml` 内置 |
| 卷挂载 | config、runtime、data、logs 分离 |

```bash
docker pull dsk3/litellm-proxy:latest
docker compose up -d --build
```

### 14.2 裸金属部署

- `deploy/systemd/litellm-proxy.service`：安全加固的 systemd unit
  - `NoNewPrivileges`、`ProtectSystem`、`PrivateTmp`
- `deploy/nginx/litellm-proxy.conf`：Nginx 反向代理配置
  - SSE 友好（`proxy_buffering off`、长超时）

### 14.3 CI/CD

| 工作流 | 触发 | 功能 |
|---|---|---|
| CI | push/PR 到 `main` | Python 3.10-3.13 矩阵测试、编译检查、控制台语法检查、Docker 构建+冒烟测试 |
| Docker 发布 | push 到 `main`、tag `v*` | 多架构构建、推送 Docker Hub、冒烟测试 |

---

## 15. 零配置模式

无 `config.json` 时，代理自动从环境变量推断供应商配置：

| 环境变量 | 自动创建的供应商 | 上游格式 | Base URL |
|---|---|---|---|
| `OPENAI_API_KEY` | `openai` | chat_completions + responses | `https://api.openai.com` |
| `ANTHROPIC_API_KEY` | `anthropic` | anthropic_messages | `https://api.anthropic.com` |
| `DEEPSEEK_API_KEY` | `deepseek` | chat_completions + anthropic_messages | `https://api.deepseek.com` |
| `OPENROUTER_API_KEY` | `openrouter` | chat_completions | `https://openrouter.ai/api` |
| `GROQ_API_KEY` | `groq` | chat_completions | `https://api.groq.com/openai` |

- 自动生成随机 `admin_key`（打印到终端）
- `models_source` 默认 `union`（自动拉取并合并所有供应商模型）
- `provider_select` 默认 `priority_failover`

```bash
OPENAI_API_KEY=sk-... DEEPSEEK_API_KEY=sk-... python sse2json.py
```

---

## 16. 兼容性能力

### 16.1 客户端兼容

| 客户端 | 兼容性 |
|---|---|
| Cherry Studio | ✅ 完整支持 |
| Claude Code | ✅ 完整支持（含 `count_tokens` 端点） |
| OpenAI SDK | ✅ 完整支持 |
| Anthropic SDK | ✅ 完整支持 |
| 任意 OpenAI 兼容客户端 | ✅ 通过 `/v1/chat/completions` |
| 任意 Anthropic 兼容客户端 | ✅ 通过 `/anthropic/v1/messages` |

### 16.2 推理模式兼容

- **DeepSeek Chat 思考模式**：`force_reasoning_content` 自动为历史 assistant 消息填充 `reasoning_content` 占位符
- **DeepSeek Anthropic 思考模式**：`force_anthropic_thinking` 自动为历史 assistant 消息填充 `thinking` block 占位符
- 防止 `content[].thinking must be passed back` / `thinking_content_required` 错误

### 16.3 旧版端点兼容

- `/v1/messages`：旧版 Anthropic Messages 别名
- `/openai/v1/responses`：命名空间 Responses 别名
- 旧环境变量（`UPSTREAM_URL`、`UPSTREAM_API_KEY`、`MODEL_MAP`、`DISABLE_MODEL_MAP`）仍兼容

### 16.4 SSE 解析容错

- 支持无空格 `data:{...}`（SSE 规范允许）
- 支持尾随空白 `data: [DONE]\r`
- 统一通过 `sse_data_payload()` / `is_sse_done()` 解析

---

## 17. 测试体系

### 17.1 测试规模

- **459+ 测试用例**，28 个测试文件
- 覆盖路由、转换、配置、流式、Admin API、可观测性、基础设施、模型管理

### 17.2 测试分类

| 分类 | 关键测试文件 |
|---|---|
| 路由与故障转移 | `test_router.py`、`test_auto_routing.py`、`test_scheduler_policy.py` |
| 格式转换 | `test_conversions.py`、`test_format_adapters.py`、`test_stream_adapters.py` |
| HTTP 路由 | `test_http_route_dispatch.py`、`test_request_routes.py` |
| 配置 | `test_config_loader.py`、`test_config_manager.py`、`test_zero_config.py`、`test_runtime_config_migration.py` |
| 代理处理器 | `test_chat_proxy.py`、`test_anthropic_proxy.py`、`test_responses_proxy.py` |
| 流式 | `test_stream_adapters.py`、`test_stream_interruption.py` |
| Admin API | `test_admin_api.py` |
| 可观测性 | `test_observability.py`、`test_history_store.py`、`test_provider_activity.py` |
| 基础设施 | `test_upstream_client.py`、`test_timeout_budget.py`、`test_health_scores.py` |
| 模型 | `test_model_registry.py`、`test_model_inference.py`、`test_model_discovery_queue.py` |

### 17.3 CI 矩阵

- Python 3.10 / 3.11 / 3.12 / 3.13
- 编译检查核心文件
- 控制台语法检查
- Docker 构建 + 冒烟测试

---

## 18. 已知限制

| 限制 | 说明 |
|---|---|
| 托管工具 | 供应商私有工具扩展（如 OpenAI hosted tools）未完整支持 |
| 复杂多模态 | 多模态 content chunk 的转换覆盖有限 |
| 供应商私有 SSE 事件 | 非通用 SSE 事件变体可能不被识别 |
| 流式 JSON 片段 | 畸形或不完整的流式 JSON 参数片段可能导致解析问题 |
| 响应头后重试 | SSE 响应头写出后不再支持透明重试（设计决策） |
| 连接池 | 当前使用 urllib3，无 HTTP/2 支持 |
| Windows 部分错误 | 部分 Windows socket 错误可能未被识别为客户端断连 |

---

## 技术栈一览

| 层 | 技术 |
|---|---|
| 语言 | Python 3.10+（推荐 3.12） |
| HTTP 服务器 | Python stdlib `http.server` + `ThreadingMixIn` |
| 上游 HTTP 客户端 | urllib3（生产）/ urllib（测试可选） |
| 数据存储 | SQLite（stdlib，WAL 模式） |
| 日志 | JSONL（stdlib `json` + `open`） |
| 控制台前端 | 原生 JS + Vite + morphdom |
| 容器 | Docker（Python 3.12-slim，多架构） |
| CI/CD | GitHub Actions |
| 外部依赖 | urllib3（唯一非 stdlib 运行时依赖） |
