# 长期使用统计与品牌图标系统设计

日期：2026-07-19
状态：待用户审阅
范围：长期聚合存储、统计查询、配置页“数据统计”、模型与供应商品牌图标

## 1. 背景与结论

当前请求历史由 RequestHistoryStore 写入 SQLite：

- 请求与 Attempt 明细默认保留 30 天，可通过 observability.history.retention_days 配置。
- 配置页“模型数据”的默认筛选是 7 天；这只是查询范围，不是数据库保留期。
- 当前 range=all 仍然只聚合尚未被 retention 清理的请求，因此不是全生命周期数据。
- 当前运行实例约 7,895 条请求、8,102 条 Attempt，占用约 6.5MB；相同数据按“日期 × 模型 × 供应商”只有约 251 个组合。

本设计将短期可追溯明细与长期低体积统计分离：

- 请求明细用于排错，按 retention 删除。
- 长期统计只保存数值和低基数维度，默认永久保留。
- 删除请求明细不修改长期统计。
- 只有独立的“清除统计数据”操作才重置长期统计。

实施顺序为后端优先：先固定数据契约、存储和测试，再实现使用真实数据的前端。

## 2. 目标

用户需要能准确回答：

1. 系统自统计起始日期以来，共调用多少次、消耗多少 Token、产生多少 Cost？
2. 普通输入、缓存读取、缓存创建、输出和 Reasoning 各占多少？
3. 任意时间范围内，哪些模型和供应商产生了调用、失败、Token、Cost 与延迟？
4. Overview 的近期运行态与长期数据统计为何不同？
5. 请求明细被自动或手动删除后，累计统计是否仍可信？

同时建立统一品牌图标解析层，使模型和供应商在列表、标签、详情标题等位置拥有一致但不混淆的视觉身份。

## 3. 非目标

- 不永久保存请求正文、响应正文、IP、User-Agent、错误原文、路由诊断或完整 Attempts。
- 不永久按 Key 聚合。Key 会删除、替换和重排，当前没有稳定且不可变的长期身份。
- 不将统计做成财务账单；Cost 是按请求发生时价格快照固定的可观测性数据。
- 不改变 Overview 的职责或布局。Overview 继续表示近期系统状态。
- 不把全部统计序列一次性发送给浏览器。
- 不使用模糊的任意子串匹配猜测品牌。

## 4. 保留策略

| 层级 | 默认保留 | 用途 |
|---|---:|---|
| 请求与 Attempt 明细 | 30 天，可配置 | 请求列表、详情、错误溯源 |
| 小时聚合 | 90 天 | 今天、24h、7d 等细粒度趋势 |
| 每日聚合 | 永久 | 30d、90d、1 年、全部、自定义长期趋势 |
| 全生命周期累计 | 永久 | 精确总量与快速汇总 |

小时聚合超过 90 天后删除，但同一数据已同步存在于每日聚合和全生命周期累计中，不会丢失长期总量。

### 4.1 清除语义

- 自动 retention 只删除请求明细，不影响聚合。
- 请求页手动删除选中或筛选结果，也只删除请求明细。
- “清除统计数据”只删除小时、每日和累计统计，不删除请求明细。
- 清除需要独立危险操作、二次确认和明确文案。
- 清除后写入新的统计世代 generation 和 statistics_started_at。
- 服务启动回填只处理当前统计世代允许导入的请求，不能因仍存在 30 天明细而复活清除前统计。

## 5. 永久统计字段

每个聚合维度保存：

- requests、attempts、success、failed、recovered
- input_tokens、uncached_input_tokens、cached_input_tokens
- cache_write_tokens、output_tokens、reasoning_tokens、total_tokens
- cost_priced_usd、cost_estimated_usd
- cost_priced_count、cost_estimated_count、cost_pending_count、cost_unpriced_count
- first_event_ms_sum、first_event_samples、first_event_ms_max
- duration_ms_sum、duration_samples、duration_ms_max
- last_used_at

平均首事件和平均总耗时由 sum / samples 计算，避免保存每个样本。最大值用于识别极端体验。

请求视角的永久维度为：

- client_model
- final_provider
- upstream_model
- client_format
- upstream_format
- route_outcome

route_outcome 使用稳定枚举：

- direct_success
- recovered_success
- failed_after_attempts
- no_candidate
- client_error
- cancelled

空值规范化为空字符串，不使用随机值或显示文案作为持久化维度。不保存 Key、IP、User-Agent、错误原文或诊断事件。

### 5.1 请求事实与 Attempt 事实

必须区分两类统计事实，避免恢复请求的消耗归属错误：

- 请求事实：一条客户端请求只增加 requests，用于调用、成功、失败、恢复、端到端首事件与总耗时，以及按客户端模型和最终供应商的请求体验。
- Attempt 事实：每次实际上游尝试只增加 attempts，用于供应商、上游模型、上游格式的 Token、Cost、成功失败和上游耗时。

例如供应商 A 产生部分 Token 或 Cost 后失败、供应商 B 恢复成功：

- 请求数和最终结果归属于一条请求，最终供应商是 B。
- A 与 B 各自实际产生的 Token 和 Cost 归入各自 Attempt 事实。
- 全局 Token 和 Cost 来自 Attempt 事实求和，不能再叠加请求事实中的汇总值。

前端的供应商消耗与成本排行明确标注为“上游尝试”，模型总览和客户端成功率使用“客户端请求”。

## 6. SQLite 架构

统计表继续放入现有历史 SQLite，保持单文件部署和事务一致性。

### 6.1 usage_statistics_meta

单行元数据保存：

- schema_version
- generation
- reporting_timezone
- statistics_started_at
- backfill_cutoff_at
- last_compacted_at
- created_at
- updated_at

generation 每次清除统计递增。backfill_cutoff_at 是新世代不允许导入的历史上界，防止清除后重启复活旧数据。

### 6.2 usage_statistics_ledger

字段为 generation、request_id、finished_at、fingerprint、contribution_snapshot、accounted_at，主键为 generation + request_id。

ledger 只用于幂等和后台 Cost 修正，不承载 UI 查询。fingerprint 表示最后一次计入统计的请求和 Attempt usage/Cost 状态；contribution_snapshot 保存计算差额所需的紧凑规范事实，不保存错误、诊断或客户端身份。

ledger 不永久保留。请求明细已经过期、Cost 不再是 pending 且超过 retention 安全窗口后可以删除对应 ledger。首次回填完成状态保存在 meta 中；旧 ledger 删除后，启动逻辑也不会再次全库回填。这样永久体积只由小时、每日和累计聚合决定。

### 6.3 小时与每日聚合

usage_statistics_hourly 和 usage_statistics_daily 均保存 request 与 attempt 两种 fact_kind。主键由以下字段组成：

- generation
- fact_kind
- bucket_start
- client_model
- final_provider
- upstream_model
- client_format
- upstream_format
- route_outcome

小时桶和每日桶使用 reporting_timezone 计算。数据库保存桶的 Unix 起点，API 同时返回时区。

### 6.4 全生命周期累计

usage_statistics_totals 使用相同 fact_kind 和维度但没有 bucket_start，用于全量汇总、排行和快速筛选。

为时间、客户端模型、最终供应商建立查询索引。管理 API 只允许受控的分组和排序字段。

## 7. 写入与幂等

### 7.1 新请求

请求结束后，现有异步历史 writer 在同一 SQLite 事务中：

1. upsert 请求与 Attempts 明细。
2. 生成一个规范请求事实和零至多个规范 Attempt 事实。
3. 查询当前 generation 的 ledger。
4. 若不存在，向小时、每日和累计表各执行一次原子增量，并写 ledger。
5. 若 fingerprint 相同，不重复累计。
6. 执行受节流的明细 retention 和小时聚合清理。

代理热路径仍只负责非阻塞入队；聚合不得增加上游响应等待。

若同一 request_id 的 fingerprint 改变，必须用 ledger 的 contribution_snapshot 计算新旧差额后更新三个聚合层，不能把修正后的请求当成新请求再次累计。

### 7.2 Cost 后台回填

价格解析器把 Attempt 从 pending 修正为 priced 或 estimated，或从 pending 修正为 unpriced 时：

1. 读取 ledger 中旧 fingerprint 和旧 Cost 状态。
2. 计算对应 Attempt 事实的 Cost 金额和状态计数差额，而不是重新添加整条请求。
3. 在同一事务中修正小时、每日、累计和 ledger。
4. 重复执行同一回填结果时差额为零。

这保证 Cost 固定价格快照、一次性回填且无重复累计。

### 7.3 首次升级回填

- 固定 statistics_started_at 为当前 SQLite 可回填请求中的最早 finished_at。
- 固定 backfill_cutoff_at 为 0。
- 分批扫描现有请求，逐条走同一个幂等记账函数。
- 不推测 retention 已删除的旧数据。
- UI 显示“统计始于 YYYY-MM-DD”，不将其称为系统真正的历史总量。
- 回填可中断并依靠 ledger 在重启后继续。
- 完成后将 backfill_completed_at 写入 meta；此后启动不再自动重新扫描全部历史。

## 8. 时区

- 首次初始化使用系统当前 IANA 时区；无法获得时保存固定 UTC offset 标识。
- reporting_timezone 写入元数据后保持稳定。
- 小时和每日边界都按该时区计算。
- 修改统计时区必须通过“清除统计并开始新世代”完成，不能仅凭已聚合的每日数据重新划分过去的日期边界。
- API 返回时区和统计起始时间，前端明确展示。

## 9. 管理 API

### 9.1 GET /-/admin/usage-statistics/summary

参数：

- range=today、24h、7d、30d、90d、1y、all 或 custom
- start、end，custom 时必填
- model、provider、client_format

返回时间范围、时区、统计起始时间、粒度、请求结果数量、去重后的上游 Token/Cost、Cost 状态和请求端延迟统计。

### 9.2 GET /-/admin/usage-statistics/timeseries

增加：

- metric=requests、tokens、cost 或 latency
- resolution=auto、hour 或 day

auto 对 90 天内范围优先使用小时，更长范围使用每日。服务端限制点数，避免浏览器绘制海量数据。

### 9.3 GET /-/admin/usage-statistics/breakdown

增加：

- group_by=model、provider、client_format 或 upstream_format
- sort=requests、tokens、cost、failures 或 latency
- limit、offset

按模型分组时，一条客户端模型记录聚合其所有供应商和上游变体。按供应商查看调用体验时使用请求事实；查看供应商 Token/Cost 时使用 Attempt 事实，API 响应必须返回 fact_kind。

### 9.4 GET /-/admin/usage-statistics/dimensions

返回当前统计世代存在的模型、供应商和格式简表，供按需下拉搜索。

### 9.5 POST /-/admin/usage-statistics/clear

请求必须包含确认值 clear_usage_statistics。响应返回新 generation、新统计起始时间和删除行数。请求明细不受影响。

清除操作通过 writer barrier 与历史写队列排序：先记录 clear_cutoff_at 并切换 generation，再处理队列中尚未写入的请求。finished_at 小于或等于 cutoff 的队列项仍保存请求明细，但不得计入新统计；cutoff 后完成的请求计入新世代。不得通过清空队列来实现统计清除。

## 10. 配置页信息架构

顶级配置标签“模型数据”改名为“数据统计”。打开后显示两个二级视图：

1. 使用统计
2. 模型数据

两个视图共享顶部范围和维度筛选，但各自保留最后选择的趋势模式、排序和页码。

### 10.1 使用统计

页面遵循“先总览，后趋势，再下钻”：

1. 标题带：使用统计、统计起始时间、时区、刷新时间。
2. 筛选带：今天、24h、7d、30d、90d、1 年、全部、自定义；模型、供应商和客户端格式。
3. 主摘要：
   - 总 Token 为视觉主值。
   - 调用与 Cost 为紧凑次值。
   - 普通输入、缓存命中、缓存创建、输出、Reasoning 为构成卡。
   - 缓存率使用清晰进度条。
4. 趋势工作区：
   - 模式为 Token、Cost、请求、延迟。
   - 一次只突出一种模式，避免不同量纲同时争夺注意力。
   - Token 显示输入、缓存和输出构成。
   - Cost 区分精确定价、估算和未定价。
   - 请求显示成功、失败和恢复。
   - 延迟显示平均首事件和平均总耗时。
5. 下钻区：
   - 模型排行和供应商分布使用切换视图，不同时大面积铺开。
   - 模型行使用模型厂商品牌图标；供应商行使用服务商品牌图标。
   - 供应商视图提供“请求结果”和“上游消耗”两个口径，默认显示上游消耗；标题和 tooltip 明确标注，禁止混算。
6. 年度活跃热力图位于页面下部，只在 1 年或全部范围显示。

视觉借鉴参考图的层级和留白，但延续现有中性色、状态色与紧凑控件，不复制大面积紫色渐变。

### 10.2 模型数据

保留当前一行一个客户端模型的高密度表格和详情抽屉：

- 模型用量改为读取长期统计 API，因此 all 真正表示当前统计世代全部数据。
- 当前路由支持仍来自实时 model registry，不能写入历史聚合。
- 历史成功供应商来自长期统计。
- 详情趋势使用小时或每日聚合，不依赖已过期请求明细。

### 10.3 响应式

- 桌面显示完整筛选、摘要、趋势和下钻。
- 平板筛选允许两行排列；摘要构成卡变为 2 至 3 列。
- 移动端主摘要优先，其他构成可横向浏览；趋势保持可读高度；排行使用列表而不是宽表。
- 页面负责纵向滚动，不创建嵌套竖向滚动容器。

## 11. 品牌图标系统

### 11.1 语义

- 模型位置显示模型厂商或模型系列图标。
- 供应商位置显示实际服务商图标。
- Requesty 调用 DeepSeek 时，供应商显示 Requesty，模型显示 DeepSeek。

### 11.2 解析优先级

统一 brand_icon_registry：

1. 配置中的显式 icon。
2. 规范 ID 精确匹配。
3. 供应商别名表，例如 zhipu、bigmodel 映射到 zai。
4. 模型命名空间和系列规则，例如 deepseek/、deepseek-、glm-、gpt-。
5. 中性本地图标。

规则必须识别字符串边界、命名空间和短横线、下划线、斜线、点号分隔符，不能使用任意 includes。规则顺序固定，并为易冲突名称添加测试。

### 11.3 渲染

- 继续使用 @lobehub/icons 的 getLobeIconCDN。
- 有彩色 SVG 时优先彩色；没有时使用官方单色。
- 未识别或加载失败使用本地中性图标，布局尺寸不变。
- 共享组件统一尺寸、边框、圆角、背景和对齐。
- 装饰性图标设置 aria-hidden；文字名称始终保留。

首批接入范围：

- 模型数据表与模型抽屉。
- 使用统计的模型排行与供应商分布。
- Provider 列表和卡片标题。
- 请求列表和请求详情的最终供应商与模型。
- 路由路径和 Attempt 中的供应商与模型。

逐处替换共享渲染函数，并控制视觉密度，避免每个标签都重复放图标。

## 12. 错误与降级

- 明细写入成功但聚合失败时增加独立失败计数和日志，后续 repair job 可根据 ledger 补齐。
- 聚合写入不得导致代理请求失败。
- 小时聚合缺失时，长范围仍可由每日表服务；短范围显示数据不完整状态。
- pending 和 unpriced Cost 不显示为 0 美元。
- API 返回 partial=true 和原因时，前端显示紧凑警告。
- 图标 CDN 失败时只降级图标，不影响数据或交互。

## 13. 测试

### 13.1 后端

- 默认明细 30 天、小时 90 天、每日永久。
- 新请求只累计一次，相同请求重写不重复。
- Cost 状态更新只应用差额。
- 恢复请求中多个 Attempt 的 Token/Cost 分别归属实际供应商，全局值不重复。
- 明细自动清理和手动删除不改变聚合。
- 清除统计递增 generation，重启不从旧明细复活。
- 清除期间队列内旧请求仍保存明细但不进入新世代，新请求正常累计。
- 首次回填可中断、恢复且不可重复。
- reporting timezone 边界正确，包括夏令时环境。
- 自定义范围、模型、供应商和格式筛选。
- 按模型聚合全部供应商和上游变体。
- 精确、估算、pending 和 unpriced Cost 正确。
- 旧 SQLite 可增量迁移。

### 13.2 前端

- 顶级“数据统计”和两个二级视图语义清楚。
- 范围与维度筛选正确生成 API 参数。
- 四种趋势模式一次只显示相关量纲。
- 全部范围显示统计起始时间。
- 空数据、部分数据、接口失败和未定价有独立状态。
- 桌面、平板、移动端无嵌套纵向滚动。
- 品牌解析覆盖精确匹配、别名、系列边界和 fallback。
- 彩色与单色资源均不破坏对齐。
- 生产构建与全部现有前端测试通过。

## 14. 实施顺序

1. 定义统计事件、稳定维度和 API response schema。
2. SQLite 表、迁移、幂等 ledger、三层聚合与测试。
3. 新请求记账、Cost 差额修正、清理和首次回填。
4. 管理查询、清除接口和 API 测试。
5. 抽取统一品牌图标 registry 并补充解析测试。
6. 配置页“数据统计”外壳和使用统计真实数据视图。
7. 将模型数据改接长期统计，同时保留实时路由覆盖。
8. 依次在 Provider、请求和路由详情中复用图标。
9. 前后端全量测试、生产构建、迁移和清除恢复测试。

## 15. 验收标准

- 页面中的“全部”表示当前统计世代全部数据，不受 30 天请求 retention 限制。
- 删除请求明细后总调用、Token、Cost 不变化。
- 清除统计后旧数据不会在重启时复活。
- Cost 回填不会重复累计，精确、估算和缺价状态可区分。
- 90 天内可查看小时趋势，长期可查看每日趋势和总累计。
- 使用统计负责长期总览，模型数据负责逐模型分析，Overview 负责近期运行态。
- 模型与供应商图标语义正确、匹配可预测、无法识别时安全降级。
- 后端、前端、构建和迁移测试全部通过。
