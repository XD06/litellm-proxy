# sse2json — Anthropic Messages ↔ OpenAI Chat Completions Proxy

把 Anthropic Messages API 格式实时转换为 OpenAI Chat Completions 格式的本地代理。支持流式 SSE 转换、Thinking 块、Tool Calls、Tool Results，以及**多供应商轮换、多 Key 切换、代理支持、模型发现与能力过滤**。

## 解决的问题

越来越多的 AI 客户端（Claude Code SDK、Cherry Studio Agent 模式等）使用 Anthropic Messages API 格式，但很多第三方 API 只支持 OpenAI 兼容格式。这个代理充当中间层，客户端发 Anthropic 格式请求，代理转发 OpenAI 格式给上游，再把响应转回 Anthropic 格式。

## 快速开始

```bash
# 1. 复制示例配置并填写你自己的 providers/keys
copy config.example.jsonc config.json

# 2. 启动
python3 sse2json.py

# 3. 客户端配置
# 将客户端的 API Base URL 设为 http://127.0.0.1:4894
# 使用任意 API Key（如 "sk-test"）
```

Windows 用户可直接双击 `start_proxy_config.bat`。

---

## 配置详解（config.json + runtime_config.json）

生产运行时会同时读取两个配置文件：

- `config.json` 是基础配置，适合放默认供应商、路由、重试策略和服务端口。
- `runtime_config.json` 是控制台/Admin API 写入的运行时覆盖配置，适合保存新增 provider、密钥、代理、格式开关、模型路由等在线修改。
- 最终生效优先级是 `config.json` → `runtime_config.json` → 环境变量。环境变量优先级最高；控制台修改不会直接改写 `config.json`。
- `runtime_config.json` 里的 `null` 只用于隐藏仍存在于 `config.json` 的基础项；已经不需要的旧删除标记会在 overlay compact 或后续配置提交时清理。

完整示例见 `config.example.jsonc`。核心配置结构：

```jsonc
{
  "server": {
    "port": 4894,           // 本地监听端口
    "max_workers": 20,       // 最大并发线程数
    "log_dir": "proxy_logs", // 日志目录
    "debug_disk_log": false, // 是否开启请求级磁盘日志
    "admin_key": "sk-admin-change-me" // 为空时 /-/admin/* 不可访问
  },
  "proxy": {},               // ★ 全局代理（最低优先级 fallback）
  "routing": {
    "default_provider_pool": ["opencode", "rawchat", "deepseek"],
    "provider_select": "priority_failover", // priority_failover | round_robin | weighted_rr | random
    "max_attempts": 6,                       // 单次请求最大尝试次数
    "connect_timeout_s": 30,
    "read_timeout_s": 180
  },
  "retry": {
    "retryable_status": [408, 409, 425, 429, 500, 502, 503, 504],
    "key_fatal_status": [401, 403],    // 这些状态码视为 key 失效
    "cooldown_s": {
      "rate_limit": 30, "server_error": 10,
      "network_error": 10, "key_invalid": 3600,
      "quota_or_balance": 3600
    },
    "failure_policies": {
      "quota_or_balance": { "cooldown_scope": "key", "cooldown_s": 3600 },
      "network_error": {
        "cooldown_scope": "key_provider",
        "cooldown_s": 10,
        "provider_cooldown_s": 10,
        "disables_key": false
      },
      "provider_compat": { "cooldown_scope": "none", "cooldown_s": 0 },
      "empty_visible_output": { "cooldown_scope": "none", "cooldown_s": 0 }
    }
  },
  "models": {
    "disable_client_model_map": true,
    "client_model_map": {},             // 客户端模型名 → canonical model；默认不改写
    "models_source": "union",           // first_healthy_provider | union
    "provider_model_map": {},           // 手动映射：canonical → 各 provider 真实模型名
    "provider_model_capabilities": {},  // 运行时自动发现快照，不需要手工填写
    "assume_supports_unknown_models": true
  },
  "providers": {
    "deepseek": {
      "base_url": "https://api.deepseek.com",
      "priority": 90, // priority_failover 下数值越大越优先
      "formats": {
        "chat_completions": { "enabled": true, "path": "/v1/chat/completions" },
        "responses": { "enabled": false, "path": "/v1/responses" },
        "anthropic_messages": { "enabled": false, "path": "/v1/messages" }
      },
      "keys": [
        "sk-default",
        { "key": "sk-special", "proxy": "http://127.0.0.1:9000" }
      ],
      "proxy": "http://127.0.0.1:8000"  // ★ 供应商级别代理（可选）
    }
  }
}
```

### 关键特性

#### 1. 多供应商 + 多 Key 轮换
- 每个请求在供应商之间**交替轮换**（不会黏在一个供应商上耗光所有 key）
- 同一供应商多把 key 按 RR 指针轮换
- `max_attempts` 是尝试上限，不是必须填满；同一次客户端请求内，同一个 `provider + key_index + upstream_format` 只尝试一次，避免无意义重复调用同一上游 key
- 失败自动切换：401/402/429/5xx → 冷却 → 下一把 key 或下一个供应商

#### 1.1 供应商格式能力（`formats`）
- 每个 provider 会归一化出 `chat_completions`、`responses`、`anthropic_messages` 三个格式能力
- 旧配置不写 `formats` 时，默认按 Chat Completions 兼容处理
- 旧字段 `chat_completions_path`、`responses_path`、`anthropic_messages_path` 会映射到 `formats.*.path`
- `base_url` 如果包含完整 endpoint，会自动拆成 base URL + format path
- 当前可推断的 hint：`anthropic` → Anthropic Messages，`responses`/`response`/`codex` → Responses，尾部 `/v1` → Chat Completions
- router 已经能按 `upstream_format` 优先选择同格式供应商；具体请求处理会按已实现的转换路径逐步开放

#### 2. 模型发现与能力过滤（`models_source: "union"`）
- 拉取所有启用供应商的 `/v1/models`，生成统一模型列表
- 自动发现结果写入运行时 `provider_model_capabilities`，不会覆盖手工 `provider_model_map`
- 只做保守归一：精确小写匹配、`vendor/model` 后缀匹配；不会把 `v4-flash` 猜成 `deepseek-v4-flash`
- 路由会根据能力快照过滤供应商，避免把 `deepseek-v4-flash` 发给只支持 `gpt-5.5` 的 rawchat
- 若 provider `base_url` 带路径且该路径下 `/v1/models` 不存在，会再尝试根域 `/v1/models`；不影响真实生成请求的 endpoint 路径

#### 3. 模型存在性过滤
- 手工 `provider_model_map` 只覆盖对应供应商的真实模型名；它不是全局供应商白名单。要限制某个模型走哪些供应商，用 `models.routes` 或关闭未知模型假设。
- 没有手工映射时，使用 `provider_model_capabilities` 自动能力快照过滤
- 发现失败或尚未发现的供应商默认仍允许尝试，避免启动时网络失败导致服务不可用
- 如需更严格，可设置 `models.assume_supports_unknown_models: false` 或 provider 级同名字段

#### 4. 模型不存在智能检测
- 上游返回 400/404 时，自动检查错误体是否为"模型不存在"（`not found`、`does not exist`、`not supported` 等关键词）
- **检测到模型不存在 → 立即停止轮换**，直接返回错误给客户端
- 避免在 max_attempts=6 的情况下无效轮询所有供应商的所有 Key

#### 5. 代理支持（优先级：key > provider > 全局 > 直连）
```jsonc
// 全局代理
"proxy": "http://127.0.0.1:7000"

"providers": {
  "deepseek": {
    "proxy": "http://127.0.0.1:8000",
    "keys": [
      "sk-default", // 不设置 key proxy → 使用 provider.proxy；provider 没有则回退全局 proxy
      { "key": "sk-special", "proxy": "http://127.0.0.1:9000" } // 最高优先级，只对这把 key 生效
    ]
  },
  "opencode": {
    "keys": ["sk-opencode"] // provider/key 都不填 proxy → 使用全局 proxy；全局也为空则直连
  }
}
```

#### 6. 模型映射链
```
客户端请求模型名
  │  client_model_map（可选；默认不改写）
  ▼
canonical model (如 "deepseek-v4-flash")
  │  provider_model_map（手工，最高优先级）
  │  provider_model_capabilities（自动发现，仅作运行时能力快照）
  ▼
供应商实际模型名:
  deepseek   → deepseek-v4-flash
  opencode   → deepseek-v4-flash
  rawchat    → gpt-5.5
```

未在 `client_model_map` 中的模型会**透传**（不再强制 fallback 到默认模型）。

---

## 支持的端点

| 端点 | 说明 |
|------|------|
| `POST /v1/chat/completions` | OpenAI Chat Completions（非流式支持 Responses/Anthropic fallback；流式当前仅原生 Chat 上游） |
| `POST /anthropic/v1/messages` | Anthropic Messages 主消息 API（非流式支持原生 Anthropic/Chat/Responses fallback；流式支持原生 Anthropic 直传、Chat Completions SSE fallback、Responses SSE fallback） |
| `POST /anthropic/v1/messages?beta=true` | Claude Code 会加此参数 |
| `POST /anthropic/v1/messages/count_tokens` | Token 估算 |
| `POST /v1/responses` | OpenAI Responses 推荐入口（非流式支持原生 Responses/Chat/Anthropic fallback；流式支持原生 Responses 直传、Chat Completions SSE fallback、Anthropic Messages SSE fallback） |
| `POST /openai/v1/responses` | OpenAI Responses 兼容别名 |
| `POST /v1/messages` | Legacy Anthropic Messages 迁移兼容 |
| `POST /v1/messages/count_tokens` | Legacy Token 估算 |
| `GET /v1/models` | 可用模型列表（支持 union 自动合并） |
| `GET /health` | 健康检查 |
| `GET /-/dashboard` | Web 控制台静态入口；页面壳可打开，数据与变更请求仍需 admin key |
| `GET /-/admin/status` | 管理状态快照（需 admin key） |
| `GET /-/admin/metrics` | 请求/attempt 统计、失败汇总、最近请求（需 admin key） |
| `GET /-/admin/metrics/timeseries?bucket_s=60&buckets=30` | 控制台图表用时间桶统计，优先读 SQLite 历史，含首字延迟 `first_byte_ms`、总耗时 `duration_ms`、token/cost、provider/format/error/status 维度（需 admin key） |
| `GET /-/admin/requests` | 最近请求列表，支持 `provider/status/status_code/client_format/endpoint/model/upstream_format/error_type/failure_reason/http_status/limit/offset` 查询 |
| `GET /-/admin/requests/{request_id}` | 单个请求详情，包含 attempt 明细 |
| `GET /-/admin/routing` | 调度策略与 provider/key 状态（需 admin key） |
| `GET /-/admin/models/capabilities` | provider 模型能力快照（需 admin key） |
| `GET /-/admin/config` | 脱敏后的当前配置视图 |
| `GET /-/admin/config/overlay` | 脱敏后的 runtime overlay 导出 |
| `GET /-/admin/audit` | 最近 admin mutation 审计记录 |
| `POST /-/admin/providers` | 新增 provider 并写入 `runtime_config.json` |
| `PATCH /-/admin/proxy` | 更新全局代理 fallback，并写入 `runtime_config.json` |
| `PATCH /-/admin/providers/{provider}` | 更新 provider 基础字段并写入 `runtime_config.json` |
| `POST /-/admin/providers/{provider}/keys` | 添加 provider key 并写入 `runtime_config.json` |
| `PATCH /-/admin/providers/{provider}/keys/{index}` | 更新指定 key 的代理设置，并写入 `runtime_config.json` |
| `POST /-/admin/providers/{provider}/keys/{index}/delete` | 带确认字段删除指定 key，并写入 `runtime_config.json`；支持控制台显示的稀疏 key index |
| `PATCH /-/admin/providers/{provider}/formats/{format}` | 更新 provider 格式能力并写入 `runtime_config.json` |
| `PATCH /-/admin/routing` | 更新常用路由参数并写入 `runtime_config.json` |
| `PATCH /-/admin/retry` | 更新常用重试/冷却参数并写入 `runtime_config.json` |
| `PATCH /-/admin/retry/failure-policies` | 更新单个 `retry.failure_policies.{error_type}` |
| `PATCH /-/admin/models/routes` | 新增或更新 `models.routes.{model}`，支持 provider 权重、优先级和 per-model `provider_select` |
| `POST /-/admin/models/routes/delete` | 删除或覆盖禁用指定 model route |
| `POST /-/admin/config/reload` | 重新加载配置并重建 router/client/metrics |
| `POST /-/admin/config/overlay/validate` | 验证当前或候选 runtime overlay，不写入文件 |
| `POST /-/admin/config/overlay/clear` | 带确认字段清空 runtime overlay，并把旧文件移到 `.bak.<ts>` |
| `POST /-/admin/providers/{provider}/enable` | 运行时启用 provider（不写回配置） |
| `POST /-/admin/providers/{provider}/disable` | 运行时禁用 provider（不写回配置） |
| `POST /-/admin/providers/{provider}/cooldown/clear` | 清除 provider 冷却状态 |
| `POST /-/admin/providers/{provider}/keys/{index}/enable` | 运行时启用指定 key（不写回配置） |
| `POST /-/admin/providers/{provider}/keys/{index}/disable` | 运行时禁用指定 key（不写回配置） |
| `POST /-/admin/providers/{provider}/keys/{index}/state/clear` | 清除指定 key 的冷却/禁用/失败计数 |
| `POST /-/admin/models/refresh` | 清空模型缓存并重新发现 provider 模型能力 |

推荐把客户端 base URL 配成统一的 `/v1` 入口，让客户端 SDK 自己补全最终路径：`/v1/chat/completions` 识别为 Chat Completions，`/v1/responses` 识别为 OpenAI Responses，`/v1/messages` 识别为 Anthropic Messages。`/anthropic/v1/messages` 和 `/openai/v1/responses` 仍保留为兼容别名。三种客户端格式的流式请求现在都可以使用三种上游格式：同格式原生 SSE 直传，跨格式通过事件 adapter 逐块转换。当前已覆盖 Chat Completions SSE、Responses SSE、Anthropic Messages SSE 之间常见的文本、reasoning/thinking、function/tool call 参数增量、stop reason 和 usage 映射。原生 Chat Completions、Responses、Anthropic SSE 透传会保持上游流字节不改写，并在后台 best-effort 解析上游 usage 事件用于 token 统计；如果供应商不在流里发送 usage，则该次流式请求不会凭空生成精确 token 统计。

Admin API 鉴权支持 `X-Admin-Key`、`Authorization: Bearer ...` 和 `?admin_key=...`。状态输出只包含 key index、脱敏 key 或短 hash，不返回完整 API key。配置编辑写入 `runtime_config.json` overlay，不直接修改真实 `config.json`；provider/key enable/disable 仍是进程内运行时控制，重启后按配置文件恢复。

Web 控制台由 `/` 和 `/-/dashboard` 提供静态 HTML/CSS/JS，启动代理后直接访问根地址会进入 admin key 登录界面；URL 查询参数 `?admin_key=...` 或浏览器 localStorage 已有 key 时会先校验 Admin API，成功后才进入控制台。控制台调用 `/-/admin/*` 时发送 `X-Admin-Key`。静态页面本身不包含运行数据或完整密钥，所有状态、统计、配置变更仍由 Admin API 鉴权保护。当前控制台已接入 provider 运行时开关、provider 模型能力查看/刷新、请求/统计查看、请求量/失败/首字延迟(ms)趋势图、Overview 时间范围筛选、token/cost 指标和 provider/model usage 对比、请求详情脱敏 key、配置摘要、新增 provider、新增 key、global/provider/key 三级 proxy 编辑、provider base URL/enabled/priority 编辑、各格式 path/enabled 编辑、Model Routes 权重/优先级编辑、常用 routing/retry 参数编辑、Failure Policies 编辑、runtime overlay 脱敏导出/验证/清空回滚，以及 admin mutation 审计记录。新增 provider 时可明确选择 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages，或选择 Auto 由 URL 推断；Provider 配置编辑入口在 Providers 页面，并显示 discovered models、canonical map 和 formats；Refresh/Pause 运行控制位于侧边栏，移动端与主导航一起折叠进 More settings 抽屉；Routing Policy 页面提供 provider pool、provider_select、attempt/timeout、retry HTTP status、fatal key status、Retry-After、基础 cooldown 和每类 failure policy 的 cooldown scope/key cooldown/provider cooldown/disable key 调整；Config 页面显示 Overlay Safety、Model Routes、最近 Audit Trail、配置摘要、新增入口和折叠后的脱敏 JSON。自动刷新会保留已展开的编辑面板、正在编辑的表单和当前视图。

请求历史默认写入 SQLite：`observability.history.enabled=true`、`path=tmp/proxy_history.sqlite3`、`retention_days=30`。历史库只保存请求元数据、attempt 链路、首字延迟 `first_byte_ms`、总耗时 `duration_ms`、状态、provider/model/format、错误分类、HTTP 状态、token usage、估算 cost、诊断阶段、上游错误摘要/type/code/param 和脱敏 key，不保存请求正文，也不保存完整 API key。`/-/admin/requests`、`/-/admin/requests/{request_id}` 和 `/-/admin/metrics/timeseries` 会优先使用 SQLite；关闭或读取失败时回退到内存 recent request ring，并在响应中通过 `source` 标明 `sqlite` 或 `memory`。

安全诊断日志默认写入 JSONL：`observability.diagnostics.enabled=true`、`path=tmp/proxy_diagnostics.jsonl`。它用于区分失败发生在 `upstream_http_error`、`provider_compat_retry`、`request_conversion`、`conversion_empty_output`、`transport_error`、`client_disconnected` 或 `proxy_exception` 等阶段。每行只保存 request_id、attempt、provider/model/format、HTTP 状态、错误分类、失败原因、上游错误摘要/type/code/param 和脱敏 key；不保存请求正文、响应正文全文或完整 API key。旧的 `server.debug_disk_log` 是调试用全量请求日志，默认关闭，真实使用时不建议长期开启。

Admin mutation 审计默认写入 JSONL：`observability.audit.enabled=true`、`path=tmp/admin_audit.jsonl`、`max_records=1000`。审计记录保存时间、action、target、来源 IP、请求路径和脱敏 detail；新增/修改 key 的明文不会写入审计文件或 API 响应。`/-/admin/audit` 返回最近记录，供控制台 Config 页展示。

`/-/admin/metrics` 的 `counters` 包含请求/attempt 成功失败数、failure rate、按 provider/status/error/reason/http_status 的聚合，以及 `usage.input_tokens/output_tokens/total_tokens/cost_usd`。`cost_usd` 只在 provider 配置了可选 `pricing` 时估算，不会内置供应商价格。流式 token usage 来自转换器生成的 completed 对象，或原生 SSE 透传时上游发送的 usage 事件。`/-/admin/requests` 会返回派生的 `routing_summary`，用于解释本次请求是直接成功、fallback 后恢复、全部失败还是没有候选。`/-/admin/requests/{request_id}` 保留每次 attempt 的 `provider`、`upstream_format`、`outcome`、`error_type`、`reason`、`http_status`、`usage`、`cost_usd`、`key_masked`、短 `key_id`、`diagnostic_stage` 和上游错误摘要字段，并为每次 attempt 派生 `routing_explanation`，说明为什么选中、结果是什么、下一步为什么切换或停止；不记录完整 API key。

`/-/admin/status` 和 `/-/admin/routing` 的 `policy` 包含机器可读的 `failure_policies` 和 `rule_table`。`failure_policies` 按 `error_type` 描述 `cooldown_scope`、`cooldown_s`、是否禁用 key；`rule_table` 按 HTTP/transport/empty-output 场景描述是否继续轮换、是否停止、以及对应原因。

`retry.failure_policies` 可覆盖各 `error_type` 的冷却行为。`cooldown_scope` 支持 `none`、`key`、`provider`、`key_provider`；`cooldown_s` 控制 key 冷却，`provider_cooldown_s` 控制 provider 冷却，`disables_key` 控制是否把 key 视为失效。非法 scope 会被忽略，负数会被裁剪为 0，provider 冷却会被限制在合理范围内。429 默认仍优先尊重上游 `Retry-After`。

调度策略当前由 `scheduler_policy.py` 统一描述：401/403 视为 key fatal，429 尊重 `Retry-After`，402/5xx/网络错误会在向客户端写响应前切换 attempt，400/404 会区分“模型不存在”“provider 不匹配”和“provider 兼容性问题”，422 直接视为客户端参数错误。非流式 HTTP 200 如果转换成客户端目标格式后没有可见正文/工具调用，且原始或目标响应显示为 reasoning/thinking 被长度截断，会记录 `empty_visible_output` 并切换到下一 attempt。一旦流式响应已经开始，就不会透明切换供应商。

`routing.provider_select` 控制候选 provider 的初始顺序。默认是 `priority_failover`：先按 provider 的 `priority` 从高到低选择主供应商，同一 provider 内多把 key 继续轮换；主供应商不可用、key 全部冷却/禁用、或本次 attempt 失败且允许重试时，再进入下一个优先级 provider。这样能最大化同一上游的缓存命中和行为稳定性，同时保留无感故障转移。

| provider_select | 效果 | 适合场景 | 配置重点 |
| --- | --- | --- | --- |
| `priority_failover` | 固定优先访问高 priority provider；同 provider 多 key 轮换；失败后转下一个 provider | 默认推荐。希望主供应商稳定承载、保留缓存、备用供应商只在故障/冷却时接管 | provider 配置 `priority`，或在 `models.routes.{model}.providers[]` 里写 route 级 `priority` |
| `round_robin` | 每个 provider 公平轮换，不看 weight，不看 priority | 主动把流量平均分散到多个供应商 | `default_provider_pool` 或 route providers 顺序 |
| `weighted_rr` | 按 route provider `weight` 展开后轮换 | 想按比例分摊成本或额度，例如 A:B = 3:1 | 只在 `models.routes` 的 provider `weight` 生效 |
| `random` | 同一次请求内顺序稳定，但不同请求随机打散 | 想降低固定顺序带来的热点，但不需要严格比例 | 候选池即可；不使用 weight/priority |

优先级配置有两层：provider 自身的 `providers.{name}.priority` 是默认优先级；某个模型的 `models.routes.{model}.providers[]` 如果写了 `priority`，会覆盖 provider 默认值。控制台里 provider 配置可以直接编辑 provider priority；Model Routes 输入框支持 `provider:weight:priority`，例如 `opencode:1:100, deepseek:1:90`。如果只写 `provider:weight`，则 route 不覆盖 priority，继续使用 provider 默认值。

注意：当前 router 仍会先把同格式/native 上游排在 fallback 格式前面，再在同一格式组内应用 `provider_select`。也就是说，如果客户端请求 Anthropic Messages，直接支持 Anthropic 的 provider 会先于只支持 Chat/Responses 的 provider；后续如果要强制跨格式优先级，需要单独引入 `format_preference`。

同一次客户端请求的 attempt 选择会做候选去重：相同 `provider + key_index + upstream_format` 不会被重复尝试。多 key provider 仍可在同一次请求中尝试不同 key；如果所有候选都已尝试过，请求会停止轮换并返回最后的失败原因。

## 支持的功能

- **流式 SSE** — 支持 Chat/Responses/Anthropic 三格式同格式直传，以及六个跨格式 SSE 事件转换；覆盖常见 text、reasoning/thinking、tool/function call 参数增量、usage 和 stop reason
- **Thinking Blocks** — `reasoning_content` / Responses `reasoning` 转为 Anthropic `type: "thinking"` 原生块；Chat → Responses 响应会保留 reasoning item；Chat/Anthropic → Responses 流式转换会发送 `response.reasoning_summary_text.delta/done`；转 Chat 上游时可按 provider 需要补齐 assistant `reasoning_content`；转 DeepSeek Anthropic 上游时可补齐缺失的 assistant `thinking` block
- **Tool Calls** — 支持常见 function/tool definitions、assistant tool calls/function calls/tool uses 的非流式跨格式转换；Chat -> Anthropic 会合并连续 tool results，Responses -> Anthropic 会合并连续 function calls
- **Tool Results** — 支持 `tool_result` / `role: "tool"` / `function_call_output` 之间的常见映射
- **Tool Choice** — `any` → `auto` 兼容映射；forced `tool_choice` 遇到 DeepSeek thinking-mode 不支持时，会记录 `provider_compat` / `tool_choice_auto_retry`，降级为 `auto` 重试一次，不冷却 provider/key
- **Empty Visible Output Guard** — 非流式响应若只有 reasoning/thinking、无可见正文/工具调用且被长度截断，会记录 `empty_visible_output` 并换供应商，不冷却 key

---

## 日志示例

每次请求可看到完整路由信息：

```
[proxy] stream=True model=claude-sonnet-4-20250514 msgs=3 tools=1
[proxy] req=083ecfae... attempt=1 provider=deepseek key=sk-db1**13 proxy=direct model=deepseek-v4-flash->deepseek-v4-flash
[proxy] UPSTREAM ERROR req=083ecfae... deepseek 402: {"error":{"message":"Insufficient Balance"}}
[proxy] req=083ecfae... attempt=2 provider=opencode key=sk-i7Q**rg proxy=direct model=deepseek-v4-flash->deepseek-v4-flash
```

- `key` 做了截断显示（前6位+**后2位），既能区分是哪把 key 又不暴露完整密钥
- `proxy=` 显示本次是否走代理（`direct` = 直连）

---

## 踩坑记录 / Pitfalls

### 1. `?beta=true` 查询参数
Claude Code SDK 会在所有请求路径后加 `?beta=true`。使用 `urlparse(self.path).path` 剥离查询参数后再匹配路径。

### 2. DeepSeek / opencode Chat 路径的 `reasoning_content` 要求
部分 DeepSeek thinking-mode Chat Completions / OpenAI-compatible 上游会要求历史里的每条 assistant 消息都带 `reasoning_content`。这不是通用 OpenAI-compatible 规范，不能全局套到所有 Chat 上游。代理现在只对内置 `deepseek`、内置 `opencode`，以及显式配置 `force_reasoning_content=true` 的 provider 补齐缺失字段；占位值使用 `"."`，避免把可见正文复制进 hidden reasoning 造成 token 翻倍。这个补齐会覆盖 Chat、Responses、Anthropic 三类客户端转 Chat 上游的 fallback 路径。

### 3. DeepSeek Anthropic 路径的 `content[].thinking` 要求
DeepSeek Anthropic Messages 上游在 thinking mode 下可能要求历史 assistant 消息带回 `content[].thinking`。代理现在对内置 `deepseek` Anthropic 上游，以及显式配置 `force_anthropic_thinking=true` 的 provider，在 assistant 历史缺少 thinking block 时插入一个最小占位 `{"type":"thinking","thinking":"."}`，避免 `/openai/v1/responses` 等跨格式请求先以 `thinking_content_required` 失败再切换供应商。

### 4. Tool Choice `any` → `auto`
DeepSeek 不支持 `tool_choice: {type: "any"}`，映射为 `auto`。

### 5. Forced Tool Choice 与 thinking mode
DeepSeek thinking mode 可能返回 `Thinking mode does not support this tool_choice`。代理会先按客户端原始 forced tool choice 发送；如果上游明确返回该兼容性错误，就在同一 provider/key 上把 `tool_choice` 降级为 `auto` 重试一次，并在观测数据里记录 `provider_compat` / `tool_choice_auto_retry`。

### 6. Reasoning-only length cutoff
部分上游路径可能返回 HTTP 200，但在低输出预算下只给 `reasoning_content` / `thinking`，没有最终可见正文。例如实测 opencode Chat Completions 路径可能出现 `finish_reason=length` 且 `content=""`。代理只在“无可见正文/工具调用 + 有 reasoning/thinking + 被长度截断”三项同时成立时切换 attempt；DeepSeek Anthropic 原生路径在同样预算下已实测可返回可见正文，不应把该现象泛化为 DeepSeek 原生行为。

### 6. Tool 消息顺序（DeepSeek 严格要求）
assistant 消息的 `tool_calls` 之后必须紧跟 tool 响应消息，中间不能插入 user 消息。转换时将 `tool_result` 放在 user text 之前。

### 7. Tool Use 流式格式（input_json_delta）
不能在 `content_block_start` 中直接传 `input`，必须通过 `input_json_delta` 事件逐步发送。

### 8. 先连接上游再发 SSE 头
先调用 `urlopen()` 确认上游接受请求后，再 `send_response(200)` 和 `end_headers()`，避免上游错误后无法返回 JSON。

### 9. Cherry Studio 的 `BLOCKED_ENV_KEYS`
需要在 Cherry Studio 源码中移除 `"ANTHROPIC_BASE_URL"` 和 `"ANTHROPIC_MODEL"` 限制。

### 9. 流中断时的部分 Tool Call
捕获流异常后丢弃不完整 tool calls，发送错误文本块并正确关闭 SSE 流。

### 9. Tool Call 首个 Delta 的空 arguments

OpenAI 流式首个 delta 只是声明 tool call 存在（设置 id/name），后续 delta 才携带参数。

### 10. Responses reasoning 与并行 function_call

Responses 的 `reasoning` output item 会映射到 Chat `reasoning_content`，再映射到 Anthropic `thinking`；Chat 响应转 Responses 时也会保留 reasoning item。流式 Chat/Anthropic 转 Responses 时，如果上游返回 `reasoning_content` 或 `thinking_delta`，代理会实时发送 `response.reasoning_summary_text.delta`，结束时发送 `response.reasoning_summary_text.done`，同时保留最终 completed reasoning item。流式 Chat 转 Responses 时，如果同一条流里同时出现 reasoning、正文和 function_call，会为每个 Responses output item 分配独立 `output_index`。Responses 转 Chat/Anthropic 时也兼容 `response.reasoning_summary_text.delta` 等 reasoning 增量事件。Responses 的多个连续 `function_call` item 转 Anthropic 时会合并为一个 assistant 消息中的多个 `tool_use` block，避免生成连续 assistant 消息。

### 11. 未实现的跨格式流式路径

流式转换现在已接通三格式 3 x 3 矩阵：三种同格式直传，六种跨格式逐事件转换。当前兼容目标是常见文本、reasoning/thinking、tool/function call 参数增量、usage 和 stop reason；hosted tools、多模态块、供应商私有事件扩展仍属于后续硬化范围。代理会在没有可用上游格式时返回 501，而不是先开始 SSE 再中途失败。

### 12. 自定义模型不存在时的轮询浪费

如果你手动填写了只存在于部分供应商的自定义模型（如 `Qwen/Qwen3.6-35B-A3B`），优先在 `provider_model_map` 中明确声明映射。若 `models_source: "union"` 已成功发现供应商模型能力，代理会自动避开明确不支持该模型的供应商；未发现能力的供应商默认仍允许尝试。

推荐做法：在 `provider_model_map` 中明确声明模型↔供应商的映射关系。

## 架构

```
  │
  ├── to_openai() — 转换请求
  │   • system → system
  │   • thinking → reasoning_content
  │   • tool_use → function tool_calls
  │   • tool_result → role: "tool"
  │
  ├── OpenAIUpstreamClient — 上游请求（含代理支持）
  │
  ├── _is_model_not_found_error() — 模型不存在检测
  │   • 解析上游 400/404 错误体
  │   • 匹配 "not found" / "does not exist" 等关键词
  │   • 命中 → client_error → 立即停止轮换
  │
  ├── 流式: do_stream()
  │   • reasoning_content → thinking_delta
  │   • content → text_delta
  │   • tool_calls → input_json_delta
  │
  └── 非流式: to_anthropic()
      • 组装完整响应
```

## 真实上游回归矩阵

`tools/real_upstream_matrix.py` 提供受控的真实上游 smoke matrix。默认是 dry-run，不会发请求；只有显式传入 `--run` 才会调用本地代理并消耗上游额度。

```powershell
python tools\real_upstream_matrix.py --max-cases 3
python tools\real_upstream_matrix.py --run --max-cases 3 --output tmp\real_upstream_matrix.json
python tools\real_upstream_matrix.py --run --include-tools --only chat_tool_deepseek
python tools\real_stream_tool_smoke.py --max-cases 3
python tools\real_stream_tool_smoke.py --run --base-url http://127.0.0.1:4894 --output tmp\real_stream_tool_smoke.json
```

默认场景覆盖 Chat Completions、Responses、Anthropic Messages 三种客户端格式，使用 `deepseek-v4-flash` 和 `gpt-5.5`。报告记录 HTTP 状态、耗时、可见正文长度、工具调用数量和短样例，不记录 provider key。`tools/real_stream_tool_smoke.py` 专门覆盖流式工具调用，报告记录 SSE 事件数量、唯一 tool call 数、参数增量数量和 stop reason，不保存模型正文或密钥。

## 文件结构

| 文件 | 说明 |
|------|------|
| `PROJECT_OVERVIEW.md` | 给新人或新 AI 的项目入口、模块地图和开发指引 |
| `sse2json.py` | 主程序（HTTP 服务 + 流式转换/调度） |
| `format_adapters.py` | 三格式非流式转换 registry（9 种组合，3 种直传 + 6 种转换） |
| `protocol_adapters.py` | Anthropic Messages ↔ OpenAI Chat Completions 纯 JSON 转换 |
| `stream_adapters.py` | Chat/Responses/Anthropic 三格式 SSE 跨格式事件转换，以及原生 SSE 透传 usage 旁路解析 |
| `model_registry.py` | 上游模型拉取、union 合并、provider model 映射推断 |
| `scheduler_policy.py` | HTTP 状态码/错误体到 retry/cooldown 决策的调度策略 |
| `observability.py` | 请求/attempt 指标与最近请求环形缓冲 |
| `usage_accounting.py` | usage 字段归一化与可选 provider pricing 成本估算 |
| `tools/real_upstream_matrix.py` | opt-in 真实上游回归矩阵 |
| `request_routes.py` | legacy / Anthropic / OpenAI 路径分类 |
| `router.py` | 供应商/Key 路由、冷却管理 |
| `upstream_client.py` | OpenAI 上游客户端（含代理支持） |
| `config_loader.py` | 配置加载与归一化 |
| `dashboard/` | Web 控制台静态资源（Overview、Requests、Providers、Routing Policy、Config） |
| `tests/` | 标准库 unittest 测试 |
| `config.json` | 实际配置文件 |
| `config.example.jsonc` | 配置示例（带注释） |
| `start_proxy_config.bat` | Windows 启动脚本 |

## 许可证

MIT
