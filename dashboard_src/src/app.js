import morphdom from "morphdom";
import { state } from "./state.js";
import { timeRanges, REQUEST_PAGE_SIZE, PROVIDERS_PAGE_SIZE, CONFIG_PROVIDERS_PAGE_SIZE, MODEL_ROUTES_PAGE_SIZE, PROVIDER_MODEL_MAP_PAGE_SIZE, AUDIT_PAGE_SIZE, OVERVIEW_PROVIDER_LIMIT, OVERVIEW_FAILURE_LIMIT, USAGE_MODEL_LIMIT, views } from "./constants.js";
import { adminQuery, withAdmin, apiGet, apiPost, apiPatch, readJson, errorMessage } from "./api.js";
import { t, getLang, setLang, applyI18n, initLang, onLangChange } from "./i18n.js";


  const el = (id) => document.getElementById(id);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));

  // === PERF TRACE (temporary debugging) ===
  // Enable from the browser console:  localStorage.setItem("perfTrace","1")
  // Disable: localStorage.removeItem("perfTrace")
  // Reload the page. Switch tabs / reproduce the freeze, then read the
  // console.table output (aggregated per function: calls / total / avg / max ms).
  window.__perf = { enabled: false, records: [] };
  try { window.__perf.enabled = localStorage.getItem("perfTrace") === "1"; } catch (_e) {}
  window.__perfMark = function (name, dtMs) {
    if (!window.__perf.enabled) return;
    window.__perf.records.push({ fn: name, dt: Math.round(dtMs * 100) / 100 });
    if (window.__perf.records.length >= 40) {
      const batch = window.__perf.records.splice(0, window.__perf.records.length);
      const byName = {};
      for (const r of batch) {
        if (!byName[r.fn]) byName[r.fn] = { calls: 0, total: 0, max: 0 };
        byName[r.fn].calls++; byName[r.fn].total += r.dt; byName[r.fn].max = Math.max(byName[r.fn].max, r.dt);
      }
      const rows = Object.entries(byName).map(([fn, s]) => ({
        fn, calls: s.calls, total_ms: Math.round(s.total), avg_ms: Math.round(s.total / s.calls * 100) / 100, max_ms: Math.round(s.max * 100) / 100,
      })).sort((a, b) => b.total_ms - a.total_ms);
      console.table(rows);
    }
  };
  // === END PERF TRACE ===

  // Remembers the model set last sent to /-/admin/model-pricing so repeated
  // refreshes with an unchanged model list do not re-issue the (potentially
  // expensive) batch resolve. Reset to "" to force a fresh fetch.
  let _lastPricingKey = "";

  // Re-entrancy guard for refreshAll: while a refresh (fetch + renderAll) is in
  // flight, additional refreshAll calls are coalesced into a single trailing
  // refresh rather than running concurrently. This prevents tab-switch bursts
  // and the 5s timer from stacking multiple full data fetches + sync renders,
  // which was the direct cause of the multi-second UI freeze.
  let _refreshInFlight = false;
  let _refreshWanted = false;
  let _refreshWantedArgs = null;

  function updateDOM(target, htmlString) {
    if (!target) return;
    const __t0 = performance.now();
    if (!target.innerHTML.trim()) {
      target.innerHTML = htmlString;
      window.__perfMark && window.__perfMark("updateDOM.innerHTML[" + (target.id || target.className || "?") + "]", performance.now() - __t0);
      return;
    }
    const wrapper = target.cloneNode(false);
    wrapper.innerHTML = htmlString;
    const __t1 = performance.now();
    morphdom(target, wrapper, { childrenOnly: true });
    const __t2 = performance.now();
    window.__perfMark && window.__perfMark("updateDOM.build[" + (target.id || target.className || "?") + "]", __t1 - __t0);
    window.__perfMark && window.__perfMark("updateDOM.morphdom[" + (target.id || target.className || "?") + "]", __t2 - __t1);
  }

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

  function proxyTestButton(title = "Test proxy") {
    return `<button class="button secondary icon-action proxy-test-button" type="button" data-proxy-test title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${iconSvg("activity")}</button>`;
  }

  function proxyControlInput(name, value = "", placeholder = "http://host:port · socks5://host:port · host:port", attrs = "") {
    return `
      <div class="proxy-control-row">
        <input class="control" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${attrs} />
        ${proxyTestButton()}
      </div>
    `;
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

  function interactiveElementHasFocus(root) {
    // Returns true when the user is actively interacting with a form control,
    // so auto-refresh should skip re-rendering to avoid stealing focus or
    // discarding in-progress input. Plain hover/scroll (no focus on a control)
    // does NOT count, allowing data updates to render normally.
    const active = document.activeElement;
    if (!active) return false;
    const tag = (active.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    // contentEditable elements also count as in-progress input.
    if (active.isContentEditable) return true;
    if (!root) return false;
    return Boolean(active.closest && active.closest(root));
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
    const explicitKey = opts && opts.key ? String(opts.key) : "";
    const dedupeKey = explicitKey || `msg:${tone}:${message}`;
    
    if (!message) {
      if (explicitKey && toasts.byKey.has(explicitKey)) dismissToast(toasts.byKey.get(explicitKey));
      return;
    }
    let node = toasts.byKey.get(dedupeKey);
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      node.dataset.toastKey = dedupeKey;
      toasts.byKey.set(dedupeKey, node);
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
      // Strip admin_key from the URL so it doesn't linger in browser history
      // or Referer headers. Only do this when the key came from the query string.
      if (persist) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("admin_key");
          window.history.replaceState(null, "", url.toString());
        } catch (_err) {
          // Ignore URL update failures; the session can still proceed.
        }
      }
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

  function openConfirmDialog({ title, message, acceptLabel = "Delete" }) {
    const dialog = el("confirmDialog");
    const backdrop = el("confirmBackdrop");
    const titleEl = el("confirmTitle");
    const messageEl = el("confirmMessage");
    const acceptButton = el("confirmAcceptButton");
    if (!dialog || !backdrop || !titleEl || !messageEl || !acceptButton) {
      setNotice(t("notice.confirm_unavailable"));
      return Promise.resolve(false);
    }
    if (state.confirmResolve) {
      state.confirmResolve(false);
      state.confirmResolve = null;
    }
    state.confirmLastFocus = document.activeElement;
    titleEl.textContent = title || t("confirm.title_default");
    messageEl.textContent = message || t("confirm.message_default");
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

  // ---- Generic form modal ------------------------------------------------
  // Renders arbitrary HTML body into a centered modal dialog. Returns nothing;
  // callers wire up their own submit handling inside the injected body. Closes
  // on backdrop click, Escape, or close button. Focus is restored on close.
  function openFormModal({ title, subtitle = "", bodyHtml = "" }) {
    const dialog = el("formModal");
    const backdrop = el("formModalBackdrop");
    const body = el("formModalBody");
    if (!dialog || !backdrop || !body) return;
    state.formModalLastFocus = document.activeElement;
    el("formModalTitle").textContent = title || "";
    el("formModalSubtitle").textContent = subtitle || "";
    updateDOM(body, bodyHtml);
    backdrop.hidden = false;
    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden", "false");
    // Inject the close icon (iconSvg is defined in render scope; inline SVG to
    // avoid ordering dependency).
    const closeBtn = el("formModalClose");
    if (closeBtn && !closeBtn.innerHTML.trim()) {
      updateDOM(closeBtn, `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>`);
    }
    // Focus first focusable element (input or button).
    const focusable = dialog.querySelector("input, select, textarea, button");
    if (focusable) focusable.focus();
  }

  function closeFormModal() {
    const dialog = el("formModal");
    const backdrop = el("formModalBackdrop");
    if (dialog) {
      dialog.classList.remove("is-open");
      dialog.classList.remove("is-model-map-modal");
      dialog.classList.remove("is-format-path-modal");
      dialog.setAttribute("aria-hidden", "true");
    }
    if (backdrop) backdrop.hidden = true;
    if (state.formModalLastFocus && typeof state.formModalLastFocus.focus === "function") {
      state.formModalLastFocus.focus();
    }
    state.formModalLastFocus = null;
  }

  // Provider preset templates for the Add Provider modal.
  const PROVIDER_PRESETS = [
    { name: "openai", base_url: "https://api.openai.com", format: "chat_completions", label: "OpenAI", env_var: "OPENAI_API_KEY", priority: 10 },
    { name: "anthropic", base_url: "https://api.anthropic.com", format: "anthropic_messages", label: "Anthropic", env_var: "ANTHROPIC_API_KEY", priority: 10 },
    { name: "deepseek", base_url: "https://api.deepseek.com", format: "chat_completions", label: "DeepSeek", env_var: "DEEPSEEK_API_KEY", priority: 8 },
    { name: "groq", base_url: "https://api.groq.com/openai", format: "chat_completions", label: "Groq", env_var: "GROQ_API_KEY", priority: 7 },
    { name: "openrouter", base_url: "https://openrouter.ai/api", format: "chat_completions", label: "OpenRouter", env_var: "OPENROUTER_API_KEY", priority: 6 },
    { name: "xai", base_url: "https://api.x.ai", format: "chat_completions", label: "xAI", env_var: "XAI_API_KEY", priority: 7 },
    { name: "mistral", base_url: "https://api.mistral.ai", format: "chat_completions", label: "Mistral", env_var: "MISTRAL_API_KEY", priority: 7 },
    { name: "siliconflow", base_url: "https://api.siliconflow.cn", format: "chat_completions", label: "SiliconFlow", env_var: "SILICONFLOW_API_KEY", priority: 6 },
    { name: "moonshot", base_url: "https://api.moonshot.cn", format: "chat_completions", label: "Moonshot", env_var: "MOONSHOT_API_KEY", priority: 6 },
    { name: "together", base_url: "https://api.together.xyz", format: "chat_completions", label: "Together", env_var: "TOGETHER_AI_API_KEY", priority: 6 },
  ];

  function addProviderModalBody() {
    const presetsHtml = PROVIDER_PRESETS.map((p) =>
      `<button type="button" class="provider-preset-chip" data-preset='${JSON.stringify(p)}' title="Fill from ${escapeHtml(p.label)} preset">${escapeHtml(p.label)}</button>`
    ).join("");
    return `
      <form id="addProviderModalForm" class="provider-create-form">
        <div class="provider-preset-section">
          <span class="provider-preset-label">Quick fill:</span>
          <div class="provider-preset-chips">${presetsHtml}</div>
        </div>
        <label class="field form-field-inline">
          <span>Provider name</span>
          <input class="control" name="name" required placeholder="my-provider" autocomplete="off" />
        </label>
        <div class="form-row-2 provider-main-fields">
          <label class="field form-field-inline">
            <span>Base URL</span>
            <input class="control" name="base_url" required placeholder="https://api.example.com/v1" autocomplete="off" />
          </label>
          <label class="field form-field-inline">
            <span>API key</span>
            <input class="control" name="key" type="password" required placeholder="sk-..." autocomplete="off" />
          </label>
        </div>
        <div class="form-row-2">
          <label class="field form-field-inline">
            <span>Upstream format</span>
            <select class="control" name="format">
              <option value="auto">Auto detect</option>
              <option value="chat_completions" selected>Chat Completions</option>
              <option value="responses">Responses</option>
              <option value="anthropic_messages">Anthropic Messages</option>
            </select>
          </label>
          <label class="field form-field-inline">
            <span>Priority</span>
            <input class="control" name="priority" type="number" value="0" min="0" />
          </label>
        </div>
        <details>
          <summary>Advanced options</summary>
          <div class="form-field-inline" style="margin-top:10px;display:grid;gap:10px">
            <label class="field form-field-inline">
              <span>Provider proxy <small class="muted">(optional)</small></span>
              ${proxyControlInput("proxy", "", "http://host:port · socks5://host:port · host:port", "autocomplete=\"off\"")}
            </label>
            <label class="field form-field-inline">
              <span>Initial key proxy <small class="muted">(optional)</small></span>
              ${proxyControlInput("key_proxy", "", "http://host:port · socks5://host:port · host:port", "autocomplete=\"off\"")}
            </label>
          </div>
        </details>
        <div class="form-actions">
          <button class="button secondary" type="button" id="addProviderModalCancel">Cancel</button>
          <button class="button primary" type="submit">Add Provider</button>
        </div>
      </form>
    `;
  }

  function openAddProviderModal() {
    openFormModal({
      title: t("form.add_provider_title"),
      subtitle: t("form.add_provider_sub"),
      bodyHtml: addProviderModalBody(),
    });
    const form = document.getElementById("addProviderModalForm");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const format = String(data.get("format") || "chat_completions");
        const proxy = String(data.get("proxy") || "").trim();
        const key = String(data.get("key") || "").trim();
        const keyProxy = String(data.get("key_proxy") || "").trim();
        const priority = Number(data.get("priority") || 0);
        const payload = {
          name: String(data.get("name") || "").trim(),
          base_url: String(data.get("base_url") || "").trim(),
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
          closeFormModal();
          await refreshAll({ quiet: true, staticData: true });
          setNotice(t("notice.provider_added", { name: payload.name }), "ok");
        } catch (err) {
          setNotice(t("notice.add_provider_failed", { error: err.message }));
        }
      });
    }
    const cancel = document.getElementById("addProviderModalCancel");
    if (cancel) cancel.addEventListener("click", closeFormModal);
    // Bind preset chips: fill form fields from the selected preset.
    document.querySelectorAll(".provider-preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        try {
          const preset = JSON.parse(chip.getAttribute("data-preset") || "{}");
          const nameField = form.querySelector('[name="name"]');
          const urlField = form.querySelector('[name="base_url"]');
          const formatField = form.querySelector('[name="format"]');
          const priorityField = form.querySelector('[name="priority"]');
          if (preset.name && nameField) nameField.value = preset.name;
          if (preset.base_url && urlField) urlField.value = preset.base_url;
          if (preset.format && formatField) formatField.value = preset.format;
          if (preset.priority != null && priorityField) priorityField.value = preset.priority;
        } catch (_e) { /* ignore */ }
      });
    });
  }

  function collectModelNames(status, config) {
    const names = new Set();
    // PRIORITIZE names that actually appear as pill labels: per-provider
    // canonical_map and models come first so they survive the slice(0,N) used
    // when building the pricing request URL.
    const caps = status?.models?.providers || {};
    Object.values(caps).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      (entry.models || []).forEach((m) => m && names.add(String(m)));
      Object.entries(entry.canonical_map || {}).forEach(([k, v]) => {
        if (k) names.add(String(k));
        if (v) names.add(String(v));
      });
    });
    // Manually configured maps.
    const maps = config?.models?.provider_model_map || {};
    Object.values(maps).forEach((map) => {
      if (map && typeof map === "object") {
        Object.entries(map).forEach(([k, v]) => {
          if (k) names.add(String(k));
          if (v) names.add(String(v));
        });
      }
    });
    (config?.models?.routes && Object.keys(config.models.routes) || []).forEach((m) => m && names.add(String(m)));
    // Union ids (may carry vendor prefixes); appended last so they only fill
    // remaining URL budget after the display labels are covered.
    (status?.models?.union_model_ids || []).forEach((m) => m && names.add(String(m)));
    return Array.from(names).filter(Boolean).sort();
  }

  // Render a small info icon with a hover tooltip showing input/output price
  // per 1M tokens for a model. Returns empty string when no pricing data is
  // available, so the UI stays clean. Data comes from state.data.pricing, which
  // is a batch read-only lookup against the local AA cache (no network).
  function lookupPricing(modelName) {
    const pricing = state.data.pricing || {};
    if (!modelName) return null;
    // Direct hit on the display label (most cases).
    let entry = pricing[modelName];
    if (entry && entry.available) return entry;
    // Try lowercased label.
    entry = pricing[String(modelName).toLowerCase()];
    if (entry && entry.available) return entry;
    // Union ids sometimes carry vendor prefixes (e.g. "Pro/Qwen/Qwen3-32B").
    // The display label is usually the last path segment ("Qwen3-32B"); try
    // that, then the AA slug form ("qwen3-32b").
    const parts = String(modelName).split(/[/\s]+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      entry = pricing[last];
      if (entry && entry.available) return entry;
      entry = pricing[last.toLowerCase()];
      if (entry && entry.available) return entry;
    }
    // Normalized form: lowercase, separators -> dash.
    const norm = String(modelName).toLowerCase().replace(/[.\s/]/g, "-").replace(/[^a-z0-9-]/g, "");
    entry = pricing[norm];
    if (entry && entry.available) return entry;
    return null;
  }

  function modelPriceTooltip(modelName) {
    const entry = lookupPricing(modelName);
    if (!entry) return "";
    const input = entry.input;
    const output = entry.output;
    const cacheHit = entry.cache_hit;
    const lines = [`Input ${fmtCost(input)}/M`, `Output ${fmtCost(output)}/M`];
    if (cacheHit !== null && cacheHit !== undefined && cacheHit !== "") {
      lines.push(`Cache hit ${fmtCost(cacheHit)}/M`);
    }
    if (entry.blended_per_million !== null && entry.blended_per_million !== undefined) {
      lines.push(`Blended ${fmtCost(entry.blended_per_million)}/M`);
    }
    const tip = lines.join(" · ");
    return `<span class="model-price-tip" data-tip="${escapeHtml(tip)}" tabindex="0" aria-label="Pricing for ${escapeHtml(modelName)}">${iconSvg("info")}</span>`;
  }

  async function refreshAll({ quiet = false, preserveNotice = false, staticData = false } = {}) {
    if (!state.adminKey) {
      setConnection(false, t("conn.admin_required"));
      showLogin(quiet ? "" : "Admin key is required to load console data.");
      return;
    }
    // Re-entrancy guard: a refresh in flight absorbs subsequent calls instead
    // of starting parallel fetch+render passes. Without this, a tab-switch burst
    // (which calls refreshAll) layered onto the 5s timer piled up multiple
    // concurrent full-data fetches and renderAll passes, each of which is sync
    // on the main thread, producing multi-second freezes.
    if (_refreshInFlight) {
      // Remember that another refresh is wanted (e.g. user switched tab while we
      // were fetching); we will run one more after the current finishes.
      _refreshWanted = true;
      const previous = _refreshWantedArgs;
      _refreshWantedArgs = {
        quiet: previous ? Boolean(previous.quiet && quiet) : Boolean(quiet),
        preserveNotice: previous ? Boolean(previous.preserveNotice || preserveNotice) : Boolean(preserveNotice),
        staticData: previous ? Boolean(previous.staticData || staticData) : Boolean(staticData),
      };
      return;
    }
    _refreshInFlight = true;
    try {

    try {
      setConnection(null, t("conn.reconnecting"));
      // Polling cost is dominated by the metrics payload when recent_requests
      // is large (hundreds of KB carrying the full per-attempt chain). To keep
      // the 5s background poll cheap on every view:
      //   - /-/admin/metrics returns the lightweight snapshot (counters +
      //     failure_summary + active, no recent_requests).
      //   - /-/admin/provider-activity returns the pre-aggregated per-provider
      //     stats so the client no longer rescans recent_requests per provider.
      //   - /-/admin/metrics/full (the heavy recent_requests ring) is only
      //     pulled on the overview view, where recent failures need the raw
      //     attempts, mirroring the existing view-aware timeseries/requests rule.
      const view = state.view || "overview";
      const needTimeseries = !quiet || view === "overview" || state.forceTimeseriesFetch;
      const needRequests = !quiet || view === "requests" || state.forceRequestsFetch;
      const needRecentRing = !quiet || view === "overview" || state.forceRequestsFetch;
      const needStaticAdminData = staticData || !quiet || !state.data.status || !state.data.config;
      state.forceTimeseriesFetch = false;
      state.forceRequestsFetch = false;

      const providerActivityPath = `/-/admin/provider-activity?limit=60&include_events=${view === "providers" ? "1" : "0"}`;
      const fetches = {
        metrics: apiGet("/-/admin/metrics"),
        providerActivity: apiGet(providerActivityPath),
        healthScores: apiGet("/-/admin/health/scores"),
      };
      if (needStaticAdminData) {
        fetches.status = apiGet("/-/admin/status");
        fetches.models = apiGet("/-/admin/models/capabilities");
        fetches.routing = apiGet("/-/admin/routing");
        fetches.config = apiGet("/-/admin/config");
        fetches.overlay = apiGet("/-/admin/config/overlay");
        fetches.audit = apiGet("/-/admin/audit?limit=12");
      }
      if (needRecentRing) fetches.metricsFull = apiGet("/-/admin/metrics/full");
      if (needTimeseries) fetches.timeseries = apiGet(timeseriesPath());
      if (needRequests) fetches.requests = apiGet(requestsPath());

      const entries = Object.entries(fetches);
      const keys = entries.map(([k]) => k);
      const values = await Promise.all(entries.map(([, v]) => v));
      const result = {};
      keys.forEach((k, i) => { result[k] = values[i]; });

      if (result.metrics !== undefined) state.data.metrics = result.metrics;
      if (result.metricsFull !== undefined) state.data.metricsFull = result.metricsFull;
      if (result.providerActivity !== undefined) {
        const pa = result.providerActivity || {};
        state.data.providerActivity = pa.providers || pa || {};
      }
      if (result.healthScores !== undefined) state.data.healthScores = result.healthScores;
      if (result.timeseries !== undefined) state.data.timeseries = result.timeseries;
      if (result.status !== undefined) state.data.status = result.status;
      if (result.models !== undefined) {
        state.data.status = { ...(state.data.status || {}), models: result.models };
      }
      if (result.requests !== undefined) state.data.requests = result.requests;
      if (result.routing !== undefined) state.data.routing = result.routing;
      if (result.config !== undefined) state.data.config = result.config;
      if (result.overlay !== undefined) state.data.overlay = result.overlay;
      if (result.audit !== undefined) state.data.audit = result.audit;
      // Bump the data version so derived caches (model capability memo, etc.)
      // invalidate together instead of deep-comparing payloads on each render.
      state.data.version = Number(state.data.version || 0) + 1;

      // Batch-fetch cached pricing for the models currently in view. This is a
      // read-only local-cache lookup on the server, but resolving unknown model
      // names against the AA index can be expensive, so: (1) cap the candidate
      // list, (2) skip the request entirely when the model set has not changed
      // since the last fetch, and (3) fire it without awaiting so a slow pricing
      // response never delays the main render. Pricing tooltips update on the
      // next render after the response lands.
      try {
        const modelNames = collectModelNames(state.data.status, state.data.config).slice(0, 60);
        const pricingKey = modelNames.join(",");
        if (modelNames.length && pricingKey !== _lastPricingKey) {
          _lastPricingKey = pricingKey;
          // Do NOT await: pricing is decorative enrichment. Let it resolve in
          // the background and re-render once it lands.
          apiGet(`/-/admin/model-pricing?models=${encodeURIComponent(pricingKey)}`)
            .then((pricingResp) => {
              state.data.pricing = (pricingResp && pricingResp.pricing) || {};
              // Trigger a quiet re-render so tooltips pick up the new pricing
              // without a full data refetch.
              try { renderAll(); } catch (_e) {}
            })
            .catch(() => { state.data.pricing = state.data.pricing || {}; });
        } else if (!modelNames.length) {
          state.data.pricing = {};
        }
      } catch (e) {
        // Pricing is best-effort enrichment; never block the dashboard on it.
        state.data.pricing = state.data.pricing || {};
      }

      renderAll();
      if (!preserveNotice) setNotice("");
      setConnection(true, `Updated ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      setConnection(false, t("conn.connection_error"));
      if (isAuthError(err)) {
        clearStoredAdminKey();
        state.adminKey = "";
        showLogin(t("auth.invalid"));
      } else {
        setNotice(t("notice.refresh_failed", { error: err.message }));
      }
    } finally {
      // Release the re-entrancy lock and, if another refresh was requested
      // while this one ran (coalesced), run exactly one trailing refresh.
      _refreshInFlight = false;
      if (_refreshWanted) {
        const args = _refreshWantedArgs || {};
        _refreshWanted = false;
        _refreshWantedArgs = null;
        // Schedule off the current call stack so the lock is fully released first.
        Promise.resolve().then(() => refreshAll(args));
      }
    }
    } catch (_outerErr) {
      // Defensive: never leave the re-entrancy lock held.
      _refreshInFlight = false;
    }
  }

  async function refreshProviderConfigView({ preserveNotice = true } = {}) {
    if (!state.adminKey) return false;
    try {
      const [status, config] = await Promise.all([
        apiGet("/-/admin/status"),
        apiGet("/-/admin/config"),
      ]);
      state.data.status = status;
      state.data.config = config;
      state.data.version = Number(state.data.version || 0) + 1;
      state.forceConfigRender = true;
      state.forceProvidersRender = true;
      state.forceModelCapsRender = true;
      renderAll();
      renderProviderDrawer({ force: true });
      if (!preserveNotice) setNotice("");
      setConnection(true, `Updated ${new Date().toLocaleTimeString()}`);
      return true;
    } catch (err) {
      setConnection(false, t("conn.connection_error"));
      setNotice(t("notice.config_refresh_failed", { error: err.message }), "bad");
      return false;
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

  function isUserReadingTooltip() {
    try {
      const hovered = Array.from(document.querySelectorAll(":hover"));
      for (let el of hovered) {
        let current = el;
        while (current && current.nodeType === 1) {
          try {
            if (
              current.hasAttribute("title") ||
              current.hasAttribute("data-tip") ||
              current.classList.contains("tooltip") ||
              current.classList.contains("has-tooltip") ||
              current.hasAttribute("aria-label")
            ) {
              return true;
            }
          } catch (e) {}
          current = current.parentElement;
        }
      }
    } catch (_err) {}
    return false;
  }

  function renderAll() {
    const __t0 = performance.now();
    renderTimeRangeControl();
    const view = state.view || "overview";
    let __ta = __t0;
    const __mark = (label) => {
      const t = performance.now();
      window.__perfMark && window.__perfMark("renderAll." + label, t - __ta);
      __ta = t;
    };
    if (view === "overview") {
      renderOnboardingBanner(); __mark("onboarding");
      renderMetrics(); __mark("metrics");
      renderOverviewVisuals(); __mark("visuals");
      renderTrafficChart(); __mark("traffic");
      renderUsageChart(); __mark("usage");
      renderProviderHealth(); __mark("providerHealth");
      renderHealthOverview(); __mark("healthOverview");
      renderRecentFailures(); __mark("recentFailures");
    } else if (view === "requests") {
      renderRequestsTable(); __mark("requestsTable");
    } else if (view === "providers") {
      renderProvidersTable(); __mark("providersTable");
      renderModelCapabilities(); __mark("modelCapabilities");
    } else if (view === "policy") {
      renderPolicy(); __mark("policy");
    } else if (view === "config") {
      renderConfig(); __mark("config");
    } else if (view === "playground") {
      renderPlayground(); __mark("playground");
    }
    renderProviderDrawer(); __mark("providerDrawer");
    bindViewTargetButtons();
    bindConfigTabs();
    bindProxyTestButtons();
    window.__perfMark && window.__perfMark("renderAll.total", performance.now() - __t0);
  }

  function bindViewTargetButtons() {
    qsa("[data-view-target]").forEach((button) => {
      if (button.dataset.boundViewTarget) return;
      button.dataset.boundViewTarget = "1";
      button.addEventListener("click", () => setView(button.dataset.viewTarget || "overview"));
    });
  }

  function switchConfigTab(tabName) {
    const tabNav = el("configTabNav");
    if (!tabNav) return;
    tabNav.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.configTab === tabName));
    document.querySelectorAll("[data-config-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.configTabPanel !== tabName;
    });
    try {
      localStorage.setItem("proxyConsoleConfigTab", tabName);
    } catch (_e) {}
  }

  function bindConfigTabs() {
    const tabNav = el("configTabNav");
    if (!tabNav || tabNav.dataset.boundConfigTabs) return;
    tabNav.dataset.boundConfigTabs = "1";
    tabNav.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-config-tab]");
      if (!btn) return;
      switchConfigTab(btn.dataset.configTab || "");
    });
    // Restore from localStorage on load
    try {
      const saved = localStorage.getItem("proxyConsoleConfigTab");
      if (saved) switchConfigTab(saved);
    } catch (_e) {}
  }

  function bindProxyTestButtons(root = document) {
    root.querySelectorAll("[data-proxy-test]").forEach((button) => {
      if (!button.innerHTML.trim()) updateDOM(button, iconSvg("activity"));
      if (button.dataset.boundProxyTest) return;
      button.dataset.boundProxyTest = "1";
      button.addEventListener("click", async () => {
        const row = button.closest(".proxy-control-row") || button.parentElement;
        const input = row?.querySelector?.("input[name='proxy'], input[name='key_proxy']");
        const proxy = String(input?.value || "").trim();
        if (!proxy) {
          button.classList.remove("is-ok", "is-bad", "is-testing");
          setNotice("Proxy is empty; this field will use direct or inherited routing.", "info");
          return;
        }
        button.disabled = true;
        button.classList.remove("is-ok", "is-bad");
        button.classList.add("is-testing");
        updateDOM(button, refreshSpinner());
        try {
          const resp = await apiPost("/-/admin/proxy/test", { proxy });
          const result = resp.result || {};
          button.classList.toggle("is-ok", Boolean(result.ok));
          button.classList.toggle("is-bad", !result.ok);
          updateDOM(button, iconSvg(result.ok ? "check" : "alert"));
          if (result.ok) {
            setNotice(`Proxy connected in ${fmtCompactMs(result.elapsed_ms || 0)}.`, "ok");
          } else {
            setNotice(`Proxy test failed: ${result.error || `HTTP ${result.status || "-"}`}`);
          }
        } catch (err) {
          button.classList.add("is-bad");
          updateDOM(button, iconSvg("alert"));
          setNotice(`Proxy test failed: ${err.message}`);
        } finally {
          button.classList.remove("is-testing");
          button.disabled = false;
        }
      });
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
    const recent = Array.isArray(state.data.metricsFull?.recent_requests) ? state.data.metricsFull.recent_requests : [];
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
      ${overviewMetricCard(t("metric.requests"), fmtInt(traffic.requests), `${fmtInt(counters.requests_in_flight || 0)} ${t("metric.in_flight")}`, requestFailureRate >= 0.1 ? "danger" : requestFailureRate > 0 ? "warning" : "info", "activity")}
      ${overviewMetricCard(t("kpi.success_rate"), fmtPct(successRate), `${fmtInt(displaySuccess)} ${t("metric.success")}`, successRate >= 0.98 ? "success" : successRate >= 0.95 ? "info" : successRate >= 0.85 ? "warning" : "danger", "check")}
      ${overviewMetricCard(t("kpi.first_byte"), latestLatency === null ? "-" : fmtMs(latestLatency), avgLatency === null ? t("kpi.no_samples") : `avg ${fmtMs(avgLatency)} / max ${fmtMs(maxLatency)}`, toneForLatency(avgLatency || latestLatency || 0), "clock")}
      ${overviewMetricCard(t("kpi.active_keys"), `${fmtInt(keyUsable)}/${fmtInt(keyTotal)}`, `${fmtInt(providerAvailable)}/${fmtInt(providerCount)} ${t("metric.providers")}`, healthTone === "bad" ? "danger" : healthTone === "soft" ? "warning" : healthTone === "warn" ? "info" : "success", "key")}
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
    const recent = Array.isArray(state.data.metricsFull?.recent_requests) ? state.data.metricsFull.recent_requests : [];
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
          <span class="usage-trend-total-icon">${iconSvg("activity")}</span>
          <span class="usage-trend-total-label">Consumed tokens</span>
          <strong>${escapeHtml(fmtTokenCount(displayUsage.total_tokens))}</strong>
          <small>${escapeHtml(fmtInt(displayUsage.total_tokens))} ${t("ov.total_in_window")}</small>
        </div>
        <div class="usage-trend-kpis">
          ${usageTrendKpi(t("kpi.input"), fmtTokenCount(displayUsage.input_tokens), "usage-input")}
          ${usageTrendKpi(t("kpi.output"), fmtTokenCount(displayUsage.output_tokens), "usage-output")}
          ${usageTrendKpi(t("metric.requests"), fmtInt(totals.requests), "usage-request")}
          ${usageTrendKpi(t("kpi.failures"), fmtInt(totals.failed), "usage-failure")}
          ${usageTrendKpi(t("kpi.success"), fmtPct(successRate), "usage-success")}
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
      if (btn.dataset.bounddatatrafficmode) return;
      btn.dataset.bounddatatrafficmode = "1";
      btn.addEventListener("click", () => {
        const mode = btn.dataset.trafficMode;
        if (state.trafficChartMode === mode) return;
        state.trafficChartMode = mode;
        renderTrafficChart();
      });
    });
  }

  function usageTrendKpi(label, value, tone) {
    const iconByTone = {
      "usage-input": "arrow-left",
      "usage-output": "arrow-right",
      "usage-request": "activity",
      "usage-failure": "alert",
      "usage-success": "check",
    };
    return `
      <div class="usage-trend-kpi ${escapeHtml(tone)}">
        <span class="usage-trend-icon">${iconSvg(iconByTone[tone] || "activity")}</span>
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
            <h3>${iconSvg("boxes")} Top ${fmtInt(USAGE_MODEL_LIMIT)} models</h3>
            <span>${fmtTokenCount(totalUsage.total_tokens)} tokens</span>
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
            <div class="usage-row usage-model-row">
              <span class="usage-rank usage-rank-tile">#${fmtInt(row.rank || 0)}</span>
              <div class="usage-row-head">
                <strong class="mono" title="${escapeHtml(row.label)}">
                  <span class="usage-model-name">${escapeHtml(row.label)}</span>
                </strong>
                <span class="usage-call-count">${escapeHtml(row.hint || "")}</span>
              </div>
              <div class="usage-track usage-track-calls" title="${escapeHtml(fmtInt(row.calls || 0))} calls">
                <span class="usage-fill calls" style="width:${callPct}%"></span>
              </div>
              <div class="usage-row-foot usage-model-foot">
                <span title="${escapeHtml(fmtInt(row.usage.total_tokens))} tokens">${iconSvg("activity")} <strong>${fmtTokenCount(row.usage.total_tokens)}</strong></span>
                <span title="${escapeHtml(fmtInt(row.usage.input_tokens))} input tokens">${iconSvg("arrow-left")} ${fmtTokenCount(row.usage.input_tokens)}</span>
                <span title="${escapeHtml(fmtInt(row.usage.output_tokens))} output tokens">${iconSvg("arrow-right")} ${fmtTokenCount(row.usage.output_tokens)}</span>
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
    if (!target) return;
    const names = providerNames(providers, configProviders);
    if (!names.length) {
      target.classList.add("empty");
      target.innerHTML = "No providers";
      return;
    }
    target.classList.remove("empty");
    // Use the lightweight view for the overview tiles: sorting and the visible
    // row only consume runtimeState / keyStats / activity.lastError, all of
    // which the server-aggregated providerActivity already provides. This
    // avoids running the full providerViewModel (model sort + route scan) for
    // every provider just to show the top 5.
    const views = names
      .map((name) => providerLightView(name))
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

  function renderOnboardingBanner() {
    const target = el("onboardingBanner");
    if (!target) return;
    const status = state.data.status || {};
    const config = state.data.config || {};
    const providers = config.providers || {};
    const providerNames = Object.keys(providers);
    const zeroConfig = !!status.zero_config;
    // Show banner when zero-config is active or no providers are configured.
    const hasProviders = providerNames.length > 0 && providerNames.some((name) => {
      const p = providers[name];
      return p && p.keys && Array.isArray(p.keys) && p.keys.length > 0;
    });
    if (!zeroConfig && hasProviders) {
      target.innerHTML = "";
      target.style.display = "none";
      return;
    }
    target.style.display = "";
    const presets = status.provider_presets || [];
    const presetChips = presets.length
      ? `<div class="onboarding-presets">
          <span class="onboarding-presets-label">Detected env vars (zero-config):</span>
          ${presets.slice(0, 6).map((p) => `<span class="onboarding-preset-chip" title="${escapeHtml(p.env_var)}">${escapeHtml(p.name)}</span>`).join("")}
        </div>`
      : "";
    target.innerHTML = `
      <div class="onboarding-banner">
        <div class="onboarding-banner-icon">${iconSvg("settings")}</div>
        <div class="onboarding-banner-content">
          <h3>${zeroConfig ? "Zero-config mode active" : "Welcome! Get started in seconds"}</h3>
          <p>${zeroConfig
            ? "Providers were auto-detected from environment variables. Create a config.json for full control, or add more providers below."
            : "No providers are configured yet. Set environment variables like OPENAI_API_KEY for zero-config, or manually add a provider."}</p>
          ${presetChips}
          <div class="onboarding-banner-actions">
            <button class="button primary" type="button" id="onboardingAddProvider" data-goto-modal="addProvider">Add Provider</button>
            <button class="button secondary" type="button" data-view-target="config">View Config</button>
          </div>
        </div>
      </div>
    `;
    const addBtn = document.getElementById("onboardingAddProvider");
    if (addBtn) addBtn.addEventListener("click", openAddProviderModal);
    bindViewTargetButtons();
  }

  function renderHealthOverview() {
    const target = el("healthOverview");
    if (!target) return;
    const hs = state.data.healthScores;
    if (!hs || !hs.providers) {
      target.innerHTML = "";
      return;
    }
    const overall = hs.overall || 0;
    const providers = hs.providers;
    const names = Object.keys(providers);
    if (!names.length) {
      target.innerHTML = `<div class="health-overview-empty">No provider health data</div>`;
      return;
    }
    // Sort by score ascending (worst first) so problem providers are visible.
    names.sort((a, b) => (providers[a].score || 0) - (providers[b].score || 0));
    const overallGrade = overall >= 90 ? "excellent" : overall >= 75 ? "good" : overall >= 50 ? "fair" : overall >= 25 ? "poor" : "critical";
    const overallTone = overall >= 75 ? "success" : overall >= 50 ? "warning" : "danger";
    const visibleNames = names.slice(0, 8);
    const hiddenCount = Math.max(0, names.length - visibleNames.length);
    target.innerHTML = `
      <div class="health-overview-header">
        <div class="health-overview-score tone-${escapeHtml(overallTone)}">
          <span class="health-score-ring ${escapeHtml(overallGrade)}">
            <strong>${fmtInt(overall)}</strong>
            <small>/ 100</small>
          </span>
          <span class="health-score-label">${escapeHtml(overallGrade)}</span>
        </div>
        <div class="health-overview-meta">
          <span>${iconSvg("server")} ${fmtInt(names.length)} ${names.length !== 1 ? "providers" : "provider"}</span>
        </div>
      </div>
      <div class="health-overview-list">
        ${visibleNames.map((name) => {
          const p = providers[name];
          const tone = p.score >= 75 ? "ok" : p.score >= 50 ? "warn" : p.score >= 25 ? "soft" : "bad";
          const gradeLabel = p.grade || "unknown";
          return `
            <div class="health-provider-row tone-${escapeHtml(tone)}" data-provider-card="${escapeHtml(name)}">
              <span class="health-provider-name mono">${escapeHtml(name)}</span>
              <div class="health-provider-bar">
                <div class="health-provider-bar-fill tone-${escapeHtml(tone)}" style="width:${Math.max(2, Math.min(100, p.score))}%"></div>
              </div>
              <span class="health-provider-score">${fmtInt(p.score)}</span>
              <span class="health-provider-grade grade-${escapeHtml(gradeLabel)}">${escapeHtml(gradeLabel)}</span>
            </div>
          `;
        }).join("")}
        ${hiddenCount ? `<div class="health-overview-more">+ ${fmtInt(hiddenCount)} more providers</div>` : ""}
      </div>
    `;
  }

  function enabledFormats(formats) {
    return Object.entries(formats || {})
      .filter(([_name, cfg]) => cfg && cfg.enabled)
      .map(([name]) => name);
  }

  function renderRecentFailures() {
    // Recent failures need the raw per-attempt chain, which lives in the full
    // metrics ring pulled only on the overview view (see refreshAll).
    const recent = state.data.metricsFull?.recent_requests || [];
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
      <div class="overview-summary-meta recent-failure-summary">
        <span>${iconSvg("alert")} latest ${fmtInt(rows.length)} / ${fmtInt(failures.length)}</span>
        <button class="overview-jump-button" type="button" data-view-target="requests" title="Open Requests" aria-label="Open Requests">${iconSvg("arrow-right")}</button>
      </div>
      <div class="recent-failure-list">
        ${rows.map((r) => {
          const failedAttempt = (r.attempts || []).find((a) => a.outcome !== "success") || {};
          const reason = failedAttempt.reason || failedAttempt.error_type || r.error || "-";
          const finalOk = r.status === "success" || r.status === "recovered" || (Number(r.status_code || 0) > 0 && Number(r.status_code || 0) < 400);
          const tone = finalOk ? "warning" : "danger";
          const firstByte = firstByteMsFromRequest(r);
          const latency = firstByte ? fmtMs(firstByte) : "-";
          return `
            <button class="recent-failure-row tone-${tone}" type="button" data-request-id="${escapeHtml(r.request_id || "")}">
              <span class="recent-failure-icon">${iconSvg(finalOk ? "undo" : "alert")}</span>
              <span class="recent-failure-main">
                <strong class="mono">${escapeHtml(r.model || "-")}</strong>
                <small>${iconSvg("clock")} ${escapeHtml(fmtDate(r.finished_at))}</small>
              </span>
              <span class="recent-failure-metrics">
                <span class="recent-failure-status">${statusBadge(r.status, r.status_code)}</span>
                <span class="recent-failure-latency">${iconSvg("bolt")} ${escapeHtml(latency)}</span>
              </span>
              <span class="recent-failure-reason ${escapeHtml(toneForText(reason))}" title="${escapeHtml(reason)}">${highlightKeywords(reason)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
    target.querySelectorAll("[data-request-id]").forEach((row) => {
      if (row.dataset.bounddatarequestid) return;
      row.dataset.bounddatarequestid = "1";
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
    const statusIcon = statusTone === "success" ? "check" : statusTone === "warning" ? "rotate" : "alert";
    const attemptText = attempts.length
      ? `${fmtInt(attempts.length)} attempts${failedAttempts ? ` / ${fmtInt(failedAttempts)} failed` : ""}`
      : "no attempts";
    const firstByte = firstByteMsFromRequest(r);
    const metaParts = [fmtDate(r.finished_at), format].filter(Boolean);
    const metricParts = [
      firstByte ? fmtMs(firstByte) : "-",
      attempts.length ? `${fmtInt(attempts.length)}x${failedAttempts ? `/${fmtInt(failedAttempts)}` : ""}` : "0x",
    ];
    const requestId = String(r.request_id || "");
    const isSelected = state.allMatchingSelected || state.selectedRequestIds.has(requestId);
    const checked = isSelected ? "checked" : "";
    return `
      <article class="request-summary-row tone-${escapeHtml(statusTone)} ${isSelected ? "is-selected" : ""}" data-request-row="${escapeHtml(requestId)}" tabindex="0" role="button" aria-label="Open request ${escapeHtml(requestId)}">
        <label class="request-row-select" title="Select request" aria-label="Select request">
          <input type="checkbox" data-request-select="${escapeHtml(requestId)}" ${checked} />
        </label>
        <span class="request-row-state" aria-hidden="true">${iconSvg(statusIcon)}</span>
        <span class="request-row-main">
          <strong class="mono" title="${escapeHtml(r.model || "-")}">${escapeHtml(r.model || "-")}</strong>
          <small>
            <span>${escapeHtml(metaParts.join(" / "))}</span>
          </small>
        </span>
        <span class="request-row-status">
          ${statusBadge(r.status, r.status_code)}
          <small class="mono">${code || "-"}</small>
        </span>
        <span class="request-row-route">
          <span class="request-provider-pill" title="${escapeHtml(provider)}">${iconSvg("server")} ${escapeHtml(provider)}</span>
          <span class="route-pill ${escapeHtml(routeTone)}">${escapeHtml(routeOutcomeLabel(route))}</span>
        </span>
        <span class="request-row-metrics mono">
          <strong title="${escapeHtml(fmtInt(usage.total_tokens))} tokens"><span>${escapeHtml(fmtTokenCount(usage.total_tokens))}</span><i></i><span>${escapeHtml(fmtCost(usage.cost_usd))}</span></strong>
          <small title="${escapeHtml(`${firstByte ? fmtMs(firstByte) : "-"} first byte / ${attemptText}`)}">${escapeHtml(metricParts.join(" / "))}</small>
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
      if (row.dataset.bounddatarequestrow) return;
      row.dataset.bounddatarequestrow = "1";
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
      if (input.dataset.bounddatarequestselect) return;
      input.dataset.bounddatarequestselect = "1";
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
        updateDOM(deleteButton, iconSvg("trash"));
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
      if (button.dataset.bounddatarequestpage) return;
      button.dataset.bounddatarequestpage = "1";
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
      if (button.dataset.bounddatalistpagekey) return;
      button.dataset.bounddatalistpagekey = "1";
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
    // Skip auto-refresh re-render only while the user is actively typing into a
    // control inside this table (filters, pagination input, inline forms). A
    // plain focus on a non-input element (e.g. a card or button) still allows
    // the table to refresh so model/capability updates appear promptly.
    if (!state.forceProvidersRender && interactiveElementHasFocus("#providersTable")) return;
    state.forceProvidersRender = false;

    // Filter / sort / paginate using the lightweight view (no per-provider
    // model sort, no route-table scan). Only the providers that survive onto
    // the visible page are upgraded to the full providerViewModel, so the
    // expensive modelItems/routeModels work is bounded by page size, not by
    // the total provider count.
    const allNames = providerNames(providers, configProviders);
    const filtered = allNames
      .map((name) => providerLightView(name))
      .filter(providerMatchesFiltersLight)
      .sort((a, b) => {
        const statusOrder = { normal: 0, degraded: 1, cooldown: 2, unavailable: 3, disabled: 4 };
        const aStatus = statusOrder[a.runtimeState.id] ?? 99;
        const bStatus = statusOrder[b.runtimeState.id] ?? 99;
        if (aStatus !== bStatus) return aStatus - bStatus;
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.name.localeCompare(b.name);
      });

    if (!allNames.length) {
      target.innerHTML = `<div class="empty pad">No providers configured</div>`;
      return;
    }

    if (!filtered.length) {
      target.innerHTML = `<div class="empty pad">No providers match the current filters</div>`;
      return;
    }

    const page = paginate(filtered, "providersPage", PROVIDERS_PAGE_SIZE);
    const visibleCards = page.items.map((view) => providerViewModel(view.name));
    target.innerHTML = `
      ${panelPagination("providersPage", page, "providers")}
      <div class="provider-card-grid">${visibleCards.map(providerRuntimeCard).join("")}</div>
    `;

    bindPanelPagination(target);
    bindActionButtons(target);
    bindProviderCards(target);
  }

  function providerNames(runtimeProviders, configProviders) {
    return Array.from(new Set([
      ...Object.keys(runtimeProviders || {}),
      ...Object.keys(configProviders || {}),
    ])).sort();
  }

  function providerViewModel(name) {
    const __t0 = performance.now();
    const runtime = state.data.status?.router?.providers?.[name] || {};
    const config = state.data.config?.providers?.[name] || {};
    const capability = state.data.status?.models?.providers?.[name] || {};
    const formats = config.formats || runtime.formats || {};
    const runtimeKeys = Array.isArray(runtime.keys) ? runtime.keys : [];
    const configKeys = Array.isArray(config.keys) ? config.keys : [];
    const keys = mergedProviderKeys(runtimeKeys, configKeys);
    const keyStats = providerKeyStats(runtimeKeys, configKeys);
    const formatNames = enabledFormats(formats);
    const __t1 = performance.now();
    const modelItems = providerModelItems(name, capability);
    const __t2 = performance.now();
    const routeModels = providerRouteModels(name);
    const __t3 = performance.now();
    const activity = providerActivity(name);
    const runtimeState = providerRuntimeState(runtime, keyStats, config);
    const __t4 = performance.now();
    window.__perfMark && window.__perfMark("viewModel.modelItems[" + name + "]", __t2 - __t1);
    window.__perfMark && window.__perfMark("viewModel.routeModels[" + name + "]", __t3 - __t2);
    window.__perfMark && window.__perfMark("viewModel.total[" + name + "]", __t4 - __t0);
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

  // Lightweight provider view used for filtering, sorting and pagination in
  // renderProvidersTable/renderProviderHealth. It computes everything the
  // filter/sort/pagination steps need WITHOUT calling providerModelItems (which
  // sorts the full model list per provider) or providerRouteModels (which scans
  // the whole route table twice). Only the providers that survive filtering and
  // land on the visible page pay for the full providerViewModel. Activity comes
  // from the server-aggregated providerActivity cache, so it is O(1) here too.
  function providerLightView(name) {
    const runtime = state.data.status?.router?.providers?.[name] || {};
    const config = state.data.config?.providers?.[name] || {};
    const formats = config.formats || runtime.formats || {};
    const runtimeKeys = Array.isArray(runtime.keys) ? runtime.keys : [];
    const configKeys = Array.isArray(config.keys) ? config.keys : [];
    const keyStats = providerKeyStats(runtimeKeys, configKeys);
    const formatNames = enabledFormats(formats);
    const activity = providerActivity(name);
    const runtimeState = providerRuntimeState(runtime, keyStats, config);
    // Cheap model count for the card badge without sorting the full list.
    const capability = state.data.status?.models?.providers?.[name] || {};
    const modelCountLite =
      (Array.isArray(capability.models) ? capability.models.length : 0) ||
      Object.keys(capability.canonical_map || {}).length;
    return {
      name,
      runtime,
      config,
      priority: Number(config.priority || 0),
      capability,
      formats,
      keyStats,
      formatNames,
      activity,
      runtimeState,
      modelCountLite,
      isLight: true,
    };
  }

  function providerMatchesFiltersLight(view) {
    const filters = state.providerFilters || {};
    if (filters.format && !view.formatNames.includes(filters.format)) return false;
    if (filters.status && view.runtimeState.id !== filters.status) return false;
    if (filters.keys === "usable" && view.keyStats.usable <= 0) return false;
    if (filters.keys === "partial" && !(view.keyStats.usable > 0 && view.keyStats.usable < view.keyStats.total)) return false;
    if (filters.keys === "none" && view.keyStats.usable > 0) return false;
    if (filters.keys === "cooldown" && view.keyStats.cooldown <= 0) return false;
    const search = String(filters.search || "").trim().toLowerCase();
    if (!search) return true;
    // Search covers identity + format + the last error reason. Per-model search
    // is intentionally deferred to the provider drawer, where the full model
    // list is already rendered; matching it here would re-scan every model on
    // every provider just to filter the list.
    const haystack = [
      view.name,
      view.config.base_url,
      view.runtimeState.label,
      view.formatNames.join(" "),
      view.activity.lastError?.reason,
    ].join(" ").toLowerCase();
    return haystack.includes(search);
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
    // modelCapabilityItemsMemo returns a shared cached array; copy it before
    // appending the provider-specific provider_model_map / route entries so the
    // cache stays pristine for other callers (e.g. modelCapabilityCard).
    const base = modelCapabilityItemsMemo(
      name,
      Array.isArray(capability.models) ? capability.models : [],
      capability.canonical_map || {},
    );
    const items = [];
    const seen = new Set();
    const seenKey = (value) => String(value || "").trim().toLowerCase();
    const rememberModelItem = (item) => {
      [item?.label, item?.raw].forEach((value) => {
        const key = seenKey(value);
        if (key) seen.add(key);
      });
    };
    const configuredMap = state.data.config?.models?.provider_model_map?.[name] || {};
    Object.entries(configuredMap || {})
      .filter(([_canonical, raw]) => raw)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .forEach(([canonical, raw]) => {
        if (seen.has(seenKey(canonical)) || seen.has(seenKey(raw))) return;
        const item = {
          label: String(canonical || raw),
          raw: String(raw || ""),
          title: raw && raw !== canonical ? `${canonical} maps to ${raw}` : String(canonical || raw),
          manual: true,
        };
        items.push(item);
        rememberModelItem(item);
      });
    base.forEach((item) => {
      if (seen.has(seenKey(item.label)) || seen.has(seenKey(item.raw))) return;
      items.push(item);
      rememberModelItem(item);
    });
    providerRouteModels(name).forEach((model) => {
      if (seen.has(seenKey(model))) return;
      const item = { label: model, raw: "", title: model };
      items.push(item);
      rememberModelItem(item);
    });
    return items.map((item) => ({
      ...item,
      disabled: isProviderModelDisabled(name, item.label),
      pending: Object.prototype.hasOwnProperty.call(providerModelDraft(name), String(item.label || "")),
    }));
  }

  function providerModelDisabledMap(provider) {
    const disabled = state.data.config?.models?.provider_model_disabled?.[provider] || {};
    return disabled && typeof disabled === "object" ? disabled : {};
  }

  function savedProviderModelDisabled(provider, model) {
    const disabled = providerModelDisabledMap(provider);
    const key = String(model || "");
    return Boolean(disabled[key] || disabled[key.toLowerCase()]);
  }

  function providerModelDraft(provider) {
    const drafts = state.providerModelDrafts || {};
    const draft = drafts[provider] || {};
    return draft && typeof draft === "object" ? draft : {};
  }

  function isProviderModelDisabled(provider, model) {
    const draft = providerModelDraft(provider);
    const key = String(model || "");
    if (Object.prototype.hasOwnProperty.call(draft, key)) return Boolean(draft[key]);
    return savedProviderModelDisabled(provider, model);
  }

  function setProviderModelDisabledDraft(provider, model, disabled) {
    if (!provider || !model) return;
    if (!state.providerModelDrafts) state.providerModelDrafts = {};
    const draft = { ...(state.providerModelDrafts[provider] || {}) };
    if (Boolean(disabled) === savedProviderModelDisabled(provider, model)) {
      delete draft[model];
    } else {
      draft[model] = Boolean(disabled);
    }
    if (Object.keys(draft).length) state.providerModelDrafts[provider] = draft;
    else delete state.providerModelDrafts[provider];
  }

  function setProviderModelsDisabledDraft(provider, modelStates) {
    if (!provider || !modelStates || typeof modelStates !== "object") return;
    if (!state.providerModelDrafts) state.providerModelDrafts = {};
    const draft = { ...(state.providerModelDrafts[provider] || {}) };
    Object.entries(modelStates).forEach(([model, disabled]) => {
      if (!model) return;
      if (Boolean(disabled) === savedProviderModelDisabled(provider, model)) {
        delete draft[model];
      } else {
        draft[model] = Boolean(disabled);
      }
    });
    if (Object.keys(draft).length) state.providerModelDrafts[provider] = draft;
    else delete state.providerModelDrafts[provider];
  }

  function providerModelDraftCount(provider) {
    return Object.keys(providerModelDraft(provider)).length;
  }

  function filteredProviderModelItems(items) {
    const filters = state.providerModelFilters || {};
    const search = String(filters.search || "").trim().toLowerCase();
    const status = String(filters.status || "");
    return (items || []).filter((item) => {
      if (status === "enabled" && item.disabled) return false;
      if (status === "disabled" && !item.disabled) return false;
      if (!search) return true;
      return [item.label, item.raw, item.title].join(" ").toLowerCase().includes(search);
    });
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
    // Provider activity is now aggregated server-side by /-/admin/provider-activity
    // (one pass over recent_requests for all providers) instead of rescanning the
    // full recent_requests ring here for every provider on every render. Fall back
    // to an empty activity object when the aggregate has not loaded yet so callers
    // keep rendering neutral placeholders.
    const aggregate = (state.data.providerActivity || {})[name];
    if (aggregate) return aggregate;
    return {
      events: [],
      total: 0,
      ok: 0,
      warn: 0,
      bad: 0,
      successRate: null,
      latestLatency: 0,
      avgLatency: 0,
      lastError: null,
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
    const keyUsable = view.keyStats.usable;
    const keyTotal = view.keyStats.total;
    const keyTone = keyUsable === 0 && keyTotal > 0 ? "bad" : keyUsable < keyTotal ? "warn" : "ok";
    const successRate = view.activity.successRate;
    const successText = successRate === null ? "—" : fmtPct(successRate);
    const latencyText = view.activity.latestLatency ? fmtCompactMs(view.activity.latestLatency) : "—";
    const modelCount = view.modelItems.length;
    const recentError = view.activity.lastError?.reason || "";
    const sparkStats = providerSparklineStats(view.activity);
    const isDisabled = view.runtimeState.id === "disabled";
    const successTone = successRate === null ? "neutral" : successRate >= 0.9 ? "ok" : successRate >= 0.5 ? "warn" : "bad";
    const latencyTone = view.activity.latestLatency ? (view.activity.latestLatency <= 800 ? "ok" : view.activity.latestLatency <= 2500 ? "warn" : "bad") : "neutral";
    return `
      <article class="provider-runtime-card provider-health-tile ${view.runtimeState.tone}" data-provider-card="${escapeHtml(view.name)}">
        <div class="provider-card-topline">
          <span class="provider-status-dot ${view.runtimeState.badge}"></span>
          <div class="provider-title-block">
            <div class="provider-name name-${view.runtimeState.badge}" title="${escapeHtml(view.name)}">${escapeHtml(view.name)}</div>
            <div class="provider-meta">${view.formatNames.length ? view.formatNames.map(formatChip).join("") : `<span class="muted">No formats</span>`}<span class="priority-chip prio-${view.priority >= 10 ? "hi" : view.priority >= 5 ? "mid" : "lo"}" title="Priority ${view.priority}">P${view.priority}</span></div>
          </div>
          <button class="provider-card-settings-btn" type="button" data-provider-open="${escapeHtml(view.name)}" title="Settings" aria-label="Provider settings">${iconSvg("settings")}</button>
        </div>
        <div class="provider-card-state-row">
          <span class="provider-state-badge tone-${view.runtimeState.badge}">${escapeHtml(view.runtimeState.label)}</span>
          <span class="provider-state-note">${escapeHtml(`${fmtInt(keyUsable)}/${fmtInt(keyTotal)} keys${view.keyStats.cooldown > 0 ? ` · ${fmtInt(view.keyStats.cooldown)} cooldown` : ""}`)}</span>
        </div>

        <div class="provider-card-signal">
          <span class="provider-signal-item model-count" title="${escapeHtml(`${fmtInt(modelCount)} available models`)}">${iconSvg("boxes")}<strong>${escapeHtml(view.capability.status === "pending" ? "..." : fmtInt(modelCount))}</strong><small>models</small></span>
          <span class="provider-signal-item ${escapeHtml(successTone)}" title="Success rate">${iconSvg("activity")}<strong>${escapeHtml(successText)}</strong><small>success</small></span>
          <span class="provider-signal-item ${escapeHtml(latencyTone)}" title="Latest first byte latency">${iconSvg("clock")}<strong>${escapeHtml(latencyText)}</strong><small>ttfb</small></span>
        </div>
        ${providerSparkline(view.activity, view.name)}

        ${recentError ? `<div class="provider-card-error"><span class="provider-card-error-icon">${iconSvg("alert")}</span><strong>${messageMarkup(recentError)}</strong></div>` : ""}

        <div class="provider-card-footer">
          <div class="provider-card-stats">
            ${compactStatInline("key", `${fmtInt(keyUsable)}/${fmtInt(keyTotal)}`, keyTone)}
            ${compactStatInline("activity", `${fmtInt(sparkStats.calls)}x`, sparkStats.calls ? "neutral" : "neutral")}
            ${compactStatInline("clock", sparkStats.avg === null ? "—" : fmtCompactMs(sparkStats.avg), sparkStats.avg === null ? "neutral" : sparkStats.avg <= 800 ? "ok" : sparkStats.avg <= 2500 ? "warn" : "bad")}
          </div>
          <div class="provider-runtime-actions">
            <button class="button primary compact-action icon-action" type="button" data-provider-open="${escapeHtml(view.name)}" title="Details" aria-label="Details">${iconSvg("info")}</button>
            ${actionButton(view.runtime.runtime_enabled !== false ? "Disable" : "Enable", `/providers/${encodeURIComponent(view.name)}/${view.runtime.runtime_enabled !== false ? "disable" : "enable"}`, view.runtime.runtime_enabled !== false ? "danger" : "secondary", { iconOnly: true })}
            ${actionButton("Clear cooldown", `/providers/${encodeURIComponent(view.name)}/cooldown/clear`, "secondary", { iconOnly: true })}
          </div>
        </div>
      </article>
    `;
  }

  function compactStatInline(iconName, value, tone) {
    return `<span class="provider-stat ${tone || ""}" title="${escapeHtml(value)}">${iconSvg(iconName)}<strong>${escapeHtml(value)}</strong></span>`;
  }

  function providerSparklineStats(activity) {
    const events = (Array.isArray(activity?.events) ? activity.events : []).slice(-36);
    const latencies = events.map((event) => Math.max(0, Number(event.latencyMs) || 0));
    const avg = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
    const failed = events.filter((event) => event.ok === false || event.status === "failed").length;
    return { calls: events.length, avg, failed, latencies, events };
  }

  function providerSparkline(activity, providerName) {
    const stats = providerSparklineStats(activity);
    const events = stats.events;
    const slotCount = 36;
    if (!events.length) {
      return `
        <div class="provider-sparkline provider-call-strip is-empty" title="No recent provider activity">
          <div class="provider-call-bars" aria-hidden="true">
            ${Array.from({ length: slotCount }, () => `<i class="is-empty-slot"></i>`).join("")}
          </div>
          <div class="provider-call-axis"><span>PAST</span><span>NOW</span></div>
        </div>
      `;
    }
    const failed = stats.failed;
    const slow = events.filter((event) => Number(event.latencyMs || 0) > 2500).length;
    const tone = failed ? "bad" : slow ? "warn" : "ok";
    const avg = stats.avg || 0;
    const emptySlots = Array.from({ length: Math.max(0, slotCount - events.length) }, () => (
      `<i class="is-empty-slot"></i>`
    ));
    const eventBars = events.map((event) => {
      const latency = Math.max(0, Number(event.latencyMs) || 0);
      const bad = event.ok === false || event.status === "failed";
      const warn = !bad && latency > 2500;
      const label = `${bad ? "failed" : warn ? "slow" : "ok"} / ${fmtCompactMs(latency || avg)}`;
      return `<i class="${bad ? "is-bad" : warn ? "is-warn" : "is-ok"}" title="${escapeHtml(label)}"></i>`;
    });
    const bars = emptySlots.concat(eventBars).slice(-slotCount).join("");
    return `
      <div class="provider-sparkline provider-call-strip tone-${escapeHtml(tone)}" title="${escapeHtml(`${providerName}: ${events.length} recent calls / avg ${fmtCompactMs(avg)} / ${failed} failed`)}">
        <div class="provider-call-bars" aria-hidden="true">${bars}</div>
        <div class="provider-call-axis"><span>PAST</span><span>NOW</span></div>
      </div>
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

  function providerMiniChart(activity, providerName) {
    const allEvents = Array.isArray(activity?.events) ? activity.events : [];
    const events = allEvents.slice(-30);
    const W = 100;
    const H = 56;
    const pad = 4;
    const safeId = String(providerName || "x").replace(/[^a-zA-Z0-9_-]/g, "_");
    const gradId = `pmc-${safeId}-${Math.random().toString(36).slice(2, 6)}`;

    // Latency thresholds (ms): green ≤ 2000, amber ≤ 5000, red > 5000
    const GREEN_MAX = 2000;
    const AMBER_MAX = 5000;
    const TIER_COLOR = { fast: "var(--pmc-green)", med: "var(--pmc-amber)", slow: "var(--pmc-red)" };

    function latencyTier(ms) {
      if (ms <= GREEN_MAX) return "fast";
      if (ms <= AMBER_MAX) return "med";
      return "slow";
    }

    // Stats — 0ms is valid (means TTFB was 0 or unrecorded), treat as 0
    const latencies = events.map((e) => Number(e.latencyMs) || 0);
    const avgLat = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const maxLat = latencies.length ? Math.max(...latencies) : 0;
    const total = events.length;

    // Legend — TTFB value colored by avg tier, everything else neutral
    const avgTier = latencyTier(avgLat);
    const legendHTML = `
      <div class="pmc-legend">
        <span class="pmc-legend-label">TTFB</span>
        <span class="pmc-legend-val" style="color:${TIER_COLOR[avgTier]}">${fmtCompactMs(avgLat)}</span>
        <span class="pmc-legend-sep"></span>
        <span class="pmc-legend-meta">${total} calls · max ${fmtCompactMs(maxLat)}</span>
      </div>`;

    // --- Empty state ---
    if (!events.length) {
      return `
        <div class="provider-chart-block is-empty">
          <div class="pmc-legend">
            <span class="pmc-legend-label">TTFB</span>
            <span class="pmc-legend-val muted">—</span>
          </div>
          <div class="pmc-chart-wrap">
            <svg class="provider-mini-chart is-empty" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="No recent activity">
              <defs>
                <pattern id="pmc-grid-${safeId}" x="0" y="0" width="20" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 10" fill="none" stroke="var(--line-soft)" stroke-width="0.3" />
                </pattern>
              </defs>
              <rect width="${W}" height="${H}" fill="url(#pmc-grid-${safeId})" opacity="0.7" />
              <line x1="0" y1="${(H * 0.5).toFixed(1)}" x2="${W}" y2="${(H * 0.5).toFixed(1)}" stroke="var(--line-strong)" stroke-width="0.3" stroke-dasharray="4 3" />
              <circle cx="${W * 0.5}" cy="${H * 0.5}" r="2" fill="var(--line-strong)" class="pmc-pulse-dot" />
            </svg>
            <span class="pmc-empty-label">${iconSvg("activity")}</span>
          </div>
          <div class="pmc-axis">
            <span class="pmc-axis-label">—</span>
            <span class="pmc-axis-label muted">no data</span>
          </div>
        </div>`;
    }

    // Dynamic scale: ensure AMBER threshold is visible, cap at actual max
    const scaleMax = Math.max(maxLat, AMBER_MAX * 1.15);

    // Map latency → y: 0ms = bottom, high latency = top
    function latToY(ms) {
      const ratio = Math.min(1, ms / scaleMax);
      return pad + (1 - ratio) * (H - 2 * pad);
    }

    const n = events.length;
    const points = events.map((event, i) => {
      const x = n === 1 ? W * 0.5 : pad + (i / (n - 1)) * (W - 2 * pad);
      const lat = Number(event.latencyMs) || 0;
      return { x, y: latToY(lat), latency: lat };
    });

    // Smooth bezier path for the line
    const linePath = smoothPathD(points);
    const areaPath = linePath + ` L ${points[n - 1].x.toFixed(1)} ${H} L ${points[0].x.toFixed(1)} ${H} Z`;

    // Subtle reference lines at 25% / 75% — neutral color, no tier semantics
    const refTop = (H * 0.25).toFixed(1);
    const refBot = (H * 0.75).toFixed(1);

    // Per-point markers — color follows avg tier, small dots
    const tierColor = TIER_COLOR[avgTier];
    const markers = points
      .map((p) => {
        return `<line x1="${p.x.toFixed(1)}" y1="${(p.y - 0.5).toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${(p.y + 0.5).toFixed(1)}" stroke="${tierColor}" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke" />`;
      })
      .join("");

    return `
      <div class="provider-chart-block">
        ${legendHTML}
        <div class="pmc-chart-wrap">
          <svg class="provider-mini-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Latency chart for ${escapeHtml(providerName)}">
            <defs>
              <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${tierColor}" stop-opacity="0.28" />
                <stop offset="100%" stop-color="${tierColor}" stop-opacity="0.02" />
              </linearGradient>
            </defs>
            <line x1="0" y1="${refTop}" x2="${W}" y2="${refTop}" stroke="var(--line-soft)" stroke-width="0.3" stroke-dasharray="2 4" />
            <line x1="0" y1="${refBot}" x2="${W}" y2="${refBot}" stroke="var(--line-soft)" stroke-width="0.3" stroke-dasharray="2 4" />
            <path d="${areaPath}" fill="url(#${gradId})" />
            <path d="${linePath}" fill="none" stroke="${tierColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
            ${markers}
          </svg>
        </div>
        <div class="pmc-axis">
          <span class="pmc-axis-label">now</span>
          <span class="pmc-axis-label muted">avg ${fmtCompactMs(avgLat)} · max ${fmtCompactMs(maxLat)}</span>
        </div>
      </div>`;
  }

  function smoothPathD(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function bindProviderCards(target) {
    target.querySelectorAll("[data-provider-open]").forEach((button) => {
      if (button.dataset.bounddataprovideropen) return;
      button.dataset.bounddataprovideropen = "1";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openProviderDrawer(button.dataset.providerOpen || "");
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
    closeDrawer(false);
    closeModelDrawer();
    state.providerDrawerName = name;
    if (tab) state.providerDrawerTab = tab;
    // Reset the lazy events cache so the newly opened drawer fetches its own
    // activity events exactly once, regardless of which provider was open before.
    resetProviderActivityEventsCache(name);
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
    resetProviderActivityEventsCache("");
  }

  function renderProviderDrawer({ force = false } = {}) {
    const drawer = el("providerDrawer");
    const body = el("providerDrawerBody");
    const name = state.providerDrawerName;
    if (!drawer || !body || !name || !drawer.classList.contains("is-open")) return;
    // Skip while the user is interacting with any control inside the drawer
    // (forms, tab buttons, refresh buttons) to preserve focus and in-progress
    // input during auto-refresh.
    if (!force && interactiveElementHasFocus("#providerDrawer")) return;
    const view = providerViewModel(name);
    const tabs = ["overview", "keys", "models", "routing", "config"];
    if (!tabs.includes(state.providerDrawerTab)) state.providerDrawerTab = "overview";
    el("providerDrawerTitle").textContent = name;
    el("providerDrawerSubtitle").textContent = `${view.runtimeState.label} / ${view.keyStats.usable}/${view.keyStats.total} usable keys / ${fmtInt(view.modelItems.length)} models`;
    updateDOM(body, `
      <div class="provider-drawer-tabs" role="tablist" aria-label="Provider detail sections">
        ${tabs.map((tab) => `
          <button class="provider-drawer-tab ${state.providerDrawerTab === tab ? "is-active" : ""}" type="button" data-provider-drawer-tab="${escapeHtml(tab)}">
            ${escapeHtml(capitalize(tab))}
          </button>
        `).join("")}
      </div>
      ${providerDrawerPanel(view)}
    `);
    bindProviderDrawerEvents(body);
    // The overview panel renders the recent activity list lazily: the aggregate
    // stats arrive via the lightweight /provider-activity poll, but the per-event
    // rows are fetched on demand for the currently open drawer only.
    if (state.providerDrawerTab === "overview") {
      loadProviderActivityEvents(name);
    }
  }

  // Switching tabs only changes which panel is visible; it does not need a full
  // providerViewModel recompute (model sort + route scan + activity lookup). We
  // rebuild just the tab strip + panel from a fresh-but-cheap view model derived
  // from the already-cached data, avoiding the cost of a full drawer re-render
  // on every tab click. The full re-render still runs on data refreshes.
  //
  // CRITICAL: this render is scheduled via requestAnimationFrame and coalesced
  // so that rapid tab clicks (the user clicking through models/keys/config
  // quickly) do NOT stack up synchronous renders. Only the LAST clicked tab is
  // rendered; earlier clicks within the same frame are discarded. Without this,
  // each click synchronously ran providerViewModel + morphdom, and a burst of
  // clicks piled those into one multi-second main-thread freeze.
  let _tabSwitchRaf = 0;
  let _tabSwitchPending = false;
  function renderProviderDrawerTabSwitch() {
    // Mark that a switch is wanted; the actual render runs in the next animation
    // frame. If another switch is requested before that frame fires, we simply
    // keep the latest target tab (already written to state) and render once.
    if (_tabSwitchRaf) return; // already scheduled — will pick up latest state
    _tabSwitchRaf = requestAnimationFrame(() => {
      _tabSwitchRaf = 0;
      _tabSwitchPending = false;
      _renderProviderDrawerTabSwitchNow();
    });
  }
  function _renderProviderDrawerTabSwitchNow() {
    const drawer = el("providerDrawer");
    const body = el("providerDrawerBody");
    const name = state.providerDrawerName;
    if (!drawer || !body || !name || !drawer.classList.contains("is-open")) return;
    const tabs = ["overview", "keys", "models", "routing", "config"];
    if (!tabs.includes(state.providerDrawerTab)) state.providerDrawerTab = "overview";
    const view = providerViewModel(name);
    updateDOM(body, `
      <div class="provider-drawer-tabs" role="tablist" aria-label="Provider detail sections">
        ${tabs.map((tab) => `
          <button class="provider-drawer-tab ${state.providerDrawerTab === tab ? "is-active" : ""}" type="button" data-provider-drawer-tab="${escapeHtml(tab)}">
            ${escapeHtml(capitalize(tab))}
          </button>
        `).join("")}
      </div>
      ${providerDrawerPanel(view)}
    `);
    bindProviderDrawerEvents(body);
    if (state.providerDrawerTab === "overview") {
      loadProviderActivityEvents(name);
    }
  }

  function bindProviderDrawerEvents(root) {
    root.querySelectorAll("[data-provider-drawer-tab]").forEach((button) => {
      if (button.dataset.bounddataproviderdrawertab) return;
      button.dataset.bounddataproviderdrawertab = "1";
      button.addEventListener("click", () => {
        // Just record the target tab; the coalesced rAF render picks it up.
        state.providerDrawerTab = button.dataset.providerDrawerTab || "overview";
        renderProviderDrawerTabSwitch();
      });
    });
    if (!root.dataset.boundprovideractivityrows) {
      root.dataset.boundprovideractivityrows = "1";
      root.addEventListener("click", (event) => {
        const row = event.target.closest(".provider-activity-row[data-request-id]");
        if (!row || !root.contains(row)) return;
        openRequestDetail(row.dataset.requestId || "");
      });
    }
    bindKeyDeleteButtons(root);
    bindProbeModelPickers(root);
    bindKeyTestButtons(root);
    bindActionButtons(root);
    bindConfigProviderForms(root);
    bindProviderModelRefreshButtons(root);
    bindProviderModelDisableControls(root);

    // static_models form
    root.querySelectorAll(".config-static-models-form").forEach((form) => {
      if (form.dataset.boundconfigstaticmodelsform) return;
      form.dataset.boundconfigstaticmodelsform = "1";
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
          setNotice(t("notice.static_models_saved", { provider }), "ok");
          form.elements.static_models.value = "";
        });
      });
    });
    root.querySelectorAll("[data-clear-static-models]").forEach((button) => {
      if (button.dataset.bounddataclearstaticmodels) return;
      button.dataset.bounddataclearstaticmodels = "1";
      button.addEventListener("click", async () => {
        const provider = button.dataset.clearStaticModels || "";
        button.disabled = true;
        try {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: [] });
          setNotice(t("notice.static_models_cleared", { provider }), "ok");
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
          renderProviderDrawer({ force: true });
        } catch (err) {
          setNotice(t("notice.failed", { error: err.message }));
        } finally {
          button.disabled = false;
        }
      });
    });
    root.querySelectorAll("[data-delete-static-model]").forEach((button) => {
      if (button.dataset.bounddatadeletestaticmodel) return;
      button.dataset.bounddatadeletestaticmodel = "1";
      button.addEventListener("click", async () => {
        const provider = button.dataset.deleteStaticProvider || "";
        const model = button.dataset.deleteStaticModel || "";
        const existing = state.data.config?.providers?.[provider]?.static_models || [];
        const models = (Array.isArray(existing) ? existing : []).filter((item) => String(item || "") !== model);
        button.disabled = true;
        try {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: models });
          setNotice(t("notice.static_model_removed", { model, provider }), "ok");
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
          renderProviderDrawer({ force: true });
        } catch (err) {
          setNotice(t("notice.failed", { error: err.message }));
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function providerDrawerPanel(view) {
    if (state.providerDrawerTab === "keys") return providerDrawerKeys(view);
    if (state.providerDrawerTab === "models") return providerDrawerModels(view);
    if (state.providerDrawerTab === "routing") return providerDrawerRouting(view);
    if (state.providerDrawerTab === "config") return providerDrawerConfig(view);
    return providerDrawerOverview(view);
  }

  function providerDrawerOverview(view) {
    // Recent activity events are loaded on demand per provider (see
    // loadProviderActivityEvents) so the 5s poll does not carry every
    // provider's event list. Fall back to whatever is cached locally.
    const events = Array.isArray(view.activity.events) ? view.activity.events : [];
    const recent = events.slice(-10).reverse();
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
        <div class="provider-activity-list" data-provider-activity-list="${escapeHtml(view.name)}">
          ${recent.length ? recent.map(providerActivityRow).join("") : `<div class="empty pad-slim">Loading recent activity…</div>`}
        </div>
      </section>
    `;
  }

  // Lazily fetch the per-provider event list for the drawer's overview panel.
  // The aggregate stats come from the lightweight /provider-activity poll, but
  // the per-event rows are only needed when a drawer is actually open, so they
  // are fetched on demand for that single provider and cached on the activity
  // entry the rest of the UI already reads.
  //
  // Guarded against re-entrancy and redundant fetches: once events for the
  // current drawer provider are loaded (or a fetch is in flight), subsequent
  // renderAll/renderProviderDrawer calls skip the network. The cache is cleared
  // when the drawer provider changes or when the aggregate refresh overwrites
  // the entry, so stale events do not survive a real data change.
  const _providerActivityEventsState = { name: "", loading: false, loaded: false };
  async function loadProviderActivityEvents(name) {
    if (!name) return;
    if (_providerActivityEventsState.loading) return;
    if (_providerActivityEventsState.name === name && _providerActivityEventsState.loaded) return;
    _providerActivityEventsState.name = name;
    _providerActivityEventsState.loading = true;
    try {
      const resp = await apiGet(`/-/admin/provider-activity/${encodeURIComponent(name)}`);
      const activity = (resp && resp.activity) || null;
      const aggregate = (state.data.providerActivity || {})[name] || {};
      if (activity) {
        // Merge events into the cached aggregate so renderProviderDrawer picks them up.
        state.data.providerActivity[name] = { ...aggregate, ...activity };
      }
      _providerActivityEventsState.loaded = true;
      // Only patch the DOM if the drawer is still showing the same provider and tab.
      if (state.providerDrawerName !== name || state.providerDrawerTab !== "overview") return;
      const lists = document.querySelectorAll("[data-provider-activity-list]");
      const list = Array.from(lists).find((el) => el.getAttribute("data-provider-activity-list") === name);
      if (list) {
        const events = Array.isArray(activity?.events) ? activity.events : [];
        const recent = events.slice(-10).reverse();
        list.innerHTML = recent.length
          ? recent.map(providerActivityRow).join("")
          : `<div class="empty pad-slim">No recent calls for this provider</div>`;
      }
    } catch (_err) {
      // Best-effort enrichment; leave the placeholder in place on failure.
    } finally {
      _providerActivityEventsState.loading = false;
    }
  }

  // Reset the lazy events cache when the drawer provider changes or closes, so
  // switching providers re-fetches the right event list exactly once.
  function resetProviderActivityEventsCache(name) {
    if (_providerActivityEventsState.name !== name) {
      _providerActivityEventsState.name = name || "";
      _providerActivityEventsState.loaded = false;
    }
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

  function providerDrawerModels(view) {
    const capability = view.capability || {};
    const modelItems = view.modelItems;
    const visibleItems = filteredProviderModelItems(modelItems);
    const disabledCount = modelItems.filter((item) => item.disabled).length;
    const modelFilters = state.providerModelFilters || {};
    const draftCount = providerModelDraftCount(view.name);
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
          ${miniMetric("Capability", capability.status === "pending" ? "refreshing" : (capability.status || "not fetched"), "models endpoint")}
          ${miniMetric("Models", fmtInt(modelItems.length), "canonical/raw")}
          ${miniMetric("Disabled", fmtInt(disabledCount), "provider")}
          ${miniMetric("Fetched", capability.fetched_at ? fmtDate(capability.fetched_at) : "-", "snapshot")}
          ${miniMetric("Routes", fmtInt(view.routeModels.length), "configured")}
        </div>
        ${capability.status === "pending" ? `<div class="model-capability-refreshing">${refreshSpinner()} Discovering models in the background…</div>` : ""}
        ${capability.error ? `<div class="model-capability-error">${messageMarkup(capability.error)}</div>` : ""}
        <div class="provider-model-toolbar">
          <input class="control provider-model-search" type="search"
            data-provider-model-search="${escapeHtml(view.name)}"
            placeholder="Search models"
            value="${escapeHtml(modelFilters.search || "")}" />
          <select class="control provider-model-status-filter" data-provider-model-status-filter="${escapeHtml(view.name)}">
            <option value="" ${!modelFilters.status ? "selected" : ""}>All</option>
            <option value="enabled" ${modelFilters.status === "enabled" ? "selected" : ""}>Enabled</option>
            <option value="disabled" ${modelFilters.status === "disabled" ? "selected" : ""}>Disabled</option>
          </select>
          <button class="button small secondary" type="button"
            data-provider-model-bulk="${escapeHtml(view.name)}"
            data-provider-model-bulk-action="disable"
            title="Stage disable visible models"
            aria-label="Stage disable visible models"
            ${visibleItems.length ? "" : "disabled"}>${iconSvg("eye-off")}</button>
          <button class="button small secondary" type="button"
            data-provider-model-bulk="${escapeHtml(view.name)}"
            data-provider-model-bulk-action="enable"
            title="Stage enable visible models"
            aria-label="Stage enable visible models"
            ${visibleItems.length ? "" : "disabled"}>${iconSvg("eye")}</button>
          <button class="button small icon-action" type="button"
            data-provider-model-apply="${escapeHtml(view.name)}"
            title="Apply model changes${draftCount ? ` (${draftCount})` : ""}"
            aria-label="Apply model changes"
            ${draftCount ? "" : "disabled"}>${iconSvg("save")}</button>
          <button class="button small secondary icon-action" type="button"
            data-provider-model-reset="${escapeHtml(view.name)}"
            title="Reset staged model changes"
            aria-label="Reset staged model changes"
            ${draftCount ? "" : "disabled"}>${iconSvg("undo")}</button>
        </div>
        <div class="model-chip-list provider-drawer-models">
          ${visibleItems.length ? visibleItems.slice(0, 100).map((item) => `
            <span class="model-map-chip provider-model-chip ${item.disabled ? "is-disabled" : ""} ${item.pending ? "is-pending" : ""} ${item.manual ? "is-manual-map" : ""}">
              <button class="model-chip-toggle" type="button"
                data-provider-model-disable-provider="${escapeHtml(view.name)}"
                data-provider-model-disable-model="${escapeHtml(item.label)}"
                data-provider-model-disable-next="${item.disabled ? "false" : "true"}"
                title="${escapeHtml(`${item.disabled ? "Stage enable" : "Stage disable"} ${item.title}`)}"
                aria-label="${escapeHtml(`${item.disabled ? "Stage enable" : "Stage disable"} ${item.label}`)}">
                <b>${escapeHtml(item.label)}</b>
                ${item.raw && item.raw !== item.label ? `<small>${escapeHtml(item.raw)}</small>` : ""}
                ${item.pending ? `<small class="model-pending-note">pending</small>` : ""}
              </button>
              <button class="model-map-edit-button" type="button"
                data-provider-model-map-edit-provider="${escapeHtml(view.name)}"
                data-provider-model-map-edit-model="${escapeHtml(item.label)}"
                data-provider-model-map-edit-raw="${escapeHtml(item.raw || item.label)}"
                data-provider-model-map-edit-manual="${item.manual ? "1" : "0"}"
                title="Edit model mapping"
                aria-label="${escapeHtml(`Edit mapping for ${item.label}`)}">${iconSvg("pencil")}</button>
            </span>
          `).join("") + (visibleItems.length > 100 ? `<span class="muted" style="padding: 4px 8px;">+ ${visibleItems.length - 100} more models...</span>` : "") : `<span class="muted">No matching models</span>`}
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
              ${staticModels.slice(0, 100).map((model) => `
                <span class="model-map-chip static-model-chip">
                  <b>${escapeHtml(model)}</b><small>static</small>
                  <button class="static-model-delete" type="button"
                    title="Remove ${escapeHtml(model)}"
                    aria-label="Remove ${escapeHtml(model)}"
                    data-delete-static-provider="${escapeHtml(view.name)}"
                    data-delete-static-model="${escapeHtml(model)}">x</button>
                </span>
              `).join("") + (staticModels.length > 100 ? `<span class="muted" style="padding: 4px 8px;">+ ${staticModels.length - 100} more...</span>` : "")}
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
    const currentMode = routing.provider_select || "priority_failover";
    return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Default pool", defaultPool.includes(view.name) ? "yes" : "no", currentMode)}
          ${miniMetric("Priority", fmtInt(view.priority), "provider")}
          ${miniMetric("Route models", fmtInt(routeRows.length), "explicit")}
          ${miniMetric("Provider select", currentMode, "default")}
          ${miniMetric("Max attempts", fmtInt(routing.max_attempts), "request")}
        </div>
        <div class="provider-hot-reload-controls">
          <div class="hot-reload-row">
            <label class="field hot-reload-field">
              <span>Quick priority (hot-reload)</span>
              <div class="hot-reload-input-row">
                <input class="control" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(view.priority ?? 0)}" data-hot-priority="${escapeHtml(view.name)}" />
                <button class="button secondary compact-action" type="button" data-hot-priority-apply="${escapeHtml(view.name)}">Apply</button>
              </div>
              <small class="muted">Instantly updates priority without full config reload</small>
            </label>
          </div>
        </div>
        <div class="provider-route-list">
          ${routeRows.length ? routeRows.slice(0, 50).map((row) => `
            <article class="provider-route-card">
              <div>
                <strong class="mono">${escapeHtml(row.model)}</strong>
                <small>${escapeHtml(row.providerText)}</small>
              </div>
              ${badge(row.select || currentMode, "info")}
            </article>
          `).join("") + (routeRows.length > 50 ? `<div class="pad-slim muted">+ ${routeRows.length - 50} more routes...</div>` : "") : `<div class="empty pad-slim">No explicit model route includes this provider</div>`}
        </div>
      </section>
    `;
  }

  function providerDrawerConfig(view) {
    return `
      <section class="provider-drawer-section">
        ${providerEditPanel(view.name, view.config, view.configKeys, view.formats, { includeFormats: true })}
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
    // Only skip while a control inside this block has focus; previously this
    // guarded on the whole #providersView, which blocked model discovery
    // updates whenever any provider card had focus.
    if (!state.forceModelCapsRender && interactiveElementHasFocus("#modelCapabilities")) return;
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
    const modelItems = modelCapabilityItemsMemo(name, models, canonicalMap);
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
          ${status === "pending" ? `<span class="badge neutral provider-cap-refreshing-badge">${refreshSpinner()} refreshing</span>` : badge(status, tone === "success" ? "ok" : tone === "danger" ? "bad" : "neutral")}
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
              ${modelPriceTooltip(item.label)}
            </span>
          `).join("") : `<span class="muted">No discovered models</span>`}
          ${modelItems.length > 18 ? `<span class="tag">+${fmtInt(modelItems.length - 18)} more</span>` : ""}
        </div>
      </article>
    `;
  }

  // Memoized model capability items. The sort/dedupe below is the hot path on
  // the providers view (each refresh re-sorted the full model list for every
  // provider). Cache by (provider, data version) so identical inputs across
  // refreshes are returned without re-sorting, and the cache auto-invalidates
  // whenever new data lands. Keyed on the inputs' identity via the data version
  // so callers do not need to build their own signature.
  const _modelCapabilityItemsCache = new Map();
  function modelCapabilityItemsMemo(name, models, canonicalMap) {
    const version = Number(state.data?.version || 0);
    const cacheKey = `${name}\n${version}`;
    const cached = _modelCapabilityItemsCache.get(cacheKey);
    if (cached) return cached;
    const items = modelCapabilityItems(models, canonicalMap);
    _modelCapabilityItemsCache.set(cacheKey, items);
    return items;
  }

  function modelCapabilityItems(models, canonicalMap) {
    const items = [];
    const seen = new Set();
    const seenKey = (value) => String(value || "").trim().toLowerCase();
    const push = (label, raw) => {
      const safeLabel = String(label || raw || "").trim();
      const safeRaw = String(raw || "").trim();
      if (!safeLabel) return;
      if (seen.has(seenKey(safeLabel)) || seen.has(seenKey(safeRaw))) return;
      [safeLabel, safeRaw].forEach((value) => {
        const key = seenKey(value);
        if (key) seen.add(key);
      });
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
      if (drawer.dataset.boundproviderruntimedetails) return;
      drawer.dataset.boundproviderruntimedetails = "1";
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
      if (drawer.dataset.boundprovidereditdrawer) return;
      drawer.dataset.boundprovidereditdrawer = "1";
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
          <div class="provider-config-block provider-config-connection">
            <div class="provider-config-block-head">
              <span class="provider-config-block-icon">${iconSvg("server")}</span>
              <div>
                <strong>Connection</strong>
                <small>Endpoint and identity</small>
              </div>
            </div>
            <div class="provider-config-grid">
              <label class="field provider-config-wide">
                <span>Base URL</span>
                <input class="control" name="base_url" value="${escapeHtml(provider.base_url || "")}" placeholder="https://api.example.com" required />
              </label>
              <label class="field">
                <span>Proxy</span>
                ${proxyControlInput("proxy", provider.proxy || "", "direct / http://host:port / socks5://host:port")}
              </label>
              <label class="field">
                <span>User-Agent</span>
                <input class="control" name="user_agent" value="${escapeHtml(provider.user_agent || "")}" placeholder="inherit" />
              </label>
            </div>
          </div>
          <div class="provider-config-block provider-config-runtime">
            <div class="provider-config-block-head">
              <span class="provider-config-block-icon">${iconSvg("gauge")}</span>
              <div>
                <strong>Runtime</strong>
                <small>Priority and availability</small>
              </div>
            </div>
            <div class="provider-config-runtime-row">
              <label class="field">
                <span>Priority</span>
                <input class="control" name="priority" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(provider.priority ?? 0)}" />
              </label>
              <label class="check-field provider-enabled-check">
                <input type="checkbox" name="enabled" ${provider.enabled === false ? "" : "checked"} />
                <span>Enabled</span>
              </label>
              <button class="button primary" type="submit">Save config</button>
            </div>
          </div>
        </form>
        <div class="provider-config-block provider-config-keys">
          <div class="provider-config-block-head">
            <span class="provider-config-block-icon">${iconSvg("key")}</span>
            <div>
              <strong>Keys</strong>
              <small>Masked keys and proxy</small>
            </div>
          </div>
          <div class="key-proxy-list">
            ${keys.length ? keys.map((key) => keyProxyRow(name, key)).join("") : `<span class="muted">No config keys</span>`}
          </div>
          <form class="config-key-form provider-inline-key-form" data-provider="${escapeHtml(name)}">
            <input class="control" name="key" type="password" autocomplete="off" placeholder="new key" required />
            ${proxyControlInput("proxy", "", "http://host:port / socks5://host:port")}}
            <button class="button secondary" type="submit">Add key</button>
          </form>
        </div>
        ${includeFormats ? `
          <div class="provider-formats-group provider-config-block">
            <div class="provider-config-block-head">
              <span class="provider-config-block-icon">${iconSvg("layers")}</span>
              <div>
                <strong>Formats</strong>
                <small>Toggle routes or edit paths</small>
              </div>
            </div>
            <div class="format-route-list provider-format-edit-list">
              ${formatRouteItems(formats, name)}
            </div>
          </div>
        ` : ""}
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
          <span>Proxy</span>
          ${proxyControlInput("proxy", proxy, "inherit")}
        </label>
        <button class="button secondary compact-action" type="submit">Save</button>
      </form>
    `;
  }

  function providerRuntimeState(p = {}, keyStats = null, config = {}) {
    const stats = keyStats || providerKeyStats(Array.isArray(p.keys) ? p.keys : [], []);
    const enabled = p.enabled !== false && p.config_enabled !== false && p.runtime_enabled !== false && config.enabled !== false;
    const providerCooldown = Number(p.cooldown_remaining_s || 0);
    const hardFailure = Boolean(p.has_hard_failure);
    if (!enabled) return { id: "disabled", label: "disabled", tone: "is-disabled", badge: "bad" };
    if (providerCooldown > 0) return { id: "cooldown", label: "cooldown", tone: "is-cooldown", badge: "warn" };
    if (stats.total > 0 && stats.usable <= 0) {
      if (stats.cooldown > 0) return { id: "cooldown", label: "key cooldown", tone: "is-cooldown", badge: "warn" };
      return { id: "unavailable", label: "no usable key", tone: "is-unavailable", badge: "bad" };
    }
    if (hardFailure) {
      return { id: "degraded", label: "degraded", tone: "is-degraded", badge: "warn" };
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

  function formatRouteItems(formats, provider) {
    const rows = Object.entries(formats || {}).sort();
    if (!rows.length) return `<span class="empty">No format routes</span>`;
    // When a provider name is supplied the cards become interactive: single
    // click toggles enabled, double click edits the path. Otherwise the cards
    // are read-only display only.
    const interactive = Boolean(provider);
    return rows.map(([name, cfg]) => {
      const enabled = cfg?.enabled;
      const path = cfg?.path || "-";
      const label = formatLabel(name) || name;
      const dataAttrs = interactive
        ? `data-format-provider="${escapeHtml(provider)}" data-format="${escapeHtml(name)}" data-format-enabled="${enabled ? "1" : "0"}" data-format-path="${escapeHtml(cfg?.path || "")}" role="button" tabindex="0" aria-label="${escapeHtml(`${enabled ? "Disable" : "Enable"} ${label} for ${provider}`)}"`
        : "";
      const edit = interactive ? `
          <button class="format-route-edit" type="button"
            data-format-path-edit
            title="Edit path"
            aria-label="${escapeHtml(`Edit ${label} path for ${provider}`)}">${iconSvg("pencil")}</button>
        ` : "";
      return `
        <span class="format-route ${enabled ? "enabled" : "disabled"} ${interactive ? "is-interactive" : ""}" ${dataAttrs}>
          <span class="format-route-main">
            <b>${escapeHtml(label)}</b>
            <small>${escapeHtml(path)}</small>
          </span>
          ${edit}
        </span>
      `;
    }).join("");
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
    const probeKey = `${provider}#${key.index}`;
    const probePending = Boolean(state.keyProbeInFlight[probeKey] || state.keyProbes[probeKey]?.pending);
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
            ${providerProbeModelOptions(provider).length && !probePending ? "" : "disabled"}
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
      x: `<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>`,
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
      eye: `<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><circle cx="12" cy="12" r="3"></circle>`,
      "eye-off": `<path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M7.4 7.4C4.3 9 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1"></path><path d="M10 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.2"></path>`,
      save: `<path d="M5 3h12l2 2v16H5z"></path><path d="M8 3v6h8V3"></path><path d="M8 21v-7h8v7"></path>`,
      undo: `<path d="M9 7H4v5"></path><path d="M4 12a8 8 0 1 0 2.3-5.7L4 7"></path>`,
      settings: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>`,
      dot: `<circle cx="12" cy="12" r="2"></circle>`,
      bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"></path>`,
      zap: `<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7z"></path>`,
      message: `<path d="M5 19l3-3h9a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3"></path><path d="M8 9h8"></path><path d="M8 12h5"></path>`,
    };
    return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.dot}</svg>`;
  }

  function refreshSpinner() {
    return `<span class="refresh-spinner" aria-hidden="true">${iconSvg("rotate")}</span>`;
  }

  function bindActionButtons(root) {
    root.querySelectorAll("[data-action-path]").forEach((button) => {
      if (button.dataset.bounddataactionpath) return;
      button.dataset.bounddataactionpath = "1";
      button.addEventListener("click", async () => {
        const path = `/-/admin${button.dataset.actionPath}`;
        button.disabled = true;
        try {
          const result = await apiPost(path);
          if (result?.router) {
            state.data.status = { ...(state.data.status || {}), router: result.router };
            state.data.version = Number(state.data.version || 0) + 1;
            state.forceProvidersRender = true;
            renderAll();
            renderProviderDrawer({ force: true });
          }
          await refreshAll({ quiet: true, staticData: true });
        } catch (err) {
          setNotice(t("notice.action_failed", { error: err.message }));
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
      if (picker.dataset.bounddataprobemodelpickerisopen) return;
      picker.dataset.bounddataprobemodelpickerisopen = "1";
        if (picker !== activePicker) closePicker(picker);
      });
    };

    root.querySelectorAll("[data-probe-model-picker]").forEach((picker) => {
      if (picker.dataset.bounddataprobemodelpicker) return;
      picker.dataset.bounddataprobemodelpicker = "1";
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
      if (button.dataset.bounddatakeydeleteprovider) return;
      button.dataset.bounddatakeydeleteprovider = "1";
      button.addEventListener("click", async () => {
        const provider = button.dataset.keyDeleteProvider || "";
        const keyIndex = button.dataset.keyDeleteIndex || "";
        const total = Number(button.dataset.keyDeleteTotal || 0);
        const label = button.dataset.keyDeleteLabel || `key ${keyIndex}`;
        if (!provider || keyIndex === "") return;
        const lastKeyText = total <= 1 ? t("confirm.delete_key.last") : "";
        const confirmed = await openConfirmDialog({
          title: t("confirm.delete_key.title"),
          message: t("confirm.delete_key.msg", { label, provider }) + lastKeyText,
          acceptLabel: t("confirm.delete"),
        });
        if (!confirmed) return;
        button.disabled = true;
        try {
          await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}/delete`, { confirm: "delete_key" });
          setNotice(t("notice.key_deleted", { index: keyIndex, provider }), "ok");
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
        } catch (err) {
          setNotice(t("notice.delete_key_failed", { error: err.message }));
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function bindKeyTestButtons(root) {
    root.querySelectorAll("[data-key-test-provider]").forEach((button) => {
      if (button.dataset.bounddatakeytestprovider) return;
      button.dataset.bounddatakeytestprovider = "1";
      button.addEventListener("click", async () => {
        const provider = button.dataset.keyTestProvider || "";
        const keyIndex = button.dataset.keyTestIndex || "";
        if (!provider || keyIndex === "") return;
        const probeKey = `${provider}#${keyIndex}`;
        const toastKey = `probe:${probeKey}`;
        const modelSelect = root.querySelector(`[data-key-test-model="${CSS.escape(probeKey)}"]`);
        const model = String(modelSelect?.value || "").trim();
        if (!model) {
          setNotice(t("notice.refresh_before_test"), "info");
          return;
        }
        if (state.keyProbeInFlight[probeKey]) return;
        state.keyProbeInFlight[probeKey] = true;
        state.keyProbes[probeKey] = { pending: true };
        button.disabled = true;
        setNotice(t("notice.testing_key", { index: keyIndex, provider, model }), "info", { key: toastKey, sticky: true });
        try {
          const resp = await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}/test`, { model });
          const result = resp.result || {};
          state.keyProbes[probeKey] = result;
          if (result.ok) {
            const shownModel = result.requested_model || model;
            const upstreamModel = result.upstream_model && result.upstream_model !== shownModel ? result.upstream_model : "";
            const upstreamText = upstreamModel ? `, upstream ${upstreamModel}` : "";
            setNotice(t("notice.key_works", { index: keyIndex, provider, model: shownModel, format: result.format, upstream: upstreamText, latency: fmtInt(result.latency_ms) }), "ok", { key: toastKey });
          } else {
            const detail = result.http_status ? `HTTP ${result.http_status}` : result.error_type || "failed";
            setNotice(t("notice.key_failed", { index: keyIndex, provider, detail }), "bad", { key: toastKey });
          }
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
        } catch (err) {
          state.keyProbes[probeKey] = { ok: false, error_type: "request_error" };
          setNotice(t("notice.test_key_failed", { error: err.message }), "bad", { key: toastKey });
        } finally {
          delete state.keyProbeInFlight[probeKey];
          button.disabled = false;
        }
      });
    });
  }

  // Tracks in-flight model refreshes per provider so a double-click or a
  // re-bind (drawer re-render) cannot fire the POST twice for the same provider.
  const _modelRefreshInFlight = new Set();
  function bindProviderModelRefreshButtons(root) {
    root.querySelectorAll("[data-provider-models-refresh]").forEach((button) => {
      if (button.dataset.bounddataprovidermodelsrefresh) return;
      button.dataset.bounddataprovidermodelsrefresh = "1";
      button.addEventListener("click", async () => {
        const provider = button.dataset.providerModelsRefresh || "";
        if (!provider) return;
        // Dedupe: if a refresh for this provider is already running, ignore.
        if (_modelRefreshInFlight.has(provider)) return;
        _modelRefreshInFlight.add(provider);
        button.disabled = true;
        try {
          await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/models/refresh`);
          setNotice(t("notice.models_refreshed", { provider }), "ok");
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
          renderProviderDrawer({ force: true });
        } catch (err) {
          setNotice(t("notice.model_refresh_failed", { error: err.message }), "bad");
        } finally {
          _modelRefreshInFlight.delete(provider);
          button.disabled = false;
        }
      });
    });
  }

  async function updateProviderModelDisabled(provider, models, successMessage) {
    if (!provider || !models || !Object.keys(models).length) return;
    try {
      await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/disabled`, { models });
      if (state.providerModelDrafts) delete state.providerModelDrafts[provider];
      setNotice(successMessage || t("notice.model_settings_saved", { provider }), "ok");
      await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
      renderProviderDrawer({ force: true });
    } catch (err) {
      setNotice(t("notice.model_setting_failed", { error: err.message }), "bad");
    }
  }

  async function updateProviderModelMapping(provider, oldModel, rawModel, nextModel) {
    if (!provider || !oldModel || !rawModel) return false;
    try {
      await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/map`, {
        old_model: oldModel,
        model: nextModel,
        raw_model: rawModel,
      });
      setNotice(nextModel ? t("notice.model_mapping_saved", { provider }) : t("notice.model_mapping_reset", { provider }), "ok");
      await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
      renderProviderDrawer({ force: true });
      return true;
    } catch (err) {
      setNotice(t("notice.model_mapping_failed", { error: err.message }), "bad");
      return false;
    }
  }

  function openProviderModelMappingModal({ provider, oldModel, rawModel, isManual }) {
    if (!provider || !oldModel || !rawModel) return;
    openFormModal({
      title: t("modal.edit_mapping_title"),
      subtitle: provider,
      bodyHtml: `
        <form class="model-map-form" data-provider-model-map-form>
          <label class="model-map-field">
            <span>Client model</span>
            <input name="model" value="${escapeHtml(oldModel)}" autocomplete="off" spellcheck="false" />
          </label>
          <div class="model-map-raw-line">
            <span>Provider</span>
            <code>${escapeHtml(rawModel)}</code>
          </div>
          ${isManual ? `<p class="model-map-hint">Empty name restores automatic mapping.</p>` : ""}
          <div class="model-map-actions">
            <button class="model-map-action secondary" type="button" data-model-map-cancel title="Cancel" aria-label="Cancel">${iconSvg("x")}</button>
            <button class="model-map-action primary" type="submit" title="Save mapping" aria-label="Save mapping">${iconSvg("save")}</button>
          </div>
        </form>
      `,
    });
    el("formModal")?.classList.add("is-model-map-modal");
    const form = el("formModalBody")?.querySelector("[data-provider-model-map-form]");
    if (!form) return;
    form.elements.model?.focus();
    form.elements.model?.select();
    form.querySelector("[data-model-map-cancel]")?.addEventListener("click", closeFormModal);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = form.elements.model;
      const nextModel = String(input?.value || "").trim();
      if (!nextModel && !isManual) {
        setNotice(t("notice.model_mapping_required"), "bad");
        input?.focus();
        return;
      }
      if (nextModel === oldModel) {
        closeFormModal();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      const saved = await updateProviderModelMapping(provider, oldModel, rawModel, nextModel);
      if (saved) closeFormModal();
      else if (submit) submit.disabled = false;
    });
  }

  function openProviderFormatPathModal({ provider, fmt, label, path, enabled, ownerCard }) {
    if (!provider || !fmt) return;
    const current = path || defaultFormatPath(fmt);
    openFormModal({
      title: t("modal.edit_format_title"),
      subtitle: provider,
      bodyHtml: `
        <form class="format-path-form" data-provider-format-path-form>
          <div class="format-path-summary">
            <span class="format-path-state ${enabled ? "is-enabled" : "is-disabled"}">${enabled ? iconSvg("check") : iconSvg("x")}</span>
            <div>
              <strong>${escapeHtml(label || formatLabel(fmt) || fmt)}</strong>
              <code>${escapeHtml(fmt)}</code>
            </div>
          </div>
          <label class="format-path-field">
            <span>Upstream path</span>
            <input name="path" value="${escapeHtml(current)}" autocomplete="off" spellcheck="false" required />
          </label>
          <p class="format-path-hint">Use the provider endpoint path, for example /v1/chat/completions.</p>
          <div class="model-map-actions">
            <button class="model-map-action secondary" type="button" data-format-path-cancel title="Cancel" aria-label="Cancel">${iconSvg("x")}</button>
            <button class="model-map-action primary" type="submit" title="Save path" aria-label="Save path">${iconSvg("save")}</button>
          </div>
        </form>
      `,
    });
    el("formModal")?.classList.add("is-format-path-modal");
    const form = el("formModalBody")?.querySelector("[data-provider-format-path-form]");
    if (!form) return;
    form.elements.path?.focus();
    form.elements.path?.select();
    form.querySelector("[data-format-path-cancel]")?.addEventListener("click", closeFormModal);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = form.elements.path;
      const trimmed = String(input?.value || "").trim();
      if (!trimmed) {
        setNotice(t("notice.format_path_empty"), "bad");
        input?.focus();
        return;
      }
      const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
      if (normalized === current) {
        closeFormModal();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      const saved = await runFormatMutation(ownerCard, async () => {
          const resp = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/formats/${encodeURIComponent(fmt)}`, { path: normalized });
          setNotice(t("notice.format_updated", { provider, format: fmt }), "ok");
          return resp;
      });
      if (saved) {
        closeFormModal();
      } else {
        if (submit) submit.disabled = false;
      }
    });
  }

  function bindProviderModelDisableControls(root) {
    if (root.dataset.boundProviderModelControls === "1") return;
    root.dataset.boundProviderModelControls = "1";
    root.addEventListener("input", (event) => {
      const input = event.target.closest("[data-provider-model-search]");
      if (!input || !root.contains(input)) return;
      state.providerModelFilters.search = String(input.value || "");
      renderProviderDrawer({ force: true });
    });
    root.addEventListener("change", (event) => {
      const select = event.target.closest("[data-provider-model-status-filter]");
      if (!select || !root.contains(select)) return;
      state.providerModelFilters.status = String(select.value || "");
      renderProviderDrawer({ force: true });
    });
    root.addEventListener("click", async (event) => {
      const mapEditButton = event.target.closest("[data-provider-model-map-edit-provider]");
      if (mapEditButton && root.contains(mapEditButton)) {
        const provider = mapEditButton.dataset.providerModelMapEditProvider || "";
        const oldModel = mapEditButton.dataset.providerModelMapEditModel || "";
        const rawModel = mapEditButton.dataset.providerModelMapEditRaw || "";
        const isManual = mapEditButton.dataset.providerModelMapEditManual === "1";
        openProviderModelMappingModal({ provider, oldModel, rawModel, isManual });
        return;
      }

      const modelButton = event.target.closest("[data-provider-model-disable-model]");
      if (modelButton && root.contains(modelButton)) {
        const provider = modelButton.dataset.providerModelDisableProvider || "";
        const model = modelButton.dataset.providerModelDisableModel || "";
        const next = modelButton.dataset.providerModelDisableNext === "true";
        setProviderModelDisabledDraft(provider, model, next);
        renderProviderDrawer({ force: true });
        return;
      }

      const bulkButton = event.target.closest("[data-provider-model-bulk]");
      if (bulkButton && root.contains(bulkButton)) {
        const provider = bulkButton.dataset.providerModelBulk || "";
        const action = bulkButton.dataset.providerModelBulkAction || "";
        const view = providerViewModel(provider);
        if (!view) return;
        const visibleItems = filteredProviderModelItems(view.modelItems);
        const next = action === "disable";
        const models = {};
        visibleItems.forEach((item) => {
          if (!item.label) return;
          models[item.label] = next;
        });
        if (!Object.keys(models).length) return;
        setProviderModelsDisabledDraft(provider, models);
        renderProviderDrawer({ force: true });
        return;
      }

      const applyButton = event.target.closest("[data-provider-model-apply]");
      if (applyButton && root.contains(applyButton)) {
        const provider = applyButton.dataset.providerModelApply || "";
        const draft = providerModelDraft(provider);
        if (!Object.keys(draft).length) return;
        applyButton.disabled = true;
        await updateProviderModelDisabled(
          provider,
          draft,
          `Applied ${Object.keys(draft).length} model changes for ${provider}.`,
        );
        applyButton.disabled = false;
        return;
      }

      const resetButton = event.target.closest("[data-provider-model-reset]");
      if (resetButton && root.contains(resetButton)) {
        const provider = resetButton.dataset.providerModelReset || "";
        if (state.providerModelDrafts) delete state.providerModelDrafts[provider];
        renderProviderDrawer({ force: true });
      }
    });
  }

  function renderPolicy() {
    const policy = state.data.routing?.policy || state.data.status?.policy || {};
    const ruleRows = Array.isArray(policy.rule_table) ? policy.rule_table : [];
    const retryStatuses = Array.isArray(policy.retryable_status) ? policy.retryable_status : [];
    renderPolicyControls(policy);
    updateDOM(el("ruleTable"), ruleRows.length ? `
      <div class="policy-summary-grid">
        ${miniMetric("Max attempts", fmtInt(policy.max_attempts), "per request")}
        ${miniMetric("Connect timeout", `${fmtInt(policy.connect_timeout_s)}s`, "upstream")}
        ${miniMetric("Read timeout", `${fmtInt(policy.read_timeout_s)}s`, "upstream")}
        ${miniMetric("Retry HTTP", retryStatuses.length ? retryStatuses.join(", ") : "-", "status codes")}
      </div>
      <div class="policy-card-list">
        ${ruleRows.map(renderPolicyRule).join("")}
      </div>
    ` : `<div class="empty pad">No rule table</div>`);

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
    const currentSelect = String(routing.provider_select || "priority_failover");
    const routeModes = [
      { value: "priority_failover", icon: "bolt", label: t("policy.mode_priority"), tip: t("policy.mode_priority_tip") },
      { value: "auto", icon: "settings", label: t("policy.mode_auto"), tip: t("policy.mode_auto_tip") },
      { value: "round_robin", icon: "rotate", label: t("policy.mode_round_robin"), tip: t("policy.mode_round_robin_tip") },
      { value: "weighted_rr", icon: "layers", label: t("policy.mode_weighted"), tip: t("policy.mode_weighted_tip") },
      { value: "random", icon: "dot", label: t("policy.mode_random"), tip: t("policy.mode_random_tip") },
    ];
    target.innerHTML = `
      <div class="policy-control-grid">
        <form id="routingControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>${t("policy.routing")}<span class="help-tip" data-tip="${escapeHtml(t("policy.routing_tip2"))}">?</span></h3>
          </div>
          <label class="field">
            <span class="label-with-tip">${t("policy.provider_pool")}<span class="help-tip" data-tip="${escapeHtml(t("policy.provider_pool_tip"))}">?</span></span>
            <input class="control" name="default_provider_pool" value="${escapeHtml(providerPool)}" placeholder="opencode, deepseek, rawchat" required />
          </label>
          <div class="form-pair-grid routing-mode-grid">
            <div class="field selection-mode-field">
              <span class="label-with-tip">${t("policy.selection_mode")}<span class="help-tip" data-tip="${escapeHtml(t("policy.selection_tip"))}">?</span></span>
              <input type="hidden" name="provider_select" value="${escapeHtml(currentSelect)}" />
              <div class="icon-btn-group" id="routeModeGroup">
                ${routeModes.map((m) => `<button type="button" data-route-mode="${escapeHtml(m.value)}" class="${currentSelect === m.value ? "is-active" : ""}" title="${escapeHtml(m.tip)}">${iconSvg(m.icon)}<span>${escapeHtml(m.label)}</span></button>`).join("")}
              </div>
            </div>
            <label class="field">
              <span class="label-with-tip">${t("policy.max_attempts")}<span class="help-tip" data-tip="${escapeHtml(t("policy.max_attempts_tip"))}">?</span></span>
              <input class="control" name="max_attempts" type="number" min="1" max="50" value="${escapeHtml(routing.max_attempts ?? policy.max_attempts ?? 6)}" required />
            </label>
          </div>
          <details class="policy-advanced">
            <summary>${t("policy.timeouts")}</summary>
            <div class="form-pair-grid" style="margin-top:10px">
              <label class="field">
                <span class="label-with-tip">${t("policy.connect")}<span class="help-tip" data-tip="${escapeHtml(t("policy.connect_tip"))}">?</span></span>
                <input class="control" name="connect_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.connect_timeout_s ?? policy.connect_timeout_s ?? 15)}" required />
              </label>
              <label class="field">
                <span class="label-with-tip">${t("policy.read")}<span class="help-tip" data-tip="${escapeHtml(t("policy.read_tip"))}">?</span></span>
                <input class="control" name="read_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.read_timeout_s ?? policy.read_timeout_s ?? 120)}" required />
              </label>
              <label class="field">
                <span class="label-with-tip">${t("policy.first_token")}<span class="help-tip" data-tip="${escapeHtml(t("policy.first_token_tip"))}">?</span></span>
                <input class="control" name="first_token_timeout_s" type="number" min="0" max="600" value="${escapeHtml(routing.first_token_timeout_s ?? policy.first_token_timeout_s ?? 30)}" required />
              </label>
            </div>
          </details>
          <button class="button secondary" type="submit">${t("policy.save_routing")}</button>
        </form>

        <form id="retryControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>${t("policy.retry")}<span class="help-tip" data-tip="${escapeHtml(t("policy.retry_tip"))}">?</span></h3>
          </div>
          <label class="field">
            <span class="label-with-tip">${t("policy.retryable_statuses")}<span class="help-tip" data-tip="${escapeHtml(t("policy.retryable_tip"))}">?</span></span>
            <input class="control" name="retryable_status" value="${escapeHtml(joinList(retry.retryable_status || policy.retryable_status || []))}" placeholder="408, 429, 500, 502, 503, 504" required />
          </label>
          <label class="field">
            <span class="label-with-tip">${t("policy.fatal_key_statuses")}<span class="help-tip" data-tip="${escapeHtml(t("policy.fatal_tip"))}">?</span></span>
            <input class="control" name="key_fatal_status" value="${escapeHtml(joinList(retry.key_fatal_status || policy.key_fatal_status || []))}" placeholder="401, 403" required />
          </label>
          <details class="policy-advanced">
            <summary>${t("policy.advanced_cooldown")}</summary>
            <label class="check-field" style="margin-top:10px">
              <span class="toggle-switch"><input type="checkbox" name="respect_retry_after" ${retry.respect_retry_after ?? policy.respect_retry_after ? "checked" : ""} /><span class="slider"></span></span>
              <span class="label-with-tip">${t("policy.respect_retry_after")}<span class="help-tip" data-tip="${escapeHtml(t("policy.respect_tip"))}">?</span></span>
            </label>
            <div class="form-pair-grid" style="margin-top:8px">
              <label class="field">
                <span class="label-with-tip">${t("policy.same_key_retries")}<span class="help-tip" data-tip="${escapeHtml(t("policy.same_key_tip"))}">?</span></span>
                <input class="control" name="same_key_retries" type="number" min="0" max="3" value="${escapeHtml(retry.same_key_retries ?? 1)}" required />
              </label>
              <label class="field">
                <span class="label-with-tip">${t("policy.failure_ladder")}<span class="help-tip" data-tip="${escapeHtml(t("policy.ladder_tip"))}">?</span></span>
                <input class="control" name="key_failure_ladder_s" value="${escapeHtml(joinNumberList(ladder))}" placeholder="10, 60, 3600" required />
              </label>
              ${cooldownField("rate_limit", t("policy.cooldown_rate_limit"), t("policy.cooldown_rate_limit_tip"), cooldown.rate_limit ?? 30)}
              ${cooldownField("server_error", t("policy.cooldown_server_error"), t("policy.cooldown_server_error_tip"), cooldown.server_error ?? 10)}
              ${cooldownField("network_error", t("policy.cooldown_network_error"), t("policy.cooldown_network_error_tip"), cooldown.network_error ?? 10)}
              ${cooldownField("key_invalid", t("policy.cooldown_key_invalid"), t("policy.cooldown_key_invalid_tip"), cooldown.key_invalid ?? 3600)}
              ${cooldownField("quota_or_balance", t("policy.cooldown_quota_or_balance"), t("policy.cooldown_quota_or_balance_tip"), cooldown.quota_or_balance ?? 3600)}
            </div>
          </details>
          <button class="button secondary" type="submit">${t("policy.save_retry")}</button>
        </form>
      </div>
    `;
    state.forcePolicyRender = false;
    bindPolicyControlForms(target);
  }

  function cooldownField(name, label, tip, value) {
    return `
      <label class="field">
        <span class="label-with-tip">${escapeHtml(label)}<span class="help-tip" data-tip="${escapeHtml(tip)}">?</span></span>
        <input class="control" name="${escapeHtml(name)}" type="number" min="0" max="86400" value="${escapeHtml(value)}" required />
      </label>
    `;
  }

  function bindPolicyControlForms(root) {
    const routingForm = root.querySelector("#routingControlForm");
    if (routingForm) {
      const routeModeGroup = routingForm.querySelector("#routeModeGroup");
      if (routeModeGroup) {
        routeModeGroup.addEventListener("click", (event) => {
          const btn = event.target.closest("[data-route-mode]");
          if (!btn) return;
          const mode = btn.dataset.routeMode || "";
          routingForm.elements.provider_select.value = mode;
          routeModeGroup.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
        });
      }
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
          setNotice(t("notice.routing_updated"), "ok");
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
          setNotice(t("notice.retry_updated"), "ok");
        });
      });
    }
  }

  function bindFailurePolicyForms(root) {
    root.querySelectorAll(".failure-policy-form").forEach((form) => {
      if (form.dataset.boundfailurepolicyform) return;
      form.dataset.boundfailurepolicyform = "1";
      const errorType = form.dataset.errorType || "";
      const storageKey = `proxyConsoleFold_failure_${errorType}`;
      try {
        if (localStorage.getItem(storageKey) === "1") form.classList.add("is-open");
      } catch (_e) {}
      const header = form.querySelector(".collapsible-card-header");
      if (header) {
        header.addEventListener("click", (event) => {
          if (event.target.closest("select, input, button, .help-tip, .toggle-switch")) return;
          const willOpen = !form.classList.contains("is-open");
          form.classList.toggle("is-open");
          try {
            localStorage.setItem(storageKey, willOpen ? "1" : "0");
          } catch (_e) {}
        });
      }
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
          setNotice(t("notice.failure_policy_updated", { type: payload.error_type }), "ok");
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
      await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
    } catch (err) {
      setNotice(t("notice.policy_failed", { error: err.message }));
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  function renderPolicyRule(rule, index) {
    const decision = policyDecision(rule);
    const headDotTone = decision.retryable ? (decision.disables_key ? "bad" : "warn") : "bad";
    return `
      <article class="policy-rule-card tone-${toneForText(decision.error_type || rule.match || "")}">
        <div class="policy-rule-head">
          <span class="status-dot ${headDotTone}"></span>
          <span class="rule-index">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${messageMarkup(rule.match || rule.name || "-")}</h3>
            <p>${messageMarkup(rule.notes || decision.reason || "-")}</p>
          </div>
        </div>
        <div class="policy-decision-strip">
          ${decisionBadgeWithDot(decision.retryable ? "retry" : "no retry", decision.retryable ? "ok" : "bad")}
          ${decisionBadgeWithDot(rule.retry_next_attempt ? "switch attempt" : "do not switch", rule.retry_next_attempt ? "ok" : "bad")}
          ${decisionBadgeWithDot(decision.stop_attempts ? "stop attempts" : "continue", decision.stop_attempts ? "bad" : "ok")}
          ${decisionBadgeWithDot(`cooldown ${decision.cooldown_scope || "none"}`, toneForText(decision.cooldown_scope || "none"))}
          ${decisionBadgeWithDot(decision.disables_key ? "disable key" : "keep key", decision.disables_key ? "bad" : "neutral")}
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
    const dotTone = scope === "none" ? "off" : scope === "key" ? "warn" : scope === "provider" ? "warn" : "bad";
    return `
      <form class="failure-policy-card failure-policy-form collapsible-card tone-${toneForText(errorType)}" data-error-type="${escapeHtml(errorType)}">
        <div class="failure-policy-head collapsible-card-header">
          <span class="status-dot ${dotTone}"></span>
          <h3>${messageMarkup(errorType)}</h3>
          <span class="badge ${scope === "none" ? "neutral" : "warn"}" style="margin-left:auto">${escapeHtml(scope)}</span>
          <select class="control compact-control" name="cooldown_scope" aria-label="${escapeHtml(errorType)} cooldown scope">
            ${["none", "key", "provider", "key_provider"].map((item) => `<option value="${item}" ${scope === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
          <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"></path></svg>
        </div>
        <div class="collapsible-card-body">
          <div class="failure-policy-edit-grid">
            <label class="field">
              <span class="label-with-tip">${t("policy.key_cooldown")}<span class="help-tip" data-tip="${escapeHtml(t("policy.key_cooldown_tip"))}">?</span></span>
              <input class="control" name="cooldown_s" type="number" min="0" max="86400" value="${escapeHtml(cfg.cooldown_s ?? 0)}" required />
            </label>
            <label class="field">
              <span class="label-with-tip">${t("policy.provider_cooldown")}<span class="help-tip" data-tip="${escapeHtml(t("policy.provider_cooldown_tip"))}">?</span></span>
              <input class="control" name="provider_cooldown_s" type="number" min="0" max="300" value="${escapeHtml(cfg.provider_cooldown_s ?? 0)}" required />
            </label>
            <label class="check-field failure-disable-check">
              <span class="toggle-switch"><input type="checkbox" name="disables_key" ${cfg.disables_key ? "checked" : ""} /><span class="slider"></span></span>
              <span class="label-with-tip">${t("policy.disable_key")}<span class="help-tip" data-tip="${escapeHtml(failurePolicyDescription(errorType))}">?</span></span>
            </label>
            <button class="button secondary" type="submit">${t("policy.save_policy")}</button>
          </div>
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

  function decisionBadgeWithDot(label, tone) {
    const safeTone = tone === "success" ? "ok" : tone === "danger" ? "bad" : tone === "warn" ? "warn" : tone;
    const dotClass = safeTone === "ok" ? "ok" : safeTone === "bad" ? "bad" : safeTone === "warn" ? "warn" : "off";
    return `<span class="badge ${safeTone}"><span class="status-dot ${dotClass}" style="margin-right:4px"></span>${escapeHtml(label)}</span>`;
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
    if (format === "chat_completions") return "Chat";
    if (format === "responses") return "Resp";
    if (format === "anthropic_messages") return "Anth";
    return String(format || "");
  }

  function providerConfigCard(name, provider) {
    const formats = provider.formats || {};
    const keys = Array.isArray(provider.keys) ? provider.keys : [];
    const isEnabled = provider.enabled !== false;
    const enabledFmtList = enabledFormats(formats);
    const dotTone = isEnabled ? "ok" : "off";
    return `
      <article class="config-provider-card collapsible-card">
        <div class="config-provider-head collapsible-card-header">
          <span class="status-dot ${dotTone}"></span>
          <div style="flex:1;min-width:0">
            <div class="provider-name">${escapeHtml(name)}</div>
            <div class="provider-meta">${keys.length} key${keys.length !== 1 ? "s" : ""} / ${enabledFmtList.length ? enabledFmtList.map(shortFormatName).join(", ") : "no formats"}</div>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"></path></svg>
        </div>
        <div class="collapsible-card-body">
          <div class="config-provider-body-inner">
            <form class="config-provider-form" data-provider="${escapeHtml(name)}">
              <label class="field">
                <span class="label-with-tip">${t("form.base_url")}<span class="help-tip" data-tip="${escapeHtml(t("form.base_url_tip"))}">?</span></span>
                <input class="control" name="base_url" value="${escapeHtml(provider.base_url || "")}" placeholder="https://api.example.com" required />
              </label>
              <label class="field">
                <span class="label-with-tip">${t("form.proxy")}<span class="help-tip" data-tip="${escapeHtml(t("form.proxy_tip"))}">?</span></span>
                ${proxyControlInput("proxy", provider.proxy || "", "direct or http://127.0.0.1:8002")}
              </label>
              <label class="field">
                <span class="label-with-tip">${t("form.user_agent")}<span class="help-tip" data-tip="${escapeHtml(t("form.ua_tip"))}">?</span></span>
                <input class="control" name="user_agent" value="${escapeHtml(provider.user_agent || "")}" placeholder="inherit client User-Agent" />
              </label>
              <label class="field">
                <span class="label-with-tip">${t("form.priority")}<span class="help-tip" data-tip="${escapeHtml(t("form.priority_tip"))}">?</span></span>
                <input class="control" name="priority" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(provider.priority ?? 0)}" />
              </label>
              <label class="check-field">
                <span class="toggle-switch"><input type="checkbox" name="enabled" ${isEnabled ? "checked" : ""} /><span class="slider"></span></span>
                <span class="label-with-tip">${t("form.enabled")}<span class="help-tip" data-tip="${escapeHtml(t("form.enabled_tip"))}">?</span></span>
              </label>
              <button class="button secondary" type="submit">${t("form.save_provider")}</button>
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

            <div class="format-route-list">
              ${formatRouteItems(formats, name)}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function formatEditRow(provider, fmt, config) {
    return `
      <form class="format-edit-row" data-provider="${escapeHtml(provider)}" data-format="${escapeHtml(fmt)}">
        <label class="check-field">
          <span class="toggle-switch"><input type="checkbox" name="enabled" ${config.enabled ? "checked" : ""} /><span class="slider"></span></span>
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
    root.querySelectorAll(".config-provider-card.collapsible-card").forEach((card) => {
      if (card.dataset.boundcollapsible) return;
      card.dataset.boundcollapsible = "1";
      const providerName = card.querySelector(".provider-name")?.textContent || "";
      const storageKey = `proxyConsoleFold_provider_${providerName}`;
      try {
        if (localStorage.getItem(storageKey) === "1") card.classList.add("is-open");
      } catch (_e) {}
      const header = card.querySelector(".collapsible-card-header");
      if (header) {
        header.addEventListener("click", (event) => {
          if (event.target.closest("input, button, select, .help-tip, .toggle-switch")) return;
          const willOpen = !card.classList.contains("is-open");
          card.classList.toggle("is-open");
          try {
            localStorage.setItem(storageKey, willOpen ? "1" : "0");
          } catch (_e) {}
          if (willOpen) {
            requestAnimationFrame(() => {
              const rect = card.getBoundingClientRect();
              if (rect.bottom > window.innerHeight) {
                card.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            });
          }
        });
      }
    });
    root.querySelectorAll("[data-provider-delete]").forEach((button) => {
      if (button.dataset.bounddataproviderdelete) return;
      button.dataset.bounddataproviderdelete = "1";
      button.addEventListener("click", async () => {
        const provider = button.dataset.providerDelete || "";
        if (!provider) return;
        const confirmed = await openConfirmDialog({
          title: t("confirm.delete_provider.title"),
          message: t("confirm.delete_provider.msg", { provider }),
          acceptLabel: t("confirm.delete"),
        });
        if (!confirmed) return;
        button.disabled = true;
        try {
          await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/delete`, { confirm: "delete_provider" });
          state.openProviderDetails.delete(provider);
          state.openProviderEditors.delete(provider);
          if (state.providerDrawerName === provider) closeProviderDrawer();
          state.forceConfigRender = true;
          setNotice(t("notice.provider_deleted", { provider }), "ok");
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
        } catch (err) {
          setNotice(t("notice.delete_provider_failed", { error: err.message }));
        } finally {
          button.disabled = false;
        }
      });
    });

    root.querySelectorAll("[data-hot-priority-apply]").forEach((button) => {
      if (button.dataset.boundHotPriority) return;
      button.dataset.boundHotPriority = "1";
      button.addEventListener("click", async () => {
        const provider = button.dataset.hotPriorityApply || "";
        if (!provider) return;
        const input = root.querySelector(`[data-hot-priority="${CSS.escape(provider)}"]`);
        if (!input) return;
        const priority = Number(input.value || 0);
        button.disabled = true;
        try {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/priority`, { priority });
          setNotice(`Priority for ${provider} hot-updated to ${priority}.`, "ok");
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
        } catch (err) {
          setNotice(`Hot-reload priority failed: ${err.message}`);
        } finally {
          button.disabled = false;
        }
      });
    });

    root.querySelectorAll(".config-provider-form").forEach((form) => {
      if (form.dataset.boundconfigproviderform) return;
      form.dataset.boundconfigproviderform = "1";
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
          setNotice(t("notice.provider_updated", { provider }), "ok");
        });
      });
    });

    root.querySelectorAll(".config-key-form").forEach((form) => {
      if (form.dataset.boundconfigkeyform) return;
      form.dataset.boundconfigkeyform = "1";
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
          setNotice(t("notice.key_added", { provider }), "ok");
        });
      });
    });

    root.querySelectorAll(".key-proxy-row").forEach((form) => {
      if (form.dataset.boundkeyproxyrow) return;
      form.dataset.boundkeyproxyrow = "1";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const provider = form.dataset.provider || "";
        const keyIndex = String(form.dataset.keyIndex || "").trim();
        const proxy = String(form.elements.proxy.value || "").trim();
        await runConfigMutation(form, async () => {
          await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}`, { proxy });
          setNotice(t("notice.key_proxy_updated", { index: keyIndex, provider }), "ok");
        });
      });
    });

    root.querySelectorAll(".format-route.is-interactive").forEach((card) => {
      if (card.dataset.boundformatrouteisinteractive) return;
      card.dataset.boundformatrouteisinteractive = "1";
      const provider = card.dataset.formatProvider || "";
      const fmt = card.dataset.format || "";
      const label = card.querySelector(".format-route-main b")?.textContent || formatLabel(fmt) || fmt;

      const toggle = async () => {
        const nextEnabled = card.dataset.formatEnabled !== "1";
        await runFormatMutation(card, async () => {
          const resp = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/formats/${encodeURIComponent(fmt)}`, { enabled: nextEnabled });
          setNotice(t("notice.format_toggled", { provider, format: fmt, state: nextEnabled ? t("notice.enabled") : t("notice.disabled") }), "ok");
          return resp;
        });
      };

      const editPath = () => {
        openProviderFormatPathModal({
          provider,
          fmt,
          label,
          path: card.dataset.formatPath || defaultFormatPath(fmt),
          enabled: card.dataset.formatEnabled === "1",
          ownerCard: card,
        });
      };

      card.querySelector("[data-format-path-edit]")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        editPath();
      });

      card.addEventListener("click", (event) => {
        if (event.target.closest("[data-format-path-edit]")) {
          return;
        }
        toggle();
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        } else if (event.key === "F2") {
          event.preventDefault();
          editPath();
        }
      });
    });
  }

  async function runFormatMutation(card, operation) {
    if (card) {
      card.setAttribute("aria-busy", "true");
      card.classList.add("is-busy");
    }
    try {
      const result = await operation();
      if (result?.config) state.data.config = result.config;
      state.data.version = Number(state.data.version || 0) + 1;
      state.forceConfigRender = true;
      state.forceProvidersRender = true;
      state.forceModelCapsRender = true;
      renderAll();
      renderProviderDrawer({ force: true });
      Promise.resolve().then(() => refreshProviderConfigView({ preserveNotice: true })).catch(() => {});
      return true;
    } catch (err) {
      setNotice(t("notice.format_update_failed", { error: err.message }), "bad");
      return false;
    } finally {
      if (card) {
        card.removeAttribute("aria-busy");
        card.classList.remove("is-busy");
      }
    }
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
      await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
    } catch (err) {
      setNotice(t("notice.config_update_failed", { error: err.message }));
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
    state.detailDrawerReturn = null;
    if (el("providerDrawer")?.classList.contains("is-open") && state.providerDrawerName) {
      state.detailDrawerReturn = {
        type: "provider",
        name: state.providerDrawerName,
        tab: state.providerDrawerTab || "overview",
      };
    } else if (el("modelDrawer")?.classList.contains("is-open")) {
      const modelName = el("modelDrawerTitle")?.textContent || "";
      if (modelName) {
        state.detailDrawerReturn = { type: "model", name: modelName };
      }
    }
    closeProviderDrawer();
    closeModelDrawer();
    const drawer = el("detailDrawer");
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    el("drawerSubtitle").textContent = requestId;
    updateDOM(el("drawerBody"), `<div class="empty">Loading request detail</div>`);
    try {
      const detail = await apiGet(`/-/admin/requests/${encodeURIComponent(requestId)}`);
      renderDrawer(detail);
    } catch (err) {
      updateDOM(el("drawerBody"), `<div class="notice">Request detail failed: ${escapeHtml(err.message)}</div>`);
    }
  }

  function renderDrawer(detail) {
    const attempts = Array.isArray(detail.attempts) ? detail.attempts : [];
    const summary = detail.routing_summary || {};
    el("drawerSubtitle").textContent = `${detail.request_id || "-"} / ${detail.state || "unknown"}`;
    updateDOM(el("drawerBody"), `
      ${renderRoutingSummary(summary)}
      <div class="kv-grid drawer-kv">
        <span>Status</span><span>${detail.status_code ? statusBadge(detail.status, detail.status_code) : messageMarkup(detail.state || "-")}</span>
        <span>Client Model</span><span class="mono">${escapeHtml(detail.model || "-")}</span>
        <span>Upstream Model</span><span class="mono">${(() => { const um = [...new Set(attempts.map(a => a.provider_model).filter(Boolean))]; return um.length ? chipList(um) : escapeHtml("-"); })()}</span>
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
    `);
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
          <span>Upstream Model ID</span><span class="mono">${escapeHtml(attempt.provider_model || "-")}</span>
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
    // When entering a view whose heavy data may be stale (not polled while the
    // user was elsewhere), force a one-shot fetch of that payload so the view
    // shows fresh data immediately instead of waiting for the next tick.
    if (nextView === "overview") {
      state.forceTimeseriesFetch = true;
      refreshAll({ quiet: true });
    } else if (nextView === "requests") {
      state.forceRequestsFetch = true;
      refreshAll({ quiet: true });
    } else if (nextView === "playground") {
      pgLoadModels();
    }
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

    // Form modal (Add Provider etc.): close on backdrop / close button / Escape.
    el("formModalClose")?.addEventListener("click", closeFormModal);
    el("formModalBackdrop")?.addEventListener("click", closeFormModal);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el("formModal")?.classList.contains("is-open")) {
        closeFormModal();
      }
    });
    el("openAddProviderModal")?.addEventListener("click", openAddProviderModal);

    // Cross-view navigation links (e.g. "use the Providers page" hint on config).
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-goto-view]");
      if (!link) return;
      event.preventDefault();
      const view = link.dataset.gotoView;
      if (view) setView(view);
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

    el("refreshButton")?.addEventListener("click", () => {
      refreshAll();
      closeMobileSettings();
    });

    el("pauseButton").addEventListener("click", () => {
      state.paused = !state.paused;
      updatePauseButtonState();
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
      const title = mode === "selected" ? t("confirm.delete_selected.title") : mode === "matching" ? t("confirm.delete_matching.title") : t("confirm.clear_history.title");
      const plural = (mode === "selected" ? ids.length : Number(state.data.requests?.total || 0)) === 1 ? "" : "s";
      const message = mode === "selected"
        ? t("confirm.delete_selected.msg", { count: fmtInt(ids.length), plural })
        : mode === "matching"
          ? t("confirm.delete_matching.msg", { count: fmtInt(state.data.requests?.total || 0), plural })
          : t("confirm.clear_history.msg");
      const confirmed = await openConfirmDialog({ title, message, acceptLabel: t("confirm.delete") });
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
        const plural = deleted === 1 ? "" : "s";
        setNotice(
          mode === "all"
            ? t("notice.request_history_cleared", { count: fmtInt(deleted) })
            : t("notice.requests_deleted", { count: fmtInt(deleted), plural }),
          "ok",
        );
        await refreshAll({ quiet: true, preserveNotice: true });
      } catch (err) {
        setNotice(t("notice.delete_requests_failed", { error: err.message }));
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
        await refreshAll({ quiet: true, staticData: true });
      } catch (err) {
        setNotice(t("notice.config_reload_failed", { error: err.message }));
      }
    });

    el("globalProxyForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await runConfigMutation(form, async () => {
        await apiPatch("/-/admin/proxy", { proxy: String(form.elements.proxy.value || "").trim() });
        setNotice(t("notice.global_proxy_updated"), "ok");
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
        setNotice(t("notice.overlay_exported"), "ok");
      } catch (err) {
        setNotice(t("notice.overlay_export_failed", { error: err.message }));
      }
    });

    el("validateOverlayButton").addEventListener("click", async () => {
      try {
        const result = await apiPost("/-/admin/config/overlay/validate", {});
        state.data.overlayPreviewPinned = true;
        state.data.overlayPreviewStatus = result.preview?.valid ? "valid" : "invalid";
        el("overlayPreview").textContent = JSON.stringify(result.preview || {}, null, 2);
        renderOverlaySafety(state.data.config || {});
        setNotice(t("notice.overlay_validated"), "ok");
      } catch (err) {
        state.data.overlayPreviewStatus = "failed";
        renderOverlaySafety(state.data.config || {});
        setNotice(t("notice.overlay_validation_failed", { error: err.message }));
      }
    });

    el("clearOverlayButton").addEventListener("click", async () => {
      const confirmed = await openConfirmDialog({
        title: t("confirm.clear_overlay.title"),
        message: t("confirm.clear_overlay.msg"),
        acceptLabel: t("confirm.clear"),
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
        setNotice(result.backup_path ? t("notice.overlay_cleared_backup", { path: result.backup_path }) : t("notice.overlay_cleared"), "ok");
        await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
      } catch (err) {
        setNotice(t("notice.clear_overlay_failed", { error: err.message }));
      }
    });

    el("addProviderForm")?.addEventListener("submit", async (event) => {
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
        await refreshAll({ quiet: true, staticData: true });
        setNotice(t("notice.provider_added", { name: payload.name }), "ok");
      } catch (err) {
        setNotice(t("notice.add_provider_failed", { error: err.message }));
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
        setNotice(t("notice.model_route_saved", { model: payload.model }), "ok");
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
          title: t("confirm.delete_route.title"),
          message: t("confirm.delete_route.msg", { model }),
          acceptLabel: t("confirm.delete"),
        });
        if (!confirmed) return;
        deleteButton.disabled = true;
        try {
          await apiPost("/-/admin/models/routes/delete", { model });
          state.forceModelRoutesRender = true;
          setNotice(t("notice.model_route_deleted", { model }), "ok");
          await refreshAll({ quiet: true, preserveNotice: true, staticData: true });
        } catch (err) {
          setNotice(t("notice.delete_route_failed", { error: err.message }));
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
        closeDrawer(false);
        closeProviderDrawer();
        closeModelDrawer();
        closeMobileSettings();
      }
    });
  }

  function updatePauseButtonState() {
    const button = el("pauseButton");
    if (!button) return;
    const label = t("action.auto_refresh");
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", state.paused ? "false" : "true");
    button.classList.toggle("is-paused", state.paused);
  }

  function closeDrawer(restoreReturn = true) {
    const drawer = el("detailDrawer");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    const returnTarget = restoreReturn ? state.detailDrawerReturn : null;
    state.detailDrawerReturn = null;
    if (returnTarget?.type === "provider" && returnTarget.name) {
      openProviderDrawer(returnTarget.name, returnTarget.tab || "overview");
    } else if (returnTarget?.type === "model" && returnTarget.name) {
      openModelDrawer(returnTarget.name);
    }
  }

  async function openModelDrawer(modelName) {
    closeDrawer(false);
    closeProviderDrawer();
    const drawer = el("modelDrawer");
    const title = el("modelDrawerTitle");
    const subtitle = el("modelDrawerSubtitle");
    const body = el("modelDrawerBody");
    if (!drawer || !body) return;

    title.textContent = modelName;
    subtitle.textContent = "Loading benchmark data...";
    updateDOM(body, `
      <div class="loading-state pad" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0;">
        <div class="auth-progress" style="width: 40px; height: 40px; border: 3px solid var(--accent-soft, #eff6ff); border-top-color: var(--accent-strong, #3b82f6); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 16px; color: var(--muted); font-size: 13px; font-weight: 500;">Retrieving details from Artificial Analysis...</div>
      </div>
    `);
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");

    try {
      const result = await apiGet(`/-/admin/model-summary/${encodeURIComponent(modelName)}`);
      if (result.error) {
        updateDOM(body, `
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
        `);
        subtitle.textContent = "Not Found";
      } else {
        const summary = result.summary || {};
        const url = result.source_url || `https://artificialanalysis.ai/models/${encodeURIComponent(result.model)}`;
        subtitle.textContent = result.model;

        const fmtRank = (item) => item && item.rank ? `#${item.rank} of ${item.total}` : "-";

        updateDOM(body, `
          <div class="model-summary-details">
            <div style="display: grid); grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px;">
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
        `);
      }
    } catch (err) {
      updateDOM(body, `
        <div class="notice danger pad" style="margin: 15px);">
          <strong>Fetch Failed</strong>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `);
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

  // ---- Custom tooltip (Apple-style) -------------------------------------
  // Any element with a non-empty [data-tip] attribute shows a floating tooltip
  // on hover. This replaces native title="" tooltips with a frosted, rounded,
  // softly-shadowed popover that matches the rest of the dashboard. Single
  // delegated listener pair, single shared element.
  let _tipEl = null;
  let _tipHideTimer = null;

  function installTooltip() {
    if (_tipEl) return;
    _tipEl = document.createElement("div");
    _tipEl.className = "lp-tip";
    _tipEl.setAttribute("role", "tooltip");
    _tipEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(_tipEl);

    // Track which element the tooltip is currently anchored to so we can react
    // only when it actually changes. This fixes the "stays open after mouse
    // leaves" bug caused by mouseout firing on child elements.
    let _currentTipTarget = null;

    // Suppress the browser's native tooltip by stashing the title into a data
    // attribute on first hover and keeping it suppressed. We do NOT restore on
    // mouseout, because the custom popover already mirrors the text and
    // restoring would let the native yellow box reappear on the next hover
    // (and churn title on every mousemove between parent/child). The original
    // text is preserved in data-original-title so it is never lost.
    const suppressNative = (target) => {
      if (target.dataset.tipTitleSuppressed === "1") return;
      const title = target.getAttribute("title");
      if (title) {
        target.setAttribute("data-original-title", title);
        target.removeAttribute("title");
      }
      target.dataset.tipTitleSuppressed = "1";
    };

    const show = (target) => {
      suppressNative(target);
      const text = target.getAttribute("data-tip") || target.getAttribute("data-original-title") || "";
      const trimmed = String(text).trim();
      if (!trimmed) {
        hideNow();
        return;
      }
      window.clearTimeout(_tipHideTimer);
      _currentTipTarget = target;
      _tipEl.textContent = trimmed;
      _tipEl.setAttribute("aria-hidden", "false");
      // Measure BEFORE making it visible so the transform: scale() transition
      // does not distort the rect used for positioning.
      positionTip(target);
      _tipEl.classList.add("is-visible");
    };
    const hideNow = () => {
      window.clearTimeout(_tipHideTimer);
      _tipEl.classList.remove("is-visible");
      _tipEl.setAttribute("aria-hidden", "true");
      _currentTipTarget = null;
    };
    const hide = () => {
      window.clearTimeout(_tipHideTimer);
      _tipHideTimer = window.setTimeout(() => {
        _tipEl.classList.remove("is-visible");
        _tipEl.setAttribute("aria-hidden", "true");
        _currentTipTarget = null;
      }, 80);
    };
    const positionTip = (target) => {
      const rect = target.getBoundingClientRect();
      // Temporarily place off-screen to measure natural size without the
      // transition transform skewing the bounding rect.
      _tipEl.style.left = "0px";
      _tipEl.style.top = "0px";
      const tipRect = _tipEl.getBoundingClientRect();
      const tipW = tipRect.width || _tipEl.offsetWidth || 0;
      const tipH = tipRect.height || _tipEl.offsetHeight || 0;
      const margin = 10;
      // Default: above and centered. Flip below if near top edge.
      let top = rect.top - tipH - margin;
      let placeBelow = false;
      if (top < margin) {
        top = rect.bottom + margin;
        placeBelow = true;
      }
      let left = rect.left + rect.width / 2 - tipW / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - tipH - margin));
      _tipEl.style.left = `${Math.round(left)}px`;
      _tipEl.style.top = `${Math.round(top)}px`;
      _tipEl.classList.toggle("is-below", placeBelow);
    };

    const selector = "[data-tip], [title]";

    // mouseover/mouseout fire when crossing element boundaries (including
    // children), so we compare the resolved tooltip target before/after to
    // decide whether to show, move, or hide. This avoids both the "stuck open"
    // bug (mouseleave on a child incorrectly hiding) and the "never hides"
    // bug (mouseout on a child with no tooltip target leaving it open).
    const targetFromEvent = (event) => {
      const node = event.target;
      if (!node || !node.closest) return null;
      return node.closest(selector);
    };

    document.addEventListener("mouseover", (event) => {
      const target = targetFromEvent(event);
      if (target) {
        show(target);
      } else if (_currentTipTarget) {
        hide();
      }
    });
    document.addEventListener("mouseout", (event) => {
      // Only hide when the pointer actually leaves the current tooltip target
      // (moved to something that is NOT the target or its descendant).
      const next = event.relatedTarget;
      if (_currentTipTarget && next && _currentTipTarget.contains(next)) return;
      if (_currentTipTarget && next === _currentTipTarget) return;
      hide();
    });
    // Safety net: if the pointer leaves the window entirely, hide immediately.
    document.addEventListener("mouseleave", hideNow);
    window.addEventListener("blur", hideNow);
    // Reposition on scroll/resize so the tooltip stays anchored correctly.
    window.addEventListener("scroll", () => {
      if (_currentTipTarget) positionTip(_currentTipTarget);
    }, { passive: true });
    window.addEventListener("resize", () => {
      if (_currentTipTarget) positionTip(_currentTipTarget);
    });

    document.addEventListener("focusin", (event) => {
      const target = targetFromEvent(event);
      if (target) show(target);
    });
    document.addEventListener("focusout", (event) => {
      const target = targetFromEvent(event);
      if (target) hide();
    });
  }

  async function init() {
    initLang();
    installMobileSettings();
    installEvents();
    installTooltip();
    bindLangToggle();
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
      checkingMessage: t("auth.checking"),
    });
  }

  function bindLangToggle() {
    const btn = el("langToggleButton");
    if (!btn) return;
    btn.addEventListener("click", () => {
      setLang(getLang() === "en" ? "zh" : "en");
    });
    // Re-render all dynamic content when language changes
    onLangChange(() => {
      updateLangToggleLabel();
      updatePauseButtonState();
      renderAll();
      // Re-apply static HTML translations
      applyI18n();
      // Update view title/subtitle
      const meta = views[state.view] || views.overview;
      el("viewTitle").textContent = meta.title;
      el("viewSubtitle").textContent = meta.subtitle;
      // Re-render time range label
      renderTimeRangeControl();
    });
    updateLangToggleLabel();
  }

  function updateLangToggleLabel() {
    const btn = el("langToggleButton");
    if (!btn) return;
    btn.textContent = getLang() === "en" ? "中" : "EN";
  }

  // ─────────────────────────────────────────────────────────────
  // Playground: interactive model testing with routing feedback
  // ─────────────────────────────────────────────────────────────

  const pg = {
    models: [],
    messages: [],
    format: "chat_completions",
    loading: false,
    abortCtrl: null,
    firstByteMs: null,
    startTime: null,
  };

function pgEsc(s) {
return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

  function pgEndpoint() {
    if (pg.format === "anthropic_messages") return "/v1/messages";
    if (pg.format === "responses") return "/v1/responses";
    return "/v1/chat/completions";
  }

  function pgBuildRequest(userText) {
    const model = el("pgModel")?.value || "";
    const temperature = parseFloat(el("pgTemperature")?.value || "0.7");
    const maxTokens = parseInt(el("pgMaxTokens")?.value || "4096", 10);
    const topP = parseFloat(el("pgTopP")?.value || "1");
    const stream = el("pgStream")?.checked !== false;
    const includeHistory = el("pgIncludeHistory")?.checked === true;
    const sysPrompt = (el("pgSystemPrompt")?.value || "").trim();

    const msgs = includeHistory ? [...pg.messages] : [];
    if (sysPrompt) {
      msgs.unshift({ role: "system", content: sysPrompt });
    }
    msgs.push({ role: "user", content: userText });

    if (pg.format === "anthropic_messages") {
      const body = {
        model,
        messages: msgs.filter((m) => m.role !== "system").map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream,
      };
      if (sysPrompt) body.system = sysPrompt;
      return body;
    }

    if (pg.format === "responses") {
      return {
        model,
        input: msgs.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream,
      };
    }

    return {
      model,
      messages: msgs,
      temperature,
      max_tokens: maxTokens,
      top_p: topP,
      stream,
    };
  }

  function pgStatus(text) {
    const node = el("pgStatusText");
    if (node) node.textContent = text;
  }

  function pgNewRequestId() {
    try {
      if (window.crypto?.randomUUID) return `pg-${window.crypto.randomUUID()}`;
    } catch (_e) {}
    return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function pgShortText(text, limit = 44) {
    const value = String(text || "");
    return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
  }

  function pgTextFromAny(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map((item) => pgTextFromAny(item)).join("");
    if (typeof value === "object") {
      for (const key of ["text", "content", "summary", "thinking"]) {
        if (value[key] != null) return pgTextFromAny(value[key]);
      }
    }
    return "";
  }

  function pgAppendStreamText(current, incoming) {
    const base = String(current || "");
    const text = String(incoming || "");
    if (!text) return base;
    if (!base) return text;
    if (text.startsWith(base)) return text;
    return base + text;
  }

  function pgApplyTraceToMessage(message, trace) {
    if (!message || !trace) return;
    if (trace.requestId) message.requestId = trace.requestId;
    if (trace.clientFormat) message.clientFormat = trace.clientFormat;
    if (trace.provider) message.provider = trace.provider;
    if (trace.keyIndex != null) message.keyIndex = trace.keyIndex;
    if (trace.keyMasked) message.keyMasked = trace.keyMasked;
    if (trace.upstreamFormat) message.upstreamFormat = trace.upstreamFormat;
    if (trace.providerModel) message.providerModel = trace.providerModel;
    if (trace.routeHeadline) message.routeHeadline = trace.routeHeadline;
    if (trace.firstByteMs != null) message.firstByteMs = trace.firstByteMs;
    if (trace.totalMs != null) message.totalMs = trace.totalMs;
    if (trace.usage) message.usage = trace.usage;
  }

  function pgIsNearBottom(node, threshold = 80) {
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight <= threshold;
  }

  function pgRenderMessages({ scroll = "preserve" } = {}) {
    const chat = el("pgChat");
    if (!chat) return;
    const previousTop = chat.scrollTop;
    const wasNearBottom = pgIsNearBottom(chat);
    if (!pg.messages.length) {
      chat.innerHTML = `<div class="pg-empty"><span class="pg-empty-icon">${iconSvg("message")}</span><span class="pg-empty-text">Send a message to start testing.</span></div>`;
      return;
    }
    chat.innerHTML = pg.messages.map((m) => pgRenderMessage(m)).join("");
    if (scroll === "bottom" || (scroll === "follow" && wasNearBottom)) {
      chat.scrollTop = chat.scrollHeight;
    } else {
      chat.scrollTop = previousTop;
    }
  }

  function pgUpdateStreamingMessage(m) {
    const chat = el("pgChat");
    if (!chat) return;
    const nodes = chat.querySelectorAll(".pg-message");
    const node = nodes[nodes.length - 1];
    const content = node?.querySelector(".pg-message-content");
    const thinking = node?.querySelector(".pg-thinking");
    const thinkingText = node?.querySelector(".pg-thinking-text");
    const thinkingSummary = node?.querySelector(".pg-thinking summary");
    if (!content) {
      pgRenderMessages({ scroll: "follow" });
      return;
    }
    const shouldFollow = pgIsNearBottom(chat);
    if (thinking && thinkingText) {
      const reasoning = m.reasoning || "";
      thinking.hidden = !reasoning.trim();
      if (reasoning.trim()) thinking.open = Boolean(m.streaming);
      thinkingText.textContent = m.reasoning || "";
      if (thinkingSummary) thinkingSummary.textContent = `Thinking${reasoning ? ` · ${reasoning.length} chars` : ""}`;
    }
    content.textContent = m.content || "";
    if (m.streaming) {
      const cursor = document.createElement("span");
      cursor.className = "pg-stream-cursor";
      content.appendChild(cursor);
    }
    if (shouldFollow) chat.scrollTop = chat.scrollHeight;
  }

  function pgRenderMessage(m) {
    const roleClass = `pg-role-${m.role || "user"}`;
    const roleLabel = (m.role || "user").replace("_", " ");
    let body = "";
    let meta = "";
    if (m.error) {
      body = `<div class="pg-message-error">${pgEsc(m.error)}</div>`;
    } else if (m.streaming) {
      body = `${pgRenderThinking(m)}<div class="pg-message-content">${pgEsc(m.content || "")}<span class="pg-stream-cursor"></span></div>`;
    } else {
      body = `${pgRenderThinking(m)}<div class="pg-message-content">${pgEsc(m.content || "")}</div>`;
    }
    if (m.provider) {
      const parts = [`provider:${pgEsc(m.provider)}`];
      if (m.keyMasked) parts.push(`key:${pgEsc(m.keyMasked)}`);
      else if (m.keyIndex != null) parts.push(`key:${m.keyIndex}`);
      if (m.clientFormat) parts.push(`client:${pgEsc(m.clientFormat)}`);
      if (m.upstreamFormat) parts.push(`upstream:${pgEsc(m.upstreamFormat)}`);
      if (m.firstByteMs != null) parts.push(`${m.firstByteMs}ms first byte`);
      if (m.totalMs != null) parts.push(`${(m.totalMs / 1000).toFixed(2)}s total`);
      if (m.usage) {
        const u = m.usage;
        const tin = u.input_tokens || u.prompt_tokens || 0;
        const tout = u.output_tokens || u.completion_tokens || 0;
        parts.push(`${tin} in / ${tout} out`);
      }
      meta = `<div class="pg-message-meta">${parts.map((p) => `<span class="badge tone-neutral">${p}</span>`).join("")}</div>`;
    }
    return `<div class="pg-message ${roleClass}">
      <div class="pg-message-head"><span class="pg-message-role">${roleLabel}</span></div>
      ${body}${meta}
    </div>`;
  }

  function pgRenderThinking(m) {
    if ((m.role || "") !== "assistant") return "";
    const text = String(m.reasoning || "");
    return `<details class="pg-thinking" ${text.trim() ? "open" : "hidden"}>
      <summary>Thinking${text ? ` · ${text.length} chars` : ""}</summary>
      <pre class="pg-thinking-text">${pgEsc(text)}</pre>
    </details>`;
  }

  function pgRenderTrace(trace) {
    const strip = el("pgTraceStrip");
    if (!strip) return;
    if (!trace) {
      strip.hidden = true;
      strip.innerHTML = "";
      return;
    }
    strip.hidden = false;
    const items = [];
    if (trace.requestId) items.push(["request", pgShortText(trace.requestId, 18)]);
    if (trace.provider) items.push(["provider", pgEsc(trace.provider)]);
    if (trace.keyMasked) items.push(["key", pgEsc(trace.keyMasked)]);
    else if (trace.keyIndex != null) items.push(["key", trace.keyIndex]);
    if (trace.upstreamFormat) items.push(["format", pgEsc(trace.upstreamFormat)]);
    if (trace.providerModel) items.push(["upstream model", pgEsc(trace.providerModel)]);
    if (trace.firstByteMs != null) items.push(["1st byte", `${trace.firstByteMs}ms`]);
    if (trace.totalMs != null) items.push(["total", `${(trace.totalMs / 1000).toFixed(2)}s`]);
    if (trace.usage) {
      const u = trace.usage;
      const tin = u.input_tokens || u.prompt_tokens || 0;
      const tout = u.output_tokens || u.completion_tokens || 0;
      items.push(["tokens", `${tin}in/${tout}out`]);
    }
    if (trace.sentText) items.push(["sent", `"${pgEsc(pgShortText(trace.sentText, 32))}"`]);
    strip.innerHTML = items.map(([k, v]) => `<div class="pg-trace-item"><span class="pg-trace-k">${k}</span><span class="pg-trace-v">${v}</span></div>`).join("");
  }

  function pgRouteTraceFromDetail(detail) {
    if (!detail || typeof detail !== "object") return null;
    const attempts = Array.isArray(detail.attempts) ? detail.attempts : [];
    const finalAttempt = attempts.find((a) => String(a?.outcome || "") === "success") || attempts[attempts.length - 1] || {};
    const summary = detail.routing_summary || {};
    return {
      requestId: detail.request_id || "",
      clientFormat: detail.client_format || "",
      provider: finalAttempt.provider || summary.final_provider || "",
      keyIndex: finalAttempt.key_index ?? null,
      keyMasked: finalAttempt.key_masked || "",
      upstreamFormat: finalAttempt.upstream_format || summary.final_upstream_format || "",
      providerModel: finalAttempt.provider_model || detail.model || "",
      firstByteMs: detail.first_byte_ms || null,
      totalMs: detail.duration_ms || null,
      usage: detail.usage || finalAttempt.usage || null,
      routeHeadline: summary.headline || "",
    };
  }

  async function pgFetchRouteTrace(requestId) {
    if (!requestId) return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const detail = await apiGet(`/-/admin/requests/${encodeURIComponent(requestId)}`);
        return pgRouteTraceFromDetail(detail);
      } catch (_err) {
        await new Promise((resolve) => setTimeout(resolve, 120 + attempt * 180));
      }
    }
    return null;
  }

  async function pgLoadModels() {
    // Always fetch fresh models to ensure latest data
    try {
      const data = await apiGet("/v1/models");
      const models = (data?.data || data?.models || []).map((m) => m.id || m);
      pg.models = models.sort();
      pgPopulateModelSelect();
    } catch (err) {
      pgStatus(t("pg.load_failed", { error: err.message }));
    }
  }

  function pgPopulateModelSelect() {
    const hidden = el("pgModel");
    const searchInput = el("pgModelSearch");
    if (!hidden || !searchInput) return;
    // Keep current selection if still valid
    if (!hidden.value || !pg.models.includes(hidden.value)) {
      hidden.value = pg.models[0] || "";
    }
    searchInput.value = hidden.value;
  }

  function pgFilterModels(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return pg.models;
    return pg.models.filter((m) => m.toLowerCase().includes(q));
  }

  function pgShowModelDropdown() {
    const dropdown = el("pgModelDropdown");
    const searchInput = el("pgModelSearch");
    if (!dropdown || !searchInput) return;
    const filtered = pgFilterModels(searchInput.value);
    if (!filtered.length) {
      dropdown.innerHTML = '<div class="pg-model-empty">No models found</div>';
    } else {
      const current = el("pgModel").value;
      dropdown.innerHTML = filtered.map((id) => `<div class="pg-model-option${id === current ? " selected" : ""}" data-model="${pgEsc(id)}">${pgEsc(id)}</div>`).join("");
    }
    dropdown.hidden = false;
  }

  function pgHideModelDropdown() {
    const dropdown = el("pgModelDropdown");
    if (dropdown) dropdown.hidden = true;
  }

  function pgSelectModel(id) {
    const hidden = el("pgModel");
    const searchInput = el("pgModelSearch");
    if (hidden) hidden.value = id;
    if (searchInput) searchInput.value = id;
    pgHideModelDropdown();
  }

  function pgExtractDelta(chunk, format) {
    const out = { content: "", reasoning: "", done: false };
    if (format === "anthropic_messages") {
      if (chunk.type === "content_block_delta" && chunk.delta) {
        if (chunk.delta.type === "text_delta") out.content = chunk.delta.text || "";
        if (chunk.delta.type === "thinking_delta") out.reasoning = chunk.delta.thinking || "";
      }
      if (chunk.type === "message_stop") out.done = true;
      return out;
    }
    if (format === "responses") {
      if (chunk.type === "response.output_text.delta") out.content = chunk.delta || "";
      if (chunk.type === "response.reasoning_summary_text.delta" || chunk.type === "response.reasoning_summary.delta" || chunk.type === "response.reasoning_text.delta") {
        out.reasoning = chunk.delta || chunk.text || "";
      }
      if (chunk.type === "response.completed") out.done = true;
      return out;
    }
    const choice = chunk.choices?.[0];
    if (!choice) return out;
    out.content = choice.delta?.content || "";
    out.reasoning = pgTextFromAny(choice.delta?.reasoning_content ?? choice.delta?.reasoning ?? choice.delta?.thinking);
    if (choice.finish_reason) out.done = true;
    return out;
  }

  function pgExtractContent(chunk, format) {
    const delta = pgExtractDelta(chunk, format);
    return delta.done ? null : delta.content;
  }

  function pgExtractReasoning(chunk, format) {
    return pgExtractDelta(chunk, format).reasoning;
  }

  function pgExtractUsage(data, format) {
    if (format === "anthropic_messages") {
      if (data.usage) return { input_tokens: data.usage.input_tokens || 0, output_tokens: data.usage.output_tokens || 0 };
      if (data.message?.usage) return { input_tokens: data.message.usage.input_tokens || 0, output_tokens: data.message.usage.output_tokens || 0 };
    }
    if (format === "responses") {
      if (data.usage) return { input_tokens: data.usage.input_tokens || 0, output_tokens: data.usage.output_tokens || 0 };
    }
    if (data.usage) return { input_tokens: data.usage.prompt_tokens || 0, output_tokens: data.usage.completion_tokens || 0 };
    return null;
  }

  async function pgSend() {
    const input = el("pgChatInput");
    if (!input) return;
    const userText = input.value.trim();
    if (!userText || pg.loading) return;
    input.value = "";

    pg.messages.push({ role: "user", content: userText });
    const assistantMsg = { role: "assistant", content: "", reasoning: "", streaming: true };
    pg.messages.push(assistantMsg);
    pg.loading = true;
    pg.firstByteMs = null;
    pg.startTime = performance.now();
    pgRenderMessages({ scroll: "bottom" });

    const sendBtn = el("pgSendButton");
    const stopBtn = el("pgStopButton");
    if (sendBtn) sendBtn.hidden = true;
    if (stopBtn) stopBtn.hidden = false;
    pgStatus(t("pg.sending"));

    const body = pgBuildRequest(userText);
    const stream = body.stream !== false;
    const endpoint = pgEndpoint();
    const requestId = pgNewRequestId();
    assistantMsg.requestId = requestId;
    assistantMsg.sentText = userText;
    assistantMsg.clientFormat = pg.format;

    pg.abortCtrl = new AbortController();

    try {
      const resp = await fetch(withAdmin(endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          ...(state.adminKey ? { "X-Admin-Key": state.adminKey } : {}),
        },
        body: JSON.stringify(body),
        signal: pg.abortCtrl.signal,
      });

      if (!resp.ok) {
        const errData = await readJson(resp);
        throw new Error(errorMessage(errData, resp.status));
      }

      // Extract routing trace from response headers (injected by the proxy backend)
      const routeTrace = pgExtractRouteHeaders(resp);
      if (routeTrace) {
        pgApplyTraceToMessage(assistantMsg, { ...routeTrace, requestId, clientFormat: pg.format, sentText: userText });
      }

      if (stream && resp.body) {
        await pgHandleStream(resp, assistantMsg);
      } else {
        const data = await resp.json();
        assistantMsg.content = pgExtractNonStreamContent(data, pg.format);
        assistantMsg.reasoning = pgExtractNonStreamReasoning(data, pg.format);
        assistantMsg.usage = pgExtractUsage(data, pg.format);
      }

      assistantMsg.streaming = false;
      assistantMsg.totalMs = performance.now() - pg.startTime;
      const detailTrace = await pgFetchRouteTrace(requestId);
      if (detailTrace) pgApplyTraceToMessage(assistantMsg, { ...detailTrace, clientFormat: detailTrace.clientFormat || pg.format, sentText: userText });
      pgRenderMessages({ scroll: "follow" });

      const trace = {
        requestId,
        clientFormat: assistantMsg.clientFormat || pg.format,
        provider: assistantMsg.provider,
        keyIndex: assistantMsg.keyIndex,
        keyMasked: assistantMsg.keyMasked,
        upstreamFormat: assistantMsg.upstreamFormat || pg.format,
        providerModel: assistantMsg.providerModel,
        firstByteMs: assistantMsg.firstByteMs ?? pg.firstByteMs,
        totalMs: assistantMsg.totalMs,
        usage: assistantMsg.usage,
        sentText: userText,
      };
      pgRenderTrace(null);
      pgStatus(t("pg.done"));
    } catch (err) {
      if (err.name === "AbortError") {
        assistantMsg.content += "\n[stopped by user]";
        pgStatus(t("pg.stopped"));
      } else {
        assistantMsg.error = err.message;
        pgStatus(t("pg.error", { error: err.message }));
      }
      assistantMsg.streaming = false;
      pgRenderMessages({ scroll: "follow" });
    } finally {
      pg.loading = false;
      pg.abortCtrl = null;
      if (sendBtn) sendBtn.hidden = false;
      if (stopBtn) stopBtn.hidden = true;
    }
  }

  function pgExtractRouteHeaders(resp) {
    const provider = resp.headers.get("x-route-provider");
    if (!provider) return null;
    return {
      provider,
      keyIndex: null,
      keyMasked: resp.headers.get("x-route-key") || null,
      upstreamFormat: resp.headers.get("x-route-format") || null,
      providerModel: resp.headers.get("x-route-model") || null,
      attemptNo: resp.headers.get("x-route-attempt") || null,
    };
  }

  function pgExtractNonStreamContent(data, format) {
    if (format === "anthropic_messages") {
      const blocks = data.content || [];
      return blocks.filter((b) => b.type === "text").map((b) => b.text || "").join("");
    }
    if (format === "responses") {
      return data.output_text || (data.output || []).filter((b) => b.type === "message").map((b) => (b.content || []).map((c) => c.text || "").join("")).join("");
    }
    return data.choices?.[0]?.message?.content || "";
  }

  function pgExtractNonStreamReasoning(data, format) {
    if (format === "anthropic_messages") {
      const blocks = data.content || [];
      return blocks.filter((b) => b.type === "thinking").map((b) => b.thinking || "").join("");
    }
    if (format === "responses") {
      const parts = [];
      for (const item of data.output || []) {
        if (item.type !== "reasoning") continue;
        for (const summary of item.summary || []) {
          const text = pgTextFromAny(summary);
          if (text) parts.push(text);
        }
        if (item.text) parts.push(pgTextFromAny(item.text));
        if (item.content) parts.push(pgTextFromAny(item.content));
      }
      return parts.join("");
    }
    const message = data.choices?.[0]?.message || {};
    return pgTextFromAny(message.reasoning_content ?? message.reasoning ?? message.thinking);
  }

  async function pgHandleStream(resp, assistantMsg) {
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotFirstByte = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload);
          if (!gotFirstByte) {
            gotFirstByte = true;
            pg.firstByteMs = Math.round(performance.now() - pg.startTime);
          }
          const delta = pgExtractDelta(chunk, pg.format);
          if (delta.content) assistantMsg.content = pgAppendStreamText(assistantMsg.content, delta.content);
          if (delta.reasoning) assistantMsg.reasoning = pgAppendStreamText(assistantMsg.reasoning, delta.reasoning);
          if (delta.content || delta.reasoning) pgUpdateStreamingMessage(assistantMsg);
          // Capture usage from final chunk
          const usage = pgExtractUsage(chunk, pg.format);
          if (usage) assistantMsg.usage = usage;
          // Capture provider from response headers/metadata
          if (chunk.provider && !assistantMsg.provider) assistantMsg.provider = chunk.provider;
        } catch (_e) {
          // Skip non-JSON lines
        }
      }
    }
  }

  function pgStop() {
    if (pg.abortCtrl) {
      pg.abortCtrl.abort();
    }
  }

  function pgClear() {
    pg.messages = [];
    pgRenderTrace(null);
    pgStatus(t("pg.ready"));
    pgRenderMessages({ scroll: "bottom" });
  }

  function pgBindEvents() {
    const sendBtn = el("pgSendButton");
    const stopBtn = el("pgStopButton");
    const clearBtn = el("pgClearButton");
    const chat = el("pgChat");

    if (sendBtn && !sendBtn.dataset.pgBound) {
      sendBtn.dataset.pgBound = "1";
      sendBtn.addEventListener("click", pgSend);
    }
    if (stopBtn && !stopBtn.dataset.pgBound) {
      stopBtn.dataset.pgBound = "1";
      stopBtn.addEventListener("click", pgStop);
    }
    if (clearBtn && !clearBtn.dataset.pgBound) {
      clearBtn.dataset.pgBound = "1";
      clearBtn.addEventListener("click", pgClear);
    }

    // Enter to send, Shift+Enter for newline
    const input = el("pgChatInput");
    if (input && !input.dataset.pgBound) {
      input.dataset.pgBound = "1";
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          pgSend();
        }
      });
    }

    // Format segmented control
    qsa("[data-pg-format]").forEach((btn) => {
      if (btn.dataset.pgBound) return;
      btn.dataset.pgBound = "1";
      btn.addEventListener("click", () => {
        qsa("[data-pg-format]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        pg.format = btn.dataset.pgFormat;
      });
    });

    // Model search combobox
    const modelSearch = el("pgModelSearch");
    if (modelSearch && !modelSearch.dataset.pgBound) {
      modelSearch.dataset.pgBound = "1";
      modelSearch.addEventListener("focus", pgShowModelDropdown);
      modelSearch.addEventListener("input", pgShowModelDropdown);
      modelSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const dropdown = el("pgModelDropdown");
          if (dropdown && !dropdown.hidden) {
            const first = dropdown.querySelector(".pg-model-option");
            if (first) pgSelectModel(first.dataset.model);
          }
        } else if (e.key === "Escape") {
          pgHideModelDropdown();
        }
      });
    }

    const modelDropdown = el("pgModelDropdown");
    if (modelDropdown && !modelDropdown.dataset.pgBound) {
      modelDropdown.dataset.pgBound = "1";
      modelDropdown.addEventListener("click", (e) => {
        const opt = e.target.closest(".pg-model-option");
        if (opt) pgSelectModel(opt.dataset.model);
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      const combo = el("pgModelCombo");
      if (combo && !combo.contains(e.target)) pgHideModelDropdown();
    });
  }

  function renderPlayground() {
    pgRenderMessages({ scroll: "preserve" });
    pgBindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);

