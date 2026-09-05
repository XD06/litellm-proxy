# 系统 API 与管理接口规范 (API Reference)

> 本文档定义代理服务端暴露的所有对外 API（客户端协议端点）与内部管理 API（Admin API）。

---

## 1. 客户端代理端点 (Client Proxy Endpoints)

所有客户端接口支持标准 Bearer Token 认证（配置于 `server.admin_key` 或各客户端 API Key）。

### 1.1 OpenAI Chat Completions
* **方法**: `POST`
* **路径**: `/v1/chat/completions`
* **说明**: 标准 OpenAI 格式对话接口，支持流式（SSE）与非流式。若上游仅支持 Anthropic Messages 或 Responses，网关会自动完成双向格式转码。
* **主要参数**: `model`, `messages`, `stream`, `temperature`, `max_tokens`, `tools`, `tool_choice`。

### 1.2 Anthropic Messages
* **方法**: `POST`
* **路径**: `/v1/messages`
* **说明**: 标准 Anthropic Messages 接口，原生支持 Claude Code / Cursor 等客户端接入。
* **主要参数**: `model`, `messages`, `system`, `stream`, `max_tokens`, `tools`。

### 1.3 OpenAI Responses
* **方法**: `POST`
* **路径**: `/v1/responses`
* **说明**: OpenAI Responses 实验性规范接口。

### 1.4 模型列表
* **方法**: `GET`
* **路径**: `/v1/models`
* **说明**: 获取当前所有可用模型的联合快照（Union Snapshot）。支持返回已去重、已重命名的 Canonical Model 列表。

---

## 2. 管理面板与控制 API (Admin API)

所有 Admin 接口均需在 Header 中携带 `Authorization: Bearer <ADMIN_KEY>`。

### 2.1 系统配置与热重载
* **`GET /-/admin/config`**：获取当前运行时的全量合并配置（Base Config + Runtime Overlay）。
* **`PATCH /-/admin/config`**：动态更新全局配置项（如代理设置、日志级别、并发限制等）。

### 2.2 供应商管理 (Providers)
* **`GET /-/admin/providers`**：获取所有供应商配置、Key 数量及实时健康状态。
* **`POST /-/admin/providers`**：新增供应商。
* **`PATCH /-/admin/providers/{provider}`**：更新指定供应商基础信息（`base_url`, `priority`, `weight`, `enabled` 等）。
* **`DELETE /-/admin/providers/{provider}`**：删除供应商。

### 2.3 密钥管理 (Keys)
* **`POST /-/admin/providers/{provider}/keys`**：为供应商新增一个或多个 API Key。
* **`PATCH /-/admin/providers/{provider}/keys/{index}`**：更新指定索引的 Key 或其模型白名单。
* **`DELETE /-/admin/providers/{provider}/keys/{index}`**：删除指定 Key。
* **`POST /-/admin/providers/{provider}/keys/{index}/test`**：按 key 发起最小真实请求探测（去重并发、15s 预算、结果记入请求历史）。控制台已不提供独立入口，由 `POST /-/admin/models/test` 复用其管道；另有 `.../disable|enable|state/clear` 用于运行态控制。
* 控制台"密钥"页签：每个 key 一张统一卡片（身份 + 状态徽标 + 代理/模型映射编辑 + fails/cooldown/disabled 指标 + 启用/禁用/清除/删除），底部为全宽"添加密钥"表单。

### 2.4 模型路由与映射管理 (Models & Routes)
* **`PATCH /-/admin/models/mapping`**：更新供应商模型重命名映射（`provider_model_map`）。
  * Payload 示例：`{"provider": "requesty", "model": "deepseek-v4-flash-plus", "raw_model": "deepseek/deepseek-v4-flash-0731"}`
* **`PATCH /-/admin/models/variants`**：更新供应商模型多变体回退列表（`provider_model_variants`）。
* **`PATCH /-/admin/models/disabled`**：启用/禁用指定供应商下的特定模型。
* **`POST /-/admin/models/refresh`**：强制立即触发后台供应商 `/v1/models` 自动发现。
* **`POST /-/admin/models/test`**：对指定供应商模型发起一次真实的最小测试请求（复用 key 探测管道，15s 预算，去重并发，结果记入请求历史）。
  * Payload：`{"provider": "requesty", "model": "runware/deepseek-v4-flash-0731", "key_index": 0}`（`key_index` 可选，默认 0）
  * 返回：`{"action": "model_tested", "result": {"ok": true, "format": "...", "upstream_model": "...", "latency_ms": 42}}`；失败时含 `http_status` / `error_type` / `error`（脱敏）。
* **模型目录可见性**：聚合供应商（如 requesty）同一基础模型的多个厂商副本归一为 1 个 canonical id，并记录 1 对多 `variant_map`；只要任一副本未被禁用，canonical 即出现在 `/v1/models`，且路由按 副本优先级 依次故障转移。

### 2.5 模型定价 (Model Pricing)
* **`PATCH /-/admin/models/pricing`**：设置人工模型价格覆盖（`models.pricing_overrides`）。保存后会自动重算历史请求中匹配该模型的价格记录（含此前 pending/unpriced 的记录），无法定价的键自动重新排队抓取。
* **`POST /-/admin/models/pricing/delete`**：删除价格覆盖，同样触发历史成本重算。
* **`GET /-/admin/model-pricing?models=...`**：批量读取本地 AA 缓存定价（只读，不触发网络）。
* **`GET /-/admin/model-summary/{slug}?refresh=true`**：拉取/刷新单个模型的 AA 评测摘要。
* **`GET /-/icons/{slug}.svg?type=color|mono`**：品牌图标本地代理（免鉴权）。内存 LRU + `data/icon_cache/` 磁盘缓存，上游 npmmirror 优先、unpkg 兜底，按需拉取一次；`Cache-Control: public, max-age=86400`；失败 404，前端自动降级为字母 fallback。

### 2.6 监控与审计 (Observability & Stats)
* **`GET /-/admin/stats`**：获取系统全局及各供应商的请求成功率、延迟百分位数、Token 消耗与费用统计。
* **`GET /-/admin/history`**：获取近期请求的详细调用链追踪记录（包含每轮 Attempt、上游响应时延、状态码）。
* **`GET /-/admin/health`**：获取各供应商节点的实时探针健康度与冷却剩余时间。
