# 健康检测机制 Overview

> 生成于 2026-07-06。梳理 LiteLLM Proxy 用于"保活"的三层健康机制。

## 项目定位

LiteLLM Proxy（入口 `sse2json.py`，默认端口 4894）是位于 LLM 客户端与多个上游 Provider 之间的格式感知代理。核心职责：OpenAI Chat Completions / Responses / Anthropic Messages 三种 API 格式互转 + 多 Provider/多 key 路由、熔断、重试。

"保活"目标：在空闲期主动探测上游 key 是否仍可用，让空闲期过后的第一个真实请求能一次命中健康 provider，同时给 `auto` 路由模式提供健康分数。

## 三层健康机制（全部为 daemon 线程，定义于 `sse2json.py`）

### 1. Idle Health Checker（空闲自适应检查器）— L311~1015

- **目标**：空闲时主动探测，让空闲期后的第一个请求一次命中。
- **自适应节奏**（`_idle_tier_info`，按"距上次请求完成时间"分档）：
  - `cold_start` 45s / `recent` 30s(<2min) / `medium` 60s(2-10min) / `long` 5min(10-30min) / `deep` 3-6h 随机(30min+)
- **关键设计**：
  - 优先级有序 + 遇健康即停（`_idle_probe_one_provider` 试该 provider 所有 key，任一健康即 break）
  - 分块睡眠（≤30s chunk）：deep idle 期间有真实请求到来时 30s 内提前唤醒重算间隔
  - 复用 `router.report_failure()` 的 cooldown 阶梯，无新状态管理
  - 有 `requests_in_flight` 时跳过本轮
  - 仅 `priority_failover` / `auto` 模式运行
- **状态**：`_idle_probe_schedule = {interval_s, computed_at}`

### 2. Patrol Health Checker（全量巡检保活）— L1018~1650

- **目标**：补充 idle 在 deep idle 期间的盲区，全量扫描每个 provider × 每个 key。
- **关键设计**：
  - 固定长间隔 1-3h 随机（`_PATROL_INTERVAL_S`）
  - 全量扫描（不像 idle 遇到第一个健康就停）
  - 流式探测省 token：`stream=true, max_tokens=1`，读首字节即关（`_patrol_probe_one_key`）
  - 多候选模型（`_collect_patrol_models`），任一成功即健康
  - 探测间 3-5s 随机延迟，跨 provider 也延迟
  - 手动触发 `_trigger_patrol_now()`，带 `_PATROL_TRIGGER_LOCK` 防并发重叠
  - 每探测一把 key 前检查 in_flight，有真实请求则中断
  - 每 provider 可配 `skip_patrol_probe`（idle 对应 `skip_idle_probe`）
- **状态**：`_patrol_probe_schedule = {last_run_at, last_run_duration_s, last_result, last_summary, next_run_at, interval_s, running, manual_trigger}`

### 3. Health Score Updater（健康分数更新器）— L299~307

- 辅助层（算分器，非探测器）：每 15s 调用 `observability.provider_health_scores()` 算 0-100 分，喂给 router 的 `auto` 模式。
- **分数构成**（`observability.py` L655）：
  - 成功率 0-50 / 延迟 0-20 / key 可用性 0-20 / 可用性状态 0-10
- **影响 auto 路由**（`router._auto_adjusted_priority`）：≥75 不罚，50-74 罚 -5，25-49 罚 -10，<25 罚 -20

## 两套检查器对比

| 维度 | Idle Health Checker | Patrol Health Checker |
|---|---|---|
| 定位 | 空闲期前置准备 | 周期性全量体检 |
| 节奏 | 自适应 30s~6h | 固定 1-3h 随机 |
| 扫描范围 | 按优先级探到第一个健康即停 | 所有 provider × 所有 key |
| 触发 | 仅自动 | 自动 + 手动 |
| 适用模式 | priority_failover / auto | 全部 |
| 事件标记 | idle_tier = cold_start/recent/medium/long/deep | idle_tier = patrol |
| 并发保护 | 线程内串行 | `_PATROL_TRIGGER_LOCK` |

**共同点**：streaming probe + 读首字节即关；复用 `router.report_failure/success` 的 cooldown；都通过 `observability.record_health_probe()` 记录；都用 `RuntimeContext` 快照保证一致性；有真实请求时都让路。

## 数据流

```
三个 daemon 线程
   │  通过 _request_runtime() 获取 RuntimeContext 快照
   ▼
RuntimeContext（router / observability / upstream_client / config）
   │  upstream_client 发起 streaming probe
   ▼
上游 Providers（读首个 SSE data 事件即关连接）
   │  observability.record_health_probe() 记录事件
   ▼
observability（探测事件 deque + provider_health_scores 计算）
   │  router.update_health_scores() 喂给 auto 路由
   │  Admin API 读取
   ▼
Dashboard（idle/patrol 状态 · 健康分数环 · 手动触发 · 配置表单）
```

## Admin API 端点（`admin_routes.py`，`/-/admin/*`）

- `GET /-/admin/metrics` — 附带 `idle_state`（tier + 下次探测倒计时）+ `patrol_state`
- `GET /-/admin/health/scores` — provider 健康分数（0-100 + grade）
- `POST /-/admin/health/patrol/trigger` — 手动触发巡检
- `POST /-/admin/config/health-monitor` — 更新 health_monitor 配置（热生效）

## 前端关键函数（`dashboard_src/src/app.js`）

- `loadHealthMonitorForm()` / `collectHealthMonitorPatch()` — 配置表单读写
- `updateHealthMonitorRuntime()` — 实时运行时状态显示
- `renderHealthOverview()` — 健康分数环 + 等级 + 进度条
- `hmPatrolRunBtn` click → `POST /-/admin/health/patrol/trigger`

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
  "patrol_interval_min_s": 3600,
  "patrol_interval_max_s": 10800,
  "patrol_delay_s": 3,
  "patrol_delay_jitter_s": 2,
  "patrol_first_byte_timeout_s": 15
}
```

## 关键代码索引

| 机制 | 位置 |
|---|---|
| 健康分数后台更新 | `sse2json.py` L270~307 |
| Idle 检查器 | `sse2json.py` L311~1015 |
| Patrol 检查器 | `sse2json.py` L1018~1650 |
| 健康分数计算 | `observability.py` L655~772 |
| 探测事件记录 | `observability.py` L530~580 |
| auto 路由优先级调整 | `router.py` L706~726 |
| Admin 端点 | `admin_routes.py` L193~227, L258~265, L648~665 |
| 前端 UI | `dashboard_src/src/app.js` L6665~6879, L2259~2310 |
