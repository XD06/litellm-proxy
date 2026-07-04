/**
 * Lightweight i18n module for LiteLLM Proxy Console.
 *
 * Usage:
 *   import { t, getLang, setLang, applyI18n, onLangChange } from "./i18n.js";
 *
 *   t("nav.overview")                      → "Overview" / "概览"
 *   t("notice.provider_added", { name })   → "Provider X added." / "提供商 X 已添加。"
 *
 * For static HTML, add data-i18n="key" to elements; applyI18n() scans and fills them.
 * For attributes (placeholder, title, data-tip), use data-i18n-attr="placeholder:key".
 */

const STORAGE_KEY = "proxyConsoleLang";
const DEFAULT_LANG = "en";

let _lang = DEFAULT_LANG;
const _listeners = new Set();

/** Translation dictionaries. Keys are dot-notation, values are { en, zh }. */
const dict = {
  // ---- App / Brand ----
  "app.title": { en: "Proxy Console", zh: "代理控制台" },
  "app.subtitle": { en: "Runtime operations", zh: "运行时管理" },

  // ---- Auth ----
  "auth.checking": { en: "Checking console access.", zh: "正在检查控制台访问权限。" },
  "auth.enter_key": { en: "Enter the admin key to open runtime operations.", zh: "输入管理员密钥以打开运行时管理。" },
  "auth.admin_key": { en: "Admin key", zh: "管理员密钥" },
  "auth.admin_key_ph": { en: "admin key", zh: "管理员密钥" },
  "auth.enter": { en: "Enter console", zh: "进入控制台" },
  "auth.invalid": { en: "Invalid admin key.", zh: "管理员密钥无效。" },

  // ---- Nav ----
  "nav.overview": { en: "Overview", zh: "概览" },
  "nav.requests": { en: "Requests", zh: "请求" },
  "nav.providers": { en: "Providers", zh: "提供商" },
  "nav.policy": { en: "Routing Policy", zh: "路由策略" },
  "nav.config": { en: "Config", zh: "配置" },
  "nav.playground": { en: "Playground", zh: "测试场" },

  // ---- Sidebar actions ----
  "action.refresh": { en: "Refresh", zh: "刷新" },
  "action.pause": { en: "Pause", zh: "暂停" },
  "action.resume": { en: "Resume", zh: "继续" },
  "action.auto_refresh": { en: "Auto refresh", zh: "自动刷新" },
  "action.more_settings": { en: "More settings", zh: "更多设置" },

  // ---- Connection ----
  "conn.connected": { en: "Connected", zh: "已连接" },
  "conn.disconnected": { en: "Not connected", zh: "未连接" },
  "conn.paused": { en: "Paused", zh: "已暂停" },
  "conn.connection_error": { en: "Connection error", zh: "连接错误" },
  "conn.admin_required": { en: "Admin key required", zh: "需要管理员密钥" },
  "conn.reconnecting": { en: "Reconnecting…", zh: "重连中…" },

  // ---- View titles & subtitles ----
  "view.overview.title": { en: "Overview", zh: "概览" },
  "view.overview.subtitle": { en: "Live runtime health and request flow.", zh: "实时运行状态与请求流量。" },
  "view.requests.title": { en: "Requests", zh: "请求" },
  "view.requests.subtitle": { en: "request failure details.", zh: "请求失败详情。" },
  "view.providers.title": { en: "Providers", zh: "提供商" },
  "view.providers.subtitle": { en: "Runtime provider and key state.", zh: "运行时提供商与密钥状态。" },
  "view.policy.title": { en: "Routing Policy", zh: "路由策略" },
  "view.policy.subtitle": { en: "switching rules.", zh: "切换规则。" },
  "view.config.title": { en: "Config", zh: "配置" },
  "view.config.subtitle": { en: "configuration and safe edits", zh: "配置与安全编辑" },
  "view.playground.title": { en: "Playground", zh: "测试场" },
  "view.playground.subtitle": { en: "Test models with live routing feedback.", zh: "测试模型并获取实时路由反馈。" },

  // ---- Overview page ----
  "ov.health_metrics": { en: "Live health metrics and proxy request traffic flow.", zh: "实时健康指标与代理请求流量。" },
  "ov.time_range": { en: "Time range", zh: "时间范围" },
  "ov.last_30m": { en: "Last 30 minutes", zh: "近 30 分钟" },
  "ov.last_2h": { en: "Last 2 hours", zh: "近 2 小时" },
  "ov.last_24h": { en: "Last 24 hours", zh: "近 24 小时" },
  "ov.last_7d": { en: "Last 7 days", zh: "近 7 天" },
  "ov.selected_window": { en: "selected window", zh: "所选时段" },
  "ov.usage_trend": { en: "Usage Trend", zh: "使用趋势" },
  "ov.usage_trend_desc": { en: "Token flow, request volume, and failures in the selected window.", zh: "所选时段内的 Token 流量、请求量和失败情况。" },
  "ov.recent_failures": { en: "Recent Failure Trace", zh: "近期失败追踪" },
  "ov.recent_failures_desc": { en: "Latest failed or recovered requests.", zh: "最近的失败或恢复请求。" },
  "ov.top_model_usage": { en: "Top Model Usage", zh: "模型用量排行" },
  "ov.top_model_desc": { en: "Tokens and top models in the selected window.", zh: "所选时段内的 Token 与热门模型。" },
  "ov.token_usage": { en: "token usage", zh: "Token 用量" },
  "ov.upstream_health": { en: "Upstream Health status", zh: "上游健康状态" },
  "ov.upstream_health_desc": { en: "Providers that need attention.", zh: "需要关注的提供商。" },
  "ov.no_providers": { en: "No providers", zh: "暂无提供商" },
  "ov.total_in_window": { en: "total in the selected window", zh: "所选时段内总计" },

  // ---- Overview metrics ----
  "metric.requests": { en: "Requests", zh: "请求" },
  "metric.success_rate": { en: "Success Rate", zh: "成功率" },
  "metric.attempt_failures": { en: "Attempt Failures", zh: "尝试失败" },
  "metric.providers": { en: "Providers", zh: "提供商" },
  "metric.tokens": { en: "Tokens", zh: "Token" },
  "metric.cost": { en: "Est. Cost", zh: "预估费用" },
  "metric.in_flight": { en: "in flight", zh: "进行中" },
  "metric.success": { en: "success", zh: "成功" },
  "metric.failed_attempts": { en: "failed attempts", zh: "次失败" },
  "metric.available": { en: "available", zh: "可用" },
  "metric.input_output": { en: "0 input / 0 output", zh: "0 输入 / 0 输出" },
  "metric.configured_pricing": { en: "configured pricing only", zh: "仅按已配置价格" },

  // ---- Overview KPIs ----
  "kpi.success_rate": { en: "Success rate", zh: "成功率" },
  "kpi.first_byte": { en: "First byte", zh: "首字节延迟" },
  "kpi.active_keys": { en: "Active keys", zh: "可用密钥" },
  "kpi.input": { en: "Input", zh: "输入" },
  "kpi.output": { en: "Output", zh: "输出" },
  "kpi.failures": { en: "Failures", zh: "失败" },
  "kpi.success": { en: "Success", zh: "成功" },
  "kpi.no_samples": { en: "no samples", zh: "无样本" },
  "kpi.estimated": { en: "estimated", zh: "预估" },
  "kpi.tokens": { en: "tokens", zh: "Token" },

  // ---- Requests view ----
  "req.all": { en: "All", zh: "全部" },
  "req.success": { en: "Success", zh: "成功" },
  "req.failed": { en: "Failed", zh: "失败" },
  "req.model": { en: "Model", zh: "模型" },
  "req.model_ph": { en: "model", zh: "模型" },
  "req.provider": { en: "Provider", zh: "提供商" },
  "req.provider_ph": { en: "provider", zh: "提供商" },
  "req.more": { en: "More", zh: "更多" },
  "req.error_type_ph": { en: "error type", zh: "错误类型" },
  "req.reason_ph": { en: "failure reason", zh: "失败原因" },
  "req.status_ph": { en: "attempt status", zh: "尝试状态" },
  "req.apply": { en: "Apply", zh: "应用" },
  "req.clear": { en: "Clear", zh: "清除" },
  "req.selected_count": { en: "0 selected", zh: "已选 0 条" },
  "req.delete_title": { en: "Delete requests", zh: "删除请求" },
  "req.recent": { en: "Recent request records.", zh: "最近请求记录。" },
  "req.detail_title": { en: "Request Detail", zh: "请求详情" },
  "req.detail_subtitle": { en: "Click a request to view its trace and payload.", zh: "点击请求查看其追踪和负载。" },
  "req.select": { en: "Select request", zh: "选择请求" },
  "req.no_records": { en: "No request records", zh: "暂无请求记录" },

  // ---- Providers view ----
  "prov.title": { en: "Providers", zh: "提供商" },
  "prov.desc": { en: "Runtime health, model coverage, key state, and routing readiness.", zh: "运行状态、模型覆盖、密钥状态与路由就绪情况。" },
  "prov.add": { en: "Add Provider", zh: "添加提供商" },
  "prov.search": { en: "Search", zh: "搜索" },
  "prov.search_ph": { en: "provider, model, base url", zh: "提供商、模型、基础 URL" },
  "prov.format": { en: "Format", zh: "格式" },
  "prov.all_formats": { en: "All formats", zh: "所有格式" },
  "prov.status": { en: "Status", zh: "状态" },
  "prov.all_status": { en: "All status", zh: "所有状态" },
  "prov.normal": { en: "Normal", zh: "正常" },
  "prov.degraded": { en: "Degraded", zh: "降级" },
  "prov.cooldown": { en: "Cooldown", zh: "冷却中" },
  "prov.unavailable": { en: "Unavailable", zh: "不可用" },
  "prov.disabled": { en: "Disabled", zh: "已禁用" },
  "prov.keys": { en: "Keys", zh: "密钥" },
  "prov.all_keys": { en: "All keys", zh: "所有密钥" },
  "prov.has_usable": { en: "Has usable key", zh: "有可用密钥" },
  "prov.partial_usable": { en: "Partial usable", zh: "部分可用" },
  "prov.no_usable": { en: "No usable keys", zh: "无可用密钥" },
  "prov.key_cooldown": { en: "Key cooldown", zh: "密钥冷却" },
  "prov.no_config": { en: "No provider config loaded", zh: "未加载提供商配置" },
  "prov.no_capabilities": { en: "No model capabilities loaded", zh: "未加载模型能力" },
  "prov.no_providers_configured": { en: "No providers configured", zh: "未配置提供商" },
  "prov.drawer_title": { en: "Provider", zh: "提供商" },
  "prov.drawer_subtitle": { en: "Select a provider to view its models and state.", zh: "选择一个提供商查看其模型和状态。" },
  "prov.clear_cooldown": { en: "Clear cooldown", zh: "清除冷却" },
  "prov.disable": { en: "Disable", zh: "禁用" },
  "prov.enable": { en: "Enable", zh: "启用" },
  "prov.disable_key": { en: "Disable key", zh: "禁用密钥" },
  "prov.enable_key": { en: "Enable key", zh: "启用密钥" },
  "prov.clear_key_state": { en: "Clear key state", zh: "清除密钥状态" },

  // ---- Provider mini metrics ----
  "pm.keys": { en: "Keys", zh: "密钥" },
  "pm.usable": { en: "usable", zh: "可用" },
  "pm.priority": { en: "Priority", zh: "优先级" },
  "pm.higher_first": { en: "higher first", zh: "越小越优先" },
  "pm.success": { en: "Success", zh: "成功率" },
  "pm.recent": { en: "recent", zh: "近期" },
  "pm.avg_first_byte": { en: "Avg first byte", zh: "平均首字节" },
  "pm.successful_calls": { en: "successful calls", zh: "成功调用" },
  "pm.last_first_byte": { en: "Last first byte", zh: "最近首字节" },
  "pm.latest_success": { en: "latest success", zh: "最近成功" },
  "pm.runtime_on": { en: "Runtime on", zh: "运行中" },
  "pm.cooldown_m": { en: "Cooldown", zh: "冷却" },
  "pm.fails": { en: "Fails", zh: "失败" },
  "pm.runtime": { en: "runtime", zh: "运行时" },
  "pm.capability": { en: "Capability", zh: "能力" },
  "pm.models": { en: "Models", zh: "模型" },
  "pm.disabled_m": { en: "Disabled", zh: "已禁用" },
  "pm.fetched": { en: "Fetched", zh: "获取时间" },
  "pm.routes": { en: "Routes", zh: "路由" },
  "pm.provider": { en: "provider", zh: "提供商" },
  "pm.default_pool": { en: "Default pool", zh: "默认池" },
  "pm.route_models": { en: "Route models", zh: "路由模型" },
  "pm.explicit": { en: "explicit", zh: "显式" },
  "pm.provider_select": { en: "Provider select", zh: "提供商选择" },
  "pm.default": { en: "default", zh: "默认" },
  "pm.max_attempts": { en: "Max attempts", zh: "最大尝试" },
  "pm.request": { en: "request", zh: "请求" },
  "pm.models_source": { en: "Models source", zh: "模型来源" },
  "pm.config": { en: "config", zh: "配置" },
  "pm.union_models": { en: "Union models", zh: "合并模型" },
  "pm.canonical_ids": { en: "canonical ids", zh: "标准 ID" },
  "pm.configured": { en: "configured", zh: "已配置" },
  "pm.mapped": { en: "Mapped", zh: "已映射" },
  "pm.available": { en: "available", zh: "可用" },
  "pm.snapshot": { en: "snapshot", zh: "快照" },
  "pm.yes": { en: "yes", zh: "是" },
  "pm.no": { en: "no", zh: "否" },
  "pm.on": { en: "on", zh: "开" },
  "pm.off": { en: "off", zh: "关" },
  "pm.refreshing": { en: "refreshing", zh: "刷新中" },
  "pm.not_fetched": { en: "not fetched", zh: "未获取" },

  // ---- Policy view ----
  "policy.routing_controls": { en: "Routing Controls", zh: "路由控制" },
  "policy.routing_tip": { en: "Safe runtime-overlay edits for common scheduling and retry settings.", zh: "安全地通过运行时覆盖编辑常用调度和重试设置。" },
  "policy.rule_table": { en: "Rule Table", zh: "规则表" },
  "policy.rule_tip": { en: "How requests move across attempts.", zh: "请求在多次尝试间的流转方式。" },
  "policy.failure_policies": { en: "Failure Policies", zh: "失败策略" },
  "policy.failure_tip": { en: "Cooldown and disable behavior by error type.", zh: "按错误类型设置冷却和禁用行为。" },
  "policy.routing": { en: "Routing", zh: "路由" },
  "policy.routing_tip2": { en: "Attempt budget, provider order, and format preference.", zh: "尝试预算、提供商顺序和格式偏好。" },
  "policy.provider_pool": { en: "Provider pool", zh: "提供商池" },
  "policy.provider_pool_tip": { en: "Comma-separated provider names used as the default routing pool.", zh: "逗号分隔的提供商名称，用作默认路由池。" },
  "policy.selection_mode": { en: "Selection mode", zh: "选择模式" },
  "policy.selection_tip": { en: "How providers are picked from the pool for each request.", zh: "每次请求如何从池中选择提供商。" },
  "policy.max_attempts": { en: "Max attempts", zh: "最大尝试次数" },
  "policy.max_attempts_tip": { en: "Maximum number of provider attempts per request before giving up.", zh: "每个请求放弃前的最大提供商尝试次数。" },
  "policy.connect": { en: "Connect", zh: "连接" },
  "policy.connect_tip": { en: "connect_timeout_s — Seconds to wait for the upstream TCP connection.", zh: "connect_timeout_s — 等待上游 TCP 连接的秒数。" },
  "policy.read": { en: "Read", zh: "读取" },
  "policy.read_tip": { en: "read_timeout_s — Seconds to wait for the full upstream response.", zh: "read_timeout_s — 等待完整上游响应的秒数。" },
  "policy.first_token": { en: "First token", zh: "首 Token" },
  "policy.first_token_tip": { en: "first_token_timeout_s — Seconds to wait for the first SSE token (0 = disabled).", zh: "first_token_timeout_s — 等待首个 SSE Token 的秒数（0 = 禁用）。" },
  "policy.retry": { en: "Retry", zh: "重试" },
  "policy.retry_tip": { en: "HTTP retry classes and key handling on failure.", zh: "HTTP 重试类别和失败时的密钥处理。" },
  "policy.retryable_statuses": { en: "Retryable statuses", zh: "可重试状态码" },
  "policy.retryable_tip": { en: "HTTP status codes that trigger a retry (e.g. 429, 500, 502, 503, 504).", zh: "触发重试的 HTTP 状态码（如 429、500、502、503、504）。" },
  "policy.fatal_key_statuses": { en: "Fatal key statuses", zh: "致命密钥状态码" },
  "policy.fatal_tip": { en: "HTTP status codes that mark a key as permanently bad (e.g. 401, 403).", zh: "将密钥标记为永久失效的 HTTP 状态码（如 401、403）。" },
  "policy.respect_retry_after": { en: "Respect Retry-After", zh: "尊重 Retry-After" },
  "policy.respect_tip": { en: "Honor the upstream Retry-After header to extend cooldown duration.", zh: "遵从上游 Retry-After 头以延长冷却时长。" },
  "policy.same_key_retries": { en: "Same-key retries", zh: "同密钥重试" },
  "policy.same_key_tip": { en: "same_key_retries — How many times to retry the same key before switching (0-3).", zh: "same_key_retries — 切换前重试同一密钥的次数（0-3）。" },
  "policy.failure_ladder": { en: "Failure ladder", zh: "失败阶梯" },
  "policy.ladder_tip": { en: "key_failure_ladder_s — Escalating cooldown seconds per consecutive key failure (e.g. 10, 60, 3600).", zh: "key_failure_ladder_s — 每次连续密钥失败的递增冷却秒数（如 10, 60, 3600）。" },
  "policy.key_cooldown": { en: "Key cooldown", zh: "密钥冷却" },
  "policy.key_cooldown_tip": { en: "Cooldown duration (seconds) applied to the key on this error type.", zh: "此错误类型下密钥的冷却时长（秒）。" },
  "policy.provider_cooldown": { en: "Provider cooldown", zh: "提供商冷却" },
  "policy.provider_cooldown_tip": { en: "Cooldown duration (seconds) applied to the provider on this error type.", zh: "此错误类型下提供商的冷却时长（秒）。" },
  "policy.save_routing": { en: "Save routing", zh: "保存路由" },
  "policy.save_retry": { en: "Save retry", zh: "保存重试" },
  "policy.save_policy": { en: "Save policy", zh: "保存策略" },
  "policy.timeouts": { en: "Timeouts", zh: "超时设置" },
  "policy.advanced_cooldown": { en: "Advanced cooldown & ladder", zh: "高级冷却与阶梯" },
  "policy.disable_key": { en: "Disable key", zh: "禁用密钥" },

  // ---- Route modes (icon button group) ----
  "policy.mode_priority": { en: "Priority", zh: "优先级" },
  "policy.mode_priority_tip": { en: "priority_failover — Try providers in priority order, failover to next on error", zh: "priority_failover — 按优先级顺序尝试提供商，出错时故障转移到下一个" },
  "policy.mode_round_robin": { en: "Round-robin", zh: "轮询" },
  "policy.mode_round_robin_tip": { en: "round_robin — Cycle through providers evenly across requests", zh: "round_robin — 在请求间均匀轮换提供商" },
  "policy.mode_weighted": { en: "Weighted", zh: "加权" },
  "policy.mode_weighted_tip": { en: "weighted_rr — Distribute by weight (e.g. provider:2 gets 2x traffic of provider:1)", zh: "weighted_rr — 按权重分配（如 provider:2 获得 provider:1 的 2 倍流量）" },
  "policy.mode_random": { en: "Random", zh: "随机" },
  "policy.mode_random_tip": { en: "random — Pick a provider at random from the pool", zh: "random — 从池中随机选择一个提供商" },
  "policy.mode_auto": { en: "Smart", zh: "智能" },
  "policy.mode_auto_tip": { en: "auto — Priority-based routing with real-time health-score adjustment. Degraded providers are automatically deprioritized.", zh: "auto — 基于优先级的路由，结合实时健康度自动调整。降级的提供商会被自动降低优先级。" },

  // ---- Cooldown fields ----
  "policy.cooldown_rate_limit": { en: "Rate limit", zh: "速率限制" },
  "policy.cooldown_rate_limit_tip": { en: "Rate limit cooldown (seconds)", zh: "速率限制冷却时长（秒）" },
  "policy.cooldown_server_error": { en: "Server error", zh: "服务器错误" },
  "policy.cooldown_server_error_tip": { en: "Server error cooldown (seconds)", zh: "服务器错误冷却时长（秒）" },
  "policy.cooldown_network_error": { en: "Network error", zh: "网络错误" },
  "policy.cooldown_network_error_tip": { en: "Network/timeout cooldown (seconds)", zh: "网络/超时冷却时长（秒）" },
  "policy.cooldown_key_invalid": { en: "Invalid key", zh: "密钥无效" },
  "policy.cooldown_key_invalid_tip": { en: "Invalid key cooldown (seconds)", zh: "密钥无效冷却时长（秒）" },
  "policy.cooldown_quota_or_balance": { en: "Quota/balance", zh: "配额/余额" },
  "policy.cooldown_quota_or_balance_tip": { en: "Quota or balance exhausted cooldown (seconds)", zh: "配额或余额耗尽冷却时长（秒）" },

  // ---- Config view ----
  "cfg.providers": { en: "Providers", zh: "提供商" },
  "cfg.providers_tip": { en: "Edit existing provider config. To add a new provider, use the Add Provider button on the Providers page.", zh: "编辑现有提供商配置。要添加新提供商，请使用提供商页面的「添加提供商」按钮。" },
  "cfg.audit_trail": { en: "Audit Trail", zh: "审计日志" },
  "cfg.audit_tip": { en: "Recent admin mutations with masked details.", zh: "最近的管理操作（详情已脱敏）。" },
  "cfg.no_audit": { en: "No audit events recorded", zh: "暂无审计记录" },
  "cfg.tab_routes": { en: "Routes", zh: "路由" },
  "cfg.tab_map": { en: "Map", zh: "映射" },
  "cfg.tab_runtime": { en: "Runtime", zh: "运行时" },
  "cfg.tab_proxy": { en: "Proxy", zh: "代理" },
  "cfg.tab_advanced": { en: "Advanced", zh: "高级" },
  "cfg.model_routes": { en: "Model Routes", zh: "模型路由" },
  "cfg.model_routes_tip": { en: "Map one client model to a weighted provider pool.", zh: "将一个客户端模型映射到加权提供商池。" },
  "cfg.add_edit_route": { en: "Add or edit route", zh: "添加或编辑路由" },
  "cfg.client_model": { en: "Client model", zh: "客户端模型" },
  "cfg.provider_order": { en: "Provider order", zh: "提供商顺序" },
  "cfg.provider_order_help": { en: "provider:weight:priority, comma separated. Priority is optional and overrides provider config.", zh: "provider:weight:priority，逗号分隔。priority 为可选，会覆盖提供商配置。" },
  "cfg.selection": { en: "Selection", zh: "选择" },
  "cfg.save_route": { en: "Save route", zh: "保存路由" },
  "cfg.no_routes": { en: "No model routes configured", zh: "未配置模型路由" },
  "cfg.provider_model_map": { en: "Provider Model Map", zh: "提供商模型映射" },
  "cfg.pmm_tip": { en: "Provider-specific model name overrides.", zh: "提供商特定的模型名称覆盖。" },
  "cfg.no_pmm": { en: "No provider model overrides configured", zh: "未配置提供商模型覆盖" },
  "cfg.runtime_config": { en: "Runtime Config", zh: "运行时配置" },
  "cfg.runtime_tip": { en: "Masked status for the active configuration.", zh: "当前活动配置的脱敏状态。" },
  "cfg.reload": { en: "Reload", zh: "重新加载" },
  "cfg.no_config": { en: "No config loaded", zh: "未加载配置" },
  "cfg.global_proxy": { en: "Global Proxy", zh: "全局代理" },
  "cfg.global_proxy_tip": { en: "Lowest-priority fallback for providers without their own proxy.", zh: "没有独立代理的提供商的最低优先级回退。" },
  "cfg.proxy_url": { en: "Proxy URL", zh: "代理 URL" },
  "cfg.proxy_url_tip": { en: "Blank means direct unless a provider or key proxy is set.", zh: "留空表示直连，除非设置了提供商或密钥代理。" },
  "cfg.save_global_proxy": { en: "Save global proxy", zh: "保存全局代理" },
  "cfg.advanced_tools": { en: "Advanced overlay tools", zh: "高级覆盖工具" },
  "cfg.advanced_desc": { en: "Validate, export masked JSON, or clear runtime_config.", zh: "验证、导出脱敏 JSON 或清除 runtime_config。" },
  "cfg.validate": { en: "Validate", zh: "验证" },
  "cfg.export_masked": { en: "Export masked", zh: "导出脱敏" },
  "cfg.clear_overlay": { en: "Clear overlay", zh: "清除覆盖" },
  "cfg.no_overlay": { en: "No overlay status loaded", zh: "未加载覆盖状态" },
  "cfg.show_preview": { en: "Show overlay preview", zh: "显示覆盖预览" },
  "cfg.raw_snapshot": { en: "Raw Snapshot", zh: "原始快照" },
  "cfg.raw_tip": { en: "Masked JSON for debugging.", zh: "用于调试的脱敏 JSON。" },
  "cfg.show_json": { en: "Show masked JSON", zh: "显示脱敏 JSON" },

  // ---- Add provider form ----
  "form.add_provider_title": { en: "Add Provider", zh: "添加提供商" },
  "form.add_provider_sub": { en: "Create a provider with the required connection fields.", zh: "创建一个包含必填连接字段的提供商。" },
  "form.base_url": { en: "Base URL", zh: "基础 URL" },
  "form.base_url_tip": { en: "The upstream API endpoint for this provider.", zh: "此提供商的上游 API 端点。" },
  "form.proxy": { en: "Proxy", zh: "代理" },
  "form.proxy_tip": { en: "Per-provider proxy URL. Leave blank to use the global proxy or direct connection.", zh: "每提供商代理 URL。留空则使用全局代理或直连。" },
  "form.user_agent": { en: "User-Agent", zh: "User-Agent" },
  "form.ua_tip": { en: "Custom User-Agent header for upstream requests. Blank = inherit default.", zh: "上游请求的自定义 User-Agent 头。留空 = 继承默认值。" },
  "form.priority": { en: "Priority", zh: "优先级" },
  "form.priority_tip": { en: "Lower number = higher priority in failover order (e.g. -10 before 0 before 10).", zh: "数字越小 = 故障转移顺序中优先级越高（如 -10 先于 0 先于 10）。" },
  "form.enabled": { en: "Enabled", zh: "启用" },
  "form.enabled_tip": { en: "Toggle whether this provider participates in routing.", zh: "切换此提供商是否参与路由。" },
  "form.save": { en: "Save", zh: "保存" },
  "form.cancel": { en: "Cancel", zh: "取消" },
  "form.save_provider": { en: "Save provider", zh: "保存提供商" },

  // ---- Confirm dialog ----
  "confirm.title_default": { en: "Confirm action", zh: "确认操作" },
  "confirm.delete": { en: "Delete", zh: "删除" },
  "confirm.clear": { en: "Clear", zh: "清除" },
  "confirm.message_default": { en: "This action needs confirmation.", zh: "此操作需要确认。" },
  "confirm.close": { en: "Close", zh: "关闭" },

  // ---- Delete confirmations ----
  "confirm.delete_key.title": { en: "Delete key", zh: "删除密钥" },
  "confirm.delete_key.msg": { en: "Delete {label} from {provider}?", zh: "从 {provider} 删除 {label}？" },
  "confirm.delete_key.last": { en: " This is the last key; the provider will become unavailable until another key is added.", zh: " 这是最后一个密钥；在添加新密钥之前，该提供商将不可用。" },
  "confirm.delete_provider.title": { en: "Delete Provider", zh: "删除提供商" },
  "confirm.delete_provider.msg": { en: "Delete {provider}? It will be removed from provider config, route pools, model maps, and capability snapshots.", zh: "删除 {provider}？它将从提供商配置、路由池、模型映射和能力快照中移除。" },
  "confirm.clear_overlay.title": { en: "Clear runtime overlay", zh: "清除运行时覆盖" },
  "confirm.clear_overlay.msg": { en: "Clear runtime_config overlay and restart runtime objects from base config?", zh: "清除 runtime_config 覆盖并从基础配置重启运行时对象？" },
  "confirm.delete_route.title": { en: "Delete model route", zh: "删除模型路由" },
  "confirm.delete_route.msg": { en: "Delete model route for {model}?", zh: "删除模型 {model} 的路由？" },
  "confirm.delete_selected.title": { en: "Delete selected requests", zh: "删除所选请求" },
  "confirm.delete_matching.title": { en: "Delete matching requests", zh: "删除匹配的请求" },
  "confirm.clear_history.title": { en: "Clear request history", zh: "清除请求历史" },
  "confirm.delete_selected.msg": { en: "Delete {count} selected request record{plural}? Runtime counters are not reset.", zh: "删除 {count} 条已选请求记录？运行时计数器不会重置。" },
  "confirm.delete_matching.msg": { en: "Delete all {count} request record{plural} matching the current filters? Runtime counters are not reset.", zh: "删除所有 {count} 条匹配当前筛选条件的请求记录？运行时计数器不会重置。" },
  "confirm.clear_history.msg": { en: "Clear all request history, runtime metrics, and diagnostic log records?", zh: "清除所有请求历史、运行时指标和诊断日志记录？" },

  // ---- Notices (toast messages) ----
  "notice.provider_added": { en: "Provider {name} added.", zh: "提供商 {name} 已添加。" },
  "notice.add_provider_failed": { en: "Add provider failed: {error}", zh: "添加提供商失败：{error}" },
  "notice.refresh_failed": { en: "Console refresh failed: {error}", zh: "控制台刷新失败：{error}" },
  "notice.config_refresh_failed": { en: "Provider config refresh failed: {error}", zh: "提供商配置刷新失败：{error}" },
  "notice.static_models_saved": { en: "Static models for {provider} saved.", zh: "{provider} 的静态模型已保存。" },
  "notice.static_models_cleared": { en: "Static models for {provider} cleared.", zh: "{provider} 的静态模型已清除。" },
  "notice.static_model_removed": { en: "Static model {model} removed from {provider}.", zh: "静态模型 {model} 已从 {provider} 移除。" },
  "notice.failed": { en: "Failed: {error}", zh: "失败：{error}" },
  "notice.saving": { en: "Saving...", zh: "正在保存..." },
  "notice.saved": { en: "Saved.", zh: "已保存。" },
  "notice.action_running": { en: "Running action...", zh: "正在执行操作..." },
  "notice.action_done": { en: "Action completed.", zh: "操作已完成。" },
  "notice.action_failed": { en: "Action failed: {error}", zh: "操作失败：{error}" },
  "notice.key_deleted": { en: "Key {index} deleted from {provider}.", zh: "密钥 {index} 已从 {provider} 删除。" },
  "notice.delete_key_failed": { en: "Delete key failed: {error}", zh: "删除密钥失败：{error}" },
  "notice.refresh_before_test": { en: "Refresh model capabilities before testing this key.", zh: "测试此密钥前请先刷新模型能力。" },
  "notice.testing_key": { en: "Testing key {index} of {provider} on {model}...", zh: "正在测试 {provider} 的密钥 {index}（模型 {model}）..." },
  "notice.key_works": { en: "Key {index} of {provider} works on {model} ({format}{upstream}, {latency}ms).", zh: "{provider} 的密钥 {index} 在 {model} 上可用（{format}{upstream}，{latency}ms）。" },
  "notice.key_failed": { en: "Key {index} of {provider} failed: {detail}.", zh: "{provider} 的密钥 {index} 失败：{detail}。" },
  "notice.test_key_failed": { en: "Test key failed: {error}", zh: "测试密钥失败：{error}" },
  "notice.models_refreshed": { en: "Models for {provider} refreshed.", zh: "{provider} 的模型已刷新。" },
  "notice.model_refresh_failed": { en: "Model refresh failed: {error}", zh: "模型刷新失败：{error}" },
  "notice.model_settings_saved": { en: "Model settings for {provider} saved.", zh: "{provider} 的模型设置已保存。" },
  "notice.model_setting_failed": { en: "Model setting failed: {error}", zh: "模型设置失败：{error}" },
  "notice.model_mapping_saved": { en: "Model mapping saved for {provider}.", zh: "{provider} 的模型映射已保存。" },
  "notice.model_mapping_reset": { en: "Model mapping reset for {provider}.", zh: "{provider} 的模型映射已重置。" },
  "notice.model_mapping_failed": { en: "Model mapping failed: {error}", zh: "模型映射失败：{error}" },
  "notice.model_mapping_required": { en: "Model mapping name is required.", zh: "模型映射名称为必填项。" },
  "notice.format_path_empty": { en: "Format path cannot be empty.", zh: "格式路径不能为空。" },
  "notice.format_updated": { en: "{provider} {format} path updated.", zh: "{provider} 的 {format} 路径已更新。" },
  "notice.routing_updated": { en: "Routing settings updated.", zh: "路由设置已更新。" },
  "notice.retry_updated": { en: "Retry settings updated.", zh: "重试设置已更新。" },
  "notice.failure_policy_updated": { en: "Failure policy {type} updated.", zh: "失败策略 {type} 已更新。" },
  "notice.policy_failed": { en: "Policy update failed: {error}", zh: "策略更新失败：{error}" },
  "notice.provider_deleted": { en: "Provider {provider} deleted.", zh: "提供商 {provider} 已删除。" },
  "notice.delete_provider_failed": { en: "Delete provider failed: {error}", zh: "删除提供商失败：{error}" },
  "notice.provider_updated": { en: "Provider {provider} updated.", zh: "提供商 {provider} 已更新。" },
  "notice.key_added": { en: "Key added to {provider}.", zh: "密钥已添加到 {provider}。" },
  "notice.key_proxy_updated": { en: "Key {index} proxy updated for {provider}.", zh: "{provider} 的密钥 {index} 代理已更新。" },
  "notice.format_toggled": { en: "{provider} {format} {state}.", zh: "{provider} 的 {format} 已{state}。" },
  "notice.enabled": { en: "enabled", zh: "启用" },
  "notice.disabled": { en: "disabled", zh: "禁用" },
  "notice.format_update_failed": { en: "Format update failed: {error}", zh: "格式更新失败：{error}" },
  "notice.config_update_failed": { en: "Config update failed: {error}", zh: "配置更新失败：{error}" },
  "notice.request_history_cleared": { en: "Request history cleared ({count} records).", zh: "请求历史已清除（{count} 条记录）。" },
  "notice.requests_deleted": { en: "Deleted {count} request record{plural}.", zh: "已删除 {count} 条请求记录。" },
  "notice.delete_requests_failed": { en: "Delete requests failed: {error}", zh: "删除请求失败：{error}" },
  "notice.config_reload_failed": { en: "Config reload failed: {error}", zh: "配置重新加载失败：{error}" },
  "notice.global_proxy_updated": { en: "Global proxy updated.", zh: "全局代理已更新。" },
  "notice.overlay_exported": { en: "Masked overlay exported to preview.", zh: "脱敏覆盖已导出到预览。" },
  "notice.overlay_export_failed": { en: "Overlay export failed: {error}", zh: "覆盖导出失败：{error}" },
  "notice.overlay_validated": { en: "Overlay validation passed.", zh: "覆盖验证通过。" },
  "notice.overlay_validation_failed": { en: "Overlay validation failed: {error}", zh: "覆盖验证失败：{error}" },
  "notice.overlay_cleared_backup": { en: "Overlay cleared. Backup: {path}", zh: "覆盖已清除。备份：{path}" },
  "notice.overlay_cleared": { en: "Overlay cleared.", zh: "覆盖已清除。" },
  "notice.clear_overlay_failed": { en: "Clear overlay failed: {error}", zh: "清除覆盖失败：{error}" },
  "notice.model_route_deleted": { en: "Model route {model} deleted.", zh: "模型路由 {model} 已删除。" },
  "notice.model_route_saved": { en: "Model route {model} saved.", zh: "模型路由 {model} 已保存。" },
  "notice.delete_route_failed": { en: "Delete model route failed: {error}", zh: "删除模型路由失败：{error}" },
  "notice.confirm_unavailable": { en: "Confirmation dialog is unavailable. Refresh the console and try again.", zh: "确认对话框不可用。请刷新控制台后重试。" },

  // ---- Edit modals ----
  "modal.edit_mapping_title": { en: "Edit model mapping", zh: "编辑模型映射" },
  "modal.edit_format_title": { en: "Edit format path", zh: "编辑格式路径" },

  // ---- Playground ----
  "pg.eyebrow": { en: "Playground", zh: "测试场" },
  "pg.setup": { en: "Request setup", zh: "请求配置" },
  "pg.setup_desc": { en: "Choose the model, client format, and generation controls for this test run.", zh: "选择此测试运行的模型、客户端格式和生成参数。" },
  "pg.model": { en: "Model", zh: "模型" },
  "pg.search_model": { en: "Search model...", zh: "搜索模型..." },
  "pg.parameters": { en: "Parameters", zh: "参数" },
  "pg.temp": { en: "Temp", zh: "温度" },
  "pg.max_tokens": { en: "Max tokens", zh: "最大 Token" },
  "pg.top_p": { en: "Top P", zh: "Top P" },
  "pg.stream": { en: "Stream", zh: "流式" },
  "pg.include_history": { en: "Include history", zh: "包含历史" },
  "pg.system_prompt": { en: "System Prompt", zh: "系统提示词" },
  "pg.system_ph": { en: "Optional system prompt...", zh: "可选的系统提示词..." },
  "pg.api_format": { en: "API Format", zh: "API 格式" },
  "pg.chat": { en: "Chat", zh: "Chat" },
  "pg.responses": { en: "Responses", zh: "Responses" },
  "pg.anthropic": { en: "Anthropic", zh: "Anthropic" },
  "pg.live_test": { en: "Live test", zh: "实时测试" },
  "pg.sandbox": { en: "Message sandbox", zh: "消息沙箱" },
  "pg.ready": { en: "Ready.", zh: "就绪。" },
  "pg.input_ph": { en: "Type a message... (Enter to send, Shift+Enter for newline)", zh: "输入消息...（Enter 发送，Shift+Enter 换行）" },
  "pg.clear": { en: "Clear", zh: "清除" },
  "pg.stop": { en: "Stop", zh: "停止" },
  "pg.send": { en: "Send", zh: "发送" },
  "pg.sending": { en: "Sending...", zh: "发送中..." },
  "pg.done": { en: "Done.", zh: "完成。" },
  "pg.stopped": { en: "Stopped.", zh: "已停止。" },
  "pg.error": { en: "Error: {error}", zh: "错误：{error}" },
  "pg.load_failed": { en: "Failed to load models: {error}", zh: "加载模型失败：{error}" },

  // ---- Model drawer ----
  "model.drawer_title": { en: "Model Details", zh: "模型详情" },
  "model.drawer_subtitle": { en: "Artificial Analysis Summary", zh: "Artificial Analysis 摘要" },

  // ---- Mobile settings ----
  "mobile.sections": { en: "Sections", zh: "栏目" },
  "mobile.runtime": { en: "Runtime", zh: "运行时" },
  "mobile.request_filters": { en: "Request filters", zh: "请求筛选" },
  "mobile.close": { en: "Close settings", zh: "关闭设置" },
  "mobile.nav_desc": { en: "Navigation, runtime controls, and view filters.", zh: "导航、运行时控制和视图筛选。" },

  // ---- Misc ----
  "misc.mono": { en: "mono", zh: "mono" },
  "misc.open_providers": { en: "Open Providers", zh: "打开提供商" },
  "misc.open_requests": { en: "Open Requests", zh: "打开请求" },
  "misc.priority_total": { en: "priority / total", zh: "优先 / 总计" },
  "misc.key_cooldown_short": { en: "key cooldown", zh: "密钥冷却" },
  "misc.pricing_for": { en: "Pricing for {model}", zh: "{model} 的定价" },
};

/**
 * Translate a key with optional parameter interpolation.
 * @param {string} key - Dot-notation key, e.g. "nav.overview"
 * @param {Record<string, string|number>} [params] - Interpolation params, e.g. { name: "OpenAI" }
 * @returns {string} Translated string, or the key itself if not found.
 */
export function t(key, params) {
  const entry = dict[key];
  if (!entry) return key;
  let text = entry[_lang] || entry.en || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

/** Get the current language code. */
export function getLang() {
  return _lang;
}

/** Set the language, persist to localStorage, and notify listeners. */
export function setLang(lang) {
  if (lang !== "en" && lang !== "zh") return;
  if (lang === _lang) return;
  _lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (_e) {}
  applyI18n();
  _listeners.forEach((fn) => { try { fn(lang); } catch (_e) {} });
}

/** Register a callback that fires when the language changes. Returns an unsubscribe function. */
export function onLangChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Scan the document for [data-i18n] and [data-i18n-attr] attributes and apply translations.
 *
 * - data-i18n="key" → sets textContent
 * - data-i18n-attr="placeholder:key,title:key2" → sets attribute values
 * - data-i18n-tip="key" → sets data-tip attribute (for custom tooltip system)
 */
export function applyI18n(root = document) {
  // textContent
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) node.textContent = t(key);
  });

  // attributes
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    const spec = node.getAttribute("data-i18n-attr") || "";
    for (const pair of spec.split(",")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  });

  // data-tip (custom tooltip system)
  root.querySelectorAll("[data-i18n-tip]").forEach((node) => {
    const key = node.getAttribute("data-i18n-tip");
    if (key) node.setAttribute("data-tip", t(key));
  });
}

/** Initialize language from localStorage or browser preference. Call once on startup. */
export function initLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") {
      _lang = saved;
    } else {
      // Auto-detect from browser
      const browserLang = (navigator.language || "en").toLowerCase();
      _lang = browserLang.startsWith("zh") ? "zh" : "en";
    }
  } catch (_e) {
    _lang = DEFAULT_LANG;
  }
  applyI18n();
  return _lang;
}
