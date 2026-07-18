# 用量成本、请求可观测性与响应可靠性设计

日期：2026-07-18
状态：已批准
范围：缓存 Token 与 Cost、模型数据、请求列表与详情、首事件故障转移、健康探测

## 1. 目标

在不保存提示词正文、不阻塞真实请求、不破坏现有路由和格式转换的前提下，完成以下能力：

- 统一统计 Chat Completions、Responses、Anthropic Messages 的普通输入、缓存读取、缓存写入、输出和 reasoning Token。
- 使用供应商配置和项目现有 Model Summary/Artificial Analysis 缓存计算 Cost，并将请求发生时的价格快照固定到历史记录。
- 在配置页提供可扫描、可筛选、按需展开的全模型调用数据。
- 把请求页面改成有固定表头的高密度数据表，并重组请求详情的信息层级。
- 在首个有效 SSE 事件前允许透明切换候选，避免用户长时间等待无输出的上游。
- 将主动健康检测改为被动健康优先，减少额外上游负载，同时更准确地恢复冷却候选。

成功标准不是展示更多文字，而是让用户能快速回答：

1. 哪个模型、供应商或 Key 正在产生调用、Token 和 Cost？
2. Cost 是否精确，缓存是否生效，价格来自哪里？
3. 一次请求慢在哪里，是否在首事件前切换过路由？
4. 当前健康状态来自真实请求还是主动探测，影响了哪个范围？

## 2. 非目标

- 不保存请求或响应正文、Authorization、API Key 或完整 Header。
- 不在 Overview 增加更多模型排行或改变现有 Overview 布局。
- 不实现账单、预算扣费、发票或财务结算系统；Cost 始终是带来源的估算值。
- 不把全部 SQLite 历史发送到前端计算。
- 不允许在客户端已经收到首个 SSE 事件后透明切换供应商。
- 不用主动探测替代真实流量健康信号。

## 3. 总体结构

新增或收敛四个边界：

- `usage_accounting`：协议无关的 Token 归一化、价格快照和 Cost 公式。
- `pricing_resolver`：供应商配置、本地 AA 缓存、后台查询与一次性回填。
- `model_usage_analytics`：SQLite 聚合查询和当前模型支持快照连接。
- `probe_coordinator`：模型发现、手动测试、空闲探测和巡检的统一限流与取消。

请求热路径只执行内存计算和非阻塞入队。网络价格查询、历史回填和聚合查询不得进入代理请求线程。

## 4. 用量归一化

### 4.1 统一字段

每个成功 attempt 和最终 request 使用以下结构：

```json
{
  "input_tokens": 0,
  "uncached_input_tokens": 0,
  "cached_input_tokens": 0,
  "cache_write_tokens": 0,
  "output_tokens": 0,
  "reasoning_tokens": 0,
  "total_tokens": 0
}
```

字段语义：

- `input_tokens`：逻辑提示词总量，包含普通输入、缓存读取和缓存写入。
- `uncached_input_tokens`：按普通输入价格计费的输入。
- `cached_input_tokens`：命中缓存并按 cache-read/cache-hit 价格计费的输入。
- `cache_write_tokens`：写入缓存并按 cache-write 价格计费的输入。
- `output_tokens`：供应商报告的总输出 Token。
- `reasoning_tokens`：输出中的 reasoning 子集，只用于分析，不重复加入 `total_tokens`。
- `total_tokens`：`input_tokens + output_tokens`。

### 4.2 上游字段映射

Chat Completions：

- 输入：`prompt_tokens` 或 `input_tokens`。
- 缓存读取：`prompt_tokens_details.cached_tokens` 或 `input_tokens_details.cached_tokens`。
- 缓存写入：供应商扩展字段，若无则为零。
- reasoning：`completion_tokens_details.reasoning_tokens`。
- 普通输入：`max(0, input_tokens - cached_input_tokens - cache_write_tokens)`。

Responses：

- 输入：`input_tokens`。
- 缓存读取：`input_tokens_details.cached_tokens`。
- 缓存写入：供应商扩展字段，若无则为零。
- reasoning：`output_tokens_details.reasoning_tokens`。
- 普通输入：`max(0, input_tokens - cached_input_tokens - cache_write_tokens)`。

Anthropic Messages：

- 普通输入：`input_tokens`。
- 缓存读取：`cache_read_input_tokens`。
- 缓存写入：`cache_creation_input_tokens`。
- 逻辑输入：三者之和。
- 输出：`output_tokens`。

流式和非流式响应必须经过同一归一化函数。流式 usage 合并保留分项字段，不再退化成只有三个总数字。

## 5. 价格解析与历史 Cost

### 5.1 价格结构

价格统一为 USD / 1M Token：

```json
{
  "input_per_million": 0,
  "cache_read_per_million": 0,
  "cache_write_per_million": 0,
  "output_per_million": 0,
  "source": "provider_config|aa_cache|fallback",
  "resolved_model": "upstream/model-id",
  "resolved_at": 0,
  "complete": true
}
```

价格优先级：

1. `providers.{provider}.pricing.models.{provider_model}`。
2. `providers.{provider}.pricing`。
3. 项目现有 AA 本地内存/文件缓存。
4. 缺失时进入后台解析队列。

AA 的 `cache_hit` 映射为 `cache_read_per_million`。AA 没有可靠 cache-write 价格时，使用普通输入价格作为回退并设置 `complete=false`。前端必须显示“估算”，不得显示为精确定价。

### 5.2 Cost 公式

```text
cost_usd =
  uncached_input_tokens * input_price / 1,000,000
  + cached_input_tokens * cache_read_price / 1,000,000
  + cache_write_tokens * cache_write_price / 1,000,000
  + output_tokens * output_price / 1,000,000
```

reasoning Token 已包含在输出 Token 中，不重复计费；未来若供应商存在独立 reasoning 费率，再通过价格结构扩展。

### 5.3 固定历史价格

每个成功 attempt 保存实际使用的价格快照、价格来源和 Cost。最终 request Cost 是成功及已产生用量的 attempts Cost 之和。

状态值：

- `priced`：价格完整且 Cost 已固定。
- `estimated`：使用 cache-write 等回退价格，Cost 已固定。
- `pending`：本地没有价格，等待后台查询。
- `unpriced`：后台查询后仍无法获得价格。
- `legacy`：旧历史只有原 Cost，缺少分项和价格快照。

历史记录一旦进入 `priced` 或 `estimated` 就不随 AA 后续价格变化。只有 `pending` 允许一次后台回填。

### 5.4 后台解析与回填

`PricingResolver` 使用有界去重队列：

- `observability.pricing.resolve_missing_prices` 默认开启；关闭后缺价记录直接进入 `unpriced`，不执行网络查询。
- 网络查询沿用 `observability.pricing.proxy`，并设置独立的短连接与总超时。
- Key 为 `provider + provider_model`。
- 请求线程只执行 `put_nowait`，队列满时记录指标，不阻塞请求。
- 单个模型同一时间只允许一个查询。
- 查询成功后写入现有 AA 文件缓存，并回填仍为 `pending` 的 attempts。
- 回填 attempt 后，在同一 SQLite 事务内重新汇总对应 request Cost。
- 查询失败使用有限退避，达到上限后标记 `unpriced`。

控制台中的 `$0` 只表示价格已知且确实为零；`pending` 和 `unpriced` 分别显示待定价和无法定价。

## 6. SQLite 迁移

`requests` 增加：

- `uncached_input_tokens`
- `cached_input_tokens`
- `cache_write_tokens`
- `reasoning_tokens`
- `cost_status`
- `pricing_source`
- `pricing_snapshot`
- `client_ip`
- `client_ip_source`
- `user_agent`
- `request_bytes`
- `request_profile`

`attempts` 增加同样的 usage/cost 字段，并增加：

- `upstream_headers_ms`
- `first_event_ms`
- `generation_wait_ms`
- `finish_reason`

迁移只能使用现有增量 `ALTER TABLE ADD COLUMN` 模式。旧记录默认 `cost_status=legacy`，不尝试推测已经丢失的缓存 Token。

## 7. 客户端来源记录

默认记录直接 TCP peer IP。

只有同时满足以下条件时才使用转发 Header：

- `server.trusted_proxy_cidrs` 显式配置了来源网段。
- 直接 peer IP 属于可信网段。

可信情况下按配置读取 `Forwarded`、`X-Forwarded-For` 或 `CF-Connecting-IP`，并记录 `client_ip_source`。值必须规范化为合法 IPv4/IPv6；非法或过长值忽略。

User-Agent 截断后保存。不得保存 Cookie、Authorization 或任意未批准 Header。IP 服从现有请求历史 retention 和删除功能。

## 8. 模型数据 API

新增只读管理接口：

- `GET /-/admin/models/usage`
- `GET /-/admin/models/usage/{client_model}`

列表参数：

- `range=24h|7d|30d|all`
- `query`
- `sort=calls|tokens|cache_rate|cost|last_used`
- `order=asc|desc`
- `limit`、`offset`

列表行返回：

- 客户端模型、调用数、成功数、失败数、成功率。
- 分项 usage、缓存命中率、固定 Cost 和 Cost 状态分布。
- 平均总耗时、平均首事件时间、最后调用时间。
- 当前支持供应商数量、历史成功供应商数量。

详情接口返回：

- 时间序列。
- 按最终供应商和 provider model 的调用、usage、Cost、延迟分解。
- 当前 provider/model/format/Key 覆盖快照。
- 历史成功供应商与当前支持供应商分别标记。

历史聚合来自 SQLite；当前支持关系在响应时通过 model registry 和有效配置连接，不写入历史表。

## 9. 配置页“模型数据”界面

在配置页新增“模型数据”标签，不改变 Overview。

默认只展示三层：

1. 紧凑工具栏：时间范围、搜索、排序。
2. 单行汇总带：调用、总 Token、缓存命中率、总 Cost。
3. 有固定表头的模型数据表。

表头：

```text
模型 | 调用/成功率 | Token 构成 | 缓存率 | Cost | 当前支持 | 最近调用
```

交互规则：

- 一行一个客户端模型，默认不展开供应商明细。
- Token 使用短横向构成条区分普通输入、缓存读取、缓存写入和输出。
- 颜色保持低饱和，并同时提供数值和 tooltip，不能只依赖颜色。
- 供应商默认显示前两个短标签，其余显示 `+N`。
- Cost 使用图标区分精确、估算、待定价和无法定价。
- 点击行打开模型详情抽屉；抽屉内才显示供应商、上游变体、格式、Key 覆盖和历史明细。
- 加载、空数据、部分价格缺失和接口错误有独立状态。
- 移动端只保留模型、调用、Token、Cost 四列摘要，其余进入行详情。

## 10. 请求列表

桌面端使用语义化表格和固定表头，不在每条记录中重复字段标题：

```text
状态 | 时间 | 模型 | 来源 | 协议 | 路由 | Token | Cost | 首事件 / 总耗时
```

显示规则：

- 状态：图标、颜色和 HTTP 状态。
- 来源：客户端 IP，过长省略，完整值在 tooltip 和详情中显示。
- 协议：客户端格式；流式使用图标并提供 tooltip。
- 路由：最终供应商和恢复次数。
- Token：总量；tooltip 展示普通输入、缓存读取、缓存写入、输出和 reasoning。
- Cost：值与定价状态。
- 延迟：首事件和总耗时，达到警戒阈值时使用警示色。

筛选增加：

- 流式/非流式。
- 来源 IP。
- 客户端格式、上游格式。
- Cost 状态。

移动端保持相同信息顺序并折为两行，不生成多个嵌套卡片。

## 11. 请求详情

保留现有路由路径作为主要可视化，只做以下调整：

- 相同 provider/key/model/format/reason 的连续跳过事件合并并显示次数。
- 格式转换附着到对应候选或 attempt，不再脱离上下文单独堆叠。
- 原始诊断默认折叠。

详情顺序固定为：

1. 结果带：状态、客户端模型、最终供应商、总耗时、Cost。
2. 路由路径。
3. Token 与 Cost 构成条。
4. Attempts 表格。
5. 默认折叠的请求元数据。

Attempts 表头：

```text
# | 供应商/Key | 上游模型 | 格式 | 结果 | 响应头 | 首事件 | 总耗时 | Token | Cost
```

元数据只展示 IP、IP 来源、User-Agent、Path、请求大小、请求特征、开始和完成时间。避免大段说明性文字。

## 12. 首事件状态机

### 12.1 阶段定义

- `upstream_headers_ms`：attempt 开始到收到上游 HTTP 响应头，包含连接、TLS、请求上传和上游开始响应时间。
- `first_event_ms`：attempt 开始到收到首个有效 SSE `data:` 事件。
- `generation_wait_ms`：收到上游响应头到首个有效 SSE 事件。

不把响应头错误标记为首字节。SSE comment、keepalive、空 data 和 `[DONE]` 不算首个有效事件。

非流式请求没有 SSE 首事件，`first_event_ms` 和 `generation_wait_ms` 保持空值；只记录 `upstream_headers_ms` 和总耗时，前端不得把完整响应时间伪装成首事件时间。

### 12.2 预算

默认策略：

- 连接超时：15 秒，沿用 `connect_timeout_s`。
- 普通请求首事件等待：收到上游响应头后 15 秒。
- tools、vision、reasoning 请求首事件等待：30 秒。
- 普通请求整体首事件预算：45 秒。
- Agent/reasoning 整体首事件预算：75 秒。

当同一 provider/model/profile 有至少 20 个成功样本时：

- 普通请求单候选预算为 `min(30 秒, max(15 秒, P95 * 1.5))`。
- Agent/reasoning 单候选预算为 `min(60 秒, max(30 秒, P95 * 1.5))`。
- 所有候选仍受 45/75 秒整体预算约束。

### 12.3 故障转移

- 客户端 HTTP 200 和 SSE headers 必须推迟到首个有效上游事件已经到达。
- 首事件超时前不写任何客户端响应字节。
- 超时后关闭当前上游，记录 `before_first_event` 并尝试下一候选。
- 所有候选共享整体首事件预算，避免多次超时造成无限等待。
- 一旦向客户端写出首个 SSE 事件，不再透明切换。
- 全部候选超时返回 504，错误中列出候选和各阶段耗时。

当前 `native_stream_mode=guarded` 不满足这一要求，因为它在首个 SSE 事件前向客户端发送 200。默认改为现有 `native_stream_mode=safe` 的首事件预取行为；旧 `guarded` 行为仅作为显式兼容选项保留。

### 12.4 健康归属

首事件超时打开 `provider/key/model/format/request_profile` 级兼容电路，不直接冷却整个 Key。401、403、余额不足等凭据错误才影响 Key 全局健康。

## 13. 被动健康优先

### 13.1 信号优先级

1. 真实请求结果。
2. 冷却恢复探测。
3. 首次验证探测。
4. 长期无流量巡检。

主动探测不得覆盖范围更窄的真实失败。例如，一个模型/格式探测成功不能清除整个 Key 的所有兼容电路。

### 13.2 ProbeCoordinator

模型发现、手动 Key 测试、idle probe 和 patrol probe 共享协调器：

- 全局主动生成探测并发为 1。
- 相同 provider/key/model/format 去重。
- 探测之间有全局最小间隔和 jitter。
- 真实请求到来时取消未开始的自动探测。
- 已开始探测不能强制杀线程，但应关闭上游连接并尽快退出。
- 手动测试优先于自动探测，但不能重复点击并发执行。

### 13.3 默认策略

- 同一 provider/key/model/format 最近 10 分钟有真实成功，不主动探测。
- 首次启动只验证最高优先级且从未有真实结果的候选。
- 冷却即将结束时，在无真实请求情况下执行一次针对性恢复探测。
- 全量巡检只检查超过 6 小时没有真实成功的 Key。
- 巡检调度窗口为 6–12 小时，不再无差别每 1–3 小时扫描所有 Key。
- 自动生成探测默认输出上限为 16 Token；供应商确有更高最小值时允许 provider 级覆盖。
- 每个供应商继续支持 `skip_idle_probe` 和 `skip_patrol_probe`。

### 13.4 探测结果作用域

- 401/403：Key 凭据状态。
- 余额或配额：Key 计费状态。
- 模型不存在：provider/key/model。
- 格式或 schema 不兼容：provider/key/model/format/profile。
- 首事件超时：provider/key/model/format/profile，连续两次探测失败后才打开兼容电路。
- 网络失败：连续失败后影响 Key 的传输状态，单次探测只记录观察。
- 成功：只清除本次实际验证范围内的状态。

健康评分以真实请求滚动窗口为主，主动探测只提供低权重的 freshness/recovery 信号。控制台分别显示 passive 和 probe 来源。

## 14. 错误与可观测性

- 价格队列满、价格解析失败、历史回填失败都写指标和诊断日志，不影响客户端请求。
- 首事件超时必须记录阶段、候选、预算、已消耗时间和状态作用域。
- 主动探测事件记录触发原因、验证范围、是否影响电路以及下一次计划时间。
- 请求详情中的 Cost tooltip 显示价格来源、价格快照时间和是否使用回退。
- 所有管理 API 保持鉴权和 ETag/缓存策略，不向普通代理客户端暴露管理数据。

## 15. 测试要求

### 15.1 用量与 Cost

- 三协议非流式缓存字段归一化。
- 三协议流式 usage 分片合并。
- reasoning 不重复计入总 Token 或 Cost。
- 手工价格、AA cache-hit 价格、cache-write 回退公式。
- 固定价格快照和一次性 pending 回填。
- `$0`、pending、unpriced、legacy 状态区分。

### 15.2 数据与迁移

- 旧 SQLite 增量迁移且旧记录可读。
- 模型聚合分页、筛选、排序和 provider 细分。
- 当前支持与历史成功不会混淆。
- IP 只信任配置的反向代理并正确处理 IPv4/IPv6。
- 删除历史时新字段和聚合结果同步消失。

### 15.3 首事件

- 响应头不算首事件。
- comment/keepalive/空 data 不算首事件。
- 首事件超时前客户端未收到 200 或 SSE bytes。
- 超时后切换候选并受整体预算约束。
- 首事件后中断不切路由。
- 普通与 Agent profile 使用不同预算。
- 首事件超时不污染 Key 凭据健康。

### 15.4 健康检测

- 最近真实成功会跳过自动探测。
- 冷却恢复和首次验证按范围探测。
- 全局并发、去重、jitter 和真实请求取消。
- 探测成功只清除匹配范围。
- 单次网络或首事件探测失败不立即禁用 Key。

### 15.5 前端

- 请求表头和每列数据对齐。
- 模型数据默认不展开、抽屉按需加载。
- Token 构成条同时具备数值和可访问文本。
- Cost 四种状态和 tooltip。
- 桌面、平板、移动端无文本重叠。
- 前端全部现有测试和生产构建通过；不要求 Playwright。

## 16. 实施顺序

1. 用量模型、价格快照、SQLite 迁移和回填 worker。
2. 模型数据聚合 API 和管理 API 测试。
3. 配置页模型数据、请求表格和请求详情。
4. 首事件状态机、阶段计时和路由健康归属。
5. ProbeCoordinator 与被动健康策略。
6. 全量后端测试、前端测试、构建和迁移兼容测试。

每一阶段必须保持已有请求历史、路由详情、格式转换和配置编辑功能可用，不允许先删除旧路径再补测试。

## 17. 验收门槛

- 缓存 Token 在请求、attempt、模型和时间序列聚合中一致。
- Cost 有固定价格快照，缺价不再显示为 `$0`。
- 配置页能查看全部模型数据，但默认界面保持可扫描且不铺满详情。
- 请求列表有固定表头，行内不重复标题，详情按五层信息结构展示。
- 首事件前超时可以透明换路由，首事件后绝不切换。
- 高频真实流量下不会继续产生周期性健康探测压力。
- 主动探测不会用单模型成功清除整个 Key 的无关失败状态。
- 后端全量测试、前端全部测试、生产构建和 `git diff --check` 通过。
