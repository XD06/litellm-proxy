(() => {
  "use strict";

  const state = {
    adminKey: "",
    paused: false,
    refreshMs: 5000,
    timer: null,
    view: "overview",
    timeRange: "30m",
    requestsPage: 0,
    requestFilters: {
      status: "",
    },
    selectedRequestIds: new Set(),
    allMatchingSelected: false,
    trafficChartMode: "requests",
    providersPage: 0,
    configProvidersPage: 0,
    modelRoutesPage: 0,
    providerModelMapPage: 0,
    auditPage: 0,
    forceConfigRender: false,
    forceModelRoutesRender: false,
    forcePolicyRender: false,
    forceFailurePoliciesRender: false,
    forceProvidersRender: false,
    forceModelCapsRender: false,
    openProviderDetails: new Set(),
    openProviderEditors: new Set(),
    providerDrawerName: "",
    providerDrawerTab: "overview",
    providerFilters: {
      search: "",
      format: "",
      status: "",
      keys: "",
    },
    confirmResolve: null,
    confirmLastFocus: null,
    keyProbes: {},
    data: {
      metrics: null,
      status: null,
      routing: null,
      config: null,
      timeseries: null,
      requests: null,
      overlay: null,
    },
  };

  const timeRanges = {
    "30m": { label: "Last 30 minutes", bucket_s: 60, buckets: 30 },
    "2h": { label: "Last 2 hours", bucket_s: 120, buckets: 60 },
    "24h": { label: "Last 24 hours", bucket_s: 900, buckets: 96 },
    "7d": { label: "Last 7 days", bucket_s: 3600, buckets: 168 },
  };
  const REQUEST_PAGE_SIZE = 10;
  const PROVIDERS_PAGE_SIZE = 6;
  const CONFIG_PROVIDERS_PAGE_SIZE = 8;
  const MODEL_ROUTES_PAGE_SIZE = 8;
  const PROVIDER_MODEL_MAP_PAGE_SIZE = 6;
  const AUDIT_PAGE_SIZE = 8;
  const OVERVIEW_PROVIDER_LIMIT = 5;
  const OVERVIEW_FAILURE_LIMIT = 5;
  const USAGE_MODEL_LIMIT = 5;

  const views = {
    overview: {
      title: "Overview",
      subtitle: "Live runtime health and request flow.",
    },
    requests: {
      title: "Requests",
      subtitle: "request failure details.",
    },
    providers: {
      title: "Providers",
      subtitle: "Runtime provider and key state.",
    },
    policy: {
      title: "Routing Policy",
      subtitle: "switching rules.",
    },
    config: {
      title: "Config",
      subtitle: "configuration and safe edits",
    },
  };

  const el = (id) => document.getElementById(id);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));
  const mobileSettings = {
    query: "(max-width: 760px)",
    media: null,
    anchors: {},
  };

  const keywordRules = [
    { tone: "danger", words: ["key_invalid", "invalid", "unauthorized", "forbidden", "401", "403", "auth"] },
    { tone: "warn", words: ["quota_or_balance", "rate_limited", "rate limit", "retry_after", "quota", "balance", "429", "402", "cooldown"] },
    { tone: "danger", words: ["server_error", "failed", "failure", "error", "timeout", "502", "503", "504", "500"] },
    { tone: "info", words: ["network_error", "network", "connect", "connection", "transport"] },
    { tone: "compat", words: ["provider_compat", "tool_choice", "unsupported", "compat", "empty_visible_output", "reasoning", "thinking", "length"] },
    { tone: "success", words: ["success", "available", "enabled", "ok", "200"] },
    { tone: "neutral", words: ["chat_completions", "responses", "anthropic_messages", "client_error", "400", "404", "422"] },
  ];

  const keywordRegex = new RegExp(
    keywordRules
      .flatMap((rule) => rule.words)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|"),
    "gi",
  );

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtInt(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
  }

  function fmtTokenCount(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0";
    const abs = Math.abs(n);
    const compact = (divisor, suffix) => {
      const scaled = n / divisor;
      const maxDigits = Math.abs(scaled) < 10 ? 1 : 0;
      return `${scaled.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDigits,
      })}${suffix}`;
    };
    if (abs >= 1_000_000) return compact(1_000_000, "M");
    if (abs >= 1_000) return compact(1_000, "K");
    return fmtInt(n);
  }

  function fmtPct(value) {
    const n = Number(value || 0);
    return `${Math.round(n * 1000) / 10}%`;
  }

  function fmtMs(value) {
    const n = Math.max(0, Number(value || 0));
    return `${Math.round(n).toLocaleString("en-US")}ms`;
  }

  function fmtCompactMs(value) {
    const n = Math.max(0, Number(value || 0));
    if (n >= 1000) {
      const seconds = n / 1000;
      const rounded = seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10;
      return `${rounded.toLocaleString("en-US")}s`;
    }
    return `${Math.round(n)}ms`;
  }

  function firstByteMsFromRequest(request) {
    const value = Number(request?.first_byte_ms || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function firstByteAvgFromBucket(bucket) {
    const value = Number(bucket?.first_byte_ms_avg || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function firstByteMaxFromBucket(bucket) {
    const value = Number(bucket?.first_byte_ms_max || 0);
    return Number.isFinite(value) && value > 0 ? value : firstByteAvgFromBucket(bucket);
  }

  function fmtCost(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "$0";
    if (n < 0.0001) return `$${n.toFixed(8)}`;
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  }

  function proxyText(value) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "object") {
      return String(value.https || value.http || value.url || value.all || "").trim();
    }
    return "";
  }

  function proxyLabel(value, fallback = "direct") {
    const text = proxyText(value);
    return text || fallback;
  }

  function usageFrom(value) {
    const usage = value?.usage && typeof value.usage === "object" ? value.usage : value || {};
    const inputTokens = Number(usage.input_tokens || value?.input_tokens || 0);
    const outputTokens = Number(usage.output_tokens || value?.output_tokens || 0);
    const totalTokens = Number(usage.total_tokens || value?.total_tokens || 0);
    return {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: Math.max(totalTokens, inputTokens + outputTokens),
      cost_usd: Number(value?.cost_usd || usage.cost_usd || 0),
    };
  }

  function addUsage(target, source) {
    const usage = usageFrom(source);
    target.input_tokens += usage.input_tokens;
    target.output_tokens += usage.output_tokens;
    target.total_tokens += usage.total_tokens;
    target.cost_usd += usage.cost_usd;
  }

  function resolveUsageTotal(windowUsage, counters) {
    return Number(windowUsage?.total_tokens || 0) > 0
      ? windowUsage
      : usageFrom((counters || {}).usage || {});
  }

  function timeseriesUsageTotal() {
    const series = state.data.timeseries || {};
    const buckets = Array.isArray(series.buckets) ? series.buckets : [];
    const usage = emptyUsageTotal();
    buckets.forEach((bucket) => addUsage(usage, bucket.usage || {}));
    return usage;
  }

  function currentUsageTotal(counters) {
    return resolveUsageTotal(timeseriesUsageTotal(), counters || {});
  }

  function timeseriesTrafficTotal() {
    const series = state.data.timeseries || {};
    const buckets = Array.isArray(series.buckets) ? series.buckets : [];
    const totals = { requests: 0, success: 0, failed: 0, attempts: 0, failedAttempts: 0 };
    buckets.forEach((bucket) => {
      totals.requests += Number(bucket.requests || 0);
      totals.success += Number(bucket.success || 0);
      totals.failed += Number(bucket.failed || 0);
      Object.values(bucket.by_provider || {}).forEach((provider) => {
        totals.attempts += Number(provider?.attempts || 0);
        totals.failedAttempts += Number(provider?.failed || 0);
      });
    });
    return totals;
  }

  function currentTrafficTotal(counters) {
    const windowTotals = timeseriesTrafficTotal();
    if (windowTotals.requests > 0 || windowTotals.attempts > 0) return windowTotals;
    return {
      requests: Number(counters?.requests_total || 0),
      success: Number(counters?.requests_success || 0),
      failed: Number(counters?.requests_failed || 0),
      attempts: Number(counters?.attempts_total || 0),
      failedAttempts: Number(counters?.attempts_failed || 0),
    };
  }

  function fmtDate(ts) {
    const n = Number(ts || 0);
    if (!n) return "-";
    return new Date(n * 1000).toLocaleString();
  }

  function joinList(items) {
    const arr = Array.isArray(items) ? items.filter(Boolean) : [];
    return arr.length ? arr.join(", ") : "-";
  }

  function joinNumberList(items) {
    const arr = Array.isArray(items) ? items.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [];
    return arr.length ? arr.join(", ") : "";
  }

  function parseNumberList(value) {
    return String(value || "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }

  function toneForText(value) {
    const text = String(value || "").toLowerCase();
    if (!text || text === "-") return "muted";
    for (const rule of keywordRules) {
      if (rule.words.some((word) => text.includes(word))) return rule.tone;
    }
    if (/^2\d\d$/.test(text)) return "success";
    if (/^4\d\d$/.test(text)) return text === "429" ? "warn" : "danger";
    if (/^5\d\d$/.test(text)) return "danger";
    return "neutral";
  }

  function highlightKeywords(value) {
    const text = String(value ?? "");
    if (!text) return "";
    let last = 0;
    let out = "";
    for (const match of text.matchAll(keywordRegex)) {
      out += escapeHtml(text.slice(last, match.index));
      const word = match[0];
      out += `<span class="keyword ${toneForText(word)}">${escapeHtml(word)}</span>`;
      last = match.index + word.length;
    }
    out += escapeHtml(text.slice(last));
    return out;
  }

  function messageMarkup(value) {
    const tone = toneForText(value);
    return `<span class="message-text ${tone}">${highlightKeywords(value || "-")}</span>`;
  }

  function chip(label, tone) {
    return `<span class="message-chip ${tone || toneForText(label)}">${escapeHtml(label || "-")}</span>`;
  }

  function chipList(items, fallback = "-") {
    const arr = Array.isArray(items) ? items.filter(Boolean) : String(items || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!arr.length) return escapeHtml(fallback);
    return `<span class="chip-list">${arr.map((item) => chip(item)).join("")}</span>`;
  }

  function badge(label, tone = "") {
    const safeTone = tone ? ` ${tone}` : "";
    return `<span class="badge${safeTone}">${escapeHtml(label)}</span>`;
  }

  function priorityBadgeTone(priority) {
    const p = Number(priority) || 0;
    if (p < 5) return "prio-0";
    if (p < 10) return "prio-1";
    if (p < 15) return "prio-2";
    return "prio-3";
  }

  function statusBadge(status, statusCode) {
    const code = Number(statusCode || 0);
    if (status === "success" || (code > 0 && code < 400)) return badge("success", "ok");
    if (code === 429) return badge("rate limited", "warn");
    if (code >= 500) return badge("server error", "bad");
    return badge("failed", "bad");
  }

  const toasts = { byKey: new Map(), seq: 0 };

  function dismissToast(node) {
    if (!node || !node.parentNode) return;
    if (node.dataset.toastKey) toasts.byKey.delete(node.dataset.toastKey);
    if (node._hideTimer) window.clearTimeout(node._hideTimer);
    node.classList.add("toast-leaving");
    window.setTimeout(() => {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 220);
  }

  function toastDuration(tone) {
    if (tone === "bad") return 6500;
    if (tone === "warn") return 5000;
    if (tone === "info") return 4000;
    return 3200;
  }

  // setNotice spawns a floating toast (top-right) instead of an in-flow banner,
  // so showing/hiding it never shifts page layout. opts.key lets a follow-up call
  // replace an earlier toast (for example, testing -> result) instead of stacking.
  function setNotice(message, tone = "bad", opts = {}) {
    const stack = el("toastStack");
    if (!stack) return;
    const key = opts && opts.key ? String(opts.key) : "";
    if (!message) {
      if (key && toasts.byKey.has(key)) dismissToast(toasts.byKey.get(key));
      return;
    }
    let node = key ? toasts.byKey.get(key) : null;
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      if (key) {
        node.dataset.toastKey = key;
        toasts.byKey.set(key, node);
      }
      stack.appendChild(node);
      requestAnimationFrame(() => node.classList.add("toast-in"));
    }
    node.dataset.tone = tone;
    node.textContent = message;
    if (node._hideTimer) window.clearTimeout(node._hideTimer);
    const sticky = opts && opts.sticky;
    if (!sticky) {
      node._hideTimer = window.setTimeout(() => dismissToast(node), opts.duration || toastDuration(tone));
    }
  }

  function setConnection(ok, text) {
    const dot = el("connectionDot");
    dot.classList.toggle("ok", Boolean(ok));
    dot.classList.toggle("bad", ok === false);
    el("connectionText").textContent = text;
  }

  function setLoginError(message = "") {
    const node = el("loginError");
    if (!node) return;
    node.textContent = message;
  }

  function stopTimer() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function setLoginBusy(busy, label = "Enter console") {
    const button = el("loginButton");
    const input = el("loginAdminKeyInput");
    if (button) {
      button.disabled = Boolean(busy);
      button.textContent = label;
    }
    if (input) input.disabled = Boolean(busy);
  }

  function showAuthChecking(message = "Checking console access.") {
    stopTimer();
    el("app")?.setAttribute("hidden", "");
    el("loginGate")?.setAttribute("hidden", "");
    el("authChecking")?.removeAttribute("hidden");
    const text = el("authCheckingText");
    if (text) text.textContent = message;
    document.body.classList.add("is-auth-checking");
    document.body.classList.remove("is-login-mode");
  }

  function showLogin(message = "") {
    stopTimer();
    el("app")?.setAttribute("hidden", "");
    el("authChecking")?.setAttribute("hidden", "");
    el("loginGate")?.removeAttribute("hidden");
    document.body.classList.add("is-login-mode");
    document.body.classList.remove("is-auth-checking");
    setLoginBusy(false);
    setLoginError(message);
    window.requestAnimationFrame(() => el("loginAdminKeyInput")?.focus());
  }

  function showConsole() {
    el("authChecking")?.setAttribute("hidden", "");
    el("loginGate")?.setAttribute("hidden", "");
    el("app")?.removeAttribute("hidden");
    document.body.classList.remove("is-login-mode");
    document.body.classList.remove("is-auth-checking");
    setLoginError("");
  }

  function isAuthError(err) {
    return /admin auth required|HTTP 401|HTTP 403|unauthorized|forbidden/i.test(err?.message || "");
  }

  function clearStoredAdminKey() {
    try {
      localStorage.removeItem("proxyConsoleAdminKey");
    } catch (_err) {
      // Ignore storage failures; the in-memory key is still cleared.
    }
  }

  async function validateAdminKey(key) {
    state.adminKey = String(key || "").trim();
    if (!state.adminKey) throw new Error("Admin key is required.");
    return apiGet("/-/admin/status");
  }

  async function openConsoleWithKey(key, { persist = false, checkingMessage = "Checking console access." } = {}) {
    showAuthChecking(checkingMessage);
    try {
      await validateAdminKey(key);
      if (persist) {
        try {
          localStorage.setItem("proxyConsoleAdminKey", state.adminKey);
        } catch (_err) {
          // Ignore storage failures; the current session can still proceed.
        }
      }
      showConsole();
      setView(loadSavedView());
      renderAll();
      await refreshAll({ quiet: true });
      startTimer();
    } catch (err) {
      clearStoredAdminKey();
      state.adminKey = "";
      el("loginAdminKeyInput").value = "";
      showLogin(isAuthError(err) ? "Admin key was rejected. Enter the current key to continue." : err.message);
    }
  }

  function adminQuery() {
    return state.adminKey ? `admin_key=${encodeURIComponent(state.adminKey)}` : "";
  }

  function withAdmin(path) {
    const q = adminQuery();
    if (!q) return path;
    return path.includes("?") ? `${path}&${q}` : `${path}?${q}`;
  }

  async function apiGet(path) {
    const resp = await fetch(withAdmin(path), {
      headers: state.adminKey ? { "X-Admin-Key": state.adminKey } : {},
    });
    const data = await readJson(resp);
    if (!resp.ok) throw new Error(errorMessage(data, resp.status));
    return data;
  }

  async function apiPost(path, body) {
    const resp = await fetch(withAdmin(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(state.adminKey ? { "X-Admin-Key": state.adminKey } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    const data = await readJson(resp);
    if (!resp.ok) throw new Error(errorMessage(data, resp.status));
    return data;
  }

  async function apiPatch(path, body) {
    const resp = await fetch(withAdmin(path), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(state.adminKey ? { "X-Admin-Key": state.adminKey } : {}),
      },
      body: JSON.stringify(body || {}),
    });
    const data = await readJson(resp);
    if (!resp.ok) throw new Error(errorMessage(data, resp.status));
    return data;
  }

  async function readJson(resp) {
    try {
      return await resp.json();
    } catch (_err) {
      return {};
    }
  }

  function errorMessage(data, status) {
    return data?.error?.message || `HTTP ${status}`;
  }

  function openConfirmDialog({ title, message, acceptLabel = "Delete" }) {
    const dialog = el("confirmDialog");
    const backdrop = el("confirmBackdrop");
    const titleEl = el("confirmTitle");
    const messageEl = el("confirmMessage");
    const acceptButton = el("confirmAcceptButton");
    if (!dialog || !backdrop || !titleEl || !messageEl || !acceptButton) {
      setNotice("Confirmation dialog is unavailable. Refresh the console and try again.");
      return Promise.resolve(false);
    }
    if (state.confirmResolve) {
      state.confirmResolve(false);
      state.confirmResolve = null;
    }
    state.confirmLastFocus = document.activeElement;
    titleEl.textContent = title || "Confirm action";
    messageEl.textContent = message || "This action needs confirmation.";
    acceptButton.textContent = acceptLabel;
    backdrop.hidden = false;
    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden", "false");
    acceptButton.focus();
    return new Promise((resolve) => {
      state.confirmResolve = resolve;
    });
  }

  function closeConfirmDialog(accepted) {
    const dialog = el("confirmDialog");
    const backdrop = el("confirmBackdrop");
    if (dialog) {
      dialog.classList.remove("is-open");
      dialog.setAttribute("aria-hidden", "true");
    }
    if (backdrop) backdrop.hidden = true;
    const resolve = state.confirmResolve;
    state.confirmResolve = null;
    if (resolve) resolve(Boolean(accepted));
    if (state.confirmLastFocus && typeof state.confirmLastFocus.focus === "function") {
      state.confirmLastFocus.focus();
    }
    state.confirmLastFocus = null;
  }

  async function refreshAll({ quiet = false, preserveNotice = false } = {}) {
    if (!state.adminKey) {
      setConnection(false, "Admin key required");
      showLogin(quiet ? "" : "Admin key is required to load console data.");
      return;
    }

    try {
      setConnection(null, "Refreshing");
      const [metrics, timeseries, status, requests, routing, config, overlay, audit] = await Promise.all([
        apiGet("/-/admin/metrics"),
        apiGet(timeseriesPath()),
        apiGet("/-/admin/status"),
        apiGet(requestsPath()),
        apiGet("/-/admin/routing"),
        apiGet("/-/admin/config"),
        apiGet("/-/admin/config/overlay"),
        apiGet("/-/admin/audit?limit=12"),
      ]);

      state.data.metrics = metrics;
      state.data.timeseries = timeseries;
      state.data.status = status;
      state.data.requests = requests;
      state.data.routing = routing;
      state.data.config = config;
      state.data.overlay = overlay;
      state.data.audit = audit;

      renderAll();
      if (!preserveNotice) setNotice("");
      setConnection(true, `Updated ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setConnection(false, "Connection error");
      if (isAuthError(err)) {
        clearStoredAdminKey();
        state.adminKey = "";
        showLogin("Admin key was rejected. Enter the current key to continue.");
        return;
      }
      setNotice(`Console refresh failed: ${err.message}`);
    }
  }

  function currentTimeRange() {
    return timeRanges[state.timeRange] || timeRanges["30m"];
  }

  function timeseriesPath() {
    const range = currentTimeRange();
    return `/-/admin/metrics/timeseries?bucket_s=${range.bucket_s}&buckets=${range.buckets}`;
  }

  function requestsPath() {
    const params = new URLSearchParams();
    params.set("limit", String(REQUEST_PAGE_SIZE));
    params.set("offset", String(Math.max(0, state.requestsPage) * REQUEST_PAGE_SIZE));
    Object.entries(currentRequestFilters()).forEach(([key, value]) => {
      const v = String(value || "").trim();
      if (v) params.set(key, v);
    });
    return `/-/admin/requests?${params.toString()}`;
  }

  function currentRequestFilters() {
    return {
      model: el("filterModel")?.value,
      provider: el("filterProvider")?.value,
      status: state.requestFilters.status,
      error_type: el("filterErrorType")?.value,
      failure_reason: el("filterReason")?.value,
      http_status: el("filterHttpStatus")?.value,
    };
  }

  function activeRequestFilters() {
    const out = {};
    Object.entries(currentRequestFilters()).forEach(([key, value]) => {
      const text = String(value || "").trim();
      if (text) out[key] = text;
    });
    return out;
  }

  function renderAll() {
    renderTimeRangeControl();
    const view = state.view || "overview";
    if (view === "overview") {
      renderMetrics();
      renderOverviewVisuals();
      renderTrafficChart();
      renderUsageChart();
      renderProviderHealth();
      renderRecentFailures();
    } else if (view === "requests") {
      renderRequestsTable();
    } else if (view === "providers") {
      renderProvidersTable();
      renderModelCapabilities();
    } else if (view === "policy") {
      renderPolicy();
    } else if (view === "config") {
      renderConfig();
    }
    renderProviderDrawer();
    bindViewTargetButtons();
  }

  function bindViewTargetButtons() {
    qsa("[data-view-target]").forEach((button) => {
      if (button.dataset.boundViewTarget) return;
      button.dataset.boundViewTarget = "1";
      button.addEventListener("click", () => setView(button.dataset.viewTarget || "overview"));
    });
  }

  function renderTimeRangeControl() {
    const range = currentTimeRange();
    const label = el("timeRangeLabel");
    if (label) label.textContent = range.label;
    qsa("[data-time-range]").forEach((button) => {
      const active = button.dataset.timeRange === state.timeRange;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function renderMetrics() {
    const metrics = state.data.metrics || {};
    const status = state.data.status || {};
    const counters = metrics.counters || {};
    const providers = status.router?.providers || {};
    const providerValues = Object.values(providers);
    const available = providerValues.filter((p) => p.available && p.enabled).length;
    const traffic = currentTrafficTotal(counters);
    const displaySuccess = traffic.requests > 0 ? Math.min(traffic.success, traffic.requests) : traffic.success;
    const successRate = traffic.requests > 0 ? Math.min(1, traffic.success / traffic.requests) : 1;
    const attemptFailureRate = traffic.attempts > 0 ? traffic.failedAttempts / traffic.attempts : 0;
    const windowLabel = `${state.timeRange} window`;

    el("metricRequests").textContent = fmtInt(traffic.requests);
    el("metricRequestsSub").textContent = `${windowLabel} / ${fmtInt(counters.requests_in_flight)} live`;
    el("metricSuccessRate").textContent = fmtPct(successRate);
    el("metricSuccessSub").textContent = `${fmtInt(displaySuccess)} success in ${state.timeRange}`;
    el("metricAttemptFailureRate").textContent = fmtPct(attemptFailureRate);
    el("metricAttemptSub").textContent = `${fmtInt(traffic.failedAttempts)}/${fmtInt(traffic.attempts)} failed attempts`;
    el("metricProviders").textContent = `${available}/${providerValues.length}`;
    el("metricProvidersSub").textContent = "available";
    const usage = currentUsageTotal(counters);
    el("metricTokens").textContent = fmtTokenCount(usage.total_tokens);
    el("metricTokens").title = `${fmtInt(usage.total_tokens)} tokens`;
    el("metricTokensSub").textContent = `${fmtTokenCount(usage.input_tokens)} input / ${fmtTokenCount(usage.output_tokens)} output`;
    el("metricTokensSub").title = `${fmtInt(usage.input_tokens)} input / ${fmtInt(usage.output_tokens)} output`;
    el("metricCost").textContent = fmtCost(usage.cost_usd);
    el("metricCostSub").textContent = usage.cost_usd > 0 ? "estimated from configured pricing" : "pricing not configured";
    setMetricProgress("metricRequests", traffic.requests > 0 ? 1 : 0);
    setMetricProgress("metricSuccessRate", successRate);
    setMetricProgress("metricAttemptFailureRate", attemptFailureRate);
    setMetricProgress("metricProviders", providerValues.length ? available / providerValues.length : 0);
    setMetricProgress("metricTokens", usage.total_tokens > 0 ? Math.max(0.08, usage.output_tokens / usage.total_tokens) : 0);
    setMetricProgress("metricCost", usage.cost_usd > 0 ? 1 : 0);
  }

  function setMetricProgress(valueId, value) {
    const node = el(valueId);
    const card = node?.closest(".metric");
    if (!card) return;
    const pct = Math.max(0, Math.min(100, Number(value || 0) * 100));
    card.style.setProperty("--metric-progress", `${pct}%`);
  }

  function renderOverviewVisuals() {
    const target = el("overviewVisuals");
    if (!target) return;
    const metrics = state.data.metrics || {};
    const counters = metrics.counters || {};
    const status = state.data.status || {};
    const providers = Object.values(status.router?.providers || {});
    const traffic = currentTrafficTotal(counters);
    const usage = currentUsageTotal(counters);
    const displaySuccess = traffic.requests > 0 ? Math.min(traffic.success, traffic.requests) : traffic.success;
    const successRate = traffic.requests > 0 ? Math.min(1, traffic.success / traffic.requests) : 1;
    const requestFailureRate = traffic.requests > 0 ? traffic.failed / traffic.requests : 0;
    const failureRate = traffic.attempts > 0 ? traffic.failedAttempts / traffic.attempts : 0;
    const providerCount = providers.length;
    const providerAvailable = providers.filter((p) => p.available && p.enabled).length;
    let keyTotal = 0;
    let keyUsable = 0;
    providers.forEach((provider) => {
      const keys = Array.isArray(provider.keys) ? provider.keys : [];
      keyTotal += keys.length;
      keyUsable += keys.filter((key) => key.available && key.runtime_enabled).length;
    });
    const recent = Array.isArray(metrics.recent_requests) ? metrics.recent_requests : [];
    const latencySamples = recent
      .map(firstByteMsFromRequest)
      .filter((value) => value > 0)
      .slice(-60);
    const latestLatency = latencySamples.length ? latencySamples[latencySamples.length - 1] : null;
    const avgLatency = latencySamples.length
      ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)
      : null;
    const maxLatency = latencySamples.length ? Math.max(...latencySamples) : null;
    const providerPct = providerCount ? providerAvailable / providerCount : 0;
    const keyPct = keyTotal ? keyUsable / keyTotal : 0;
    const healthTone =
      providerPct >= 0.9 && keyPct >= 0.9 && failureRate < 0.05
        ? "ok"
        : providerPct >= 0.5 && keyPct >= 0.5 && failureRate < 0.2
        ? "warn"
        : providerPct > 0 && keyPct > 0
        ? "soft"
        : "bad";
    const rangeLabel = currentTimeRange().label || state.timeRange;
    target.innerHTML = `
      ${overviewMetricCard("Requests", fmtInt(traffic.requests), `${fmtInt(counters.requests_in_flight || 0)} in flight`, requestFailureRate >= 0.1 ? "danger" : requestFailureRate > 0 ? "warning" : "info", "activity")}
      ${overviewMetricCard("Success rate", fmtPct(successRate), `${fmtInt(displaySuccess)} success`, successRate >= 0.98 ? "success" : successRate >= 0.95 ? "info" : successRate >= 0.85 ? "warning" : "danger", "check")}
      ${overviewMetricCard("First byte", latestLatency === null ? "-" : fmtMs(latestLatency), avgLatency === null ? "no samples" : `avg ${fmtMs(avgLatency)} / max ${fmtMs(maxLatency)}`, toneForLatency(avgLatency || latestLatency || 0), "clock")}
      ${overviewMetricCard("Active keys", `${fmtInt(keyUsable)}/${fmtInt(keyTotal)}`, `${fmtInt(providerAvailable)}/${fmtInt(providerCount)} providers`, healthTone === "bad" ? "danger" : healthTone === "soft" ? "warning" : healthTone === "warn" ? "info" : "success", "key")}
    `;
  }

  function overviewMetricCard(label, value, hint, tone, icon) {
    return `
      <article class="visual-card accent-${escapeHtml(tone || "info")}">
        <div class="metric-header">
          <span class="metric-label">${escapeHtml(label)}</span>
          <span class="metric-icon">${iconSvg(icon || "activity")}</span>
        </div>
        <strong class="metric-val">${escapeHtml(value)}</strong>
        <small class="metric-sub">${metricDot(tone)}${escapeHtml(hint)}</small>
      </article>
    `;
  }

  function metricDot(tone) {
    const safeTone = tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : "info";
    return `<span class="metric-dot ${safeTone}"></span>`;
  }

  function visualProgressCard(label, value, hint, ratio, tone, icon) {
    const pct = Math.max(0, Math.min(100, Number(ratio || 0) * 100));
    return `
      <article class="visual-card visual-progress-card tone-${escapeHtml(tone || "neutral")}">
        <div class="visual-card-icon tone-${escapeHtml(tone === "ok" ? "success" : tone === "warn" ? "warning" : tone === "bad" ? "danger" : tone || "neutral")}">${iconSvg(icon || "activity")}</div>
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(hint)}</small>
          <div class="visual-progress" style="--progress:${svgNum(pct)}%"></div>
        </div>
      </article>
    `;
  }

  function renderTrafficChart() {
    const series = state.data.timeseries || {};
    const buckets = Array.isArray(series.buckets) ? series.buckets : [];
    const recent = Array.isArray(state.data.metrics?.recent_requests) ? state.data.metrics.recent_requests : [];
    const target = el("trafficChart");
    if (!target) return;
    const chartWindow = el("chartWindow");
    const bucketS = Number(series.bucket_s || 60);
    const sourceLabel = series.source === "sqlite" ? "sqlite history" : "memory";

    const recentSorted = recent
      .filter((request) => Number(request.finished_at || 0) > 0)
      .slice()
      .sort((a, b) => Number(a.finished_at || 0) - Number(b.finished_at || 0));

    let chartBuckets = buckets.map((bucket) => {
      const start = Number(bucket.start || 0);
      const end = Number(bucket.end || (start ? start + bucketS : 0));
      const usage = usageFrom(bucket.usage || {});
      const success = Number(bucket.success || 0);
      const failed = Number(bucket.failed || 0);
      const requests = Number(bucket.requests || success + failed || 0);
      return {
        ts: start + Math.max(0, end - start) / 2,
        start,
        end,
        requests,
        success,
        failed,
        input: usage.input_tokens,
        output: usage.output_tokens,
        total_tokens: usage.total_tokens,
        cost_usd: usage.cost_usd,
        first_byte_ms_avg: Number(bucket.first_byte_ms_avg || 0),
      };
    });

    const bucketHasSignal = chartBuckets.some((bucket) =>
      Number(bucket.requests || 0) ||
      Number(bucket.success || 0) ||
      Number(bucket.failed || 0) ||
      Number(bucket.input || 0) ||
      Number(bucket.output || 0) ||
      Number(bucket.total_tokens || 0)
    );
    const useRecentSamples = !bucketHasSignal && recentSorted.length > 0;

    if (useRecentSamples) {
      chartBuckets = recentSorted.slice(-72).map((request) => {
        const ts = Number(request.finished_at || 0);
        const usage = usageFrom(request);
        const statusCode = Number(request.status_code || 0);
        const failed = request.status === "success" || (statusCode > 0 && statusCode < 400) ? 0 : 1;
        return {
          ts,
          start: ts,
          end: ts,
          requests: 1,
          success: failed ? 0 : 1,
          failed,
          input: usage.input_tokens,
          output: usage.output_tokens,
          total_tokens: usage.total_tokens,
          cost_usd: usage.cost_usd,
          first_byte_ms_avg: Number(request.first_byte_ms || 0),
        };
      });
    }

    if (chartBuckets.length && !chartBuckets.some((bucket) => Number(bucket.total_tokens || 0) > 0)) {
      const firstTs = Number(chartBuckets[0]?.start || chartBuckets[0]?.ts || 0);
      const lastTs = Number(chartBuckets[chartBuckets.length - 1]?.end || chartBuckets[chartBuckets.length - 1]?.ts || firstTs);
      recentSorted
        .filter((request) => Number(request.finished_at || 0) >= firstTs && Number(request.finished_at || 0) <= lastTs)
        .forEach((request) => {
          const ts = Number(request.finished_at || 0);
          const usage = usageFrom(request);
          if (!ts || !usage.total_tokens) return;
          let closest = null;
          chartBuckets.forEach((bucket) => {
            const distance = Math.abs(Number(bucket.ts || 0) - ts);
            if (!closest || distance < closest.distance) closest = { bucket, distance };
          });
          if (!closest?.bucket) return;
          closest.bucket.input += usage.input_tokens;
          closest.bucket.output += usage.output_tokens;
          closest.bucket.total_tokens += usage.total_tokens;
          closest.bucket.cost_usd += usage.cost_usd;
        });
    }

    if (!chartBuckets.length) {
      if (chartWindow) chartWindow.textContent = `${currentTimeRange().label} / no samples`;
      target.innerHTML = `<div class="empty">No time-series data</div>`;
      return;
    }

    const totals = chartBuckets.reduce((memo, bucket) => {
      memo.requests += Number(bucket.requests || 0);
      memo.success += Number(bucket.success || 0);
      memo.failed += Number(bucket.failed || 0);
      memo.input += Number(bucket.input || 0);
      memo.output += Number(bucket.output || 0);
      memo.total_tokens += Number(bucket.total_tokens || 0);
      memo.cost_usd += Number(bucket.cost_usd || 0);
      return memo;
    }, { requests: 0, success: 0, failed: 0, input: 0, output: 0, total_tokens: 0, cost_usd: 0 });
    totals.total_tokens = Math.max(totals.total_tokens, totals.input + totals.output);
    const windowUsage = {
      input_tokens: totals.input,
      output_tokens: totals.output,
      total_tokens: totals.total_tokens,
      cost_usd: totals.cost_usd,
    };
    const fallbackUsage = currentUsageTotal(state.data.metrics?.counters || {});
    const displayUsage = windowUsage.total_tokens > 0 ? windowUsage : fallbackUsage;
    const successRate = totals.requests ? Math.min(1, totals.success / totals.requests) : 1;
    const firstTs = Number(chartBuckets[0]?.start || chartBuckets[0]?.ts || 0);
    const lastTs = Number(chartBuckets[chartBuckets.length - 1]?.end || chartBuckets[chartBuckets.length - 1]?.ts || firstTs);
    if (chartWindow) {
      chartWindow.textContent = useRecentSamples
        ? `${currentTimeRange().label} / recent requests`
        : `${currentTimeRange().label} / ${sourceLabel}`;
    }

    target.innerHTML = `
      <div class="usage-trend-overview">
        <div class="usage-trend-total">
          <span>Consumed tokens</span>
          <strong>${escapeHtml(fmtTokenCount(displayUsage.total_tokens))}</strong>
          <small>${escapeHtml(fmtInt(displayUsage.total_tokens))} total in the selected window</small>
        </div>
        <div class="usage-trend-kpis">
          ${usageTrendKpi("Input", fmtTokenCount(displayUsage.input_tokens), "usage-input")}
          ${usageTrendKpi("Output", fmtTokenCount(displayUsage.output_tokens), "usage-output")}
          ${usageTrendKpi("Requests", fmtInt(totals.requests), "usage-request")}
          ${usageTrendKpi("Failures", `${fmtInt(totals.failed)} failed`, "usage-failure")}
          ${usageTrendKpi("Success", fmtPct(successRate), "usage-success")}
        </div>
      </div>
      ${renderTrafficComboChart({
        buckets: chartBuckets,
        firstTs,
        lastTs,
        width: 1120,
        height: 360,
        pad: { top: 32, right: 72, bottom: 48, left: 72 },
      })}
    `;

    // Bind event listeners for mode toggling
    target.querySelectorAll("[data-traffic-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.trafficMode;
        if (state.trafficChartMode === mode) return;
        state.trafficChartMode = mode;
        renderTrafficChart();
      });
    });
  }

  function usageTrendKpi(label, value, tone) {
    return `
      <div class="usage-trend-kpi ${escapeHtml(tone)}">
        <i></i>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function niceChartMax(value) {
    const raw = Math.max(1, Number(value || 1));
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10;
    return step * magnitude;
  }

  function svgNum(value) {
    return Number(value || 0).toFixed(2).replace(/\.?0+$/, "");
  }

  function smoothSvgPath(points, minY, maxY) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${svgNum(points[0].x)} ${svgNum(points[0].y)}`;
    const clampY = (value) => Math.max(minY, Math.min(maxY, Number(value || 0)));
    let path = `M ${svgNum(points[0].x)} ${svgNum(points[0].y)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
      path += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
    }
    return path;
  }

  function renderTrafficComboChart(options) {
    const width = Number(options.width || 1120);
    const height = Number(options.height || 360);
    const pad = options.pad || { top: 32, right: 72, bottom: 48, left: 72 };
    const firstTs = Number(options.firstTs || 0);
    const lastTs = Number(options.lastTs || firstTs);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const buckets = Array.isArray(options.buckets) ? options.buckets : [];

    const xFor = (bucket, index, total) => {
      const ts = Number(bucket.ts || 0);
      if (lastTs > firstTs && ts) return pad.left + ((ts - firstTs) / (lastTs - firstTs)) * plotW;
      return pad.left + (total > 1 ? (index / (total - 1)) * plotW : plotW / 2);
    };

    const enriched = buckets.map((bucket, index) => ({
      ...bucket,
      x: xFor(bucket, index, buckets.length),
    }));

    const safeMax = (values, fallback = 1) => Math.max(fallback, ...values.map((value) => Number(value || 0)));
    const barBaseline = height - pad.bottom;

    let svgContent = "";
    let legendItems = [];

    if (state.trafficChartMode === "requests") {
      const requestMax = niceChartMax(Math.max(4, safeMax(buckets.map((b) => b.requests), 1) * 1.15));
      const latencyMax = niceChartMax(safeMax(buckets.map((b) => b.first_byte_ms_avg), 1000) * 1.15);

      const yBar = (value) => barBaseline - (Number(value || 0) / Math.max(1, requestMax)) * plotH;
      const yLatency = (value) => barBaseline - (Number(value || 0) / Math.max(1, latencyMax)) * plotH;

      const requestLabels = [0, Math.ceil(requestMax / 2), requestMax];
      const latencyLabels = [0, Math.ceil(latencyMax / 2), latencyMax];

      // Draw grid lines and left Y axis labels (Requests)
      const gridAndLabels = requestLabels.map((label) => `
        <line class="axis traffic-grid-line" x1="${pad.left}" y1="${yBar(label)}" x2="${width - pad.right}" y2="${yBar(label)}"></line>
        <text class="traffic-axis-label" x="${pad.left - 14}" y="${yBar(label) + 4}" text-anchor="end">${escapeHtml(fmtInt(label))}</text>
      `).join("");

      // Draw right Y axis labels (Latency)
      const rightLabels = latencyLabels.map((label) => `
        <text class="traffic-axis-label traffic-axis-label-info" x="${width - pad.right + 14}" y="${yLatency(label) + 4}">${escapeHtml(fmtMs(label))}</text>
      `).join("");

      // Draw stacked request bars
      const count = enriched.length;
      const slot = count > 0 ? plotW / count : plotW;
      const barW = Math.max(2, Math.min(26, slot * 0.5));
      const bars = enriched.map((bucket) => {
        const requests = Number(bucket.requests || 0);
        const failed = Math.min(requests, Number(bucket.failed || 0));
        const success = Math.max(0, requests - failed);
        const cx = bucket.x;
        const x = cx - barW / 2;
        if (requests === 0) return "";

        const successTop = yBar(success);
        const totalTop = yBar(requests);

        const successHeight = barBaseline - successTop;
        const failedHeight = successTop - totalTop;

        const successRect = success > 0
          ? `<rect class="traffic-bar-success" x="${svgNum(x)}" y="${svgNum(successTop)}" width="${svgNum(barW)}" height="${svgNum(successHeight)}" rx="1.5">
              <title>${escapeHtml(`${fmtDate(bucket.start || bucket.ts)} Success: ${fmtInt(success)}`)}</title>
             </rect>`
          : "";

        const failedRect = failed > 0
          ? `<rect class="traffic-bar-fail" x="${svgNum(x)}" y="${svgNum(totalTop)}" width="${svgNum(barW)}" height="${svgNum(failedHeight)}" rx="1.5">
              <title>${escapeHtml(`${fmtDate(bucket.start || bucket.ts)} Failures: ${fmtInt(failed)}`)}</title>
             </rect>`
          : "";

        return successRect + failedRect;
      }).join("");

      // Draw latency line & area
      const latencyPoints = enriched
        .filter((bucket) => bucket.requests > 0 && bucket.first_byte_ms_avg > 0)
        .map((bucket) => ({
          x: bucket.x,
          y: yLatency(bucket.first_byte_ms_avg),
          value: bucket.first_byte_ms_avg,
          start: bucket.start,
          ts: bucket.ts,
        }));
      const latencyPath = smoothSvgPath(latencyPoints, pad.top, barBaseline);
      const latencyAreaPath = latencyPath && latencyPoints.length > 1
        ? `${latencyPath} L ${svgNum(latencyPoints[latencyPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(latencyPoints[0].x)} ${svgNum(barBaseline)} Z`
        : "";

      const latencyArea = latencyAreaPath
        ? `<path class="traffic-latency-region" d="${latencyAreaPath}"></path>`
        : "";
      const latencyLine = latencyPath
        ? `<path class="traffic-latency-line" d="${latencyPath}"></path>`
        : "";
      const latencyDots = latencyPoints.length <= 64
        ? latencyPoints.map((point) => `
            <circle class="traffic-trend-dot traffic-latency-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3.2">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Avg Latency: ${fmtMs(point.value)}`)}</title>
            </circle>
          `).join("")
        : "";

      svgContent = `
        ${gridAndLabels}
        ${rightLabels}
        ${bars}
        ${latencyArea}
        ${latencyLine}
        ${latencyDots}
        <text class="traffic-axis-title" x="${pad.left}" y="${pad.top - 8}">requests</text>
        <text class="traffic-axis-title traffic-axis-label-info" x="${width - pad.right}" y="${pad.top - 8}" text-anchor="end">latency</text>
      `;

      legendItems = [
        { dotClass: "traffic-bar-success-legend", label: "Success requests" },
        { dotClass: "traffic-bar-fail-legend", label: "Failures" },
        { dotClass: "traffic-latency-legend", label: "Avg Latency" },
      ];
    } else {
      // Tokens & Usage mode
      const tokenMax = niceChartMax(safeMax(buckets.flatMap((bucket) => [
        bucket.total_tokens,
        bucket.input,
        bucket.output,
      ]), 1000) * 1.15);
      const costMax = safeMax(buckets.map((b) => b.cost_usd), 0.01) * 1.15;

      const yToken = (value) => barBaseline - (Number(value || 0) / Math.max(1, tokenMax)) * plotH;
      const yCost = (value) => barBaseline - (Number(value || 0) / Math.max(0.000001, costMax)) * plotH;

      const tokenLabels = [0, Math.ceil(tokenMax / 2), tokenMax];
      const costLabels = [0, costMax / 2, costMax];

      // Draw grid lines and left Y axis labels (Tokens)
      const gridAndLabels = tokenLabels.map((label) => `
        <line class="axis traffic-grid-line" x1="${pad.left}" y1="${yToken(label)}" x2="${width - pad.right}" y2="${yToken(label)}"></line>
        <text class="traffic-axis-label" x="${pad.left - 14}" y="${yToken(label) + 4}" text-anchor="end">${escapeHtml(fmtTokenCount(label))}</text>
      `).join("");

      // Draw right Y axis labels (Cost)
      const rightLabels = costLabels.map((label) => `
        <text class="traffic-axis-label traffic-axis-label-info" x="${width - pad.right + 14}" y="${yCost(label) + 4}">${escapeHtml(fmtCost(label))}</text>
      `).join("");

      // Draw total tokens path and area
      const totalPoints = enriched.map((bucket) => ({
        x: bucket.x,
        y: yToken(bucket.total_tokens),
        value: bucket.total_tokens,
        start: bucket.start,
        ts: bucket.ts,
      }));
      const totalPath = smoothSvgPath(totalPoints, pad.top, barBaseline);
      const totalAreaPath = totalPath && totalPoints.length > 1
        ? `${totalPath} L ${svgNum(totalPoints[totalPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(totalPoints[0].x)} ${svgNum(barBaseline)} Z`
        : "";

      const totalArea = totalAreaPath ? `<path class="traffic-token-area" d="${totalAreaPath}"></path>` : "";
      const totalLine = totalPath ? `<path class="traffic-total-line" d="${totalPath}"></path>` : "";

      // Draw input/output token lines
      const inputPoints = enriched.map((bucket) => ({
        x: bucket.x,
        y: yToken(bucket.input),
        value: bucket.input,
        start: bucket.start,
        ts: bucket.ts,
      }));
      const inputPath = smoothSvgPath(inputPoints, pad.top, barBaseline);
      const inputLine = inputPath ? `<path class="traffic-input-line" d="${inputPath}"></path>` : "";

      const outputPoints = enriched.map((bucket) => ({
        x: bucket.x,
        y: yToken(bucket.output),
        value: bucket.output,
        start: bucket.start,
        ts: bucket.ts,
      }));
      const outputPath = smoothSvgPath(outputPoints, pad.top, barBaseline);
      const outputLine = outputPath ? `<path class="traffic-output-line" d="${outputPath}"></path>` : "";

      // Draw cost line
      const costPoints = enriched.map((bucket) => ({
        x: bucket.x,
        y: yCost(bucket.cost_usd),
        value: bucket.cost_usd,
        start: bucket.start,
        ts: bucket.ts,
      }));
      const costPath = smoothSvgPath(costPoints, pad.top, barBaseline);
      const costLine = costPath ? `<path class="traffic-cost-line" d="${costPath}"></path>` : "";

      // Draw dots for total tokens
      const totalDots = totalPoints.length <= 64
        ? totalPoints.map((point) => `
            <circle class="traffic-trend-dot traffic-total-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3.6">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Total Tokens: ${fmtTokenCount(point.value)}`)}</title>
            </circle>
          `).join("")
        : "";

      // Draw dots for cost
      const costDots = costPoints.length <= 64 && costPath
        ? costPoints.map((point) => `
            <circle class="traffic-trend-dot traffic-cost-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3.2">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Est. Cost: ${fmtCost(point.value)}`)}</title>
            </circle>
          `).join("")
        : "";

      svgContent = `
        ${gridAndLabels}
        ${rightLabels}
        ${totalArea}
        ${totalLine}
        ${inputLine}
        ${outputLine}
        ${costLine}
        ${totalDots}
        ${costDots}
        <text class="traffic-axis-title" x="${pad.left}" y="${pad.top - 8}">tokens</text>
        <text class="traffic-axis-title traffic-axis-label-info" x="${width - pad.right}" y="${pad.top - 8}" text-anchor="end">cost</text>
      `;

      legendItems = [
        { dotClass: "traffic-total-dot", label: "Total tokens" },
        { dotClass: "traffic-input-dot", label: "Input" },
        { dotClass: "traffic-output-dot", label: "Output" },
        { dotClass: "traffic-cost-legend", label: "Est. Cost" },
      ];
    }

    // Common elements: baseline, X ticks, and wrapping structure.
    const xTicks = enriched.length > 2
      ? [enriched[0], enriched[Math.floor(enriched.length / 2)], enriched[enriched.length - 1]]
      : enriched;

    const shortDate = (ts) => {
      const n = Number(ts || 0);
      if (!n) return "-";
      const d = new Date(n * 1000);
      const range = currentTimeRange();
      const opts = range === timeRanges["24h"] || range === timeRanges["7d"]
        ? { month: "2-digit", day: "2-digit" }
        : { hour: "2-digit", minute: "2-digit" };
      return d.toLocaleString(undefined, opts);
    };

    const xTicksHtml = xTicks.map((point) => `
      <text class="traffic-axis-label" x="${svgNum(point.x)}" y="${height - 18}" text-anchor="middle">${escapeHtml(shortDate(point.start || point.ts))}</text>
    `).join("");

    const legend = legendItems.map((item) => `
      <span class="traffic-trend-legend-item ${item.dotClass}">
        <i></i>${escapeHtml(item.label)}
      </span>
    `).join("");

    return `
      <div class="traffic-chart-shell">
        <div class="traffic-chart-header">
          <div class="traffic-trend-legend">${legend}</div>
          <div class="traffic-mode-selectors">
            <button type="button" class="button pill-toggle ${state.trafficChartMode === "requests" ? "is-active" : ""}" data-traffic-mode="requests">Requests & Latency</button>
            <button type="button" class="button pill-toggle ${state.trafficChartMode === "tokens" ? "is-active" : ""}" data-traffic-mode="tokens">Usage</button>
          </div>
        </div>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gateway traffic visualization chart">
          <defs>
            <linearGradient id="trafficTokenArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#a855f7" stop-opacity="0.22"></stop>
              <stop offset="55%" stop-color="#a855f7" stop-opacity="0.07"></stop>
              <stop offset="100%" stop-color="#a855f7" stop-opacity="0"></stop>
            </linearGradient>
            <linearGradient id="trafficLatencyArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.16"></stop>
              <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          <rect class="traffic-plot-bg" x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" rx="0"></rect>
          ${svgContent}
          <line class="axis traffic-baseline" x1="${pad.left}" y1="${barBaseline}" x2="${width - pad.right}" y2="${barBaseline}"></line>
          ${xTicksHtml}
        </svg>
      </div>
    `;
  }

  function renderUsageChart() {
    const target = el("usageChart");
    if (!target) return;
    const metrics = state.data.metrics || {};
    const counters = metrics.counters || {};
    const series = state.data.timeseries || {};
    const buckets = Array.isArray(series.buckets) ? series.buckets : [];
    const windowUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 };
    const modelTotals = {};
    buckets.forEach((bucket) => {
      addUsage(windowUsage, bucket.usage || {});
      Object.entries(bucket.by_model || {}).forEach(([label, count]) => {
        const entry = modelTotals[label] || { usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 }, calls: 0 };
        entry.calls += Number(count || 0);
        modelTotals[label] = entry;
      });
      Object.entries(bucket.by_model_usage || {}).forEach(([label, usage]) => {
        const entry = modelTotals[label] || { usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 }, calls: 0 };
        addUsage(entry.usage, usage || {});
        modelTotals[label] = entry;
      });
    });
    const hasWindowModels = Object.values(modelTotals).some((entry) => Number(entry.calls || 0) > 0 || usageFrom(entry.usage).total_tokens > 0);
    const totalUsage = resolveUsageTotal(windowUsage, counters);
    const modelRows = hasWindowModels
      ? modelRankRows(modelTotals)
      : modelRankRowsFromCounters(counters);

    el("usageWindow").textContent = totalUsage.total_tokens
      ? `${currentTimeRange().label} / ${fmtTokenCount(totalUsage.total_tokens)} tokens / ${fmtCost(totalUsage.cost_usd)}`
      : "no token samples";

    if (!totalUsage.total_tokens && !modelRows.length) {
      target.innerHTML = `<div class="empty pad">No model usage recorded yet</div>`;
      return;
    }

    target.innerHTML = `
      <div class="usage-summary">
        ${miniMetric("Input", fmtTokenCount(totalUsage.input_tokens), "tokens")}
        ${miniMetric("Output", fmtTokenCount(totalUsage.output_tokens), "tokens")}
        ${miniMetric("Total", fmtTokenCount(totalUsage.total_tokens), "tokens")}
        ${miniMetric("Cost", fmtCost(totalUsage.cost_usd), "estimated")}
      </div>
      <div class="usage-columns usage-model-only">
        <section>
          <div class="usage-section-title">
            <h3>Top ${fmtInt(USAGE_MODEL_LIMIT)} models by calls</h3>
            <span>selected window</span>
          </div>
          ${usageRows(modelRows, "No model calls")}
        </section>
      </div>
    `;
  }

  function emptyUsageTotal() {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 };
  }

  function modelRankRows(modelTotals) {
    return Object.entries(modelTotals || {})
      .map(([label, stats]) => ({
        label: label || "-",
        calls: Number(stats.calls || 0),
        usage: usageFrom(stats.usage || {}),
      }))
      .filter((row) => row.calls > 0 || row.usage.total_tokens > 0)
      .sort((a, b) => (b.calls - a.calls) || (b.usage.total_tokens - a.usage.total_tokens) || a.label.localeCompare(b.label))
      .slice(0, USAGE_MODEL_LIMIT)
      .map((row, index) => ({ ...row, rank: index + 1, hint: `${fmtInt(row.calls)} calls` }));
  }

  function modelRankRowsFromCounters(counters) {
    const counts = counters.by_model || {};
    const usage = counters.by_model_usage || {};
    const names = Array.from(new Set([...Object.keys(counts), ...Object.keys(usage)]));
    return modelRankRows(Object.fromEntries(names.map((name) => [
      name,
      {
        calls: Number(counts[name] || 0),
        usage: usageFrom(usage[name] || emptyUsageTotal()),
      },
    ])));
  }

  function usageRows(rows, emptyText) {
    if (!rows.length) return `<div class="empty pad-slim">${escapeHtml(emptyText)}</div>`;
    const max = Math.max(1, ...rows.map((row) => Number(row.calls || 0)));
    return `
      <div class="usage-bars">
        ${rows.map((row) => {
          const callPct = Math.max(3, (Number(row.calls || 0) / max) * 100);
          return `
            <div class="usage-row">
              <div class="usage-row-head">
                <strong class="mono" title="${escapeHtml(row.label)}">
                  <span class="usage-rank">#${fmtInt(row.rank || 0)}</span>
                  <span class="usage-model-name">${escapeHtml(row.label)}</span>
                </strong>
                <span class="usage-call-count">${escapeHtml(row.hint || "")}</span>
              </div>
              <div class="usage-track usage-track-calls" title="${escapeHtml(fmtInt(row.calls || 0))} calls">
                <span class="usage-fill calls" style="width:${callPct}%"></span>
              </div>
              <div class="usage-row-foot">
                <span title="${escapeHtml(fmtInt(row.usage.total_tokens))} tokens"><strong>${fmtTokenCount(row.usage.total_tokens)}</strong> tokens</span>
                <span title="${escapeHtml(fmtInt(row.usage.input_tokens))} input tokens">${fmtTokenCount(row.usage.input_tokens)} in</span>
                <span title="${escapeHtml(fmtInt(row.usage.output_tokens))} output tokens">${fmtTokenCount(row.usage.output_tokens)} out</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function toneForLatency(value) {
    const ms = Number(value || 0);
    if (ms >= 6000) return "danger";
    if (ms >= 2500) return "warning";
    if (ms >= 800) return "info";
    return "success";
  }

  function renderProviderHealth() {
    const providers = state.data.status?.router?.providers || {};
    const configProviders = state.data.config?.providers || {};
    const target = el("providerHealth");
    const names = providerNames(providers, configProviders);
    if (!names.length) {
      target.classList.add("empty");
      target.innerHTML = "No providers";
      return;
    }
    target.classList.remove("empty");
    const views = names
      .map((name) => providerViewModel(name))
      .sort((a, b) => providerOverviewPriority(a) - providerOverviewPriority(b) || a.name.localeCompare(b.name));
    const visible = views.slice(0, OVERVIEW_PROVIDER_LIMIT);
    target.innerHTML = `
      <div class="overview-summary-meta">
        <span>${iconSvg("server")} ${fmtInt(visible.length)} priority / ${fmtInt(views.length)} total</span>
        ${views.length > visible.length ? `<button class="overview-jump-button" type="button" data-view-target="providers" title="Open Providers" aria-label="Open Providers">${iconSvg("arrow-right")}</button>` : ""}
      </div>
      <div class="overview-provider-list">
        ${visible.map((view) => {
          const stateLabel = view.runtimeState.label;
          const keyText = `${fmtInt(view.keyStats.usable)}/${fmtInt(view.keyStats.total)}`;
          const issue = view.activity.lastError?.reason || (view.keyStats.cooldown ? `${fmtInt(view.keyStats.cooldown)} key cooldown` : "");
          return `
            <button class="overview-provider-row tone-${escapeHtml(view.runtimeState.badge)}" type="button" data-view-target="providers" title="Open providers">
              <span class="provider-status-dot ${escapeHtml(view.runtimeState.badge)}"></span>
              <span class="overview-provider-main">
                <strong class="mono">${escapeHtml(view.name)}</strong>
                <small>${issue ? highlightKeywords(issue) : escapeHtml(stateLabel)}</small>
              </span>
              <span class="overview-provider-kpi">
                <strong>${escapeHtml(keyText)}</strong>
                <small>keys</small>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
    bindViewTargetButtons();
  }

  function providerOverviewPriority(view) {
    if (view.runtimeState.id === "unavailable") return 0;
    if (view.runtimeState.id === "cooldown") return 1;
    if (view.runtimeState.id === "degraded") return 2;
    if (view.runtimeState.id === "disabled") return 3;
    if (view.activity.lastError) return 4;
    if (view.keyStats.cooldown > 0) return 5;
    return 10;
  }

  function enabledFormats(formats) {
    return Object.entries(formats || {})
      .filter(([_name, cfg]) => cfg && cfg.enabled)
      .map(([name]) => name);
  }

  function renderRecentFailures() {
    const recent = state.data.metrics?.recent_requests || [];
    const failures = recent.filter((item) => {
      if (Number(item.status_code || 0) >= 400) return true;
      return (item.attempts || []).some((a) => a.outcome !== "success");
    });
    const rows = failures.slice(0, OVERVIEW_FAILURE_LIMIT);
    const target = el("recentFailures");
    if (!rows.length) {
      target.innerHTML = `<div class="empty pad">No recent failures</div>`;
      return;
    }
    target.innerHTML = `
      <div class="overview-summary-meta">
        <span>${iconSvg("alert")} latest ${fmtInt(rows.length)} / ${fmtInt(failures.length)}</span>
        <button class="overview-jump-button" type="button" data-view-target="requests" title="Open Requests" aria-label="Open Requests">${iconSvg("arrow-right")}</button>
      </div>
      <div class="recent-failure-list">
        ${rows.map((r) => {
          const failedAttempt = (r.attempts || []).find((a) => a.outcome !== "success") || {};
          const reason = failedAttempt.reason || failedAttempt.error_type || r.error || "-";
          const finalOk = r.status === "success" || r.status === "recovered" || (Number(r.status_code || 0) > 0 && Number(r.status_code || 0) < 400);
          const tone = finalOk ? "warning" : "danger";
          return `
            <button class="recent-failure-row tone-${tone}" type="button" data-request-id="${escapeHtml(r.request_id || "")}">
              <span class="request-row-dot"></span>
              <span class="recent-failure-main">
                <strong class="mono">${escapeHtml(r.model || "-")}</strong>
                <small>${escapeHtml(fmtDate(r.finished_at))} / first byte ${escapeHtml(firstByteMsFromRequest(r) ? fmtMs(firstByteMsFromRequest(r)) : "-")}</small>
              </span>
              <span class="recent-failure-status">${statusBadge(r.status, r.status_code)}</span>
              <span class="recent-failure-reason ${escapeHtml(toneForText(reason))}">${highlightKeywords(reason)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
    target.querySelectorAll("[data-request-id]").forEach((row) => {
      row.addEventListener("click", () => {
        if (row.dataset.requestId) openRequestDetail(row.dataset.requestId);
      });
    });
    bindViewTargetButtons();
  }

  function selectAllBannerHtml(total, items) {
    const visibleIds = items.map((item) => String(item.request_id || "")).filter(Boolean);
    const selectedVisible = visibleIds.filter((id) => state.selectedRequestIds.has(id)).length;
    const allVisibleSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    if (allVisibleSelected && total > visibleIds.length) {
      if (state.allMatchingSelected) {
        return `
          <div class="request-select-all-banner">
            <span>All ${fmtInt(total)} requests matching current filters are selected.</span>
            <button type="button" class="button link-action" data-request-clear-all-matching>Clear selection</button>
          </div>
        `;
      } else {
        return `
          <div class="request-select-all-banner">
            <span>All ${fmtInt(visibleIds.length)} requests on this page are selected.</span>
            <button type="button" class="button link-action" data-request-select-all-matching>Select all ${fmtInt(total)} matching requests</button>
          </div>
        `;
      }
    }
    return "";
  }

  function renderRequestsTable() {
    const data = state.data.requests || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const sourceLabel = data.source === "sqlite" ? "sqlite history" : "memory";
    const total = Number(data.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE));
    if (total > 0 && state.requestsPage >= totalPages) {
      state.requestsPage = totalPages - 1;
      refreshAll({ quiet: true });
      return;
    }
    syncRequestFilterUi();
    const currentPage = Math.min(state.requestsPage + 1, totalPages);
    const start = total ? state.requestsPage * REQUEST_PAGE_SIZE + 1 : 0;
    const end = total ? Math.min(total, start + items.length - 1) : 0;
    el("requestCountLabel").textContent = total
      ? `${fmtInt(total)} matching records from ${sourceLabel}. Showing ${fmtInt(start)}-${fmtInt(end)}.`
      : `No matching request records from ${sourceLabel}.`;
    const target = el("requestsTable");
    if (!items.length) {
      target.innerHTML = `<div class="request-list-head">${requestPagination(total, currentPage, totalPages, items)}</div><div class="empty pad">No matching requests</div>`;
      bindRequestPagination(target, totalPages);
      updateRequestSelectionUi();
      return;
    }
    const rows = items.map(requestSummaryRow).join("");
    target.innerHTML = `
      <div class="request-list-head">${requestPagination(total, currentPage, totalPages, items)}</div>
      ${selectAllBannerHtml(total, items)}
      ${requestPageVisuals(items)}
      <div class="request-summary-list">${rows}</div>
    `;
    bindRequestRowInteractions(target);
    bindRequestSelection(target, items);
    bindRequestPagination(target, totalPages);
    updateRequestSelectionUi();
  }

  function requestPageVisuals(items) {
    const rows = Array.isArray(items) ? items : [];
    const success = rows.filter((r) => r.status === "success" || Number(r.status_code || 0) < 400).length;
    const failed = rows.length - success;
    const recovered = rows.filter((r) => r.routing_summary?.outcome === "recovered").length;
    const firstByteSamples = rows.map(firstByteMsFromRequest).filter((value) => value > 0);
    const avgFirstByte = firstByteSamples.length
      ? Math.round(firstByteSamples.reduce((sum, value) => sum + value, 0) / firstByteSamples.length)
      : null;
    const totalTokens = rows.reduce((sum, r) => sum + usageFrom(r).total_tokens, 0);
    return `
      <div class="request-page-vitals">
        ${requestVital("Success", success, rows.length, "success")}
        ${requestVital("Recovered", recovered, rows.length, "warning")}
        ${requestVital("Failed", failed, rows.length, "danger")}
        <span class="request-vital request-vital-info">${iconSvg("clock")}<strong>${avgFirstByte === null ? "-" : escapeHtml(fmtMs(avgFirstByte))}</strong><small>first byte</small></span>
        <span class="request-vital request-vital-compat">${iconSvg("activity")}<strong>${escapeHtml(fmtTokenCount(totalTokens))}</strong><small>tokens</small></span>
      </div>
    `;
  }

  function requestVital(label, value, total, tone) {
    const pct = total ? Math.max(0, Math.min(100, (Number(value || 0) / total) * 100)) : 0;
    return `
      <span class="request-vital request-vital-${escapeHtml(tone)}" style="--vital:${svgNum(pct)}%">
        ${iconSvg(tone === "success" ? "check" : tone === "danger" ? "alert" : "rotate")}
        <strong>${escapeHtml(fmtInt(value))}</strong>
        <small>${escapeHtml(label)}</small>
      </span>
    `;
  }

  function requestSummaryRow(r) {
    const usage = usageFrom(r);
    const statusTone = requestTone(r);
    const attempts = Array.isArray(r.attempts) ? r.attempts : [];
    const failedAttempts = attempts.filter((attempt) => attempt.outcome !== "success").length;
    const provider = primaryProvider(r);
    const route = r.routing_summary?.outcome || "unknown";
    const routeTone = routeOutcomeTone(route);
    const code = Number(r.status_code || 0);
    const format = r.client_format || r.endpoint || "";
    const attemptText = attempts.length
      ? `${fmtInt(attempts.length)} attempts${failedAttempts ? ` / ${fmtInt(failedAttempts)} failed` : ""}`
      : "no attempts";
    const firstByte = firstByteMsFromRequest(r);
    const requestId = String(r.request_id || "");
    const isSelected = state.allMatchingSelected || state.selectedRequestIds.has(requestId);
    const checked = isSelected ? "checked" : "";
    return `
      <article class="request-summary-row tone-${escapeHtml(statusTone)} ${isSelected ? "is-selected" : ""}" data-request-row="${escapeHtml(requestId)}" tabindex="0" role="button" aria-label="Open request ${escapeHtml(requestId)}">
        <label class="request-row-select" title="Select request" aria-label="Select request">
          <input type="checkbox" data-request-select="${escapeHtml(requestId)}" ${checked} />
        </label>
        <span class="request-row-dot"></span>
        <span class="request-row-main">
          <strong class="mono" title="${escapeHtml(r.model || "-")}">${escapeHtml(r.model || "-")}</strong>
          <small>
            <span>${escapeHtml(fmtDate(r.finished_at))}</span>
            ${format ? `<span>${escapeHtml(format)}</span>` : ""}
          </small>
        </span>
        <span class="request-row-status">
          ${statusBadge(r.status, r.status_code)}
          <small class="mono">${code || "-"}</small>
        </span>
        <span class="request-row-route">
          <span class="request-provider-pill" title="${escapeHtml(provider)}">${escapeHtml(provider)}</span>
          <span class="route-pill ${escapeHtml(routeTone)}">${escapeHtml(routeOutcomeLabel(route))}</span>
        </span>
        <span class="request-row-metrics mono">
          <strong title="${escapeHtml(fmtInt(usage.total_tokens))} tokens">${escapeHtml(fmtTokenCount(usage.total_tokens))} <span style="font-weight: normal; color: var(--muted); opacity: 0.85; margin: 0 3px;">/</span> <span style="color: #0f172a; font-weight: 700;">${escapeHtml(fmtCost(usage.cost_usd))}</span></strong>
          <small>${escapeHtml(firstByte ? fmtMs(firstByte) : "-")} first / ${escapeHtml(attemptText)}</small>
        </span>
        <span class="request-row-open">${iconSvg("chevron-right")}</span>
      </article>
    `;
  }

  function requestTone(request) {
    const code = Number(request?.status_code || 0);
    if (request?.status === "success" || (code > 0 && code < 400)) {
      return request?.routing_summary?.outcome === "recovered" ? "warning" : "success";
    }
    if (code === 429 || code === 402) return "warning";
    return "danger";
  }

  function primaryProvider(request) {
    const summaryProvider = request?.routing_summary?.final_provider;
    if (summaryProvider) return summaryProvider;
    const providers = Array.isArray(request?.providers) ? request.providers.filter(Boolean) : [];
    return providers[0] || "-";
  }

  function compactRoutingSummary(summary) {
    if (!summary || typeof summary !== "object") return badge("unknown", "neutral");
    return badge(routeOutcomeLabel(summary.outcome || "unknown"), routeOutcomeTone(summary.outcome || "unknown"));
  }

  function requestPagination(total, currentPage, totalPages, visibleItems) {
    const items = Array.isArray(visibleItems) ? visibleItems : [];
    const visibleCount = items.length;
    const start = total ? state.requestsPage * REQUEST_PAGE_SIZE + 1 : 0;
    const end = total ? Math.min(total, start + Number(visibleCount || 0) - 1) : 0;
    const visibleIds = items.map((item) => String(item.request_id || "")).filter(Boolean);
    const selectedVisible = state.allMatchingSelected ? visibleIds.length : visibleIds.filter((id) => state.selectedRequestIds.has(id)).length;
    const allVisibleSelected = state.allMatchingSelected || (visibleIds.length > 0 && selectedVisible === visibleIds.length);
    const labelText = state.allMatchingSelected ? `${fmtInt(total)} selected` : selectedVisible ? `${fmtInt(selectedVisible)} selected` : "Select page";
    return `
      <div class="request-page-summary">
        <label class="request-page-select">
          <input type="checkbox" data-request-select-page ${allVisibleSelected ? "checked" : ""} ${visibleIds.length ? "" : "disabled"} />
          <span>${labelText}</span>
        </label>
        <strong>${fmtInt(start)}-${fmtInt(end)}</strong>
        <span>of ${fmtInt(total)} requests</span>
      </div>
      <div class="request-pagination" aria-label="Request pages">
        <button class="button secondary icon-action" type="button" data-request-page="prev" title="Previous page" aria-label="Previous page" ${currentPage <= 1 ? "disabled" : ""}>${iconSvg("arrow-left")}</button>
        <span class="request-page-indicator">Page ${fmtInt(currentPage)} / ${fmtInt(totalPages)}</span>
        <button class="button secondary icon-action" type="button" data-request-page="next" title="Next page" aria-label="Next page" ${currentPage >= totalPages ? "disabled" : ""}>${iconSvg("arrow-right")}</button>
      </div>
    `;
  }

  function bindRequestRowInteractions(root) {
    root.querySelectorAll("[data-request-row]").forEach((row) => {
      const open = () => {
        const requestId = row.dataset.requestRow || "";
        if (requestId) openRequestDetail(requestId);
      };
      row.addEventListener("click", (event) => {
        if (event.target.closest(".request-row-select, input, button, a")) return;
        open();
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest(".request-row-select, input, button, a")) return;
        event.preventDefault();
        open();
      });
    });
  }

  function bindRequestSelection(root, items) {
    root.querySelectorAll("[data-request-select]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", () => {
        const requestId = input.dataset.requestSelect || "";
        if (!requestId) return;
        if (state.allMatchingSelected) {
          state.allMatchingSelected = false;
          state.selectedRequestIds.clear();
          const visibleIds = (Array.isArray(items) ? items : []).map((item) => String(item.request_id || "")).filter(Boolean);
          visibleIds.forEach((id) => {
            if (id !== requestId) state.selectedRequestIds.add(id);
          });
          renderRequestsTable();
        } else {
          if (input.checked) state.selectedRequestIds.add(requestId);
          else state.selectedRequestIds.delete(requestId);
          const row = input.closest("[data-request-row]");
          if (row) row.classList.toggle("is-selected", input.checked);
          updateRequestSelectionUi(root, items);
        }
      });
    });
    const pageInput = root.querySelector("[data-request-select-page]");
    if (pageInput) {
      const ids = (Array.isArray(items) ? items : []).map((item) => String(item.request_id || "")).filter(Boolean);
      const selected = ids.filter((id) => state.selectedRequestIds.has(id)).length;
      pageInput.indeterminate = !state.allMatchingSelected && selected > 0 && selected < ids.length;
      pageInput.addEventListener("change", () => {
        state.allMatchingSelected = false;
        ids.forEach((id) => {
          if (pageInput.checked) state.selectedRequestIds.add(id);
          else state.selectedRequestIds.delete(id);
        });
        renderRequestsTable();
      });
    }
    const selectAllBtn = root.querySelector("[data-request-select-all-matching]");
    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", () => {
        state.allMatchingSelected = true;
        state.selectedRequestIds.clear();
        renderRequestsTable();
      });
    }
    const clearAllBtn = root.querySelector("[data-request-clear-all-matching]");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", () => {
        state.allMatchingSelected = false;
        state.selectedRequestIds.clear();
        renderRequestsTable();
      });
    }
  }

  function updateRequestSelectionUi(root = el("requestsTable"), items = state.data.requests?.items || []) {
    const total = Number(state.data.requests?.total || 0);
    const count = state.allMatchingSelected ? total : state.selectedRequestIds.size;
    const countEl = el("requestSelectedCount");
    if (countEl) countEl.textContent = count ? `${fmtInt(count)} selected` : "0 selected";
    const deleteButton = el("deleteRequestsButton");
    if (deleteButton) {
      if (!deleteButton.dataset.iconified) {
        deleteButton.innerHTML = iconSvg("trash");
        deleteButton.dataset.iconified = "1";
      }
      const filters = activeRequestFilters();
      const action = count ? "Delete selected" : Object.keys(filters).length ? "Delete matching" : "Clear history";
      deleteButton.title = action;
      deleteButton.setAttribute("aria-label", action);
    }
    const ids = (Array.isArray(items) ? items : []).map((item) => String(item.request_id || "")).filter(Boolean);
    const selected = state.allMatchingSelected ? ids.length : ids.filter((id) => state.selectedRequestIds.has(id)).length;
    const pageInput = root?.querySelector?.("[data-request-select-page]");
    if (pageInput) {
      pageInput.checked = ids.length > 0 && selected === ids.length;
      pageInput.indeterminate = !state.allMatchingSelected && selected > 0 && selected < ids.length;
      const label = pageInput.closest(".request-page-select")?.querySelector("span");
      if (label) label.textContent = state.allMatchingSelected ? `${fmtInt(total)} selected` : selected ? `${fmtInt(selected)} selected` : "Select page";
    }
  }

  function syncRequestFilterUi() {
    qsa("[data-request-status]").forEach((button) => {
      const active = (button.dataset.requestStatus || "") === (state.requestFilters.status || "");
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function bindRequestPagination(root, totalPages) {
    root.querySelectorAll("[data-request-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const direction = button.dataset.requestPage;
        if (direction === "prev") state.requestsPage = Math.max(0, state.requestsPage - 1);
        if (direction === "next") state.requestsPage = Math.min(totalPages - 1, state.requestsPage + 1);
        refreshAll({ quiet: true });
      });
    });
  }

  function paginate(items, pageKey, pageSize) {
    const list = Array.isArray(items) ? items : [];
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.max(0, Math.min(Number(state[pageKey] || 0), totalPages - 1));
    if (current !== state[pageKey]) state[pageKey] = current;
    const start = total ? current * pageSize : 0;
    const end = Math.min(total, start + pageSize);
    return {
      items: list.slice(start, end),
      total,
      totalPages,
      currentPage: current + 1,
      start: total ? start + 1 : 0,
      end,
      pageSize,
    };
  }

  function panelPagination(pageKey, page, noun) {
    if (!page || page.total <= page.pageSize) return "";
    return `
      <div class="panel-pagination" data-pagination-for="${escapeHtml(pageKey)}">
        <span><strong>${fmtInt(page.start)}-${fmtInt(page.end)}</strong> of ${fmtInt(page.total)} ${escapeHtml(noun || "items")}</span>
        <div class="panel-pagination-actions">
          <button class="button secondary icon-action" type="button" data-list-page-key="${escapeHtml(pageKey)}" data-list-page="prev" title="Previous page" aria-label="Previous page" ${page.currentPage <= 1 ? "disabled" : ""}>${iconSvg("arrow-left")}</button>
          <span class="request-page-indicator">${fmtInt(page.currentPage)} / ${fmtInt(page.totalPages)}</span>
          <button class="button secondary icon-action" type="button" data-list-page-key="${escapeHtml(pageKey)}" data-list-page="next" title="Next page" aria-label="Next page" ${page.currentPage >= page.totalPages ? "disabled" : ""}>${iconSvg("arrow-right")}</button>
        </div>
      </div>
    `;
  }

  function bindPanelPagination(root) {
    root.querySelectorAll("[data-list-page-key]").forEach((button) => {
      button.addEventListener("click", () => {
        const pageKey = button.dataset.listPageKey || "";
        if (!(pageKey in state)) return;
        const direction = button.dataset.listPage;
        if (direction === "prev") state[pageKey] = Math.max(0, Number(state[pageKey] || 0) - 1);
        if (direction === "next") state[pageKey] = Number(state[pageKey] || 0) + 1;
        state.forceConfigRender = true;
        state.forceModelRoutesRender = true;
        state.forceProvidersRender = true;
        state.forceModelCapsRender = true;
        renderAll();
      });
    });
  }

  function renderProvidersTable() {
    const providers = state.data.status?.router?.providers || {};
    const configProviders = state.data.config?.providers || {};
    const target = el("providersTable");
    if (!target) return;
    const active = document.activeElement;
    if (!state.forceProvidersRender && active && active.closest("#providersTable")) return;
    state.forceProvidersRender = false;

    const cards = providerNames(providers, configProviders)
      .map((name) => providerViewModel(name))
      .filter(providerMatchesFilters);

    if (!providerNames(providers, configProviders).length) {
      target.innerHTML = `<div class="empty pad">No providers configured</div>`;
      return;
    }

    if (!cards.length) {
      target.innerHTML = `<div class="empty pad">No providers match the current filters</div>`;
      return;
    }

    const page = paginate(cards, "providersPage", PROVIDERS_PAGE_SIZE);
    target.innerHTML = `
      ${panelPagination("providersPage", page, "providers")}
      <div class="provider-card-grid">${page.items.map(providerRuntimeCard).join("")}</div>
    `;

    bindPanelPagination(target);
    bindActionButtons(target);
    bindProviderCards(target);
  }

  function providerNames(runtimeProviders, configProviders) {
    const capabilityProviders = state.data.status?.models?.providers || {};
    const mappedProviders = state.data.config?.models?.provider_model_map || {};
    return Array.from(new Set([
      ...Object.keys(runtimeProviders || {}),
      ...Object.keys(configProviders || {}),
      ...Object.keys(capabilityProviders || {}),
      ...Object.keys(mappedProviders || {}),
    ])).sort();
  }

  function providerViewModel(name) {
    const runtime = state.data.status?.router?.providers?.[name] || {};
    const config = state.data.config?.providers?.[name] || {};
    const capability = state.data.status?.models?.providers?.[name] || {};
    const formats = config.formats || runtime.formats || {};
    const runtimeKeys = Array.isArray(runtime.keys) ? runtime.keys : [];
    const configKeys = Array.isArray(config.keys) ? config.keys : [];
    const keys = mergedProviderKeys(runtimeKeys, configKeys);
    const keyStats = providerKeyStats(runtimeKeys, configKeys);
    const formatNames = enabledFormats(formats);
    const modelItems = providerModelItems(name, capability);
    const routeModels = providerRouteModels(name);
    const activity = providerActivity(name);
    const runtimeState = providerRuntimeState(runtime, keyStats, config);
    return {
      name,
      runtime,
      config,
      priority: Number(config.priority || 0),
      capability,
      formats,
      keys,
      configKeys,
      keyStats,
      formatNames,
      modelItems,
      routeModels,
      activity,
      runtimeState,
    };
  }

  function mergedProviderKeys(runtimeKeys, configKeys) {
    if (!runtimeKeys.length) return configKeys;
    const configByIndex = new Map((configKeys || []).map((key) => [Number(key.index), key]));
    return runtimeKeys.map((key) => {
      const cfg = configByIndex.get(Number(key.index)) || {};
      return {
        ...cfg,
        ...key,
        masked: key.masked || cfg.masked || "",
        proxy: key.proxy || cfg.proxy || "",
      };
    });
  }

  function providerKeyStats(runtimeKeys, configKeys) {
    const total = runtimeKeys.length || configKeys.length || 0;
    const usable = runtimeKeys.filter((key) => key.available && key.runtime_enabled).length;
    const runtimeEnabled = runtimeKeys.filter((key) => key.runtime_enabled).length;
    const cooldown = runtimeKeys.filter((key) => Number(key.cooldown_remaining_s || key.disabled_remaining_s || 0) > 0).length;
    const fails = runtimeKeys.reduce((sum, key) => sum + Number(key.fails || 0), 0);
    return { total, usable, runtimeEnabled, cooldown, fails };
  }

  function providerModelItems(name, capability) {
    const items = modelCapabilityItems(
      Array.isArray(capability.models) ? capability.models : [],
      capability.canonical_map || {},
    );
    const seen = new Set(items.map((item) => `${item.label}\n${item.raw}`));
    const configuredMap = state.data.config?.models?.provider_model_map?.[name] || {};
    Object.entries(configuredMap || {})
      .filter(([_canonical, raw]) => raw)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .forEach(([canonical, raw]) => {
        const key = `${canonical}\n${raw}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({
          label: String(canonical || raw),
          raw: String(raw || ""),
          title: raw && raw !== canonical ? `${canonical} maps to ${raw}` : String(canonical || raw),
        });
      });
    providerRouteModels(name).forEach((model) => {
      const key = `${model}\n`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label: model, raw: "", title: model });
    });
    return items;
  }

  function providerRouteModels(name) {
    const routes = state.data.config?.models?.routes || {};
    return Object.entries(routes)
      .filter(([_model, route]) => {
        const providers = routeProviderItems(route?.providers);
        return providers.some((item) => item.name === name);
      })
      .map(([model]) => String(model))
      .sort((a, b) => a.localeCompare(b));
  }

  function providerActivity(name) {
    const recent = Array.isArray(state.data.metrics?.recent_requests) ? state.data.metrics.recent_requests : [];
    const events = [];
    recent.forEach((request) => {
      const attempts = Array.isArray(request.attempts) ? request.attempts : [];
      const matched = attempts.filter((attempt) => attempt.provider === name);
      const finalProvider = request?.routing_summary?.final_provider || primaryProvider(request);
      if (!matched.length && finalProvider !== name) return;
      const successAttempt = matched.find((attempt) => attempt.outcome === "success");
      const failedAttempt = matched.slice().reverse().find((attempt) => attempt.outcome !== "success");
      const finalSuccess = request.status === "success" && finalProvider === name;
      const tone = successAttempt || finalSuccess ? "ok" : request.status === "success" ? "warn" : "bad";
      const reason = failedAttempt?.reason || failedAttempt?.error_type || request.error || request.status || "-";
      events.push({
        requestId: request.request_id || "",
        ts: Number(request.finished_at || 0),
        model: request.model || "-",
        tone,
        reason,
        latencyMs: successAttempt || finalSuccess ? firstByteMsFromRequest(request) : 0,
        status: request.status || "-",
      });
    });
    events.sort((a, b) => a.ts - b.ts);
    const clipped = events.slice(-60);
    const ok = clipped.filter((event) => event.tone === "ok").length;
    const warn = clipped.filter((event) => event.tone === "warn").length;
    const bad = clipped.filter((event) => event.tone === "bad").length;
    const latencySamples = clipped.map((event) => event.latencyMs).filter((value) => value > 0);
    const latestLatency = latencySamples.length ? latencySamples[latencySamples.length - 1] : 0;
    const avgLatency = latencySamples.length
      ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)
      : 0;
    const lastError = clipped.slice().reverse().find((event) => event.tone !== "ok");
    return {
      events: clipped,
      total: clipped.length,
      ok,
      warn,
      bad,
      successRate: clipped.length ? ok / clipped.length : null,
      latestLatency,
      avgLatency,
      lastError,
    };
  }

  function providerMatchesFilters(view) {
    const filters = state.providerFilters || {};
    if (filters.format && !view.formatNames.includes(filters.format)) return false;
    if (filters.status && view.runtimeState.id !== filters.status) return false;
    if (filters.keys === "usable" && view.keyStats.usable <= 0) return false;
    if (filters.keys === "partial" && !(view.keyStats.usable > 0 && view.keyStats.usable < view.keyStats.total)) return false;
    if (filters.keys === "none" && view.keyStats.usable > 0) return false;
    if (filters.keys === "cooldown" && view.keyStats.cooldown <= 0) return false;
    const search = String(filters.search || "").trim().toLowerCase();
    if (!search) return true;
    const haystack = [
      view.name,
      view.config.base_url,
      view.runtimeState.label,
      view.formatNames.join(" "),
      view.modelItems.map((item) => `${item.label} ${item.raw}`).join(" "),
      view.activity.lastError?.reason,
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  }

  function providerRuntimeCard(view) {
    const keyText = `${fmtInt(view.keyStats.usable)}/${fmtInt(view.keyStats.total)}`;
    const successText = view.activity.successRate === null ? "-" : fmtPct(view.activity.successRate);
    const latencyText = view.activity.latestLatency ? fmtCompactMs(view.activity.latestLatency) : "-";
    const avgLatencyText = view.activity.avgLatency ? `${fmtCompactMs(view.activity.avgLatency)} avg` : "no first byte";
    const modelCount = view.modelItems.length;
    const primaryModels = view.modelItems.slice(0, 3);
    const recentError = view.activity.lastError?.reason || "";
    const configEnabled = view.config.enabled === false ? "config off" : "config on";
    const priorityText = `P${fmtInt(view.priority)}`;
    return `
      <article class="provider-runtime-card provider-health-tile ${view.runtimeState.tone}" data-provider-card="${escapeHtml(view.name)}" tabindex="0">
        <div class="provider-card-topline">
          <span class="provider-status-dot ${view.runtimeState.badge}"></span>
          <div class="provider-title-block">
            <div class="provider-name name-${view.runtimeState.badge}" title="${escapeHtml(view.name)}">${escapeHtml(view.name)}</div>
            <div class="provider-meta">${view.formatNames.length ? view.formatNames.map(formatChip).join("") : `<span class="muted">no enabled formats</span>`}</div>
          </div>
          <div class="provider-card-badges">
            ${badge(priorityText, priorityBadgeTone(view.priority))}
            ${badge(view.runtimeState.label, view.runtimeState.badge)}
          </div>
        </div>

        <div class="provider-card-models">
          ${primaryModels.length ? primaryModels.map((item) => `<span class="provider-model-pill" title="${escapeHtml(item.title)}">${escapeHtml(item.label)}</span>`).join("") : `<span class="muted">No discovered models</span>`}
          ${modelCount > primaryModels.length ? `<span class="provider-model-more">+${fmtInt(modelCount - primaryModels.length)}</span>` : ""}
        </div>

        <div class="provider-card-metrics">
          ${providerMetric("Keys", keyText, view.keyStats.cooldown ? `${fmtInt(view.keyStats.cooldown)} cooldown` : "usable")}
          ${providerMetric("Priority", fmtInt(view.priority), "route order")}
          ${providerMetric("Models", fmtInt(modelCount), view.capability.status || "capability")}
          ${providerMetric("Success", successText, `${fmtInt(view.activity.total)} recent`)}
          ${providerMetric("First byte", latencyText, avgLatencyText)}
        </div>

        <div class="provider-card-error ${recentError ? "" : "is-empty"}">
          <span>Last issue</span>
          <strong>${recentError ? messageMarkup(recentError) : "No recent provider issue"}</strong>
        </div>

        ${providerSparkline(view.activity)}

        <div class="provider-card-footer">
          <span class="provider-config-state">${escapeHtml(configEnabled)}</span>
          <div class="provider-runtime-actions">
            <button class="button primary compact-action icon-action" type="button" data-provider-open="${escapeHtml(view.name)}" title="Details" aria-label="Details">${iconSvg("info")}</button>
            ${actionButton(view.runtime.runtime_enabled !== false ? "Disable" : "Enable", `/providers/${encodeURIComponent(view.name)}/${view.runtime.runtime_enabled !== false ? "disable" : "enable"}`, view.runtime.runtime_enabled !== false ? "danger" : "secondary", { iconOnly: true })}
            ${actionButton("Clear cooldown", `/providers/${encodeURIComponent(view.name)}/cooldown/clear`, "secondary", { iconOnly: true })}
          </div>
        </div>
      </article>
    `;
  }

  function providerMetric(label, value, hint) {
    return `
      <span class="provider-card-metric" title="${escapeHtml(`${label}: ${value} / ${hint}`)}">
        <b>${iconSvg(metricIcon(label))}</b>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </span>
    `;
  }

  function metricIcon(label) {
    const text = String(label || "").toLowerCase();
    if (text.includes("key")) return "key";
    if (text.includes("priority")) return "arrow-up";
    if (text.includes("model")) return "boxes";
    if (text.includes("success")) return "activity";
    if (text.includes("latency")) return "clock";
    return "dot";
  }

  function formatChip(fmt) {
    return `<span class="format-chip tone-${escapeHtml(toneForText(fmt))}" title="${escapeHtml(formatLabel(fmt))}">${escapeHtml(shortFormatLabel(fmt))}</span>`;
  }

  function shortFormatLabel(fmt) {
    if (fmt === "chat_completions") return "Chat";
    if (fmt === "responses") return "Responses";
    if (fmt === "anthropic_messages") return "Anthropic";
    return String(fmt || "");
  }

  function providerSparkline(activity) {
    const events = activity.events.length ? activity.events : Array.from({ length: 24 }, () => ({ tone: "neutral", reason: "No recent calls" }));
    return `
      <div class="provider-sparkline" aria-label="Recent provider attempts">
        ${events.map((event) => `
          <span class="provider-spark ${escapeHtml(event.tone)}" title="${escapeHtml(`${fmtDate(event.ts)} / ${event.model || "-"} / ${event.reason || event.status || "-"}`)}"></span>
        `).join("")}
      </div>
    `;
  }

  function bindProviderCards(target) {
    target.querySelectorAll("[data-provider-open]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openProviderDrawer(button.dataset.providerOpen || "");
      });
    });
    target.querySelectorAll("[data-provider-card]").forEach((card) => {
      const open = () => openProviderDrawer(card.dataset.providerCard || "");
      card.addEventListener("click", (event) => {
        if (event.target.closest("button, input, select, textarea, a, summary, details, form")) return;
        open();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("button, input, select, textarea, a")) return;
        event.preventDefault();
        open();
      });
    });
  }

  function syncProviderFiltersFromControls() {
    state.providerFilters = {
      search: el("providerSearchInput")?.value || "",
      format: el("providerFormatFilter")?.value || "",
      status: el("providerStatusFilter")?.value || "",
      keys: el("providerKeyFilter")?.value || "",
    };
    state.providersPage = 0;
    state.forceProvidersRender = true;
    renderProvidersTable();
  }

  function clearProviderFilters() {
    ["providerSearchInput", "providerFormatFilter", "providerStatusFilter", "providerKeyFilter"].forEach((id) => {
      const node = el(id);
      if (node) node.value = "";
    });
    syncProviderFiltersFromControls();
  }

  function openProviderDrawer(name, tab = "") {
    if (!name) return;
    state.providerDrawerName = name;
    if (tab) state.providerDrawerTab = tab;
    const drawer = el("providerDrawer");
    if (!drawer) return;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    renderProviderDrawer({ force: true });
  }

  function closeProviderDrawer() {
    const drawer = el("providerDrawer");
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    state.providerDrawerName = "";
  }

  function renderProviderDrawer({ force = false } = {}) {
    const drawer = el("providerDrawer");
    const body = el("providerDrawerBody");
    const name = state.providerDrawerName;
    if (!drawer || !body || !name || !drawer.classList.contains("is-open")) return;
    const active = document.activeElement;
    if (!force && active && active.closest("#providerDrawer form")) return;
    const view = providerViewModel(name);
    const tabs = ["overview", "keys", "formats", "models", "routing", "config"];
    if (!tabs.includes(state.providerDrawerTab)) state.providerDrawerTab = "overview";
    el("providerDrawerTitle").textContent = name;
    el("providerDrawerSubtitle").textContent = `${view.runtimeState.label} / ${view.keyStats.usable}/${view.keyStats.total} usable keys / ${fmtInt(view.modelItems.length)} models`;
    body.innerHTML = `
      <div class="provider-drawer-tabs" role="tablist" aria-label="Provider detail sections">
        ${tabs.map((tab) => `
          <button class="provider-drawer-tab ${state.providerDrawerTab === tab ? "is-active" : ""}" type="button" data-provider-drawer-tab="${escapeHtml(tab)}">
            ${escapeHtml(capitalize(tab))}
          </button>
        `).join("")}
      </div>
      ${providerDrawerPanel(view)}
    `;
    bindProviderDrawerEvents(body);
  }

  function bindProviderDrawerEvents(root) {
    root.querySelectorAll("[data-provider-drawer-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.providerDrawerTab = button.dataset.providerDrawerTab || "overview";
        renderProviderDrawer({ force: true });
      });
    });
    root.querySelectorAll(".provider-activity-row[data-request-id]").forEach((button) => {
      button.addEventListener("click", () => openRequestDetail(button.dataset.requestId || ""));
    });
    bindKeyDeleteButtons(root);
    bindProbeModelPickers(root);
    bindKeyTestButtons(root);
    bindActionButtons(root);
    bindConfigProviderForms(root);
    bindProviderModelRefreshButtons(root);

    // static_models form
    root.querySelectorAll(".config-static-models-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const provider = form.dataset.provider || "";
        const raw = String(form.elements.static_models.value || "").trim();
        const additions = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const existing = state.data.config?.providers?.[provider]?.static_models || [];
        const seen = new Set();
        const models = [];
        [...(Array.isArray(existing) ? existing : []), ...additions].forEach((model) => {
          const value = String(model || "").trim();
          if (!value || seen.has(value)) return;
          seen.add(value);
          models.push(value);
        });
        await runConfigMutation(form, async () => {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: models });
          setNotice(`Static models for ${provider} saved.`, "ok");
          form.elements.static_models.value = "";
          await refreshAll({ quiet: true, preserveNotice: true });
          renderProviderDrawer({ force: true });
        });
      });
    });
    root.querySelectorAll("[data-clear-static-models]").forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = button.dataset.clearStaticModels || "";
        button.disabled = true;
        try {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: [] });
          setNotice(`Static models for ${provider} cleared.`, "ok");
          await refreshAll({ quiet: true, preserveNotice: true });
          renderProviderDrawer({ force: true });
        } catch (err) {
          setNotice(`Failed: ${err.message}`);
        } finally {
          button.disabled = false;
        }
      });
    });
    root.querySelectorAll("[data-delete-static-model]").forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = button.dataset.deleteStaticProvider || "";
        const model = button.dataset.deleteStaticModel || "";
        const existing = state.data.config?.providers?.[provider]?.static_models || [];
        const models = (Array.isArray(existing) ? existing : []).filter((item) => String(item || "") !== model);
        button.disabled = true;
        try {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: models });
          setNotice(`Static model ${model} removed from ${provider}.`, "ok");
          await refreshAll({ quiet: true, preserveNotice: true });
          renderProviderDrawer({ force: true });
        } catch (err) {
          setNotice(`Failed: ${err.message}`);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function providerDrawerPanel(view) {
    if (state.providerDrawerTab === "keys") return providerDrawerKeys(view);
    if (state.providerDrawerTab === "formats") return providerDrawerFormats(view);
    if (state.providerDrawerTab === "models") return providerDrawerModels(view);
    if (state.providerDrawerTab === "routing") return providerDrawerRouting(view);
    if (state.providerDrawerTab === "config") return providerDrawerConfig(view);
    return providerDrawerOverview(view);
  }

  function providerDrawerOverview(view) {
    const recent = view.activity.events.slice(-10).reverse();
    return `
      <section class="provider-drawer-section">
        <div class="provider-detail-hero ${view.runtimeState.tone}">
          <div>
            <span class="provider-status-dot ${view.runtimeState.badge}"></span>
            <strong>${escapeHtml(view.runtimeState.label)}</strong>
            <p>${escapeHtml(view.config.base_url || "No base_url configured")}</p>
          </div>
          <div class="runtime-state-strip">
            ${providerStateChips(view)}
          </div>
        </div>
        <div class="provider-detail-metrics">
          ${miniMetric("Keys", `${fmtInt(view.keyStats.usable)}/${fmtInt(view.keyStats.total)}`, "usable")}
          ${miniMetric("Priority", fmtInt(view.priority), "higher first")}
          ${miniMetric("Success", view.activity.successRate === null ? "-" : fmtPct(view.activity.successRate), `${fmtInt(view.activity.total)} recent`)}
          ${miniMetric("Avg first byte", view.activity.avgLatency ? fmtMs(view.activity.avgLatency) : "-", "successful calls")}
          ${miniMetric("Last first byte", view.activity.latestLatency ? fmtMs(view.activity.latestLatency) : "-", "latest success")}
        </div>
        <h3 class="drawer-section-title">Recent provider activity</h3>
        <div class="provider-activity-list">
          ${recent.length ? recent.map(providerActivityRow).join("") : `<div class="empty pad-slim">No recent calls for this provider</div>`}
        </div>
      </section>
    `;
  }

  function providerDrawerKeys(view) {
    return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Usable", fmtInt(view.keyStats.usable), "keys")}
          ${miniMetric("Runtime on", fmtInt(view.keyStats.runtimeEnabled), "keys")}
          ${miniMetric("Cooldown", fmtInt(view.keyStats.cooldown), "keys")}
          ${miniMetric("Fails", fmtInt(view.keyStats.fails), "runtime")}
        </div>
        <div class="provider-key-list drawer-key-list">
          ${view.keys.length ? view.keys.map((key) => keyCard(view.name, key, view.keyStats.total)).join("") : `<div class="empty pad-slim">No keys configured</div>`}
        </div>
      </section>
    `;
  }

  function providerDrawerFormats(view) {
    const rows = Object.entries(view.formats || {}).sort();
    return `
      <section class="provider-drawer-section">
        <div class="format-route-list drawer-format-list">
          ${formatRouteItems(view.formats)}
        </div>
        <h3 class="drawer-section-title">Format paths</h3>
        <div class="provider-format-edit-list">
          ${rows.length ? rows.map(([fmt, cfg]) => formatEditRow(view.name, fmt, cfg || {})).join("") : `<div class="empty pad-slim">No format routes configured</div>`}
        </div>
      </section>
    `;
  }

  function providerDrawerModels(view) {
    const capability = view.capability || {};
    const modelItems = view.modelItems;
    const staticModels = [];
    const seenStatic = new Set();
    (Array.isArray(view.config.static_models) ? view.config.static_models : []).forEach((model) => {
      const value = String(model || "").trim();
      if (!value || seenStatic.has(value)) return;
      seenStatic.add(value);
      staticModels.push(value);
    });
    return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Capability", capability.status || "not fetched", "models endpoint")}
          ${miniMetric("Models", fmtInt(modelItems.length), "canonical/raw")}
          ${miniMetric("Fetched", capability.fetched_at ? fmtDate(capability.fetched_at) : "-", "snapshot")}
          ${miniMetric("Routes", fmtInt(view.routeModels.length), "configured")}
        </div>
        ${capability.error ? `<div class="model-capability-error">${messageMarkup(capability.error)}</div>` : ""}
        <div class="model-chip-list provider-drawer-models">
          ${modelItems.length ? modelItems.map((item) => `
            <span class="model-map-chip" title="${escapeHtml(item.title)}">
              <b>${escapeHtml(item.label)}</b>
              ${item.raw && item.raw !== item.label ? `<small>${escapeHtml(item.raw)}</small>` : ""}
            </span>
          `).join("") : `<span class="muted">No discovered or mapped models</span>`}
        </div>
        <div class="provider-models-actions">
          <button class="button secondary icon-action" type="button"
            data-provider-models-refresh="${escapeHtml(view.name)}"
            title="Refresh models"
            aria-label="Refresh models">${iconSvg("rotate")}</button>
        </div>
        <h3 class="drawer-section-title">Static models (fallback when /v1/models unreachable)</h3>
        <form class="config-static-models-form" data-provider="${escapeHtml(view.name)}">
          ${staticModels.length ? `
            <div class="model-chip-list static-model-chip-list">
              ${staticModels.map((model) => `
                <span class="model-map-chip static-model-chip">
                  <b>${escapeHtml(model)}</b><small>static</small>
                  <button class="static-model-delete" type="button"
                    title="Remove ${escapeHtml(model)}"
                    aria-label="Remove ${escapeHtml(model)}"
                    data-delete-static-provider="${escapeHtml(view.name)}"
                    data-delete-static-model="${escapeHtml(model)}">x</button>
                </span>
              `).join("")}
            </div>
          ` : `<span class="muted">No static models configured</span>`}
          <div class="form-row">
            <label for="static-models-${escapeHtml(view.name)}">Add model IDs</label>
            <input id="static-models-${escapeHtml(view.name)}" name="static_models" type="text"
              placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
              value=""
              style="font-family:monospace;width:100%">
            <small class="muted">Comma-separated. New entries are appended and de-duplicated.</small>
          </div>
          <div class="form-actions">
            <button class="button small" type="submit">Add models</button>
            ${staticModels.length ? `<button class="button small secondary" type="button" data-clear-static-models="${escapeHtml(view.name)}">Clear</button>` : ""}
          </div>
        </form>
      </section>
    `;
  }

  function providerDrawerRouting(view) {
    const routing = state.data.config?.routing || {};
    const defaultPool = Array.isArray(routing.default_provider_pool) ? routing.default_provider_pool : [];
    const routeRows = providerRoutingRows(view.name);
    return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Default pool", defaultPool.includes(view.name) ? "yes" : "no", routing.provider_select || "priority_failover")}
          ${miniMetric("Priority", fmtInt(view.priority), "provider")}
          ${miniMetric("Route models", fmtInt(routeRows.length), "explicit")}
          ${miniMetric("Provider select", routing.provider_select || "priority_failover", "default")}
          ${miniMetric("Max attempts", fmtInt(routing.max_attempts), "request")}
        </div>
        <div class="provider-route-list">
          ${routeRows.length ? routeRows.map((row) => `
            <article class="provider-route-card">
              <div>
                <strong class="mono">${escapeHtml(row.model)}</strong>
                <small>${escapeHtml(row.providerText)}</small>
              </div>
              ${badge(row.select || routing.provider_select || "priority_failover", "info")}
            </article>
          `).join("") : `<div class="empty pad-slim">No explicit model route includes this provider</div>`}
        </div>
      </section>
    `;
  }

  function providerDrawerConfig(view) {
    return `
      <section class="provider-drawer-section">
        ${providerEditPanel(view.name, view.config, view.configKeys, view.formats, { includeFormats: false })}
        <div class="provider-danger-zone">
          <div>
            <strong>Delete provider</strong>
            <p>Remove this provider from config, route pools, model maps, and capability snapshots.</p>
          </div>
          <button class="button danger icon-action" type="button" data-provider-delete="${escapeHtml(view.name)}" title="Delete provider" aria-label="Delete provider">${iconSvg("trash")}</button>
        </div>
      </section>
    `;
  }

  function providerRoutingRows(name) {
    const routes = state.data.config?.models?.routes || {};
    return Object.entries(routes)
      .map(([model, route]) => {
        const providers = routeProviderItems(route?.providers);
        return {
          model,
          select: route?.provider_select || "",
          providers,
          providerText: providers.map((item) => `${item.name}:${item.weight}${item.priority !== null && item.priority !== undefined ? `:${item.priority}` : ""}`).join(", "),
        };
      })
      .filter((row) => row.providers.some((item) => item.name === name))
      .sort((a, b) => a.model.localeCompare(b.model));
  }

  function providerActivityRow(event) {
    return `
      <button class="provider-activity-row ${escapeHtml(event.tone)}" type="button" ${event.requestId ? `data-request-id="${escapeHtml(event.requestId)}"` : ""}>
        <span class="provider-status-dot ${escapeHtml(event.tone)}"></span>
        <strong>${escapeHtml(event.model || "-")}</strong>
        <small>${escapeHtml(fmtDate(event.ts))}</small>
        <span>${messageMarkup(event.reason || event.status || "-")}</span>
        <em>${event.latencyMs ? escapeHtml(fmtMs(event.latencyMs)) : "-"}</em>
      </button>
    `;
  }

  function providerStateChips(view) {
    const runtimeOn = view.runtime.runtime_enabled !== false;
    const configOn = view.config.enabled !== false && view.runtime.config_enabled !== false;
    return [
      badge(configOn ? "config on" : "config off", configOn ? "ok" : "bad"),
      badge(runtimeOn ? "runtime on" : "runtime off", runtimeOn ? "ok" : "bad"),
      badge(view.runtime.available ? "available" : "not available", view.runtime.available ? "ok" : "warn"),
      badge(`${fmtInt(view.runtime.cooldown_remaining_s)}s cooldown`, Number(view.runtime.cooldown_remaining_s || 0) > 0 ? "warn" : "neutral"),
    ].join(" ");
  }

  function capitalize(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }

  function renderModelCapabilities() {
    const target = el("modelCapabilities");
    if (!target) return;
    const active = document.activeElement;
    if (!state.forceModelCapsRender && active && active.closest("#providersView")) return;
    state.forceModelCapsRender = false;
    const snapshot = state.data.status?.models || {};
    const providers = snapshot.providers || {};
    const configProviders = state.data.config?.providers || {};
    const names = Array.from(new Set([...Object.keys(configProviders), ...Object.keys(providers)])).sort();
    const unionCount = Array.isArray(snapshot.union_model_ids) ? snapshot.union_model_ids.length : 0;
    const header = `
      <div class="model-capability-summary">
        ${miniMetric("Models source", snapshot.models_source || "-", "config")}
        ${miniMetric("Union models", fmtInt(unionCount), "canonical ids")}
        ${miniMetric("Providers", fmtInt(names.length), "configured")}
      </div>
    `;

    if (!names.length) {
      target.classList.add("empty");
      target.innerHTML = `${header}<div class="pad-slim">No providers configured</div>`;
      return;
    }

    target.classList.remove("empty");
    target.innerHTML = `${header}${names.map((name) => modelCapabilityCard(name, providers[name] || {}, configProviders[name] || {})).join("")}`;
  }

  function modelCapabilityCard(name, capability, providerConfig) {
    const status = capability.status || "not_fetched";
    const tone = status === "ok" ? "success" : status === "error" ? "danger" : "neutral";
    const models = Array.isArray(capability.models) ? capability.models : [];
    const canonicalMap = capability.canonical_map || {};
    const mapEntries = Object.entries(canonicalMap).sort();
    const modelItems = modelCapabilityItems(models, canonicalMap);
    const formats = Array.isArray(capability.formats) && capability.formats.length
      ? capability.formats
      : enabledFormats(providerConfig.formats || {});
    return `
      <article class="model-capability-card tone-${toneForText(status)}">
        <div class="provider-runtime-head">
          <div class="provider-title-block">
            <div class="provider-name">${escapeHtml(name)}</div>
            <div class="provider-meta">${chipList(formats, "no enabled formats")}</div>
          </div>
          ${badge(status, tone === "success" ? "ok" : tone === "danger" ? "bad" : "neutral")}
        </div>
        <div class="provider-metrics">
          ${miniMetric("Models", fmtInt(modelItems.length), "available")}
          ${miniMetric("Mapped", fmtInt(mapEntries.length), "canonical ids")}
          ${miniMetric("Fetched", capability.fetched_at ? fmtDate(capability.fetched_at) : "-", "snapshot")}
          ${miniMetric("Config", providerConfig.enabled === false ? "off" : "on", "provider")}
        </div>
        ${capability.error ? `<div class="model-capability-error">${messageMarkup(capability.error)}</div>` : ""}
        <div class="model-chip-list">
          ${modelItems.length ? modelItems.slice(0, 18).map((item) => `
            <span class="model-map-chip" data-model-name="${escapeHtml(item.label)}" title="${escapeHtml(item.title)}">
              <b>${escapeHtml(item.label)}</b>
              ${item.raw && item.raw !== item.label ? `<small>${escapeHtml(item.raw)}</small>` : ""}
            </span>
          `).join("") : `<span class="muted">No discovered models</span>`}
          ${modelItems.length > 18 ? `<span class="tag">+${fmtInt(modelItems.length - 18)} more</span>` : ""}
        </div>
      </article>
    `;
  }

  function modelCapabilityItems(models, canonicalMap) {
    const items = [];
    const seen = new Set();
    const push = (label, raw) => {
      const safeLabel = String(label || raw || "").trim();
      const safeRaw = String(raw || "").trim();
      if (!safeLabel) return;
      const key = `${safeLabel}\n${safeRaw}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        label: safeLabel,
        raw: safeRaw,
        title: safeRaw && safeRaw !== safeLabel ? `${safeLabel} maps to ${safeRaw}` : safeLabel,
      });
    };
    Object.entries(canonicalMap || {})
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .forEach(([canonical, raw]) => push(canonical, raw));
    (Array.isArray(models) ? models : [])
      .slice()
      .sort((a, b) => String(a).localeCompare(String(b)))
      .forEach((model) => push(model, model));
    return items;
  }

  function bindProviderEditDrawers(target) {
    target.querySelectorAll(".provider-runtime-details").forEach((drawer) => {
      drawer.addEventListener("toggle", () => {
        const provider = drawer.dataset.provider || "";
        if (!provider) return;
        if (drawer.open) {
          state.openProviderDetails.add(provider);
        } else {
          state.openProviderDetails.delete(provider);
          state.openProviderEditors.delete(provider);
        }
      });
    });

    target.querySelectorAll(".provider-edit-drawer").forEach((drawer) => {
      drawer.addEventListener("toggle", () => {
        const provider = drawer.dataset.provider || "";
        if (!provider) return;
        if (drawer.open) {
          state.openProviderEditors.add(provider);
        } else {
          state.openProviderEditors.delete(provider);
        }
      });
    });
  }

  function providerEditPanel(name, provider, keys, formats, options = {}) {
    const includeFormats = options.includeFormats !== false;
    return `
      <div class="provider-edit-panel">
        <form class="config-provider-form provider-inline-form" data-provider="${escapeHtml(name)}">
          <label class="field">
            <span>Base URL</span>
            <input class="control" name="base_url" value="${escapeHtml(provider.base_url || "")}" placeholder="https://api.example.com" required />
          </label>
          <label class="field">
            <span>Proxy</span>
            <input class="control" name="proxy" value="${escapeHtml(provider.proxy || "")}" placeholder="direct or http://127.0.0.1:8002" />
          </label>
          <label class="field">
            <span>User-Agent override</span>
            <input class="control" name="user_agent" value="${escapeHtml(provider.user_agent || "")}" placeholder="inherit client User-Agent" />
          </label>
          <label class="field">
            <span>Priority</span>
            <input class="control" name="priority" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(provider.priority ?? 0)}" />
          </label>
          <label class="check-field">
            <input type="checkbox" name="enabled" ${provider.enabled === false ? "" : "checked"} />
            <span>Enabled in config</span>
          </label>
          <button class="button primary" type="submit">Save config</button>
        </form>
        <div class="key-proxy-list">
          ${keys.length ? keys.map((key) => keyProxyRow(name, key)).join("") : `<span class="muted">No config keys</span>`}
        </div>
        <form class="config-key-form provider-inline-key-form" data-provider="${escapeHtml(name)}">
          <input class="control" name="key" type="password" autocomplete="off" placeholder="new api key" required />
          <input class="control" name="proxy" placeholder="optional key proxy" />
          <button class="button secondary" type="submit">Add key</button>
        </form>
        ${includeFormats ? `<div class="format-edit-list provider-format-edit-list">
          ${["chat_completions", "responses", "anthropic_messages"].map((fmt) => formatEditRow(name, fmt, formats[fmt] || {})).join("")}
        </div>` : ""}
      </div>
    `;
  }

  function keyProxyRow(provider, key) {
    const proxy = proxyText(key.proxy);
    return `
      <form class="key-proxy-row" data-provider="${escapeHtml(provider)}" data-key-index="${escapeHtml(key.index)}">
        <div class="key-proxy-id">
          <strong class="mono">key ${escapeHtml(key.index)}</strong>
          <span title="${escapeHtml(key.key_id || "")}">${escapeHtml(key.masked || key.key_id || "-")}</span>
        </div>
        <label class="field key-proxy-field">
          <span>Key proxy</span>
          <input class="control" name="proxy" value="${escapeHtml(proxy)}" placeholder="inherit provider/global" />
        </label>
        <button class="button secondary compact-action" type="submit">Save</button>
      </form>
    `;
  }

  function providerRuntimeState(p = {}, keyStats = null, config = {}) {
    const stats = keyStats || providerKeyStats(Array.isArray(p.keys) ? p.keys : [], []);
    const enabled = p.enabled !== false && p.config_enabled !== false && p.runtime_enabled !== false && config.enabled !== false;
    const providerCooldown = Number(p.cooldown_remaining_s || 0);
    if (!enabled) return { id: "disabled", label: "disabled", tone: "is-disabled", badge: "bad" };
    if (providerCooldown > 0) return { id: "cooldown", label: "cooldown", tone: "is-cooldown", badge: "warn" };
    if (stats.total > 0 && stats.usable <= 0) {
      if (stats.cooldown > 0) return { id: "cooldown", label: "key cooldown", tone: "is-cooldown", badge: "warn" };
      return { id: "unavailable", label: "no usable key", tone: "is-unavailable", badge: "bad" };
    }
    if (p.available) {
      if (stats.total > 0 && stats.usable < stats.total) {
        return { id: "degraded", label: "degraded", tone: "is-degraded", badge: "warn" };
      }
      return { id: "normal", label: "normal", tone: "is-available", badge: "ok" };
    }
    return { id: "unavailable", label: "unavailable", tone: "is-unavailable", badge: "warn" };
  }

  function miniMetric(label, value, hint) {
    return `
      <div class="mini-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </div>
    `;
  }

  function compactStat(label, value, hint) {
    return `
      <span class="compact-stat">
        <b>${escapeHtml(label)}</b>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </span>
    `;
  }

  function formatRouteItems(formats) {
    const rows = Object.entries(formats || {}).sort();
    if (!rows.length) return `<span class="empty">No format routes</span>`;
    return rows.map(([name, cfg]) => `
      <span class="format-route ${cfg?.enabled ? "enabled" : "disabled"}">
        <b>${escapeHtml(name)}</b>
        <small>${escapeHtml(cfg?.path || "-")}</small>
      </span>
    `).join("");
  }

  function stateBadges(p) {
    const parts = [];
    parts.push(badge(p.config_enabled ? "config on" : "config off", p.config_enabled ? "ok" : "bad"));
    parts.push(badge(p.runtime_enabled ? "runtime on" : "runtime off", p.runtime_enabled ? "ok" : "bad"));
    parts.push(badge(p.available ? "available" : "unavailable", p.available ? "ok" : "warn"));
    return parts.join(" ");
  }

  function probeBadge(provider, keyIndex) {
    const probe = state.keyProbes[`${provider}#${keyIndex}`];
    if (!probe) return "";
    if (probe.pending) return badge("testing", "info");
    if (probe.ok) {
      const lat = probe.latency_ms != null ? ` ${fmtInt(probe.latency_ms)}ms` : "";
      return badge(`probe ok${lat}`, "ok");
    }
    const detail = probe.http_status ? ` ${fmtInt(probe.http_status)}` : probe.error_type ? ` ${probe.error_type}` : "";
    return badge(`probe fail${detail}`, "bad");
  }

  function providerProbeModelOptions(provider) {
    const values = [];
    const seen = new Set();
    const add = (value) => {
      const text = String(value || "").trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      values.push(text);
    };
    const caps = state.data.status?.models?.providers?.[provider] || state.data.status?.models?.providers?.[String(provider)] || {};
    Object.keys(caps.canonical_map || {}).forEach(add);
    (caps.models || []).forEach(add);
    const configProvider = state.data.config?.providers?.[provider] || {};
    (configProvider.static_models || []).forEach(add);
    const providerModelMap = state.data.config?.models?.provider_model_map?.[provider] || {};
    Object.keys(providerModelMap || {}).forEach(add);
    providerRouteModels(provider).forEach(add);
    return values.sort((a, b) => a.localeCompare(b));
  }

  function probeModelSelect(provider, keyIndex) {
    const options = providerProbeModelOptions(provider);
    const probeKey = `${provider}#${keyIndex}`;
    const selected = options[0] || "";
    const optionHtml = options.length
      ? options.map((model, index) => `
        <button class="key-probe-option ${index === 0 ? "is-selected" : ""}" type="button" data-probe-model-option="${escapeHtml(model)}" title="${escapeHtml(model)}">
          <span>${escapeHtml(model)}</span>
        </button>
      `).join("")
      : `<div class="key-probe-empty">No discovered models</div>`;
    return `
      <div class="key-probe-model" data-probe-model-picker>
        <button class="control compact-control key-probe-trigger" type="button" data-probe-model-trigger title="${escapeHtml(selected || "No discovered models")}" ${options.length ? "" : "disabled"}>
          <span data-probe-model-label>${escapeHtml(selected || "No discovered models")}</span>
        </button>
        <input type="hidden" data-key-test-model="${escapeHtml(probeKey)}" value="${escapeHtml(selected)}" />
        <div class="key-probe-menu" data-probe-model-menu hidden>
          <input class="control key-probe-search" type="search" data-probe-model-search placeholder="Filter models" autocomplete="off" />
          <div class="key-probe-option-list" data-probe-model-options>
            ${optionHtml}
          </div>
        </div>
      </div>
    `;
  }

  function keyCard(provider, key, totalKeys = 0) {
    const available = key.available && key.runtime_enabled;
    const tone = available ? "ok" : key.runtime_enabled ? "warn" : "bad";
    return `
      <article class="provider-key-card" data-key-total="${escapeHtml(totalKeys)}">
        <div class="key-card-head">
          <div>
            <div class="mono key-title">key ${escapeHtml(key.index)}</div>
            <div class="provider-meta" title="${escapeHtml(key.key_id || "")}">${escapeHtml(key.masked || key.key_id || "-")}</div>
          </div>
          <div class="key-card-badges">
            ${probeBadge(provider, key.index)}
            ${badge(available ? "available" : key.runtime_enabled ? "cooldown" : "disabled", tone)}
          </div>
        </div>
        <div class="key-card-grid">
          <span>fails</span><strong>${fmtInt(key.fails)}</strong>
          <span>cooldown</span><strong>${fmtInt(key.cooldown_remaining_s)}s</strong>
          <span>disabled</span><strong>${fmtInt(key.disabled_remaining_s)}s</strong>
        </div>
        <div class="actions key-actions">
          ${probeModelSelect(provider, key.index)}
          <button
            class="button secondary icon-action"
            type="button"
            data-key-test-provider="${escapeHtml(provider)}"
            data-key-test-index="${escapeHtml(key.index)}"
            title="Test key"
            aria-label="Test key"
            ${providerProbeModelOptions(provider).length ? "" : "disabled"}
          >${iconSvg("bolt")}</button>
          ${actionButton(key.runtime_enabled ? "Disable key" : "Enable key", `/providers/${encodeURIComponent(provider)}/keys/${key.index}/${key.runtime_enabled ? "disable" : "enable"}`, key.runtime_enabled ? "danger" : "secondary", { iconOnly: true })}
          ${actionButton("Clear key state", `/providers/${encodeURIComponent(provider)}/keys/${key.index}/state/clear`, "secondary", { iconOnly: true })}
          <button
            class="button danger icon-action"
            type="button"
            data-key-delete-provider="${escapeHtml(provider)}"
            data-key-delete-index="${escapeHtml(key.index)}"
            data-key-delete-total="${escapeHtml(totalKeys)}"
            data-key-delete-label="${escapeHtml(key.masked || key.key_id || `key ${key.index}`)}"
            title="Delete key"
            aria-label="Delete key"
          >${iconSvg("trash")}</button>
        </div>
      </article>
    `;
  }

  function actionButton(label, path, tone, options = {}) {
    const iconOnly = Boolean(options.iconOnly);
    const classes = `button ${tone || "secondary"}${iconOnly ? " icon-action" : ""}`;
    const content = iconOnly
      ? iconSvg(actionIcon(label))
      : escapeHtml(label);
    return `<button class="${classes}" type="button" data-action-path="${escapeHtml(path)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${content}</button>`;
  }

  function actionIcon(label) {
    const text = String(label || "").toLowerCase();
    if (text.includes("delete")) return "trash";
    if (text.includes("disable")) return "power-off";
    if (text.includes("enable")) return "power";
    if (text.includes("clear")) return "rotate";
    if (text.includes("refresh")) return "rotate";
    if (text.includes("edit")) return "pencil";
    if (text.includes("config")) return "settings";
    if (text.includes("save")) return "check";
    if (text.includes("detail")) return "info";
    return "dot";
  }

  function iconSvg(name) {
    const icons = {
      info: `<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7.5h.01"></path>`,
      "power": `<path d="M12 3v8"></path><path d="M17.7 6.3a8 8 0 1 1-11.4 0"></path>`,
      "power-off": `<path d="M12 3v4"></path><path d="M6.3 6.3a8 8 0 0 0 11.4 11.4"></path><path d="M18.7 13.8a8 8 0 0 0-2.4-7.5"></path><path d="M4 4l16 16"></path>`,
      rotate: `<path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path>`,
      trash: `<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path>`,
      check: `<path d="M5 12l4 4L19 6"></path>`,
      key: `<circle cx="7.5" cy="12.5" r="3.5"></circle><path d="M11 12.5h9"></path><path d="M16 12.5v3"></path><path d="M19 12.5v2"></path>`,
      activity: `<path d="M3 12h4l3-7 4 14 3-7h4"></path>`,
      alert: `<path d="M12 3 2.8 20h18.4L12 3z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`,
      gauge: `<path d="M4 14a8 8 0 1 1 16 0"></path><path d="M12 14l4-4"></path><path d="M7 14h.01"></path><path d="M17 14h.01"></path>`,
      layers: `<path d="M12 3 3 8l9 5 9-5-9-5z"></path><path d="M3 12l9 5 9-5"></path><path d="M3 16l9 5 9-5"></path>`,
      server: `<rect x="4" y="4" width="16" height="6" rx="2"></rect><rect x="4" y="14" width="16" height="6" rx="2"></rect><path d="M8 7h.01"></path><path d="M8 17h.01"></path><path d="M12 7h4"></path><path d="M12 17h4"></path>`,
      "arrow-left": `<path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path>`,
      "arrow-right": `<path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path>`,
      "arrow-up": `<path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path>`,
      boxes: `<path d="M4 7l8-4 8 4-8 4-8-4z"></path><path d="M4 7v10l8 4 8-4V7"></path><path d="M12 11v10"></path>`,
      "chevron-right": `<path d="M9 18l6-6-6-6"></path>`,
      clock: `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>`,
      filter: `<path d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path>`,
      pencil: `<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path>`,
      search: `<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>`,
      settings: `<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path><path d="M4 12h2"></path><path d="M18 12h2"></path><path d="M12 4v2"></path><path d="M12 18v2"></path><path d="M5.6 5.6 7 7"></path><path d="M17 17l1.4 1.4"></path><path d="M18.4 5.6 17 7"></path><path d="M7 17l-1.4 1.4"></path>`,
      dot: `<circle cx="12" cy="12" r="2"></circle>`,
      bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"></path>`,
    };
    return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.dot}</svg>`;
  }

  function bindActionButtons(root) {
    root.querySelectorAll("[data-action-path]").forEach((button) => {
      button.addEventListener("click", async () => {
        const path = `/-/admin${button.dataset.actionPath}`;
        button.disabled = true;
        try {
          await apiPost(path);
          await refreshAll({ quiet: true });
        } catch (err) {
          setNotice(`Action failed: ${err.message}`);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function bindProbeModelPickers(root) {
    const closePicker = (picker) => {
      const menu = picker?.querySelector?.("[data-probe-model-menu]");
      const trigger = picker?.querySelector?.("[data-probe-model-trigger]");
      if (!menu || !trigger) return;
      menu.hidden = true;
      picker.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    };
    const closeOthers = (activePicker) => {
      root.querySelectorAll("[data-probe-model-picker].is-open").forEach((picker) => {
        if (picker !== activePicker) closePicker(picker);
      });
    };

    root.querySelectorAll("[data-probe-model-picker]").forEach((picker) => {
      const trigger = picker.querySelector("[data-probe-model-trigger]");
      const menu = picker.querySelector("[data-probe-model-menu]");
      const search = picker.querySelector("[data-probe-model-search]");
      const hidden = picker.querySelector("[data-key-test-model]");
      const label = picker.querySelector("[data-probe-model-label]");
      if (!trigger || !menu || !hidden || !label) return;
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");

      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextOpen = menu.hidden;
        closeOthers(picker);
        menu.hidden = !nextOpen;
        picker.classList.toggle("is-open", nextOpen);
        trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        if (nextOpen && search) {
          search.value = "";
          picker.querySelectorAll("[data-probe-model-option]").forEach((option) => { option.hidden = false; });
          search.focus();
        }
      });

      search?.addEventListener("input", () => {
        const needle = String(search.value || "").trim().toLowerCase();
        picker.querySelectorAll("[data-probe-model-option]").forEach((option) => {
          const model = String(option.dataset.probeModelOption || "").toLowerCase();
          option.hidden = needle ? !model.includes(needle) : false;
        });
      });

      picker.querySelectorAll("[data-probe-model-option]").forEach((option) => {
        option.addEventListener("click", (event) => {
          event.stopPropagation();
          const model = String(option.dataset.probeModelOption || "").trim();
          if (!model) return;
          hidden.value = model;
          label.textContent = model;
          trigger.title = model;
          picker.querySelectorAll("[data-probe-model-option]").forEach((item) => {
            item.classList.toggle("is-selected", item === option);
          });
          closePicker(picker);
          trigger.focus();
        });
      });

      picker.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closePicker(picker);
          trigger.focus();
        }
      });
    });
  }

  function bindKeyDeleteButtons(root) {
    root.querySelectorAll("[data-key-delete-provider]").forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = button.dataset.keyDeleteProvider || "";
        const keyIndex = button.dataset.keyDeleteIndex || "";
        const total = Number(button.dataset.keyDeleteTotal || 0);
        const label = button.dataset.keyDeleteLabel || `key ${keyIndex}`;
        if (!provider || keyIndex === "") return;
        const lastKeyText = total <= 1 ? " This is the last key; the provider will become unavailable until another key is added." : "";
        const confirmed = await openConfirmDialog({
          title: "Delete key",
          message: `Delete ${label} from ${provider}?${lastKeyText}`,
          acceptLabel: "Delete",
        });
        if (!confirmed) return;
        button.disabled = true;
        try {
          await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}/delete`, { confirm: "delete_key" });
          setNotice(`Key ${keyIndex} deleted from ${provider}.`, "ok");
          await refreshAll({ quiet: true, preserveNotice: true });
        } catch (err) {
          setNotice(`Delete key failed: ${err.message}`);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function bindKeyTestButtons(root) {
    root.querySelectorAll("[data-key-test-provider]").forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = button.dataset.keyTestProvider || "";
        const keyIndex = button.dataset.keyTestIndex || "";
        if (!provider || keyIndex === "") return;
        const probeKey = `${provider}#${keyIndex}`;
        const toastKey = `probe:${probeKey}`;
        const modelSelect = root.querySelector(`[data-key-test-model="${CSS.escape(probeKey)}"]`);
        const model = String(modelSelect?.value || "").trim();
        if (!model) {
          setNotice("Refresh model capabilities before testing this key.", "info");
          return;
        }
        state.keyProbes[probeKey] = { pending: true };
        button.disabled = true;
        setNotice(`Testing key ${keyIndex} of ${provider} on ${model}...`, "info", { key: toastKey, sticky: true });
        try {
          const resp = await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}/test`, { model });
          const result = resp.result || {};
          state.keyProbes[probeKey] = result;
          if (result.ok) {
            const shownModel = result.requested_model || model;
            const upstreamModel = result.upstream_model && result.upstream_model !== shownModel ? result.upstream_model : "";
            const upstreamText = upstreamModel ? `, upstream ${upstreamModel}` : "";
            setNotice(`Key ${keyIndex} of ${provider} works on ${shownModel} (${result.format}${upstreamText}, ${fmtInt(result.latency_ms)}ms).`, "ok", { key: toastKey });
          } else {
            const detail = result.http_status ? `HTTP ${result.http_status}` : result.error_type || "failed";
            setNotice(`Key ${keyIndex} of ${provider} failed: ${detail}.`, "bad", { key: toastKey });
          }
          await refreshAll({ quiet: true, preserveNotice: true });
        } catch (err) {
          state.keyProbes[probeKey] = { ok: false, error_type: "request_error" };
          setNotice(`Test key failed: ${err.message}`, "bad", { key: toastKey });
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function bindProviderModelRefreshButtons(root) {
    root.querySelectorAll("[data-provider-models-refresh]").forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = button.dataset.providerModelsRefresh || "";
        if (!provider) return;
        button.disabled = true;
        try {
          await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/models/refresh`);
          setNotice(`Models for ${provider} refreshed.`, "ok");
          await refreshAll({ quiet: true, preserveNotice: true });
          renderProviderDrawer({ force: true });
        } catch (err) {
          setNotice(`Model refresh failed: ${err.message}`, "bad");
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function renderPolicy() {
    const policy = state.data.routing?.policy || state.data.status?.policy || {};
    const ruleRows = Array.isArray(policy.rule_table) ? policy.rule_table : [];
    const retryStatuses = Array.isArray(policy.retryable_status) ? policy.retryable_status : [];
    renderPolicyControls(policy);
    el("ruleTable").innerHTML = ruleRows.length ? `
      <div class="policy-summary-grid">
        ${miniMetric("Max attempts", fmtInt(policy.max_attempts), "per request")}
        ${miniMetric("Connect timeout", `${fmtInt(policy.connect_timeout_s)}s`, "upstream")}
        ${miniMetric("Read timeout", `${fmtInt(policy.read_timeout_s)}s`, "upstream")}
        ${miniMetric("Retry HTTP", retryStatuses.length ? retryStatuses.join(", ") : "-", "status codes")}
      </div>
      <div class="policy-card-list">
        ${ruleRows.map(renderPolicyRule).join("")}
      </div>
    ` : `<div class="empty pad">No rule table</div>`;

    renderFailurePolicies(policy);
  }

  function renderFailurePolicies(policy) {
    const target = el("failurePoliciesTable");
    if (!target) return;
    const active = document.activeElement;
    if (!state.forceFailurePoliciesRender && active && active.closest("#failurePoliciesTable")) return;

    const policies = policy.failure_policies || {};
    const rows = Object.entries(policies).sort();
    target.innerHTML = rows.length ? `
      <div class="failure-policy-list">
        ${rows.map(([errorType, cfg]) => failurePolicyCard(errorType, cfg || {})).join("")}
      </div>
    ` : `<div class="empty pad">No failure policies</div>`;
    state.forceFailurePoliciesRender = false;
    bindFailurePolicyForms(target);
  }

  function renderPolicyControls(policy) {
    const target = el("policyControls");
    if (!target) return;
    const active = document.activeElement;
    if (!state.forcePolicyRender && active && active.closest("#policyControls")) return;

    const config = state.data.config || {};
    const routing = config.routing || {};
    const retry = config.retry || {};
    const cooldown = retry.cooldown_s || policy.cooldown_s || {};
    const ladder = Array.isArray(retry.key_failure_ladder_s) ? retry.key_failure_ladder_s : [10, 60, 3600];
    const providerPool = Array.isArray(routing.default_provider_pool) ? routing.default_provider_pool.join(", ") : "";
    target.innerHTML = `
      <div class="policy-control-grid">
        <form id="routingControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>Routing</h3>
            <p>Attempt budget, provider order, and upstream timeout caps.</p>
          </div>
          <label class="field">
            <span>Provider pool</span>
            <input class="control" name="default_provider_pool" value="${escapeHtml(providerPool)}" placeholder="opencode, deepseek, rawchat" required />
          </label>
          <div class="form-pair-grid">
            <label class="field">
              <span>Provider select</span>
              <select class="control" name="provider_select">
                ${["priority_failover", "round_robin", "weighted_rr", "random"].map((mode) => `<option value="${mode}" ${String(routing.provider_select || "priority_failover") === mode ? "selected" : ""}>${mode}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Max attempts</span>
              <input class="control" name="max_attempts" type="number" min="1" max="50" value="${escapeHtml(routing.max_attempts ?? policy.max_attempts ?? 6)}" required />
            </label>
            <label class="field">
              <span>Connect timeout</span>
              <input class="control" name="connect_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.connect_timeout_s ?? policy.connect_timeout_s ?? 15)}" required />
            </label>
            <label class="field">
              <span>Read timeout</span>
              <input class="control" name="read_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.read_timeout_s ?? policy.read_timeout_s ?? 120)}" required />
            </label>
            <label class="field">
              <span>First token timeout</span>
              <input class="control" name="first_token_timeout_s" type="number" min="0" max="600" value="${escapeHtml(routing.first_token_timeout_s ?? policy.first_token_timeout_s ?? 30)}" required />
            </label>
          </div>
          <button class="button secondary" type="submit">Save routing</button>
        </form>

        <form id="retryControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>Retry</h3>
            <p>HTTP retry classes and base cooldown seconds.</p>
          </div>
          <label class="field">
            <span>Retry HTTP statuses</span>
            <input class="control" name="retryable_status" value="${escapeHtml(joinList(retry.retryable_status || policy.retryable_status || []))}" placeholder="408, 429, 500, 502, 503, 504" required />
          </label>
          <label class="field">
            <span>Fatal key statuses</span>
            <input class="control" name="key_fatal_status" value="${escapeHtml(joinList(retry.key_fatal_status || policy.key_fatal_status || []))}" placeholder="401, 403" required />
          </label>
          <label class="check-field">
            <input type="checkbox" name="respect_retry_after" ${retry.respect_retry_after ?? policy.respect_retry_after ? "checked" : ""} />
            <span>Respect upstream Retry-After</span>
          </label>
          <div class="form-pair-grid">
            <label class="field">
              <span>Same-key retries</span>
              <input class="control" name="same_key_retries" type="number" min="0" max="3" value="${escapeHtml(retry.same_key_retries ?? 1)}" required />
            </label>
            <label class="field">
              <span>Key failure ladder</span>
              <input class="control" name="key_failure_ladder_s" value="${escapeHtml(joinNumberList(ladder))}" placeholder="10, 60, 3600" required />
            </label>
            ${cooldownField("rate_limit", "Rate limit cooldown", cooldown.rate_limit ?? 30)}
            ${cooldownField("server_error", "Server error cooldown", cooldown.server_error ?? 10)}
            ${cooldownField("network_error", "Network cooldown", cooldown.network_error ?? 10)}
            ${cooldownField("key_invalid", "Invalid key cooldown", cooldown.key_invalid ?? 3600)}
            ${cooldownField("quota_or_balance", "Quota cooldown", cooldown.quota_or_balance ?? 3600)}
          </div>
          <button class="button secondary" type="submit">Save retry</button>
        </form>
      </div>
    `;
    state.forcePolicyRender = false;
    bindPolicyControlForms(target);
  }

  function cooldownField(name, label, value) {
    return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <input class="control" name="${escapeHtml(name)}" type="number" min="0" max="86400" value="${escapeHtml(value)}" required />
      </label>
    `;
  }

  function bindPolicyControlForms(root) {
    const routingForm = root.querySelector("#routingControlForm");
    if (routingForm) {
      routingForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = {
          default_provider_pool: String(routingForm.elements.default_provider_pool.value || "").trim(),
          provider_select: String(routingForm.elements.provider_select.value || "").trim(),
          max_attempts: Number(routingForm.elements.max_attempts.value || 0),
          connect_timeout_s: Number(routingForm.elements.connect_timeout_s.value || 0),
          read_timeout_s: Number(routingForm.elements.read_timeout_s.value || 0),
          first_token_timeout_s: Number(routingForm.elements.first_token_timeout_s.value || 0),
        };
        await runPolicyMutation(routingForm, async () => {
          await apiPatch("/-/admin/routing", payload);
          setNotice("Routing settings updated.", "ok");
        });
      });
    }

    const retryForm = root.querySelector("#retryControlForm");
    if (retryForm) {
      retryForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = {
          retryable_status: String(retryForm.elements.retryable_status.value || "").trim(),
          key_fatal_status: String(retryForm.elements.key_fatal_status.value || "").trim(),
          respect_retry_after: Boolean(retryForm.elements.respect_retry_after.checked),
          same_key_retries: Number(retryForm.elements.same_key_retries.value || 0),
          key_failure_ladder_s: parseNumberList(retryForm.elements.key_failure_ladder_s.value),
          cooldown_s: {
            rate_limit: Number(retryForm.elements.rate_limit.value || 0),
            server_error: Number(retryForm.elements.server_error.value || 0),
            network_error: Number(retryForm.elements.network_error.value || 0),
            key_invalid: Number(retryForm.elements.key_invalid.value || 0),
            quota_or_balance: Number(retryForm.elements.quota_or_balance.value || 0),
          },
        };
        await runPolicyMutation(retryForm, async () => {
          await apiPatch("/-/admin/retry", payload);
          setNotice("Retry settings updated.", "ok");
        });
      });
    }
  }

  function bindFailurePolicyForms(root) {
    root.querySelectorAll(".failure-policy-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = {
          error_type: form.dataset.errorType || "",
          cooldown_scope: String(form.elements.cooldown_scope.value || "none"),
          cooldown_s: Number(form.elements.cooldown_s.value || 0),
          provider_cooldown_s: Number(form.elements.provider_cooldown_s.value || 0),
          disables_key: Boolean(form.elements.disables_key.checked),
        };
        await runPolicyMutation(form, async () => {
          await apiPatch("/-/admin/retry/failure-policies", payload);
          setNotice(`Failure policy ${payload.error_type} updated.`, "ok");
        });
      });
    });
  }

  async function runPolicyMutation(form, operation) {
    const buttons = Array.from(form.querySelectorAll("button"));
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await operation();
      state.forcePolicyRender = true;
      state.forceFailurePoliciesRender = true;
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      await refreshAll({ quiet: true, preserveNotice: true });
    } catch (err) {
      setNotice(`Policy update failed: ${err.message}`);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  function renderPolicyRule(rule, index) {
    const decision = policyDecision(rule);
    return `
      <article class="policy-rule-card tone-${toneForText(decision.error_type || rule.match || "")}">
        <div class="policy-rule-head">
          <span class="rule-index">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${messageMarkup(rule.match || rule.name || "-")}</h3>
            <p>${messageMarkup(rule.notes || decision.reason || "-")}</p>
          </div>
        </div>
        <div class="policy-decision-strip">
          ${decisionBadge(decision.retryable ? "retry" : "no retry", decision.retryable ? "ok" : "bad")}
          ${decisionBadge(rule.retry_next_attempt ? "switch attempt" : "do not switch", rule.retry_next_attempt ? "ok" : "bad")}
          ${decisionBadge(decision.stop_attempts ? "stop attempts" : "continue", decision.stop_attempts ? "bad" : "ok")}
          ${decisionBadge(`cooldown ${decision.cooldown_scope || "none"}`, toneForText(decision.cooldown_scope || "none"))}
          ${decision.disables_key ? decisionBadge("disable key", "bad") : decisionBadge("keep key", "neutral")}
        </div>
        <div class="policy-rule-meta">
          <span>Error</span><strong>${messageMarkup(decision.error_type || "-")}</strong>
          <span>Reason</span><strong>${messageMarkup(decision.reason || "-")}</strong>
          <span>Cooldown</span><strong>${escapeHtml(fmtInt(decision.cooldown_s))}s</strong>
        </div>
      </article>
    `;
  }

  function failurePolicyCard(errorType, cfg) {
    const scope = cfg.cooldown_scope || "none";
    return `
      <form class="failure-policy-card failure-policy-form tone-${toneForText(errorType)}" data-error-type="${escapeHtml(errorType)}">
        <div class="failure-policy-head">
          <h3>${messageMarkup(errorType)}</h3>
          <select class="control compact-control" name="cooldown_scope" aria-label="${escapeHtml(errorType)} cooldown scope">
            ${["none", "key", "provider", "key_provider"].map((item) => `<option value="${item}" ${scope === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </div>
        <p>${escapeHtml(failurePolicyDescription(errorType))}</p>
        <div class="failure-policy-edit-grid">
          <label class="field">
            <span>Key cooldown</span>
            <input class="control" name="cooldown_s" type="number" min="0" max="86400" value="${escapeHtml(cfg.cooldown_s ?? 0)}" required />
          </label>
          <label class="field">
            <span>Provider cooldown</span>
            <input class="control" name="provider_cooldown_s" type="number" min="0" max="300" value="${escapeHtml(cfg.provider_cooldown_s ?? 0)}" required />
          </label>
          <label class="check-field failure-disable-check">
            <input type="checkbox" name="disables_key" ${cfg.disables_key ? "checked" : ""} />
            <span>Disable key</span>
          </label>
          <button class="button secondary" type="submit">Save policy</button>
        </div>
      </form>
    `;
  }

  function failurePolicyDescription(errorType) {
    const text = String(errorType || "");
    if (text.includes("key_invalid")) return "Auth/key failures mark that key unhealthy; rotation may continue with another key.";
    if (text.includes("rate")) return "Rate limits cool the key briefly; Retry-After can extend this when upstream provides it.";
    if (text.includes("network")) return "Network and timeout failures cool the current key by default; provider cooldown is optional.";
    if (text.includes("server")) return "Provider-side failures are retryable before the client response starts.";
    if (text.includes("empty_visible")) return "Empty converted output is retried without cooling the upstream key.";
    if (text.includes("compat")) return "Compatibility failures are retried when another format/provider may satisfy the request.";
    return "Default failure handling for this error type.";
  }

  function decisionBadge(label, tone) {
    const safeTone = tone === "success" ? "ok" : tone === "danger" ? "bad" : tone === "warn" ? "warn" : tone;
    return badge(label, safeTone);
  }

  function policyDecision(rule) {
    const decision = rule?.decision && typeof rule.decision === "object" ? rule.decision : rule || {};
    return {
      error_type: decision.error_type || rule?.error_type || "",
      retryable: Boolean(decision.retryable ?? rule?.retryable),
      reason: decision.reason || rule?.reason || "",
      stop_attempts: Boolean(decision.stop_attempts ?? rule?.stop_attempts),
      cooldown_scope: decision.cooldown_scope || rule?.cooldown_scope || "none",
      cooldown_s: Number(decision.cooldown_s ?? rule?.cooldown_s ?? 0),
      disables_key: Boolean(decision.disables_key ?? rule?.disables_key),
    };
  }

  function decisionText(rule) {
    const decision = policyDecision(rule);
    const pieces = [];
    pieces.push(decision.retryable ? "retry" : "no retry");
    if (rule.retry_next_attempt !== undefined) pieces.push(rule.retry_next_attempt ? "switch attempt" : "no switch");
    if (decision.stop_attempts) pieces.push("stop");
    if (decision.cooldown_scope) pieces.push(`cooldown ${decision.cooldown_scope}`);
    if (decision.disables_key) pieces.push("disable key");
    return pieces.join(", ") || rule.decision || "-";
  }

  function renderConfig() {
    const config = state.data.config || {};
    el("configSnapshot").textContent = JSON.stringify(config, null, 2);
    renderConfigSummary(config);
    renderGlobalProxy(config);
    renderOverlaySafety(config);
    renderModelRoutes(config);
    renderProviderModelMap(config);
    renderConfigProviders(config);
    renderAuditTrail();
  }

  function renderConfigSummary(config) {
    const target = el("configSummary");
    if (!target) return;
    const providers = config.providers || {};
    const names = Object.keys(providers).sort();
    const providerCount = names.length;
    const keyCount = names.reduce((sum, name) => sum + (Array.isArray(providers[name]?.keys) ? providers[name].keys.length : 0), 0);
    const enabledProviders = names.filter((name) => providers[name]?.enabled !== false).length;
    const overlayPath = config.overlay_path || "-";
    const formatCounts = { chat_completions: 0, responses: 0, anthropic_messages: 0 };
    names.forEach((name) => {
      Object.entries(providers[name]?.formats || {}).forEach(([fmt, cfg]) => {
        if (cfg?.enabled && formatCounts[fmt] !== undefined) formatCounts[fmt] += 1;
      });
    });
    target.innerHTML = `
      <div class="config-summary-grid config-status-grid">
        ${miniMetric("Providers", `${fmtInt(enabledProviders)}/${fmtInt(providerCount)}`, "enabled")}
        ${miniMetric("Keys", fmtInt(keyCount), "masked")}
        ${miniMetric("Global proxy", proxyLabel(config.proxy, "direct"), "fallback")}
        ${miniMetric("Overlay", config.has_overlay ? "active" : "none", "runtime_config")}
        ${miniMetric("Formats", Object.entries(formatCounts).map(([k, v]) => `${shortFormatName(k)} ${v}`).join(" / "), "enabled routes")}
      </div>
      <div class="config-path-row">
        <span>Overlay path</span>
        <strong class="mono">${escapeHtml(overlayPath)}</strong>
      </div>
    `;
  }

  function renderGlobalProxy(config) {
    const form = el("globalProxyForm");
    if (!form) return;
    const active = document.activeElement;
    if (active && active.closest("#globalProxyForm")) return;
    form.elements.proxy.value = proxyText(config.proxy);
  }

  function renderOverlaySafety(config) {
    const target = el("overlaySafety");
    if (!target) return;
    const overlay = state.data.overlay || {};
    const hasOverlay = Boolean(overlay.has_overlay ?? config.has_overlay);
    const overlayPath = overlay.overlay_path || config.overlay_path || "-";
    const overlayKeys = overlay.overlay && typeof overlay.overlay === "object" ? Object.keys(overlay.overlay).sort() : [];
    target.innerHTML = `
      <div class="config-summary-grid overlay-summary-grid">
        ${miniMetric("Overlay", hasOverlay ? "active" : "none", "runtime_config")}
        ${miniMetric("Sections", overlayKeys.length ? overlayKeys.join(", ") : "-", "overlay")}
        ${miniMetric("Preview", state.data.overlayPreviewStatus || "-", "last validation")}
        ${miniMetric("Rollback", hasOverlay ? "available" : "not needed", "clear overlay")}
      </div>
      <div class="config-path-row">
        <span>Overlay path</span>
        <strong class="mono">${escapeHtml(overlayPath)}</strong>
      </div>
    `;
    const preview = el("overlayPreview");
    if (preview && !state.data.overlayPreviewPinned) {
      preview.textContent = JSON.stringify(overlay.overlay || {}, null, 2);
    }
  }

  function renderConfigProviders(config) {
    const target = el("configProviders");
    if (!target) return;
    const active = document.activeElement;
    if (!state.forceConfigRender && active && active.closest("#configProviders")) return;

    const providers = config.providers || {};
    const names = Object.keys(providers).sort();
    if (!names.length) {
      target.classList.add("empty");
      target.innerHTML = "No providers configured";
      state.forceConfigRender = false;
      return;
    }

    const page = paginate(names, "configProvidersPage", CONFIG_PROVIDERS_PAGE_SIZE);
    target.classList.remove("empty");
    target.innerHTML = `
      ${panelPagination("configProvidersPage", page, "providers")}
      <div class="config-provider-page-list">
        ${page.items.map((name) => providerConfigSummaryCard(name, providers[name] || {})).join("")}
      </div>
    `;
    bindPanelPagination(target);
    state.forceConfigRender = false;
  }

  function renderModelRoutes(config) {
    const target = el("modelRoutes");
    if (!target) return;
    const active = document.activeElement;
    if (!state.forceModelRoutesRender && active && active.closest("#modelRoutesPanel")) return;

    const providers = Object.keys(config.providers || {}).sort();
    const routes = config.models?.routes || {};
    const entries = Object.entries(routes)
      .filter(([_model, route]) => route && typeof route === "object")
      .sort(([a], [b]) => a.localeCompare(b));
    const hint = providers.length
      ? `<div class="model-route-hint">Available providers ${chipList(providers)}</div>`
      : `<div class="model-route-hint muted">No providers available</div>`;

    if (!entries.length) {
      target.classList.add("empty");
      target.innerHTML = `${hint}<div class="pad-slim">No model routes configured</div>`;
      state.forceModelRoutesRender = false;
      return;
    }

    target.classList.remove("empty");
    const page = paginate(entries, "modelRoutesPage", MODEL_ROUTES_PAGE_SIZE);
    target.innerHTML = `
      ${hint}
      ${panelPagination("modelRoutesPage", page, "routes")}
      <div class="model-route-page-list">
        ${page.items.map(([model, route]) => modelRouteCard(model, route)).join("")}
      </div>
    `;
    bindPanelPagination(target);
    state.forceModelRoutesRender = false;
  }

  function modelRouteCard(model, route) {
    const providers = routeProviderItems(route.providers);
    const providerSelect = route.provider_select || "priority_failover";
    return `
      <article class="model-route-card">
        <div class="model-route-main">
          <div class="provider-name mono">${escapeHtml(model)}</div>
          <div class="model-route-provider-list">
            ${providers.length ? providers.map((item) => `<span class="tag">${escapeHtml(item.name)}:${escapeHtml(item.weight)}</span>`).join("") : `<span class="muted">No providers</span>`}
          </div>
        </div>
        <div class="model-route-side">
          ${badge(providerSelect, providerSelect === "random" ? "warn" : providerSelect === "weighted_rr" ? "info" : "ok")}
          <div class="actions tight">
            <button class="button secondary compact-action icon-action" type="button" data-model-route-edit="${escapeHtml(model)}" title="Edit route" aria-label="Edit route">${iconSvg("pencil")}</button>
            <button class="button danger compact-action icon-action" type="button" data-model-route-delete="${escapeHtml(model)}" title="Delete route" aria-label="Delete route">${iconSvg("trash")}</button>
          </div>
        </div>
      </article>
    `;
  }

  function routeProviderItems(providers) {
    if (!Array.isArray(providers)) return [];
    return providers
      .map((item) => {
        if (typeof item === "string") {
          const parts = String(item).split(":").map((part) => part.trim());
          const priority = parts[2] === undefined || parts[2] === ""
            ? null
            : Number(parts.slice(2).join(":"));
          return { name: parts[0] || "", weight: Number(parts[1] || 1), priority: Number.isFinite(priority) ? priority : null };
        }
        if (item && typeof item === "object") return { name: item.name || "", weight: item.weight || 1, priority: item.priority ?? null };
        return null;
      })
      .filter((item) => item && item.name);
  }

  function routeProvidersText(providers) {
    return routeProviderItems(providers)
      .map((item) => `${item.name}:${item.weight || 1}${item.priority !== null && item.priority !== undefined ? `:${item.priority}` : ""}`)
      .join(", ");
  }

  function renderProviderModelMap(config) {
    const target = el("providerModelMap");
    if (!target) return;
    const map = config.models?.provider_model_map || {};
    const providers = Object.entries(map)
      .filter(([_provider, entries]) => entries && typeof entries === "object" && Object.keys(entries).length)
      .sort(([a], [b]) => a.localeCompare(b));
    if (!providers.length) {
      target.classList.add("empty");
      target.innerHTML = `<div class="pad-slim">No provider model overrides configured</div>`;
      return;
    }

    target.classList.remove("empty");
    const page = paginate(providers, "providerModelMapPage", PROVIDER_MODEL_MAP_PAGE_SIZE);
    target.innerHTML = `
      ${panelPagination("providerModelMapPage", page, "maps")}
      <div class="provider-model-map-page-list">
        ${page.items.map(([provider, entries]) => {
      const pairs = Object.entries(entries || {}).sort(([a], [b]) => a.localeCompare(b));
      return `
        <article class="provider-model-map-card">
          <div class="provider-model-map-head">
            <span class="provider-name">${escapeHtml(provider)}</span>
            ${badge(`${fmtInt(pairs.length)} overrides`, "info")}
          </div>
          <div class="provider-model-map-pairs">
            ${pairs.map(([canonical, upstream]) => `
              <div class="provider-model-map-pair">
                <span class="mono">${escapeHtml(canonical)}</span>
                <strong class="mono">${escapeHtml(upstream)}</strong>
              </div>
            `).join("")}
          </div>
        </article>
      `;
    }).join("")}
      </div>
    `;
    bindPanelPagination(target);
  }

  function routeByModel(model) {
    const routes = state.data.config?.models?.routes || {};
    const route = routes[model];
    return route && typeof route === "object" ? route : null;
  }

  function renderAuditTrail() {
    const target = el("auditTrail");
    if (!target) return;
    const audit = state.data.audit || {};
    const items = Array.isArray(audit.items) ? audit.items : [];
    if (!items.length) {
      target.classList.add("empty");
      target.innerHTML = "No audit events recorded";
      return;
    }

    target.classList.remove("empty");
    const page = paginate(items, "auditPage", AUDIT_PAGE_SIZE);
    target.innerHTML = `
      ${panelPagination("auditPage", page, "events")}
      <div class="audit-page-list">
        ${page.items.map((item) => auditTrailItem(item)).join("")}
      </div>
    `;
    bindPanelPagination(target);
  }

  function auditTrailItem(item) {
    const status = String(item.status || "success");
    const tone = status === "failed" ? "bad" : "ok";
    const detail = item.detail && Object.keys(item.detail).length ? JSON.stringify(item.detail) : "";
    return `
      <article class="audit-item tone-${escapeHtml(tone)}">
        <div class="audit-item-main">
          <div class="audit-item-title">
            <span class="mono">${escapeHtml(item.action || "unknown")}</span>
            ${badge(status, tone)}
          </div>
          <div class="audit-item-meta">
            <span>${escapeHtml(fmtDate(item.ts))}</span>
            <span>${escapeHtml(item.target || "-")}</span>
            <span>${escapeHtml(item.source_ip || "-")}</span>
          </div>
          ${detail ? `
            <details class="audit-detail-details">
              <summary>Detail</summary>
              <pre class="audit-detail">${escapeHtml(detail)}</pre>
            </details>
          ` : ""}
          ${item.error ? `<div class="audit-error">${escapeHtml(item.error)}</div>` : ""}
        </div>
      </article>
    `;
  }

  function providerConfigSummaryCard(name, provider) {
    const formats = provider.formats || {};
    const keys = Array.isArray(provider.keys) ? provider.keys : [];
    const enabled = enabledFormats(formats);
    const firstKey = keys[0];
    const keyText = firstKey ? `key ${firstKey.index} / ${firstKey.masked || firstKey.key_id || "-"}` : "No keys";
    const moreKeys = keys.length > 1 ? ` +${keys.length - 1}` : "";
    const priority = Number(provider.priority || 0);
    return `
      <article class="config-provider-summary-card">
        <div class="config-provider-summary-main">
          <div class="provider-name">${escapeHtml(name)}</div>
          <div class="provider-meta">${escapeHtml(provider.base_url || "-")}</div>
        </div>
        <div class="config-provider-summary-badges">
          ${badge(`P${fmtInt(priority)}`, "info")}
          ${badge(provider.enabled === false ? "config off" : "config on", provider.enabled === false ? "bad" : "ok")}
        </div>
        <div class="config-provider-summary-keys mono">${escapeHtml(keyText)}${escapeHtml(moreKeys)}</div>
        <div class="config-provider-summary-formats">${chipList(enabled, "no enabled formats")}</div>
        <button class="button secondary compact-action icon-action" type="button" data-view-target="providers" title="Open providers" aria-label="Open providers">${iconSvg("settings")}</button>
      </article>
    `;
  }

  function shortFormatName(format) {
    if (format === "chat_completions") return "chat";
    if (format === "anthropic_messages") return "messages";
    return String(format || "");
  }

  function providerConfigCard(name, provider) {
    const formats = provider.formats || {};
    const keys = Array.isArray(provider.keys) ? provider.keys : [];
    return `
      <article class="config-provider-card">
        <div class="config-provider-head">
          <div>
            <div class="provider-name">${escapeHtml(name)}</div>
            <div class="provider-meta">${keys.length} masked keys / ${chipList(enabledFormats(formats), "no enabled formats")}</div>
          </div>
          ${badge(provider.enabled === false ? "config off" : "config on", provider.enabled === false ? "bad" : "ok")}
        </div>

        <form class="config-provider-form" data-provider="${escapeHtml(name)}">
          <label class="field">
            <span>Base URL</span>
            <input class="control" name="base_url" value="${escapeHtml(provider.base_url || "")}" placeholder="https://api.example.com" required />
          </label>
          <label class="field">
            <span>Proxy</span>
            <input class="control" name="proxy" value="${escapeHtml(provider.proxy || "")}" placeholder="direct or http://127.0.0.1:8002" />
          </label>
          <label class="field">
            <span>User-Agent override</span>
            <input class="control" name="user_agent" value="${escapeHtml(provider.user_agent || "")}" placeholder="inherit client User-Agent" />
          </label>
          <label class="field">
            <span>Priority</span>
            <input class="control" name="priority" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(provider.priority ?? 0)}" />
          </label>
          <label class="check-field">
            <input type="checkbox" name="enabled" ${provider.enabled === false ? "" : "checked"} />
            <span>Enabled in config</span>
          </label>
          <button class="button secondary" type="submit">Save provider</button>
          <button class="button danger icon-action" type="button" data-provider-delete="${escapeHtml(name)}" title="Delete provider" aria-label="Delete provider">${iconSvg("trash")}</button>
        </form>

        <div class="masked-key-list">
          ${keys.length ? keys.map((key) => `
            <span class="tag" title="${escapeHtml(key.key_id || "")}">key ${escapeHtml(key.index)} / ${escapeHtml(key.masked || key.key_id || "-")}</span>
          `).join("") : `<span class="muted">No keys</span>`}
        </div>

        <form class="config-key-form" data-provider="${escapeHtml(name)}">
          <input class="control" name="key" type="password" autocomplete="off" placeholder="new api key" required />
          <button class="button secondary" type="submit">Add key</button>
        </form>

        <div class="format-edit-list">
          ${["chat_completions", "responses", "anthropic_messages"].map((fmt) => formatEditRow(name, fmt, formats[fmt] || {})).join("")}
        </div>
      </article>
    `;
  }

  function formatEditRow(provider, fmt, config) {
    return `
      <form class="format-edit-row" data-provider="${escapeHtml(provider)}" data-format="${escapeHtml(fmt)}">
        <label class="check-field">
          <input type="checkbox" name="enabled" ${config.enabled ? "checked" : ""} />
          <span>${escapeHtml(formatLabel(fmt))}</span>
        </label>
        <input class="control" name="path" value="${escapeHtml(config.path || defaultFormatPath(fmt))}" required />
        <button class="button secondary" type="submit">Save</button>
      </form>
    `;
  }

  function formatLabel(fmt) {
    if (fmt === "chat_completions") return "OpenAI Chat Completions";
    if (fmt === "responses") return "OpenAI Responses";
    if (fmt === "anthropic_messages") return "Anthropic Messages";
    return String(fmt || "");
  }

  function defaultFormatPath(fmt) {
    if (fmt === "responses") return "/v1/responses";
    if (fmt === "anthropic_messages") return "/v1/messages";
    return "/v1/chat/completions";
  }

  function bindConfigProviderForms(root) {
    root.querySelectorAll("[data-provider-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const provider = button.dataset.providerDelete || "";
        if (!provider) return;
        const confirmed = await openConfirmDialog({
          title: "Delete Provider",
          message: `Delete ${provider}? It will be removed from provider config, route pools, model maps, and capability snapshots.`,
          acceptLabel: "Delete",
        });
        if (!confirmed) return;
        button.disabled = true;
        try {
          await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/delete`, { confirm: "delete_provider" });
          state.openProviderDetails.delete(provider);
          state.openProviderEditors.delete(provider);
          if (state.providerDrawerName === provider) closeProviderDrawer();
          state.forceConfigRender = true;
          setNotice(`Provider ${provider} deleted.`, "ok");
          await refreshAll({ quiet: true, preserveNotice: true });
        } catch (err) {
          setNotice(`Delete provider failed: ${err.message}`);
        } finally {
          button.disabled = false;
        }
      });
    });

    root.querySelectorAll(".config-provider-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const provider = form.dataset.provider || "";
        const payload = {
          base_url: String(form.elements.base_url.value || "").trim(),
          proxy: String(form.elements.proxy.value || "").trim(),
          user_agent: String(form.elements.user_agent?.value || "").trim(),
          priority: Number(form.elements.priority.value || 0),
          enabled: Boolean(form.elements.enabled.checked),
        };
        await runConfigMutation(form, async () => {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, payload);
          setNotice(`Provider ${provider} updated.`, "ok");
        });
      });
    });

    root.querySelectorAll(".config-key-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const provider = form.dataset.provider || "";
        const key = String(form.elements.key.value || "").trim();
        const proxy = String(form.elements.proxy?.value || "").trim();
        const payload = { key };
        if (proxy) payload.proxy = proxy;
        await runConfigMutation(form, async () => {
          await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys`, payload);
          form.reset();
          setNotice(`Key added to ${provider}.`, "ok");
        });
      });
    });

    root.querySelectorAll(".key-proxy-row").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const provider = form.dataset.provider || "";
        const keyIndex = String(form.dataset.keyIndex || "").trim();
        const proxy = String(form.elements.proxy.value || "").trim();
        await runConfigMutation(form, async () => {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}`, { proxy });
          setNotice(`Key ${keyIndex} proxy updated for ${provider}.`, "ok");
        });
      });
    });

    root.querySelectorAll(".format-edit-row").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const provider = form.dataset.provider || "";
        const fmt = form.dataset.format || "";
        const payload = {
          enabled: Boolean(form.elements.enabled.checked),
          path: String(form.elements.path.value || "").trim(),
        };
        await runConfigMutation(form, async () => {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/formats/${encodeURIComponent(fmt)}`, payload);
          setNotice(`${provider} ${fmt} updated.`, "ok");
        });
      });
    });
  }

  async function runConfigMutation(form, operation) {
    const buttons = Array.from(form.querySelectorAll("button"));
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await operation();
      state.forceConfigRender = true;
      state.forceModelRoutesRender = true;
      if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
      }
      await refreshAll({ quiet: true, preserveNotice: true });
    } catch (err) {
      setNotice(`Config update failed: ${err.message}`);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  function table(headers, rows, options = {}) {
    const mono = new Set(options.monospaceCols || []);
    const html = new Set(options.htmlCols || []);
    return `
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>${row.map((cell, idx) => `<td class="${mono.has(idx) ? "mono" : ""}">${html.has(idx) ? cell : escapeHtml(cell)}</td>`).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  async function openRequestDetail(requestId) {
    if (!requestId) return;
    const drawer = el("detailDrawer");
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    el("drawerSubtitle").textContent = requestId;
    el("drawerBody").innerHTML = `<div class="empty">Loading request detail</div>`;
    try {
      const detail = await apiGet(`/-/admin/requests/${encodeURIComponent(requestId)}`);
      renderDrawer(detail);
    } catch (err) {
      el("drawerBody").innerHTML = `<div class="notice">Request detail failed: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDrawer(detail) {
    const attempts = Array.isArray(detail.attempts) ? detail.attempts : [];
    const summary = detail.routing_summary || {};
    el("drawerSubtitle").textContent = `${detail.request_id || "-"} / ${detail.state || "unknown"}`;
    el("drawerBody").innerHTML = `
      ${renderRoutingSummary(summary)}
      <div class="kv-grid drawer-kv">
        <span>Status</span><span>${detail.status_code ? statusBadge(detail.status, detail.status_code) : messageMarkup(detail.state || "-")}</span>
        <span>Model</span><span>${escapeHtml(detail.model || "-")}</span>
        <span>Client</span><span>${chipList([detail.client_format || "-"])}</span>
        <span>Endpoint</span><span>${messageMarkup(detail.endpoint || "-")}</span>
        <span>Path</span><span>${escapeHtml(detail.path || "-")}</span>
        <span>Stream</span><span>${detail.stream ? "yes" : "no"}</span>
        <span>Duration</span><span>${escapeHtml(fmtMs(detail.duration_ms))}</span>
        <span>First byte</span><span>${detail.first_byte_ms ? escapeHtml(fmtMs(detail.first_byte_ms)) : escapeHtml("-")}</span>
        <span>Tokens</span><span class="mono" title="${escapeHtml(fmtInt(usageFrom(detail).total_tokens))} tokens">${escapeHtml(fmtTokenCount(usageFrom(detail).total_tokens))}</span>
        <span>Cost</span><span class="mono">${escapeHtml(fmtCost(usageFrom(detail).cost_usd))}</span>
        <span>Error</span><span>${messageMarkup(detail.error || "-")}</span>
      </div>
      <h3 class="drawer-section-title">Attempts</h3>
      ${attempts.length ? attempts.map(renderAttempt).join("") : `<div class="empty">No attempts recorded</div>`}
    `;
  }

  function renderAttempt(attempt) {
    const ok = attempt.outcome === "success";
    const keyLabel = attempt.key_masked
      ? `key ${attempt.key_index ?? "-"} / ${attempt.key_masked}`
      : `key ${attempt.key_index ?? "-"}`;
    const maskedKey = attempt.key_masked || attempt.key_id || "-";
    const explanation = attempt.routing_explanation || {};
    const diagnosticRows = renderAttemptDiagnostics(attempt);
    return `
      <article class="attempt tone-${escapeHtml(explanation.tone || toneForText(attempt.reason || attempt.error_type || attempt.outcome || ""))}">
        <div class="attempt-head">
          <strong class="mono">#${escapeHtml(attempt.attempt_no || "-")} ${chipList([attempt.provider || "-"])}</strong>
          ${badge(attempt.outcome || "unknown", ok ? "ok" : "bad")}
        </div>
        ${renderAttemptExplanation(explanation)}
        <div class="kv-grid">
          <span>Key</span><span>${escapeHtml(keyLabel)}</span>
          <span>Key ID</span><span>${escapeHtml(maskedKey)}</span>
          <span>Provider Model</span><span>${escapeHtml(attempt.provider_model || "-")}</span>
          <span>Upstream Format</span><span>${chipList([attempt.upstream_format || "-"])}</span>
          <span>Duration</span><span>${attempt.duration_ms ? escapeHtml(fmtMs(attempt.duration_ms)) : escapeHtml("-")}</span>
          <span>HTTP Status</span><span>${attempt.http_status ? statusBadge("", attempt.http_status) : escapeHtml("-")}</span>
          <span>Tokens</span><span class="mono" title="${escapeHtml(fmtInt(usageFrom(attempt).total_tokens))} tokens">${escapeHtml(fmtTokenCount(usageFrom(attempt).total_tokens))}</span>
          <span>Cost</span><span class="mono">${escapeHtml(fmtCost(usageFrom(attempt).cost_usd))}</span>
          <span>Error Type</span><span>${messageMarkup(attempt.error_type || "-")}</span>
          <span>Reason</span><span>${messageMarkup(attempt.reason || "-")}</span>
          ${diagnosticRows}
        </div>
      </article>
    `;
  }

  function renderAttemptDiagnostics(attempt) {
    const rows = [];
    if (attempt.diagnostic_stage) {
      rows.push(`<span>Stage</span><span>${messageMarkup(attempt.diagnostic_stage)}</span>`);
    }
    if (attempt.upstream_error_summary) {
      rows.push(`<span>Upstream Error</span><span>${messageMarkup(attempt.upstream_error_summary)}</span>`);
    }
    if (attempt.upstream_error_type) {
      rows.push(`<span>Upstream Type</span><span>${messageMarkup(attempt.upstream_error_type)}</span>`);
    }
    if (attempt.upstream_error_code) {
      rows.push(`<span>Upstream Code</span><span>${messageMarkup(attempt.upstream_error_code)}</span>`);
    }
    if (attempt.upstream_error_param) {
      rows.push(`<span>Upstream Param</span><span>${messageMarkup(attempt.upstream_error_param)}</span>`);
    }
    return rows.join("");
  }

  function routingSummaryInline(summary) {
    if (!summary || typeof summary !== "object") return messageMarkup("-");
    const outcome = summary.outcome || "unknown";
    const headline = summary.headline || "-";
    return `
      <div class="route-inline tone-${escapeHtml(toneForText(outcome))}">
        ${badge(routeOutcomeLabel(outcome), routeOutcomeTone(outcome))}
        <span>${messageMarkup(headline)}</span>
      </div>
    `;
  }

  function renderRoutingSummary(summary) {
    if (!summary || typeof summary !== "object" || !summary.headline) return "";
    return `
      <section class="routing-summary-card tone-${escapeHtml(routeOutcomeTone(summary.outcome))}">
        <div class="routing-summary-head">
          <div>
            <h3>Routing Summary</h3>
            <p>${messageMarkup(summary.headline)}</p>
          </div>
          ${badge(routeOutcomeLabel(summary.outcome), routeOutcomeTone(summary.outcome))}
        </div>
        <div class="routing-summary-grid">
          <span>Attempts</span><strong>${fmtInt(summary.attempts)}</strong>
          <span>Failed</span><strong>${fmtInt(summary.failed_attempts)}</strong>
          <span>Final Provider</span><strong>${escapeHtml(summary.final_provider || "-")}</strong>
          <span>Final Format</span><strong>${chipList([summary.final_upstream_format || "-"])}</strong>
        </div>
        <div class="routing-next-action">
          <span>Next action</span>
          <strong>${messageMarkup(summary.next_action || "-")}</strong>
        </div>
      </section>
    `;
  }

  function renderAttemptExplanation(explanation) {
    if (!explanation || typeof explanation !== "object") return "";
    return `
      <div class="attempt-explain">
        <div><span>Selected</span><strong>${messageMarkup(explanation.selected || "-")}</strong></div>
        <div><span>Result</span><strong>${messageMarkup(explanation.result || "-")}</strong></div>
        <div><span>Next</span><strong>${messageMarkup(explanation.next_step || "-")}</strong></div>
      </div>
    `;
  }

  function routeOutcomeLabel(outcome) {
    if (outcome === "direct_success") return "direct";
    if (outcome === "recovered") return "recovered";
    if (outcome === "failed") return "failed";
    if (outcome === "no_attempts") return "no attempts";
    return outcome || "unknown";
  }

  function routeOutcomeTone(outcome) {
    if (outcome === "direct_success") return "ok";
    if (outcome === "recovered") return "warn";
    if (outcome === "failed") return "bad";
    return "neutral";
  }

  function setView(view) {
    const nextView = views[view] ? view : "overview";
    state.view = nextView;
    try {
      localStorage.setItem("proxyConsoleView", nextView);
    } catch (err) {
      // Ignore storage failures; navigation should still work.
    }
    try {
      const nextHash = `#${nextView}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
      }
    } catch (err) {
      // Ignore URL update failures; local navigation still works.
    }
    const meta = views[nextView] || views.overview;
    el("viewTitle").textContent = meta.title;
    el("viewSubtitle").textContent = meta.subtitle;
    qsa(".nav-item").forEach((button) => {
      button.classList.toggle("is-active", (button.dataset.view || button.dataset.viewTarget) === nextView);
    });
    qsa(".view").forEach((node) => node.classList.remove("is-active"));
    el(`${nextView}View`)?.classList.add("is-active");
    renderAll();
    syncMobileSettingsContext();
    closeMobileSettings();
  }

  function captureMobileAnchor(id) {
    const node = el(id);
    if (!node) return;
    mobileSettings.anchors[id] = {
      parent: node.parentNode,
      next: node.nextSibling,
    };
  }

  function moveNodeTo(id, targetId) {
    const node = el(id);
    const target = el(targetId);
    if (node && target && node.parentNode !== target) target.appendChild(node);
  }

  function restoreNode(id) {
    const node = el(id);
    const anchor = mobileSettings.anchors[id];
    if (!node || !anchor?.parent || node.parentNode === anchor.parent) return;
    if (anchor.next && anchor.next.parentNode === anchor.parent) {
      anchor.parent.insertBefore(node, anchor.next);
    } else {
      anchor.parent.appendChild(node);
    }
  }

  function syncMobileSettingsContext() {
    const contextSection = el("mobileContextSection");
    if (!contextSection) return;
    const isMobile = Boolean(mobileSettings.media?.matches);
    contextSection.classList.toggle("is-hidden", !(isMobile && state.view === "requests"));
  }

  function applyMobileSettingsMode() {
    const isMobile = Boolean(mobileSettings.media?.matches);
    document.body.classList.toggle("has-mobile-settings", isMobile);
    if (isMobile) {
      moveNodeTo("sectionNav", "mobileNavActions");
      moveNodeTo("sidebarActions", "mobileGlobalActions");
      moveNodeTo("requestsToolbar", "mobileContextActions");
    } else {
      closeMobileSettings();
      restoreNode("sectionNav");
      restoreNode("sidebarActions");
      restoreNode("requestsToolbar");
    }
    syncMobileSettingsContext();
  }

  function openMobileSettings() {
    if (!mobileSettings.media?.matches) return;
    el("mobileSettingsDrawer")?.classList.add("is-open");
    el("mobileSettingsDrawer")?.setAttribute("aria-hidden", "false");
    el("mobileSettingsButton")?.setAttribute("aria-expanded", "true");
    const backdrop = el("mobileSettingsBackdrop");
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.classList.add("is-open");
    }
    document.body.classList.add("is-mobile-settings-open");
  }

  function closeMobileSettings() {
    el("mobileSettingsDrawer")?.classList.remove("is-open");
    el("mobileSettingsDrawer")?.setAttribute("aria-hidden", "true");
    el("mobileSettingsButton")?.setAttribute("aria-expanded", "false");
    const backdrop = el("mobileSettingsBackdrop");
    if (backdrop) {
      backdrop.classList.remove("is-open");
      backdrop.hidden = true;
    }
    document.body.classList.remove("is-mobile-settings-open");
  }

  function toggleMobileSettings() {
    if (el("mobileSettingsDrawer")?.classList.contains("is-open")) {
      closeMobileSettings();
    } else {
      openMobileSettings();
    }
  }

  function installMobileSettings() {
    captureMobileAnchor("sectionNav");
    captureMobileAnchor("sidebarActions");
    captureMobileAnchor("requestsToolbar");
    mobileSettings.media = window.matchMedia(mobileSettings.query);
    const onChange = () => applyMobileSettingsMode();
    if (typeof mobileSettings.media.addEventListener === "function") {
      mobileSettings.media.addEventListener("change", onChange);
    } else if (typeof mobileSettings.media.addListener === "function") {
      mobileSettings.media.addListener(onChange);
    }
    applyMobileSettingsMode();
  }

  function installEvents() {
    window.addEventListener("hashchange", () => {
      const hashView = String(window.location.hash || "").replace(/^#/, "");
      if (views[hashView] && hashView !== state.view) setView(hashView);
    });

    qsa(".nav-item").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view || button.dataset.viewTarget));
    });

    el("confirmCancelButton")?.addEventListener("click", () => closeConfirmDialog(false));
    el("confirmAcceptButton")?.addEventListener("click", () => closeConfirmDialog(true));
    el("confirmBackdrop")?.addEventListener("click", () => closeConfirmDialog(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.confirmResolve) {
        closeConfirmDialog(false);
      }
    });

    el("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const nextKey = el("loginAdminKeyInput").value.trim();
      if (!nextKey) {
        setLoginError("Admin key is required.");
        return;
      }
      setLoginBusy(true, "Checking...");
      setLoginError("");
      await openConsoleWithKey(nextKey, { persist: true, checkingMessage: "Checking admin key." });
    });

    el("refreshButton").addEventListener("click", () => {
      refreshAll();
      closeMobileSettings();
    });

    el("pauseButton").addEventListener("click", () => {
      state.paused = !state.paused;
      el("pauseButton").textContent = state.paused ? "Resume" : "Pause";
      if (!state.paused) refreshAll({ quiet: true });
    });

    qsa("[data-time-range]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextRange = button.dataset.timeRange || "30m";
        if (!timeRanges[nextRange] || nextRange === state.timeRange) return;
        state.timeRange = nextRange;
        localStorage.setItem("proxyConsoleTimeRange", state.timeRange);
        renderTimeRangeControl();
        refreshAll();
      });
    });

    qsa("[data-request-status]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextStatus = button.dataset.requestStatus || "";
        if (state.requestFilters.status === nextStatus) return;
        state.requestFilters.status = nextStatus;
        state.requestsPage = 0;
        state.selectedRequestIds.clear();
        state.allMatchingSelected = false;
        syncRequestFilterUi();
        refreshAll({ quiet: true });
      });
    });

    ["filterModel", "filterProvider", "filterErrorType", "filterReason", "filterHttpStatus"].forEach((id) => {
      el(id)?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        state.requestsPage = 0;
        state.selectedRequestIds.clear();
        state.allMatchingSelected = false;
        refreshAll({ quiet: true });
        closeMobileSettings();
      });
    });

    el("applyFiltersButton").addEventListener("click", () => {
      state.requestsPage = 0;
      state.selectedRequestIds.clear();
      state.allMatchingSelected = false;
      refreshAll();
      closeMobileSettings();
    });
    el("clearFiltersButton").addEventListener("click", () => {
      ["filterModel", "filterProvider", "filterErrorType", "filterReason", "filterHttpStatus"].forEach((id) => {
        el(id).value = "";
      });
      state.requestFilters.status = "";
      syncRequestFilterUi();
      state.requestsPage = 0;
      state.selectedRequestIds.clear();
      state.allMatchingSelected = false;
      refreshAll();
      closeMobileSettings();
    });

    el("deleteRequestsButton")?.addEventListener("click", async () => {
      const ids = Array.from(state.selectedRequestIds);
      const filters = activeRequestFilters();
      const filterCount = Object.keys(filters).length;
      const mode = state.allMatchingSelected
        ? (filterCount ? "matching" : "all")
        : ids.length ? "selected" : filterCount ? "matching" : "all";
      const title = mode === "selected" ? "Delete selected requests" : mode === "matching" ? "Delete matching requests" : "Clear request history";
      const message = mode === "selected"
        ? `Delete ${fmtInt(ids.length)} selected request record${ids.length === 1 ? "" : "s"}? Runtime counters are not reset.`
        : mode === "matching"
          ? `Delete all ${fmtInt(state.data.requests?.total || 0)} request record${Number(state.data.requests?.total || 0) === 1 ? "" : "s"} matching the current filters? Runtime counters are not reset.`
          : "Clear all request history, runtime metrics, and diagnostic log records?";
      const confirmed = await openConfirmDialog({ title, message, acceptLabel: "Delete" });
      if (!confirmed) return;
      const button = el("deleteRequestsButton");
      button.disabled = true;
      try {
        let result;
        if (mode === "selected") {
          result = await apiPost("/-/admin/requests/delete", {
            confirm: "delete_request_records",
            request_ids: ids,
          });
          ids.forEach((id) => state.selectedRequestIds.delete(id));
        } else if (mode === "matching") {
          result = await apiPost("/-/admin/requests/delete-matching", {
            confirm: "delete_matching_request_records",
            filters,
          });
          state.allMatchingSelected = false;
          state.selectedRequestIds.clear();
        } else {
          result = await apiPost("/-/admin/requests/clear", {
            confirm: "clear_request_history",
            include_diagnostics: true,
          });
          state.allMatchingSelected = false;
          state.selectedRequestIds.clear();
        }
        state.requestsPage = 0;
        const deleted = result.history?.requests_deleted || result.memory?.recent_requests_deleted || 0;
        setNotice(
          mode === "all"
            ? `Request history cleared (${fmtInt(deleted)} records).`
            : `Deleted ${fmtInt(deleted)} request record${deleted === 1 ? "" : "s"}.`,
          "ok",
        );
        await refreshAll({ quiet: true, preserveNotice: true });
      } catch (err) {
        setNotice(`Delete requests failed: ${err.message}`);
      } finally {
        button.disabled = false;
        updateRequestSelectionUi();
        closeMobileSettings();
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-probe-model-picker]")) {
        qsa("[data-probe-model-picker].is-open").forEach((picker) => {
          const menu = picker.querySelector("[data-probe-model-menu]");
          const trigger = picker.querySelector("[data-probe-model-trigger]");
          if (menu) menu.hidden = true;
          if (trigger) trigger.setAttribute("aria-expanded", "false");
          picker.classList.remove("is-open");
        });
      }
    });

    el("providerSearchInput")?.addEventListener("input", syncProviderFiltersFromControls);
    ["providerFormatFilter", "providerStatusFilter", "providerKeyFilter"].forEach((id) => {
      el(id)?.addEventListener("change", syncProviderFiltersFromControls);
    });
    el("clearProviderFiltersButton")?.addEventListener("click", clearProviderFilters);

    el("reloadConfigButton").addEventListener("click", async () => {
      try {
        await apiPost("/-/admin/config/reload");
        await refreshAll({ quiet: true });
      } catch (err) {
        setNotice(`Config reload failed: ${err.message}`);
      }
    });

    el("globalProxyForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await runConfigMutation(form, async () => {
        await apiPatch("/-/admin/proxy", { proxy: String(form.elements.proxy.value || "").trim() });
        setNotice("Global proxy updated.", "ok");
      });
    });

    el("exportOverlayButton").addEventListener("click", async () => {
      try {
        const overlay = await apiGet("/-/admin/config/overlay");
        state.data.overlay = overlay;
        state.data.overlayPreviewPinned = true;
        state.data.overlayPreviewStatus = overlay.has_overlay ? "exported" : "empty";
        el("overlayPreview").textContent = JSON.stringify(overlay.overlay || {}, null, 2);
        renderOverlaySafety(state.data.config || {});
        setNotice("Masked overlay exported to preview.", "ok");
      } catch (err) {
        setNotice(`Overlay export failed: ${err.message}`);
      }
    });

    el("validateOverlayButton").addEventListener("click", async () => {
      try {
        const result = await apiPost("/-/admin/config/overlay/validate", {});
        state.data.overlayPreviewPinned = true;
        state.data.overlayPreviewStatus = result.preview?.valid ? "valid" : "invalid";
        el("overlayPreview").textContent = JSON.stringify(result.preview || {}, null, 2);
        renderOverlaySafety(state.data.config || {});
        setNotice("Overlay validation passed.", "ok");
      } catch (err) {
        state.data.overlayPreviewStatus = "failed";
        renderOverlaySafety(state.data.config || {});
        setNotice(`Overlay validation failed: ${err.message}`);
      }
    });

    el("clearOverlayButton").addEventListener("click", async () => {
      const confirmed = await openConfirmDialog({
        title: "Clear runtime overlay",
        message: "Clear runtime_config overlay and restart runtime objects from base config?",
        acceptLabel: "Clear",
      });
      if (!confirmed) return;
      try {
        const result = await apiPost("/-/admin/config/overlay/clear", { confirm: "clear_runtime_overlay" });
        state.data.overlayPreviewPinned = true;
        state.data.overlayPreviewStatus = "cleared";
        el("overlayPreview").textContent = JSON.stringify(
          { action: result.action, backup_path: result.backup_path || "", config: result.config || {} },
          null,
          2,
        );
        setNotice(result.backup_path ? `Overlay cleared. Backup: ${result.backup_path}` : "Overlay cleared.", "ok");
        await refreshAll({ quiet: true, preserveNotice: true });
      } catch (err) {
        setNotice(`Clear overlay failed: ${err.message}`);
      }
    });

    el("addProviderForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const formEl = event.currentTarget;
      const form = new FormData(formEl);
      const format = String(form.get("format") || "chat_completions");
      const proxy = String(form.get("proxy") || "").trim();
      const key = String(form.get("key") || "").trim();
      const keyProxy = String(form.get("key_proxy") || "").trim();
      const priority = Number(form.get("priority") || 0);
      const payload = {
        name: String(form.get("name") || "").trim(),
        base_url: String(form.get("base_url") || "").trim(),
        keys: [keyProxy ? { key, proxy: keyProxy } : key],
        priority,
      };
      if (proxy) payload.proxy = proxy;
      if (format !== "auto") {
        payload.formats = {
          chat_completions: { enabled: format === "chat_completions", path: "/v1/chat/completions" },
          responses: { enabled: format === "responses", path: "/v1/responses" },
          anthropic_messages: { enabled: format === "anthropic_messages", path: "/v1/messages" },
        };
      }
      try {
        await apiPost("/-/admin/providers", payload);
        if (formEl && typeof formEl.reset === "function") formEl.reset();
        await refreshAll({ quiet: true });
        setNotice(`Provider ${payload.name} added.`, "ok");
      } catch (err) {
        setNotice(`Add provider failed: ${err.message}`);
      }
    });

    el("modelRouteForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = {
        model: String(form.elements.model.value || "").trim(),
        providers: String(form.elements.providers.value || "").trim(),
        provider_select: String(form.elements.provider_select.value || "priority_failover").trim(),
      };
      await runConfigMutation(form, async () => {
        await apiPatch("/-/admin/models/routes", payload);
        setNotice(`Model route ${payload.model} saved.`, "ok");
      });
    });

    el("clearModelRouteFormButton").addEventListener("click", () => {
      el("modelRouteForm").reset();
      const editor = el("modelRouteEditor");
      if (editor) editor.open = false;
    });

    el("modelRoutes").addEventListener("click", async (event) => {
      const editButton = event.target.closest("[data-model-route-edit]");
      const deleteButton = event.target.closest("[data-model-route-delete]");
      if (editButton) {
        const model = editButton.dataset.modelRouteEdit || "";
        const route = routeByModel(model);
        if (!route) return;
        const form = el("modelRouteForm");
        const editor = el("modelRouteEditor");
        if (editor) editor.open = true;
        form.elements.model.value = model;
        form.elements.providers.value = routeProvidersText(route.providers);
        form.elements.provider_select.value = route.provider_select || "priority_failover";
        (editor || form).scrollIntoView({ block: "nearest" });
        form.elements.providers.focus();
        return;
      }
      if (deleteButton) {
        const model = deleteButton.dataset.modelRouteDelete || "";
        if (!model) return;
        const confirmed = await openConfirmDialog({
          title: "Delete model route",
          message: `Delete model route for ${model}?`,
          acceptLabel: "Delete",
        });
        if (!confirmed) return;
        deleteButton.disabled = true;
        try {
          await apiPost("/-/admin/models/routes/delete", { model });
          state.forceModelRoutesRender = true;
          setNotice(`Model route ${model} deleted.`, "ok");
          await refreshAll({ quiet: true, preserveNotice: true });
        } catch (err) {
          setNotice(`Delete model route failed: ${err.message}`);
        } finally {
          deleteButton.disabled = false;
        }
      }
    });

    el("closeDrawerButton").addEventListener("click", closeDrawer);
    el("closeProviderDrawerButton")?.addEventListener("click", closeProviderDrawer);
    el("closeModelDrawerButton")?.addEventListener("click", closeModelDrawer);
    el("modelCapabilities")?.addEventListener("click", (event) => {
      const chip = event.target.closest(".model-map-chip");
      if (chip) {
        const modelName = chip.dataset.modelName;
        if (modelName) {
          openModelDrawer(modelName);
        }
      }
    });
    el("mobileSettingsButton").addEventListener("click", toggleMobileSettings);
    el("closeMobileSettingsButton").addEventListener("click", closeMobileSettings);
    el("mobileSettingsBackdrop").addEventListener("click", closeMobileSettings);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDrawer();
        closeProviderDrawer();
        closeModelDrawer();
        closeMobileSettings();
      }
    });
  }

  function closeDrawer() {
    const drawer = el("detailDrawer");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  async function openModelDrawer(modelName) {
    const drawer = el("modelDrawer");
    const title = el("modelDrawerTitle");
    const subtitle = el("modelDrawerSubtitle");
    const body = el("modelDrawerBody");
    if (!drawer || !body) return;

    title.textContent = modelName;
    subtitle.textContent = "Loading benchmark data...";
    body.innerHTML = `
      <div class="loading-state pad" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0;">
        <div class="auth-progress" style="width: 40px; height: 40px; border: 3px solid var(--accent-soft, #eff6ff); border-top-color: var(--accent-strong, #3b82f6); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 16px; color: var(--muted); font-size: 13px; font-weight: 500;">Retrieving details from Artificial Analysis...</div>
      </div>
    `;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");

    try {
      const result = await apiGet(`/-/admin/model-summary/${encodeURIComponent(modelName)}`);
      if (result.error) {
        body.innerHTML = `
          <div style="padding: 24px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
            <strong style="display: block; font-size: 15px; color: var(--text); margin-bottom: 8px;">Model Not Found</strong>
            <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">${escapeHtml(result.error)}</p>
            ${result.suggestion ? `
              <div style="border-top: 1px solid var(--line-soft); padding-top: 16px; margin-top: 16px;">
                <span style="font-size: 12px; color: var(--muted); display: block; margin-bottom: 8px;">Did you mean?</span>
                <button class="button secondary pill-toggle" style="padding: 6px 12px; font-size: 12px; font-weight: bold;" onclick="window.LP_openModelDrawer('${escapeHtml(result.suggestion)}')">
                  ${escapeHtml(result.suggestion)}
                </button>
              </div>
            ` : ""}
          </div>
        `;
        subtitle.textContent = "Not Found";
      } else {
        const summary = result.summary || {};
        const url = result.source_url || `https://artificialanalysis.ai/models/${encodeURIComponent(result.model)}`;
        subtitle.textContent = result.model;

        const fmtRank = (item) => item && item.rank ? `#${item.rank} of ${item.total}` : "-";

        body.innerHTML = `
          <div class="model-summary-details">
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px;">
              ${summary.intelligence ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Quality (AA Index)</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${summary.intelligence.score}</strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.intelligence)}</small>
                </div>
              ` : ""}
              ${summary.speed ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Output Speed</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${summary.speed.tokens_per_second} <span style="font-size: 11px; font-weight: normal;">t/s</span></strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.speed)}</small>
                </div>
              ` : ""}
              ${summary.price_blended ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Blended Cost</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${fmtCost(summary.price_blended.price_per_1m_tokens)}<span style="font-size: 11px; font-weight: normal;">/1M</span></strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.price_blended)}</small>
                </div>
              ` : ""}
              ${summary.context_window ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Context Window</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${fmtTokenCount(summary.context_window.tokens)}</strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.context_window)}</small>
                </div>
              ` : ""}
            </div>

            <h3 class="drawer-section-title" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 24px 0 8px; border-bottom: 1px solid var(--line-soft); padding-bottom: 6px;">Pricing per 1M Tokens</h3>
            <div class="kv-grid drawer-kv" style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px;">
              ${summary.pricing ? `
                <span style="color: var(--muted);">Input Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${fmtCost(summary.pricing.input)}</span>
                <span style="color: var(--muted);">Output Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${fmtCost(summary.pricing.output)}</span>
                <span style="color: var(--muted);">Cache Hit Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.pricing.cache_hit !== null ? fmtCost(summary.pricing.cache_hit) : "-"}</span>
              ` : "<span>Pricing data</span><span>Not available</span>"}
            </div>

            <h3 class="drawer-section-title" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 24px 0 8px; border-bottom: 1px solid var(--line-soft); padding-bottom: 6px;">Latency Performance</h3>
            <div class="kv-grid drawer-kv" style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px;">
              ${summary.latency ? `
                <span style="color: var(--muted);">TTFT (Time To First Token)</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.latency.input_time_s !== null ? `${summary.latency.input_time_s.toFixed(2)}s` : "-"}</span>
                <span style="color: var(--muted);">Reasoning Time</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.latency.reasoning_time_s !== null ? `${summary.latency.reasoning_time_s.toFixed(2)}s` : "-"}</span>
                <span style="color: var(--muted);">Answer Generation</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.latency.answer_time_s !== null ? `${summary.latency.answer_time_s.toFixed(2)}s` : "-"}</span>
              ` : "<span>Latency data</span><span>Not available</span>"}
            </div>

            <h3 class="drawer-section-title" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 24px 0 8px; border-bottom: 1px solid var(--line-soft); padding-bottom: 6px;">Specifications & Openness</h3>
            <div class="kv-grid drawer-kv" style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; margin-bottom: 24px;">
              ${summary.model_size ? `
                <span style="color: var(--muted);">Active Parameters</span><span style="font-weight: 600; text-align: right;">${summary.model_size.active_params_b !== null ? `${summary.model_size.active_params_b}B` : "-"}</span>
                <span style="color: var(--muted);">Total Parameters</span><span style="font-weight: 600; text-align: right;">${summary.model_size.total_params_b !== null ? `${summary.model_size.total_params_b}B` : "-"}</span>
              ` : ""}
              ${summary.openness ? `
                <span style="color: var(--muted);">Openness Score</span><span style="font-weight: 600; text-align: right;"><strong>${summary.openness.score}</strong>/10 <small class="muted">(${fmtRank(summary.openness)})</small></span>
              ` : ""}
            </div>

            <div style="margin-top: 32px; display: flex; justify-content: center;">
              <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="button primary" style="display: inline-flex; align-items: center; gap: 8px; text-decoration: none; padding: 8px 16px; font-size: 13px; font-weight: bold;">
                View on Artificial Analysis ↗
              </a>
            </div>
          </div>
        `;
      }
    } catch (err) {
      body.innerHTML = `
        <div class="notice danger pad" style="margin: 15px;">
          <strong>Fetch Failed</strong>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
      subtitle.textContent = "Error";
    }
  }

  function closeModelDrawer() {
    const drawer = el("modelDrawer");
    if (drawer) {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
    }
  }

  window.LP_openModelDrawer = openModelDrawer;

  function startTimer() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(() => {
      if (!state.paused) refreshAll({ quiet: true });
    }, state.refreshMs);
  }

  function loadAdminKey() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("admin_key") || "";
    const fromStorage = localStorage.getItem("proxyConsoleAdminKey") || "";
    state.adminKey = String(fromQuery || fromStorage).trim();
    el("loginAdminKeyInput").value = state.adminKey;
    return { fromQuery: Boolean(fromQuery), hasKey: Boolean(state.adminKey) };
  }

  function loadTimeRange() {
    const saved = localStorage.getItem("proxyConsoleTimeRange") || "30m";
    state.timeRange = timeRanges[saved] ? saved : "30m";
  }

  function loadSavedView() {
    try {
      const hashView = String(window.location.hash || "").replace(/^#/, "");
      if (views[hashView]) return hashView;
      const savedView = localStorage.getItem("proxyConsoleView") || "overview";
      return views[savedView] ? savedView : "overview";
    } catch (err) {
      return "overview";
    }
  }

  async function init() {
    installMobileSettings();
    installEvents();
    const adminKeySource = loadAdminKey();
    loadTimeRange();
    setView(loadSavedView());
    if (!state.adminKey) {
      renderTimeRangeControl();
      showLogin("");
      return;
    }
    await openConsoleWithKey(state.adminKey, {
      persist: adminKeySource.fromQuery,
      checkingMessage: "Checking saved admin key.",
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

