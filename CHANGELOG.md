# Changelog

> 遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)（"写给人看"）。
> **版本说明**：本仓库尚无 git tag，`pyproject.toml` 是唯一版本来源（当前 `1.0.0`）。
> 条目按 Conventional Commits 历史人工归纳；最近一次提交日期 2026-08-28。

## [未发布]

### 修复
- **思考强度显示**：请求日志的思考强度徽标改用归一化级别显示——空值显示 `default`，Anthropic `budget:N` 折算为 minimal/low/medium/high/xhigh，`max`/`extra_high` 归入 xhigh 档；每档独立配色（新增 xhigh 红色档、off 弱化灰），模型路由覆盖思考强度后请求记录回写为实际生效值。
- **流式首事件超时**：默认预算上调（plain 15→25s / agent 30→45s，总预算 45→90s / 75→150s），自适应上限放宽（plain 45s / agent 90s）；总预算将耗尽时后续尝试保底获得单次预算的 60%，不再被切成几秒的"死亡时间片"（`TimeoutError: first stream event timeout after 9.6s` 类故障）；超时错误信息保留 1 位小数。
- **模型定价自愈**：AA 索引按 TTL（6h）周期刷新且刷新不再被单模型 8s 预算掐死；`-high`/`:flex` 等变体后缀模型自动回退到基础模型定价（标记 estimated，不冒充精确价）；`backfill` 从仅 `pending` 扩展到 `unpriced`；人工价格覆盖保存/删除后自动重算历史成本，无法定价的键自动重新排队。
- **聚合供应商模型目录**：requesty 等供应商的厂商副本（`sail/...`、`runware/...`）归一为 canonical 后记录 1 对多 `variant_map`；只要任一副本未被禁用，模型即出现在 `/v1/models`（此前"选中副本被禁用即整行消失"），路由在副本间自动故障转移。
- **移动端控制台**：请求列表卡片式布局修复（客户端 IP 列塌缩为 "12…"、行宽溢出需横滚）；模型映射弹窗按钮竖排截断修复（`仍要重命名`）；供应商抽屉页签栏溢出截断修复；请求详情抽屉整体横向溢出修复（长错误文本换行，尝试表格内部滚动）。

### 变更
- **控制台**：模型工作台移除"按密钥查看模型"目录对比面板（后端按 key 发现数据保留用于路由）；模型映射编辑弹窗新增图标化"测试模型"按钮（`POST /-/admin/models/test`，复用探测管道）。

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