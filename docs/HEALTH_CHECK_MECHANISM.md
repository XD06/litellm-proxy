# 健康检测机制 Overview

> 更新于 2026-09-28。梳理 LiteLLM Proxy 的两套健康探测器 + 健康分数体系。
> 控制台命名：**预检（Readiness Probe，配置键 `idle_*`）** 与 **巡检（Full Sweep，配置键 `patrol_*`）**。
> 注意：配置键与 Admin API 字段沿用 `idle`/`patrol` 历史名，仅界面文案使用新名。

## 项目定位

LiteLLM Proxy（入口 `sse2json.py`，默认端口 4894）是位于 LLM 客户端与多个上游 Provider 之间的格式感知代理。核心职责：OpenAI Chat Completions / Responses / Anthropic Messages 三种 API 格式互转 + 多 Provider/多 key 路由、熔断、重试。

"保活"目标：空闲期主动探测上游 key 是否仍可用，让空闲期过后的第一个真实请求一次命中健康 provider，同时给 `auto` 路由模式提供健康分数。

## 两套探测器（均为 daemon 线程，定义于 `sse2json.py`）

| 维度 | 预检 Readiness Probe（`idle_*`） | 巡检 Full Sweep（`patrol_*`） |
|---|---|---|
| 目的 | 预验证"下一个请求会用到的 provider" | 周期性体检：恢复冷却/禁用 key、发现死 key |
| 节奏 | 自适应分档 30s~6h（见下） | 固定 6-12h 随机（可配 `patrol_interval_min/max_s`） |
| 范围 | 按路由优先级，测到第一个健康即停 | 所有 provider × 所有 key（每 key 最多 5 个候选模型） |
| 广度 | 按档位缩放：`recent` 只测 plan[0]，`medium` 前 3，更深档全量 | 全量 |
| 触发 | 仅自动 | 自动 + 手动（`POST /-/admin/health/patrol/trigger`） |
| 适用模式 | 仅 `priority_failover` / `auto` | 全部模式 |
| 事件标记 | idle_tier = cold_start/recent/medium/long/deep | idle_tier = patrol |

### 1. 预检（Idle Health Checker）

- **自适应节奏**（`_idle_tier_info`，按"距上次请求完成时间"分档）：
  - `cold_start` 45s / `recent` 30s(<2min) / `medium` 60s(2-10min) / `long` 5min(10-30min) / `deep` 3-6h 随机(30min+)。全部可经 `health_monitor.*` 配置覆盖。
- **失败轮退避**：连续整轮无健康 provider 时，下轮间隔 ×2/×4（封顶 max(档位间隔, 30min)，deep 档不受影响）；发现健康即复位。
- **分块睡眠**（≤30s chunk）：deep idle 期间有真实请求到来时 30s 内提前唤醒重算间隔。
- **失败反噬防护**：
  - **冷却中的 key 不再每轮补测**——冷却到期后自动回到可用池，下一轮作为可用 key 验证（最多晚一个 tick）；
  - **禁用 key 每轮最多补测 1 把**（唯一恢复通道，但要限频）；
  - 同一 provider 连续 key 探测之间 1.5s 间隔，避免每轮连击。
- **复用 `router.report_failure()` 的冷却策略**，无新状态管理。
- 有 `requests_in_flight` 时跳过本轮；仅 `priority_failover` / `auto` 模式运行。
- 状态：`_idle_probe_schedule = {interval_s, computed_at}` + `_idle_failed_round_streak`。

### 2. 巡检（Patrol Health Checker）

- **固定 6-12h 随机间隔**（历史文档写的 1-3h 已过期），全量扫描每个 provider × 每个 key。间隔 = `patrol_interval_min_s + r × (patrol_interval_max_s - min)`（r 为本轮掷定的 0-1 比例）；**配置修改对当前周期实时生效**：巡检线程每 30s 重读 `health_monitor` 并按同一比例重映射 `next_run_at`（如 6-12h 已跑 9h 时改成 3-6h，则按比例折算 ~2h 后运行），窗口改小到已过时间以内时**立即触发本轮**（`_patrol_checker_loop`）。
- **流式探测省 token**：`stream=true, max_tokens=16`（payload 为 `"Hi"`，历史教训：空 content 会被上游 400 误伤健康 key），读首个非 `[DONE]` 的 `data:` 事件即关连接。
- **多候选模型**（`_collect_patrol_models`，来源优先级 key_recent_success → recent_success → capability → manual_map → static → route，上限 5 个），任一成功即健康；provider 级无候选模型时现场拉取 `/v1/models` 补救；单 key 无候选模型时记录 `skipped: no probe model` 事件（不再静默漏测）。
- **探测间 3-5s 随机延迟**（`patrol_delay_s` + `patrol_delay_jitter_s`），跨 provider 也延迟。
- **中断就近重排 + 断点续扫**：被真实请求打断的轮次在 ~10min 后重试（`_PATROL_RESCHEDULE_AFTER_INTERRUPT_S`），不再等下一个完整 6-12h 间隔——巡检是禁用 key 的主要恢复通道，不能被一个 in-flight 请求推迟半天。重试轮次从**续扫游标**（`_patrol_probe_schedule.cursor = {provider, key_index}`，每完成一个 key 前进一次）继续，而不是从最高优先级 provider 重新开始——否则高频流量下排在队尾的供应商可能长期轮不到；整轮扫完游标清除，游标指向的 provider 被移除时游标作废。轮次开始时遇真实请求在途同样标记 `postponed`（~10min 后重试），不再整轮跳过并等满 6-12h。
- **手动触发** `_trigger_patrol_now()`，`_PATROL_TRIGGER_LOCK` 防并发重叠；有续扫游标时手动轮次同样从断点继续（扫完自动清零，重新获得完整覆盖）。
- 每 provider 可配 `skip_patrol_probe`（预检对应 `skip_idle_probe`）。
- 状态：`_patrol_probe_schedule = {last_run_at, last_run_duration_s, last_result, last_summary, next_run_at, interval_s, running, manual_trigger, cursor}`；`last_result ∈ {ok, partial, failed, skipped, interrupted, postponed}`。

### 3. 健康分数更新器（算分器，非探测器）

每 15s 调用 `observability.provider_health_scores()` 计算 0-100 分，喂给 router 的 `auto` 模式：

- 成功率 0-50 / 延迟 0-20 / key 可用性 0-20 / 可用性状态 0-10（无数据按健康计）。
- 影响 auto 路由（`router._auto_adjusted_priority`）：≥75 不罚，50-74 罚 -5，25-49 罚 -10，<25 罚 -20。

## 探测公共机制

### 探测载荷与首字节预算（自适应）

- 载荷：`content="Hi"` + `max_tokens=16`（`health_monitor.probe_max_tokens` 可覆盖）+ `stream=true`，并应用与真实请求相同的 provider 特殊变换（reasoning content / anthropic thinking）。
- **首字节预算自适应**（`_probe_first_event_budget` → `_adaptive_first_event_budget`）：以该 provider+model 的 plain 档实测首事件 p95×1.5 动态放宽（≥20 样本，下限 20s、上限 45s），无样本时回退 `health_monitor.patrol_first_byte_timeout_s`（默认 15s）。思考型模型排队 30s+ 不会再被固定超时误判。
- 探测本身 payload 很小；真实请求的长上下文首字节延迟（可达 60s+）由真实请求自身的自适应预算（25-90s）处理，与探测预算相互独立。

### 失败上报：防毒化设计

- **"流已打开但无首事件"（`first_event_timeout`）**：上报为 `probe_first_event_timeout` → **平坦 120s 兼容性熔断**（`scheduler_policy.PROBE_FIRST_EVENT_CIRCUIT_S`，可经 `retry.failure_policies.probe_first_event_timeout` 覆盖），**不爬** `provider_compat` 的 10/60/3600s 阶梯。理由：探测证据是连续的（每轮重测），短冷却 + 成功即清零已足够；升级阶梯只会把首字节慢的健康模型挡在路由外。下一次探测成功时 `report_success` 会清除该熔断。
- **ProbeCoordinator（`probe_coordinator.py`）**：
  - `run_auto`：串行化自动探测（同一时刻只跑一个）；执行前记录真实请求代数，若期间有真实请求到来则放弃；`probe_recent_success_s`（默认 600s）内该 provider+model 有真实成功则跳过。
  - `should_apply_failure`：同一 scope（provider+key+model+format）**连续窗口内 2 次失败**才上报 router；失败计数带 **600s 时间衰减**（`failure_decay_s`，陈旧证据不再武装处罚）；`key_invalid`/`quota_or_balance` 一次即上报。
- **HTTP 错误**走 `_probe_error_type` 分类（401/403→key_invalid、429→rate_limited、402→quota_or_balance、5xx→server_error、4xx→client_error），按 `scheduler_policy.failure_policy_for_error_type` 冷却；模型级 404 只记录不惩罚 key。

### 探测压力可见性与记录保留

- **探测事件持久化**：`record_health_probe` 除写入内存 deque（默认 200 条，全 provider 共享，重启即失）外，同步落库 SQLite `probe_events` 表（`history_store.py`，与请求历史同库、同 `retention_days` 剪枝；history 关闭时自动回退纯内存）。理由：巡检间隔 6-12h，200 条全局环形队列在高探测压力下数小时即翻转，旧记录几乎必然在下轮巡检前消失——"被检测过但没有记录"即由此而来。
- `observability` 聚合每 provider 的探测摘要（控制台 provider 卡片探测摘要 chip 消费）：`probeCount24h`（24h 探测总数，SQLite 为准）+ `probeCount24hPatrol/probeCount24hReadiness`（分层计数）+ `lastProbePatrol/lastProbeReadiness`（各检测来源最近一次事件）。provider 卡片因此按来源拆成两个徽标（预检 / 巡检），各带自己的 24h 次数。
- provider 抽屉的活动面板探测记录（`probeEvents`）合并 SQLite 历史行，不再受 deque 翻转影响。
- 巡检轮次结果 `X/Y keys healthy` 同时是本轮探测请求数。

## 数据流

```
两个探测 daemon 线程 + 健康分数线程
   │  通过 _request_runtime() 获取 RuntimeContext 快照
   ▼
RuntimeContext（router / observability / upstream_client / config）
   │  upstream_client 发起 streaming probe（自适应首字节预算）
   ▼
上游 Providers（读首个 SSE data 事件即关连接）
   │  ProbeCoordinator 门控（2 连击 + 时间衰减 + 真实请求让路）
   │  observability.record_health_probe() 记录事件
   ▼
observability（探测事件 deque + SQLite probe_events + 分层 probeCount24h + provider_health_scores）
   │  router.update_health_scores() 喂给 auto 路由
   │  Admin API 读取
   ▼
Dashboard（预检/巡检运行时卡 · 健康分数环 · 手动触发 · 配置表单 · 对照表 · 概览预检/巡检双徽标）
```

## Admin API 端点（`admin_routes.py`，`/-/admin/*`）

- `GET /-/admin/metrics` — 附带 `idle_state`（tier + 下次探测稳定倒计时）+ `patrol_state`（含 `cursor` 续扫游标，非空表示上一轮被请求打断、下一轮将从该 (provider, key) 继续）
- `GET /-/admin/health/scores` — provider 健康分数（0-100 + grade）
- `POST /-/admin/health/patrol/trigger` — 手动触发巡检
- `POST /-/admin/config/health-monitor` — 更新 health_monitor 配置（热生效）

## 前端关键位置

- 设置页 `panel health-monitor-panel`（`dashboard/index.html`）：配置表单 + 预检/巡检对照表 + 两张运行时状态卡；文案键 `cfg.*`（`dashboard_src/src/i18n.js`）。
- provider 抽屉 `provider-inspector-section`：`skip_idle_probe` / `skip_patrol_probe` 跳过开关（跳过预检 / 跳过巡检）。
- `renderHealthOverview` / `renderIdleStateBar` / `providerProbeSummary` / `providerProbeRow`（`dashboard_src/src/app.js`）：健康分数环、idle 状态条、探测摘要 chip（含 probes/24h）、探测事件列表。

## 配置项（`health_monitor`）

```json
{
  "idle_check_enabled": true,
  "idle_check_interval_recent_s": 30,
  "idle_check_interval_medium_s": 60,
  "idle_check_interval_long_s": 300,
  "idle_check_interval_deep_min_s": 10800,
  "idle_check_interval_deep_max_s": 21600,
  "patrol_check_enabled": true,
  "patrol_interval_min_s": 21600,
  "patrol_interval_max_s": 43200,
  "patrol_delay_s": 3,
  "patrol_delay_jitter_s": 2,
  "patrol_first_byte_timeout_s": 15,
  "probe_recent_success_s": 600,
  "probe_max_tokens": 16
}
```

> `patrol_first_byte_timeout_s` 现在是自适应首字节预算的**兜底值**（无实测样本时使用）。

## 关键代码索引

| 机制 | 位置（函数名，行号会漂移，以 grep 为准） |
|---|---|
| 健康分数后台更新 | `sse2json.py` `_update_health_scores` / `_start_health_score_updater` |
| 预检检查器 | `sse2json.py` `_idle_tier_info` / `_build_probe_plan` / `_idle_probe_one_provider_impl` / `_idle_health_check_round` / `_start_idle_health_checker` |
| 巡检检查器 | `sse2json.py` `_patrol_probe_one_key_impl` / `_collect_patrol_models` / `_patrol_health_check_round` / `_start_patrol_health_checker` / `_trigger_patrol_now` / `_patrol_schedule_snapshot` |
| 探测协调 + 失败衰减 | `probe_coordinator.py` |
| 平坦超时熔断 | `scheduler_policy.py` `PROBE_FIRST_EVENT_CIRCUIT_S` / `router.py report_failure` 兼容性分支 |
| 自适应探测预算 | `sse2json.py` `_probe_first_event_budget`（复用 `_adaptive_first_event_budget`） |
| 健康分数计算 | `observability.py` `provider_health_scores` |
| 探测事件记录/聚合 | `observability.py` `record_health_probe` / `_merge_health_probe_summary`（probeCount24h） |
| auto 路由优先级调整 | `router.py` `_auto_adjusted_priority` |
| Admin 端点 | `admin_routes.py`（metrics 的 idle_state/patrol_state、health/scores、health/patrol/trigger、config/health-monitor） |
| 相关测试 | `tests/test_health_check_optimizations.py`、`tests/test_probe_coordinator.py`、`tests/test_admin_api.py`（Idle/Patrol 测试类） |
