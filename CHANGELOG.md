# Changelog

> 遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)（"写给人看"）。
> **版本说明**：本仓库尚无 git tag，`pyproject.toml` 是唯一版本来源（当前 `1.0.0`）。
> 条目按 Conventional Commits 历史人工归纳；最近一次提交日期 2026-08-28。

## [未发布]

### 变更
- **健康检测覆盖与记录可靠性**（预检/巡检）：
  - **巡检断点续扫**：被真实请求打断的巡检轮次记下续扫游标（`patrol_state.cursor`），下一轮从断点继续而不是从最高优先级重新开始——排在队尾的供应商不再因反复被打断而永远轮不到；整轮扫完游标自动清除。轮次开始时遇真实请求在途由"整轮跳过并等下一个 6-12h"改为**就地推迟 ~10 分钟重试**（`last_result: postponed`）；无候选模型的 key 记录 `skipped` 事件；设置页运行时卡显示续扫位置与推迟/打断状态。
  - **探测事件持久化**：预检/巡检探测事件写入 SQLite `probe_events` 表（随请求历史同库、同保留期剪枝）。此前记录只存全局 200 条内存环形队列，重启即失、高探测压力下数小时即被挤出——巡检间隔 6-12h，记录几乎必然在下轮巡检前消失。24h 探测计数、provider 卡片探测摘要、活动面板探测记录现以 SQLite 为准（历史存储关闭时回退内存队列）；`provider_activity_summary` 新增 `probeCount24hPatrol/probeCount24hReadiness` 与分层 `lastProbePatrol/lastProbeReadiness`。
  - **概览卡片区分预检/巡检**：provider 卡片探测摘要按检测来源拆分为两个徽标（"预检 · 探测正常" / "巡检 · 探测正常"），各带自己的 24h 次数，不再混成一条只显示最近一次。
- **模型归属精确到密钥**：模型映射编辑弹窗新增归属密钥徽章——展示该模型出现在哪些 key 的自身目录里（脱敏形态 `ms-559**1d`，多把可点选切换），"测试模型"按所选密钥发起并把 `key_index` 传给 `POST /-/admin/models/test`；后端新增 `model_registry.resolve_key_provider_model`，手动测试、空闲探测、巡检统一按"这把 key 自己的目录"解析上游 raw（key `models` dict → `provider_key_model_capabilities` 指纹条目），无 key 级信息时回退 provider 级主 raw。真实路由的逐 key 过滤行为（`key_supports_provider_model`）本已精确，本次补测试回归锁定。
- **聚合已知成本三位小数**：用量统计汇总卡与分组行的已知成本最多显示 3 位小数（四舍五入）；小于 $0.0001 的场景与请求明细等小金额展示保留原 6 位精度。
- **请求详情直接看价格**：Token 构成图例下方新增该请求实付费率快照（输入/缓存/缓存写/输出，每百万 tokens，悬浮提示含定价来源），数据取自请求记录的 `pricing_snapshot`，无需再到系统设置的模型价格页查询；无快照的聚合视图不显示。
- **健康检测反毒化与降压力**（预检/巡检两套探测器）：
  - **探测超时不再毒化路由**：探测"流已打开但超时未收到首事件"由 `provider_compat`（兼容性熔断阶梯 10s→60s→1h）改判为专用 `probe_first_event_timeout`——**平坦 120s 熔断**（可经 `retry.failure_policies` 覆盖），下一次探测成功即清除。思考型模型首字节 routinely 超过固定探测超时，旧逻辑会把"探测必然超时但真实请求能成功"的模型+key 组合挡在路由外最长 1 小时。
  - **探测首字节预算自适应**：复用真实请求的 `_adaptive_first_event_budget`，按该 provider+model 的 plain 档实测首事件 p95×1.5 放宽（下限 20s / 上限 45s），无样本时回退 `patrol_first_byte_timeout_s`（现为其兜底值语义）。
  - **失败计数带时间衰减**：ProbeCoordinator 的 2 连击门控计数在距上次失败超过 10 分钟后重置，跨越数小时的两次孤立失败不再叠加武装处罚。
  - **预检降压力**：冷却未到期的 key 不再每轮补测（到期后回到可用池自然验证）；禁用 key 每轮最多补测 1 把；同 provider 连续 key 探测间加 1.5s 间隔；按空闲档位缩探测广度（recent 只测首选 provider、medium 前 3、深档全量）；连续整轮无健康 provider 时间隔 ×2/×4 退避（封顶 30min，深档不受影响）。
  - **巡检中断就近重排**：被真实请求打断的巡检轮次 ~10 分钟后重试，不再等待下一个完整 6-12h 间隔。
  - **探测压力可视化**：observability 新增每 provider `probeCount24h`，provider 卡片探测摘要显示 24h 探测次数。
- **控制台健康检测可读性改版**：修复健康监控设置面板整面显示原始 i18n 键名的问题（16 个 `cfg.*` 键缺失）；两套探测器改名**预检（Readiness Probe）/巡检（Full Sweep）**并配目的/节奏/范围/适用模式对照表；provider 卡片"跳过空闲探测/跳过巡检探测"开关改为"跳过预检/跳过巡检"；运行时状态卡标签与"立即运行"按钮接入 i18n；探测摘要徽标、档位提示、巡检徽标文案同步 i18n；健康检测两个配置小节去除底色，与面板背景融为一体。

### 修复
- **健康检测设置无法保存**：`_config_view` 配置快照漏掉了 `health_monitor` 块——保存接口实际写入 overlay 成功，但响应与 `GET /-/admin/config` 都不含该块，前端乐观更新确认后表单回读永远是默认值（保存看起来"没生效"）；现在快照携带 `health_monitor`，保存后表单回显真实值。
- **内网上游被 key 代理拦成 502**：给 key/provider/全局设置代理后，上游是 docker 内网地址（单标签服务名如 `http://opencode2api-1:9090`、内网 IP、localhost、`.local`/`.internal`/`.lan`/`.docker.internal`）的流量也一律强走公网出口代理——代理无法回源 docker 内嵌 DNS，转发、模型发现、测试/探测全部 502。现按 NO_PROXY 惯例自动绕过代理直连（`proxy_utils.should_bypass_proxy` / `resolve_upstream_proxy`，真实路由与发现路径一致生效），公网上游不受影响。
- **探测/巡检的 key 目录盲区**：同一供应商不同 key 的 `/v1/models` 不同（或同 canonical 映射不同 raw）时，探测此前对每把 key 发同一个 provider 级 raw——非首选 key 的专属模型永远巡检不到，其 404 还会被误判为"模型级拒绝"提前终止整轮探测；现在空闲探测跳过目录明确不含探测模型的 key（全部不含时保持原顺序兼容 static_models/手动映射），巡检按 key 级 raw 发送并对明确不含的 (key, 模型) 组合记录 `skipped: model not in key catalog`（不记失败，由驱动换下一候选模型）。
- **思考强度显示**：请求日志的思考强度徽标改用归一化级别显示——空值显示 `default`，Anthropic `budget:N` 折算为 minimal/low/medium/high/xhigh，`max`/`extra_high` 归入 xhigh 档；每档独立配色（新增 xhigh 红色档、off 弱化灰），模型路由覆盖思考强度后请求记录回写为实际生效值；徽标图标尺寸/间距/字重与相邻"流式"徽标统一（此前闪电图标回退到 16px 全局尺寸），客户端 IP 列让位给身份列（11→9% / 12→10%），徽标行不再拥挤。
- **流式首事件超时**：默认预算上调（plain 15→25s / agent 30→45s，总预算 45→90s / 75→150s），自适应上限放宽（plain 45s / agent 90s）；总预算将耗尽时后续尝试保底获得单次预算的 60%，不再被切成几秒的"死亡时间片"（`TimeoutError: first stream event timeout after 9.6s` 类故障）；超时错误信息保留 1 位小数。
- **模型定价自愈**：AA 索引按 TTL（6h）周期刷新且刷新不再被单模型 8s 预算掐死；`-high`/`:flex` 等变体后缀模型自动回退到基础模型定价（标记 estimated，不冒充精确价）；`backfill` 从仅 `pending` 扩展到 `unpriced`；人工价格覆盖保存/删除后自动重算历史成本，无法定价的键自动重新排队。
- **聚合供应商模型目录**：requesty 等供应商的厂商副本（`sail/...`、`runware/...`）归一为 canonical 后记录 1 对多 `variant_map`；只要任一副本未被禁用，模型即出现在 `/v1/models`（此前"选中副本被禁用即整行消失"），路由在副本间自动故障转移。
- **移动端控制台**：请求列表卡片式布局修复（客户端 IP 列塌缩为 "12…"、行宽溢出需横滚）；模型映射弹窗按钮竖排截断修复（`仍要重命名`）；供应商抽屉页签栏溢出截断修复；请求详情抽屉整体横向溢出修复（长错误文本换行，尝试表格内部滚动）。

### 变更
- **控制台**：模型工作台移除"按密钥查看模型"目录对比面板（后端按 key 发现数据保留用于路由）；模型映射编辑弹窗新增图标化"测试模型"按钮（`POST /-/admin/models/test`，复用探测管道）。
- **控制台密钥页签改版**：每个 key 合并为一张统一卡片（身份 + 状态徽标 + 内嵌代理/模型映射编辑 + fails/cooldown/disabled 指标 + 启用/禁用/清除/删除），移除按 key 的模型测试下拉与测试按钮（后端 key 探测端点保留，由模型测试复用），独立的"密钥配置"表格撤除，"添加密钥"表单改为卡片列表下方的全宽行；卡片列响应式布局（约 430px 阈值自动单列）。

### 文档
- 新增根级 `ARCHITECTURE.md`（克制版架构全景）与 `CHANGELOG.md`。
- 根目录收敛为核心四文档（README / ARCHITECTURE / CHANGELOG / AGENTS）；`PROJECT_OVERVIEW.md`、`CONTRIBUTING.md`、`README_CN.md` 移入 `docs/`。
- 过期计划/修复类文档归档至 `docs/archive/2026-09-05/`（仅本地保留，不随仓库提交）。
- 测试数量统一校准为实测值：886 个 pytest（51 文件）+ 32 个 Node UI 测试（`npm test` 脚本实跑）。

---

## [1.0.0] - 2026-08-28

> 基准版本（对应 `pyproject.toml`），聚合 2026-06-12 至 2026-08-28 共 169 次提交的功能演进。

### 新增
- **三格式互转引擎**：`conversion_core/` 新一代转换引擎，codecs 按 chat / responses / anthropic 分层，支持流式/非流式的文本、reasoning/thinking、tool calls 双向转换，支持 agent 格式转换流式分块。
- **智能路由**：5 种 `provider_select` 模式（priority_failover / round_robin / weighted_rr / random / auto），auto 模式按实时健康分动态调整优先级；故障转移、逐 key/provider 冷却、候选去重、attempt 级可解释日志。
- **模型体系**：自动发现队列、canonical 模型归一与重命名映射、多变体回退、按供应商禁用模型；发现失败保留 last-known，不静默清空；重命名冲突守卫。
- **客户端虚拟密钥**：`client_key_store.py` 实现客户端密钥的存储/鉴权/限流/配额；控制台 `X-Admin-Key` 可绕过 client-key 鉴权。
- **价格与用量**：人工模型价格覆盖（pricing overrides）、定价解析器、生命周期用量统计、reasoning-effort 标签。
- **可观测性**：逐尝试延迟归因、路由路径可视化（routing_explain / routing_trace）、健康探测与自适应空闲检测、审计日志（JSONL）、诊断扩展与控制。
- **Web 控制台**：workspaces 改版、客户端密钥与系统设置页、路由决策可视化、请求 IP 密度、请求搜索与批量选择、Playground（三格式）、i18n（EN/ZH）、接入 AA 基准模型详情抽屉。
- **零配置模式**：无 `config.json` 时按环境变量（`OPENAI_API_KEY` 等）自动生成 provider，直接启动。
- **基础设施**：GitHub Actions CI（Python 3.10–3.13 矩阵 + 编译检查 + Node 产物检查 + Docker 冒烟）与 Docker Hub 自动发布（amd64/arm64）；CLI `--init` / `--config` / `--host` / `--port`。

### 修复
- CLI 参数曾全部失效（`if __name__ == "__main__"` 重复实现而非调用 `main()`）。
- 配置热重载期间请求线程读取撕裂状态 → 引入 thread-local `RuntimeContext` 快照。
- 路由提前终止（非致命错误被错误标记 `stop_attempts=True`，漏掉后续 provider/key）；新 provider 未显式 priority 时抢流量；客户端错误信息泄露内部 provider 细节。
- 流式转换重复内容、断流收尾二重异常、预拉取线程池引用泄漏、退出时连接池未关闭。
- 模型映射 tombstone 复活、统一映射时字典迭代中修改、级联删除与 key-filter 归一化、AA 改版导致的静默模型不匹配。
- 控制台批量 UI 稳定性问题：key 抽屉重复/失效、mapping 重名歧义、pricing 分页抖动、stale model mapping 提交等。
- Cloudflare/反代后客户端 IP 丢失（可信反代头配置）。

### 性能
- 核心路径性能优化（2026-07-02 验证性提升约 +99%）。
- 配置热重载跳过冗余磁盘扫描（2026-07-27）。

### 变更
- Dashboard 由 251KB 单体 `dashboard/app.js` 迁移为 Vite 构建管线（`dashboard_src/`）；产物保持未压缩以兼容子串断言型 UI 测试。
- Admin 路由自 `sse2json.py` 拆分为 `admin_routes.py`（~700 行脱出）；重构蓝图见 `docs/REFACTOR_GUIDE_*`。
- README 中英双语化（README.md / README_CN.md 分置）；Docker Hub 镜像名定为 `dsk3/litellm-proxy`。

### 文档
- 功能全景 `docs/FEATURES.md`、API 参考 `docs/API_REFERENCE.md`、故障排查 `docs/TROUBLESHOOTING.md`。
- 模型路由生命周期 `docs/MODEL_ROUTING_LIFECYCLE.md`、健康检查机制 `docs/HEALTH_CHECK_MECHANISM.md`、三阶段重构蓝图 `docs/REFACTOR_GUIDE_PHASE_1_2/3_4/5.md`。