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
* **`GET /-/admin/config`**：获取当前运行时的全量合并配置（Base Config + Runtime Overlay）。快照含 `server` / `routing` / `retry` / `health_monitor` / `models` / `proxy` / `providers`（key 脱敏）。
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

模型与映射的写入端点全部按**供应商维度**（控制台供应商抽屉的"模型目录"即调用这些端点；此前文档里写作 `/-/admin/models/mapping|variants|disabled` 的路径并不存在）：

* **`PATCH /-/admin/providers/{provider}/models/map`**：更新该供应商的模型重命名映射（`provider_model_map`）。
  * Payload：`{"model": "deepseek-v4-flash-plus", "raw_model": "deepseek/deepseek-v4-flash-0731", "old_model": "deepseek-v4-flash"}`；`old_model` 是改名时被替换的旧键（新增时留空），`model` 留空表示恢复为自动映射。
  * 响应含可选 `warning`（`last_model_mapping_warning`），两种真实来源：**改名时拒绝级联删除**（旧键当前指向的 raw 与本次提交的 raw 不一致时保留旧键并提示 "refused to remove mapping ..."），以及**覆盖已有映射**（同名键原本指向另一个 raw，提示 "overwrote mapping ..."）。跨供应商同名 canonical 只写日志不阻断（合法用法）。
* **`PATCH /-/admin/providers/{provider}/models/{model}/variants`**：整表改写该 canonical 的多变体回退列表（`provider_model_variants[provider][model]`）。
  * Payload：`{"variants": [{"model": "xai/grok-4", "priority": 10}, {"model": "xai/grok-4-mini", "priority": 5}]}`；元素也可为裸字符串（priority 记 0）。
  * 写入规则：必须是列表且 ≤ 32 条；`priority` 限 `[-1000, 1000]`；同名 raw 只保留**首现**一条；落库前按 `(-priority, 首现下标)` 稳定排序。
  * **空列表 = 删除该键**：该 canonical 若在基础 `config.json` 中存在则写 `null`（tombstone，用于遮蔽基础配置），否则直接 `pop`；该 provider 下已无键时连 provider 键一并移除。provider 级 `provider_model_map` 空表同样删键。
  * **改名没有原子端点**：URL 里的 `{model}` 就是 canonical，改名需要两次 PATCH（先写新键、再对旧键发空列表）；中途失败最多留下重复键，不会丢组。控制台在占用冲突时先二次确认再执行完整两步。
  * 该端点**不做跨来源冲突校验**：组与 `provider_model_map` / 自动发现映射 / `static_models` 同名时照样写入成功，冲突只在控制台以警告呈现（7 类警告码见 [docs/FEATURES.md](FEATURES.md) §10.5）。
* **`PATCH /-/admin/providers/{provider}/models/{model}/disabled`**：启用/禁用单个模型 id。Payload `{"disabled": true|false}`。
* **`PATCH /-/admin/providers/{provider}/models/disabled`**：批量改写该供应商的禁用表。Payload `{"models": {"grok-4.3": true, "grok-4": false}}`。
  * 判定口径：读路径先精确匹配 id，再 `lower()` 兜底（`provider_model_disabled`）；禁用 canonical 会让它从 `/v1/models` 消失，禁用某个 raw 只剔除该候选（聚合供应商的其他副本仍可用）。
* **静态模型名单**：沿用 §2.2 的 `PATCH /-/admin/providers/{provider}` 的 `static_models` 字段，**整表重写**语义——接受字符串数组或逗号分隔字符串（保序去重），传 `null` 清空。
* **`POST /-/admin/providers/{provider}/models/refresh`**：立即触发该供应商的 `/v1/models` 重新发现。
* **`POST /-/admin/models/refresh`**：立即触发全部供应商的模型发现。
* **`POST /-/admin/models/test`**：对指定供应商模型发起一次真实的最小测试请求（复用 key 探测管道，15s 预算，去重并发，结果记入请求历史）。
  * Payload：`{"provider": "requesty", "model": "runware/deepseek-v4-flash-0731", "key_index": 0}`（`key_index` 可选，默认 0）
  * **key 级解析**：探测按所选 key 的自身目录解析上游模型名（key 条目 `models` dict → `provider_key_model_capabilities` 指纹条目），无 key 级信息时回退 provider 级主 raw；控制台映射弹窗会展示该模型的归属 key 徽章（脱敏形态，可多选）并把所选 `key_index` 传入本端点。
  * 返回：`{"action": "model_tested", "result": {"ok": true, "format": "...", "upstream_model": "...", "latency_ms": 42}}`；失败时含 `http_status` / `error_type` / `error`（脱敏）。
* **模型目录可见性（`GET /v1/models`）**：候选 id 来自 5 类来源 —— 自动发现的 canonical、`provider_model_map` 键、`provider_model_variants` 键、`static_models`、`models.routes` 的模型键，外加全局 `client_model_map` 键（`model_registry._configured_model_ids` 去重后输出）；变体组只要**至少一条** raw 非空且 canonical 键自身未被禁用即出现在列表里。聚合供应商（如 requesty）同一基础模型的多个厂商副本归一为 1 个 canonical id 并记录 1 对多 `variant_map`，只要任一副本未被禁用 canonical 即可见，路由按副本优先级依次故障转移。

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

### 2.7 客户端虚拟密钥 (Client Keys)
* **`GET /-/admin/client-keys`**：列出虚拟密钥（脱敏预览 + 用量计数 `requests_total` / `consumed_tokens` / `cost_usd` / `last_used_at`，随请求实时累加）。
* **`POST /-/admin/client-keys`**：签发虚拟密钥（`name` / `quota`（支持 `100M`/`1.5B`）/ `rpm` / `models` / `expires`）。完整 Key 仅创建时返回一次，服务端只存哈希。
* **`PATCH /-/admin/client-keys/{id}`**：更新备注、额度、RPM、模型范围、有效期、启用状态。
* **`POST /-/admin/client-keys/{id}/reset-usage`** / **`.../delete`**：重置用量计数 / 删除密钥。
* 额度拦截：`quota_tokens > 0` 且 `consumed_tokens >= quota_tokens` 时新请求返回 429 `quota_exceeded`；用量经可观测性 usage 监听器在请求结束时记账，设置页数据随 5s 轮询刷新（K/M/B 压缩显示）。

### 2.8 控制台安全 (Console Security)
* **`PATCH /-/admin/server/admin-key`**：轮换控制台管理员密钥。Payload：`{"admin_key": "新密钥"}`（6–128 位、不含空白）。用**当前**密钥鉴权，保存后立即生效并写入 runtime overlay（`config.json` 永不改写）；响应、配置快照（掩码 `***`）与审计日志均不回显密钥明文。设置 `PROXY_ADMIN_KEY` 环境变量时拒绝修改（env 优先级高于 overlay，避免改动静默失效）。
* **请求归因**：经客户端虚拟密钥发起的请求在请求记录中携带 `client_key_id` / `client_key_name` / `client_key_masked` 快照（请求时固化，key 删除或改名后历史仍可读；管理员密钥直连与未启用密钥模式不归因），`GET /-/admin/requests` 列表与 `GET /-/admin/requests/{id}` 详情均携带，控制台请求详情页直接展示。
