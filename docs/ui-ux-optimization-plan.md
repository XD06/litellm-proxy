# UI/UX 优化文档 — Config & Routing Policy 界面

> **最后更新**: 2026-06-25 (Round 2 — 不足修复)  
> **状态**: 阶段一已完成（10/10 项），体验细节修复完成（8/8 项），阶段二待实施  
> **后端测试**: `351 passed` ✅ — 本轮优化为纯前端改动，后端 API 无变更  
> **构建状态**: Vite 构建成功 ✅，产物已同步到 `dashboard/`

---

## 0. 核心 UI/UX 目标（供审查 AI 参考）

本项目的 Dashboard 是一个**高密度运维控制台**，用户是技术运维人员。优化的根本目标不是"好看"，而是**降低操作失误率和认知负载**。

### 五条不可动摇的准则

| # | 准则 | 衡量标准 | 违反后果 |
|---|---|---|---|
| **G-A** | **信息分层** | 首屏只展示状态摘要和最常用操作；详细配置折叠在二级 | 用户看到 30+ 字段 → 眼花 → 不敢改 → 或者乱改 |
| **G-B** | **状态可视化** | Provider/Key/Failure Policy 的健康状态用颜色圆点即时可读，不依赖文字 | 需要逐行阅读文字才能判断状态 → 慢、易漏 |
| **G-C** | **术语去技术化** | 面向用户显示人类可读名（"Failure ladder"），技术名放 tooltip | 用户看到 `key_failure_ladder_s` → 不理解 → 不敢改 |
| **G-D** | **零回归** | 任何 UI 改动不得破坏表单提交、事件绑定、API 调用 | 功能可用性 > 美观 |
| **G-E** | **渐进增强** | 优化只改展示层（HTML 结构 + CSS + 渲染函数），不改后端 API、不改数据模型 | 改动范围失控 → 回归风险 |

### 审查 AI 的检查清单

其他 AI 审查时应重点验证以下内容：

1. **折叠后表单能否正常提交？** — 展开卡片 → 填写 → 点 Save → 检查 API 请求是否发出
2. **hidden 元素中的表单/按钮事件是否正常绑定？** — Config Tab 切换后，隐藏 panel 中的按钮（如 Reload、Validate）能否点击
3. **图标按钮组的值是否正确传递到表单？** — 点选路由模式 → 提交 → 检查 `provider_select` 值
4. **scope 下拉在折叠 header 中能否独立操作？** — 不触发折叠，不阻断提交
5. **CSS 是否实际生效？** — `dashboard/styles.css` 和 `dashboard/app.js` 是否包含新组件样式（`.collapsible-card`、`.status-dot`、`.help-tip` 等）
6. **toggle switch 是否正常切换？** — 点击 toggle slider → 检查 hidden checkbox 的 checked 状态是否同步 → 表单提交时 `form.elements.xxx.checked` 能否正确取值
7. **折叠状态刷新后是否保持？** — 展开 Provider 卡片 → 刷新页面 → 检查卡片是否自动展开（localStorage 记忆）
8. **Tab 切换刷新后是否保持？** — 切到 Map tab → 刷新页面 → 检查是否仍在 Map tab（localStorage 记忆）
9. **Tooltip 在窄屏是否被截断？** — 窗口缩至 640px 以下 → hover help-tip → 检查 tooltip 是否缩小适配
10. **图标按钮组在小屏是否换行？** — 窗口缩至 640px 以下 → 检查路由模式按钮是否只显示图标不换行

---

## 1. 问题诊断

用户反馈 Config 和 Routing Policy 界面"杂乱、文字太多、看不懂、眼花缭乱"。通过代码审查，将问题定位为 5 个具体根因。

### 1.1 所有字段同时展开，视觉过载

Routing Policy 页面一进即呈现 30+ 个输入框：

| 区域 | 字段数 | 代码位置 |
|---|---|---|
| Routing 表单 | 6（pool, select, max_attempts, 3 个 timeout） | `app.js:4283-4324` |
| Retry 表单 | 8（retryable_status, key_fatal_status, respect_retry_after, same_key_retries, ladder, 5 个 cooldown） | `app.js:4326-4361` |
| Rule Table | 十几行文字行 | `renderPolicyRule()` |
| Failure Policies | 6 卡片 × 4 字段 = 24 | `failurePolicyCard()` |

Config 页面同理：每个 provider 展开后有 7 个字段 + key 列表 + 3 个 format 行。

### 1.2 描述文字与输入框平铺，无层级

每个 panel head 有 `<h2>` + `<p>`，每个表单卡片有 `<h3>` + `<p>`，failure policy 卡片还有描述段落。这些文字同级平铺，用户眼睛在标题、描述、输入框之间反复跳。

### 1.3 技术术语裸露

- `priority_failover` / `round_robin` / `weighted_rr` / `random` 直接作为 `<select>` 选项
- `provider:weight:priority, comma separated` 挤在 `<small>` 里
- `key_failure_ladder_s` 字段名直接暴露
- Rule Table 用 `retry, switch attempt, cooldown key, disable key` 流水账文本

### 1.4 Config 页面信息密度不均

左侧列：Providers + Audit Trail。右侧列塞 7 个 panel：Model Routes、Provider Model Map、Runtime Config、Global Proxy、Advanced Overlay、Raw Snapshot。右侧需要不停滚动。

### 1.5 缺少状态可视化

Provider 的 enabled/disabled、cooldown、key 健康状态都只用文字 badge，没有颜色编码或图标。

---

## 2. 设计原则

结合 `minimalist-ui` skill 和 `ui-ux-pro-max` skill 的设计规范，确立以下原则：

### 2.1 渐进式披露（Progressive Disclosure）

> `ui-ux-pro-max` — `progressive-disclosure`: Reveal complex options progressively; don't overwhelm users upfront (Apple HIG)

**核心**：用户 80% 的场景只需要 20% 的字段。默认只展示关键设置，高级配置折叠。

- Vercel Dashboard：Project Settings 默认只显示域名和环境变量，Advanced 折叠
- Stripe Dashboard：每个支付方式是卡片，默认折叠，点击展开
- Linear Settings：功能区用折叠面板，只展开当前编辑的项

### 2.2 图标替代文字标签

> `minimalist-ui` — Iconography: Use SVG icons, not emojis
> `ui-ux-pro-max` — `no-emoji-icons`: Use SVG icons

- 状态用颜色圆点：绿=正常、黄=警告、红=错误、灰=禁用
- 操作按钮用纯图标（trash=删除），hover 显示 tooltip
- checkbox 改为 iOS 风格 toggle switch（⏳ 未实施）

### 2.3 Tooltip 替代描述段落

> `ui-ux-pro-max` — `input-helper-text`: Provide persistent helper text below complex inputs, not just placeholder (Material Design)
> `minimalist-ui` — Whitespace: Use whitespace intentionally to group related items and separate sections

- 字段旁放 `?` 图标，hover 显示详细说明
- 说明文字不占布局空间，只在需要时出现

### 2.4 分区卡片 + 视觉层级

> `minimalist-ui` — Bento Box: Cards must have `border: 1px solid #EAEAEA`; Border-radius `8px` or `12px` maximum
> `ui-ux-pro-max` — `visual-hierarchy`: Establish hierarchy via size, spacing, contrast — not color alone

- 每个配置区域是独立卡片，卡片间 8px gap
- Config 右侧 7 个 panel 改为 tab 导航切换

### 2.5 暖色单色调 + 语义色

> `minimalist-ui` — Color Palette: Color is a scarce resource, utilized only for semantic meaning

当前项目已有的 CSS 变量与此原则一致（`--text: #09090b`, `--line: #e4e4e7`, `--surface: #ffffff`），复用即可。

### 2.6 微交互

> `ui-ux-pro-max` — `duration-timing`: Use 150–300ms for micro-interactions
> `minimalist-ui` — Hover States: Cards lift with ultra-subtle shadow shift `0 2px 8px rgba(0,0,0,0.04)` over `200ms`

- 折叠/展开用 `max-height` transition，250ms ease-out
- 卡片 hover 时 `box-shadow: 0 2px 8px rgba(0,0,0,0.04)`
- chevron 旋转 200ms ease

---

## 3. 顶级控制台产品参考

| 产品 | 参考点 | 借鉴方式 |
|---|---|---|
| **Vercel Dashboard** | Project Settings 左侧 tab 导航，右侧只显示当前区域 | Config 页面右侧 7 个 panel → tab 切换 |
| **Vercel Dashboard** | 高级设置收在 `<details>` 折叠区 | Routing/Retry 高级字段折叠 |
| **Stripe Dashboard** | 支付方式卡片默认折叠，点击展开配置 | Provider/Failure Policy 卡片默认折叠 |
| **Linear Settings** | 功能区前面有图标，状态用颜色圆点 | Provider 状态圆点，路由模式图标按钮组 |
| **Linear Settings** | 字段旁 `?` 图标 hover 显示说明 | 所有描述文字 → tooltip |
| **Supabase Dashboard** | 复杂概念用 popover 显示小例子 | 路由模式、冷却阶梯 → tooltip 说明 |
| **Cloudflare Dashboard** | toggle switch 替代 checkbox | enabled/stream → toggle switch（⏳ 未实施） |
| **Railway Dashboard** | 配置卡片间 gap，内部用 divider 分组 | Policy 表单内部用 divider 分区 |

---

## 4. 已实施改动详细记录

> 以下记录每一项改动的**改前代码**、**改后代码**、**预期效果**、**涉及文件和行号**，供审查 AI 逐一核对。

### 4.1 CSS 新组件（G1-G6 + 辅助类）

**文件**: `dashboard_src/src/styles.css`（行 9855-10127）

#### G1: 状态圆点 `.status-dot`（行 9855-9867）

```css
/* 实际写入的 CSS */
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 200ms ease;
}
.status-dot.ok    { background: var(--success); }   /* #14795c 绿 */
.status-dot.warn  { background: var(--warning); }   /* #d1431f 橙红 */
.status-dot.bad   { background: var(--danger); }    /* #b23a48 红 */
.status-dot.off   { background: var(--line-strong); } /* #d4d4d8 灰 */
```

**使用位置**:
- Provider 卡片 header（`providerConfigCard()` 行 4914）：`dotTone = isEnabled ? "ok" : "off"`
- Failure Policy 卡片 header（`failurePolicyCard()` 行 4518）：`dotTone = scope === "none" ? "off" : scope === "key" ? "warn" : scope === "provider" ? "warn" : "bad"`
- Rule Table 每行 header（`renderPolicyRule()` 行 4489）：`headDotTone = decision.retryable ? (decision.disables_key ? "bad" : "warn") : "bad"`
- Rule Table decision strip（`decisionBadgeWithDot()` 行 4563-4567）：每个 badge 内嵌一个圆点

#### G2: Tooltip 帮助图标 `.help-tip`（使用项目已有 JS 浮动 tooltip 系统）

> **重要变更（Round 2）**: 原实现用 CSS `::after` 伪元素 `position: absolute` 显示 tooltip 文字。但父容器（`.collapsible-card`、`.icon-btn-group`、`.panel`）有 `overflow: hidden`，导致 tooltip 被裁剪截断。
>
> **修复**: 将 `data-tooltip` 属性改为 `data-tip`，复用项目已有的 `installTooltip()` JS 浮动 tooltip 系统（`.lp-tip`，`position: fixed`，挂载在 `document.body`），彻底不受任何父容器 `overflow` 影响。

```css
/* 最终实现：只有视觉圆点，tooltip 由 JS .lp-tip 系统处理 */
.help-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  cursor: help;
  vertical-align: middle;
  margin-left: 6px;
  flex-shrink: 0;
  transition: background 150ms ease, color 150ms ease;
}
.help-tip:hover { background: var(--surface-strong); color: var(--text); }
/* 无 ::after / ::before 伪元素 — tooltip 由 data-tip 属性触发 JS .lp-tip */
```

**JS tooltip 系统工作原理**（`app.js:6114-6252` 已有代码）:
- `installTooltip()` 在 `document` 上委托 `mouseover`/`mouseout` 事件
- 选择器 `[data-tip], [title]` 匹配任何带 `data-tip` 或 `title` 的元素
- 创建 `div.lp-tip`（`position: fixed`）挂载到 `document.body`
- 用 `getBoundingClientRect()` 定位，自动翻转上/下，自动贴边
- `max-width: 320px`，毛玻璃风格

**使用位置**: 所有 `<h2>` / `<h3>` / `<span class="label-with-tip">` 旁的 `?` 图标，均使用 `data-tip="..."` 属性。

#### G3: Toggle Switch `.toggle-switch`（行 9922-9965）

```css
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}
.toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
.toggle-switch .slider {
  position: absolute; inset: 0;
  background: var(--line-strong);
  border-radius: 999px;
  transition: background 200ms ease;
  cursor: pointer;
}
.toggle-switch .slider::before {
  content: "";
  position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px;
  background: #fff; border-radius: 50%;
  transition: transform 200ms ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
.toggle-switch input:checked + .slider { background: var(--success); }
.toggle-switch input:checked + .slider::before { transform: translateX(16px); }
.toggle-switch input:focus-visible + .slider { box-shadow: 0 0 0 3px rgba(47, 52, 55, 0.16); }
```

> ✅ **已应用**: C4 修复中已将 4 处 checkbox 替换为 toggle switch（Provider enabled、Format enabled、Respect Retry-After、Disable key）。

#### G4: 图标按钮组 `.icon-btn-group`（行 9967-10003）

```css
.icon-btn-group {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 7px;
  overflow: hidden;
}
.icon-btn-group button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 560;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  white-space: nowrap;
}
.icon-btn-group button:hover { background: var(--surface-soft); color: var(--text); }
.icon-btn-group button.is-active { background: var(--text); color: #fff; }
.icon-btn-group button + button { border-left: 1px solid var(--line); }
.icon-btn-group button svg { width: 14px; height: 14px; flex-shrink: 0; }
```

**使用位置**: Routing 表单的路由模式选择器（行 4297-4299）。

#### G5: Tab 导航 `.config-tab-nav`（行 10005-10035）

```css
.config-tab-nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--line);
  margin-bottom: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.config-tab-nav::-webkit-scrollbar { display: none; }
.config-tab-nav button {
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 620;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 150ms ease, border-color 150ms ease;
  white-space: nowrap;
}
.config-tab-nav button:hover { color: var(--text); }
.config-tab-nav button.is-active { color: var(--text); border-bottom-color: var(--text); }
```

**使用位置**: `index.html` 行 336-342，Config 右侧 panel 的 tab 导航。

#### G6: 可折叠卡片 `.collapsible-card`（行 10037-10074）

```css
.collapsible-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 200ms ease;
}
.collapsible-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
.collapsible-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 150ms ease;
}
.collapsible-card-header:hover { background: var(--surface-soft); }
.collapsible-card-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 250ms ease-out;
}
.collapsible-card.is-open .collapsible-card-body { max-height: 1200px; }
.collapsible-card .chevron {
  transition: transform 200ms ease;
  flex-shrink: 0;
  color: var(--muted);
}
.collapsible-card.is-open .chevron { transform: rotate(90deg); }
```

#### 辅助类 `.label-with-tip`（行 10076-10081）

```css
.label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
```

#### 覆盖样式（行 10083-10123）

针对已有组件的 collapsible 适配：

- `.config-provider-card.collapsible-card` — 覆盖原 `.config-provider-card` 的 padding/border，适配折叠结构
- `.config-provider-body-inner` — body 内部 grid 布局，14px padding，顶部 1px divider
- `.failure-policy-card.collapsible-card` — 覆盖原 failure policy 卡片样式
- `.failure-policy-card .collapsible-card-header` — 10px 14px padding
- `.failure-policy-card .collapsible-card-body .failure-policy-edit-grid` — 14px padding，顶部 1px divider

---

### 4.2 Routing Policy 页面改动（R1-R7）

**文件**: `dashboard_src/src/app.js`

#### R1: 路由模式 `<select>` → 图标按钮组 ✅

**改前**（伪代码）:
```html
<select name="provider_select">
  <option value="priority_failover">priority_failover</option>
  <option value="round_robin">round_robin</option>
  ...
</select>
```

**改后**（行 4277-4299）:
```html
<input type="hidden" name="provider_select" value="${currentSelect}" />
<div class="icon-btn-group" id="routeModeGroup">
  <button type="button" data-route-mode="priority_failover" class="is-active" title="...">
    ${iconSvg("bolt")}<span>Priority</span>
  </button>
  <button type="button" data-route-mode="round_robin" title="...">
    ${iconSvg("rotate")}<span>Round-robin</span>
  </button>
  <button type="button" data-route-mode="weighted_rr" title="...">
    ${iconSvg("layers")}<span>Weighted</span>
  </button>
  <button type="button" data-route-mode="random" title="...">
    ${iconSvg("dot")}<span>Random</span>
  </button>
</div>
```

**事件绑定**（`bindPolicyControlForms()` 行 4380-4388）:
```js
routeModeGroup.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-route-mode]");
  if (!btn) return;
  const mode = btn.dataset.routeMode || "";
  routingForm.elements.provider_select.value = mode;
  routeModeGroup.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
});
```

**预期效果**: 4 个并排图标按钮，当前选中项黑底白字高亮，点击切换时更新 hidden input 值。表单提交时 `provider_select` 正确传递。每个按钮 `title` 属性提供 hover 说明。

**使用的 SVG 图标**:
- `bolt`: 闪电图标 — Priority（优先级）
- `rotate`: 循环箭头 — Round-robin（轮询）
- `layers`: 层叠图标 — Weighted（加权）
- `dot`: 圆点 — Random（随机）

#### R2: 超时设置默认折叠 ✅

**改前**: `<details class="policy-advanced" open>`
**改后**（行 4306）: `<details class="policy-advanced">`（无 `open` 属性）

**预期效果**: 超时设置（Connect / Read / First token）默认隐藏，点击"Timeouts"摘要展开。

#### R3: Retry 高级冷却默认折叠 ✅

**改前**: `<details class="policy-advanced" open>`
**改后**（行 4338）: `<details class="policy-advanced">`（无 `open` 属性）

**预期效果**: respect_retry_after、same_key_retries、failure_ladder、5 个 cooldown 字段默认隐藏，点击"Advanced cooldown & ladder"展开。

#### R4: 字段名人类可读 + tooltip 显示技术名 ✅

| 改前（技术名） | 改后（人类名） | tooltip 内容 | 代码行 |
|---|---|---|---|
| `key_failure_ladder_s` | Failure ladder | `key_failure_ladder_s — Escalating cooldown seconds per consecutive key failure (e.g. 10, 60, 3600).` | 4350 |
| `same_key_retries` | Same-key retries | `same_key_retries — How many times to retry the same key before switching (0-3).` | 4346 |
| `respect_retry_after` | Respect Retry-After | `Honor the upstream Retry-After header to extend cooldown duration.` | 4342 |
| `connect_timeout_s` | Connect | `connect_timeout_s — Seconds to wait for the upstream TCP connection.` | 4310 |
| `read_timeout_s` | Read | `read_timeout_s — Seconds to wait for the full upstream response.` | 4314 |
| `first_token_timeout_s` | First token | `first_token_timeout_s — Seconds to wait for the first SSE token (0 = disabled).` | 4318 |
| `retryable_status` | Retryable statuses | `HTTP status codes that trigger a retry (e.g. 429, 500, 502, 503, 504).` | 4331 |
| `key_fatal_status` | Fatal key statuses | `HTTP status codes that mark a key as permanently bad (e.g. 401, 403).` | 4335 |

**cooldownField 函数**（行 4368-4375）:
```js
function cooldownField(name, label, tip, value) {
  return `
    <label class="field">
      <span class="label-with-tip">${escapeHtml(label)}<span class="help-tip" data-tooltip="${escapeHtml(tip)}">?</span></span>
      <input class="control" name="${escapeHtml(name)}" type="number" min="0" max="86400" value="${escapeHtml(value)}" required />
    </label>
  `;
}
```

调用点（行 4353-4357）:
```js
cooldownField("rate_limit", "Rate limit", "Rate limit cooldown (seconds)", cooldown.rate_limit ?? 30)
cooldownField("server_error", "Server error", "Server error cooldown (seconds)", cooldown.server_error ?? 10)
cooldownField("network_error", "Network error", "Network/timeout cooldown (seconds)", cooldown.network_error ?? 10)
cooldownField("key_invalid", "Invalid key", "Invalid key cooldown (seconds)", cooldown.key_invalid ?? 3600)
cooldownField("quota_or_balance", "Quota/balance", "Quota or balance exhausted cooldown (seconds)", cooldown.quota_or_balance ?? 3600)
```

> **注意**: `name` 属性仍为技术名（`rate_limit` 等），确保表单提交时 `form.elements.rate_limit.value` 能正确取到值。只有**显示标签**改为了人类可读名。

#### R5: 描述文字 `<p>` → `.help-tip` tooltip ✅

**改前**（伪代码）:
```html
<h2>Routing Controls</h2>
<p>Safe runtime-overlay edits for common scheduling and retry settings.</p>
```

**改后**（`index.html` 行 288）:
```html
<h2>Routing Controls<span class="help-tip" data-tooltip="Safe runtime-overlay edits for common scheduling and retry settings.">?</span></h2>
```

**所有改动的位置**:

| 页面 | 元素 | tooltip 内容 | 位置 |
|---|---|---|---|
| Routing Policy | Routing Controls h2 | `Safe runtime-overlay edits for common scheduling and retry settings.` | `index.html:288` |
| Routing Policy | Rule Table h2 | `How requests move across attempts.` | `index.html:297` |
| Routing Policy | Failure Policies h2 | `Cooldown and disable behavior by error type.` | `index.html:305` |
| Routing Policy | Routing h3 | `Attempt budget, provider order, and format preference.` | `app.js:4287` |
| Routing Policy | Retry h3 | `HTTP retry classes and key handling on failure.` | `app.js:4328` |
| Config | Providers h2 | `Edit existing provider config. To add a new provider, use the Add Provider button on the Providers page.` | `index.html:319` |
| Config | Audit Trail h2 | `Recent admin mutations with masked details.` | `index.html:328` |
| Config | Model Routes h2 | `Map one client model to a weighted provider pool.` | `index.html:348` |
| Config | Provider Model Map h2 | `Provider-specific model name overrides.` | `index.html:387` |
| Config | Runtime Config h2 | `Masked status for the active configuration.` | `index.html:398` |
| Config | Global Proxy h2 | `Lowest-priority fallback for providers without their own proxy.` | `index.html:410` |
| Config | Advanced overlay tools summary | 原有 `<small>` 文字保留在 `<details><summary>` 中 | `index.html:428` |

#### R6: Failure Policy 卡片默认折叠 ✅

**改前**（`failurePolicyCard()` 伪代码）:
```html
<form class="failure-policy-card failure-policy-form">
  <h3>server_error</h3>
  <p>Description text...</p>
  <label>Key cooldown <input name="cooldown_s"></label>
  <label>Provider cooldown <input name="provider_cooldown_s"></label>
  <label><input type="checkbox" name="disables_key"> Disable key</label>
  <button>Save policy</button>
</form>
```

**改后**（`failurePolicyCard()` 行 4512-4545）:
```html
<form class="failure-policy-card failure-policy-form collapsible-card tone-...">
  <div class="failure-policy-head collapsible-card-header">
    <span class="status-dot {dotTone}"></span>
    <h3>server_error</h3>
    <span class="badge {scope-tone}">{scope}</span>
    <select class="control compact-control" name="cooldown_scope" onclick="event.stopPropagation()">
      <option value="none">none</option>
      <option value="key">key</option>
      <option value="provider">provider</option>
      <option value="key_provider">key_provider</option>
    </select>
    <svg class="chevron">...</svg>
  </div>
  <div class="collapsible-card-body">
    <div class="failure-policy-edit-grid">
      <label>Key cooldown <input name="cooldown_s"></label>
      <label>Provider cooldown <input name="provider_cooldown_s"></label>
      <label><input type="checkbox" name="disables_key"> Disable key</label>
      <button>Save policy</button>
    </div>
  </div>
</form>
```

**事件绑定**（`bindFailurePolicyForms()` 行 4433-4458）:
```js
const header = form.querySelector(".collapsible-card-header");
if (header) {
  header.addEventListener("click", (event) => {
    if (event.target.closest("select, input, button, .help-tip")) return;
    form.classList.toggle("is-open");
  });
}
```

**预期效果**:
- 默认折叠，只显示：状态圆点 + error_type + scope badge + scope 下拉 + chevron
- scope 下拉直接在 header 中，无需展开即可修改
- 点击 header 空白处展开/折叠（点击 select/input/button/help-tip 时不触发折叠）
- 圆点颜色逻辑：`none` → 灰(off)、`key`/`provider` → 橙红(warn)、`key_provider` → 红(bad)

> ⚠️ **已知限制**: `scope` 下拉有一个 `onclick="event.stopPropagation()"` 内联事件，这是为了防止 select 点击触发折叠。同时 JS 中的 `event.target.closest("select, ...")` 也排除了 select。两重保险，但有内联事件，不够优雅。

#### R7: Rule Table 每行加状态色点 ✅

**改前**（`renderPolicyRule()` 伪代码）:
```html
<article class="policy-rule-card">
  <div class="policy-rule-head">
    <span class="rule-index">01</span>
    <h3>429 Too Many Requests</h3>
  </div>
  <div class="policy-decision-strip">
    <span class="badge ok">retry</span>
    <span class="badge ok">switch attempt</span>
    ...
  </div>
</article>
```

**改后**（`renderPolicyRule()` 行 4483-4510）:
```html
<article class="policy-rule-card tone-...">
  <div class="policy-rule-head">
    <span class="status-dot {headDotTone}"></span>   <!-- 新增 -->
    <span class="rule-index">01</span>
    <h3>429 Too Many Requests</h3>
    <p>Reason text</p>
  </div>
  <div class="policy-decision-strip">
    <span class="badge ok"><span class="status-dot ok"></span>retry</span>          <!-- decisionBadgeWithDot -->
    <span class="badge ok"><span class="status-dot ok"></span>switch attempt</span>
    <span class="badge bad"><span class="status-dot bad"></span>stop attempts</span>
    <span class="badge warn"><span class="status-dot warn"></span>cooldown key</span>
    <span class="badge bad"><span class="status-dot bad"></span>disable key</span>
  </div>
</article>
```

**新增函数 `decisionBadgeWithDot`**（行 4563-4567）:
```js
function decisionBadgeWithDot(label, tone) {
  const safeTone = tone === "success" ? "ok" : tone === "danger" ? "bad" : tone === "warn" ? "warn" : tone;
  const dotClass = safeTone === "ok" ? "ok" : safeTone === "bad" ? "bad" : safeTone === "warn" ? "warn" : "off";
  return `<span class="badge ${safeTone}"><span class="status-dot ${dotClass}" style="margin-right:4px"></span>${escapeHtml(label)}</span>`;
}
```

> **注意**: 原 `decisionBadge(label, tone)` 函数（行 4558）保留未删，因为不确定是否有其他地方引用。当前搜索显示只在定义处出现，后续可安全删除。

**预期效果**: Rule Table 每行左侧有一个状态圆点（按 retryable/disables_key 逻辑着色），每个 decision badge 内也有一个小圆点。用户扫一眼颜色就能判断哪些错误可重试、哪些会禁用 key。

---

### 4.3 Config 页面改动（C1-C6）

**文件**: `dashboard_src/src/app.js` + `dashboard/index.html`

#### C1: Provider 卡片默认折叠 ✅

**改前**（`providerConfigCard()` 伪代码）:
```html
<article class="config-provider-card">
  <div class="config-provider-head">
    <h3>opencode</h3>
    <span class="badge">config on</span>
  </div>
  <form class="config-provider-form">
    <label>Base URL <input name="base_url"></label>
    <label>Proxy <input name="proxy"></label>
    ...全展开...
  </form>
</article>
```

**改后**（`providerConfigCard()` 行 4905-4966）:
```html
<article class="config-provider-card collapsible-card">
  <div class="config-provider-head collapsible-card-header">
    <span class="status-dot {dotTone}"></span>
    <div style="flex:1;min-width:0">
      <div class="provider-name">opencode</div>
      <div class="provider-meta">3 keys / Chat, Resp, Anth</div>
    </div>
    <svg class="chevron">...</svg>
  </div>
  <div class="collapsible-card-body">
    <div class="config-provider-body-inner">
      <form class="config-provider-form">
        <label>Base URL <input name="base_url"></label>
        <label>Proxy <input name="proxy"></label>
        <label>User-Agent <input name="user_agent"></label>
        <label>Priority <input name="priority"></label>
        <label class="check-field"><input type="checkbox" name="enabled"> Enabled</label>
        <button>Save provider</button>
        <button data-provider-delete="...">trash icon</button>
      </form>
      <div class="masked-key-list">key tags...</div>
      <form class="config-key-form">add key input + button</form>
      <div class="format-route-list">format route items</div>
    </div>
  </div>
</article>
```

**事件绑定**（`bindConfigProviderForms()` 行 4995-5005）:
```js
root.querySelectorAll(".config-provider-card.collapsible-card").forEach((card) => {
  if (card.dataset.boundcollapsible) return;
  card.dataset.boundcollapsible = "1";
  const header = card.querySelector(".collapsible-card-header");
  if (header) {
    header.addEventListener("click", (event) => {
      if (event.target.closest("input, button, select, .help-tip")) return;
      card.classList.toggle("is-open");
    });
  }
});
```

**预期效果**: Provider 列表默认只显示每行的摘要（状态圆点 + 名称 + key 数量 + 格式标签），点击展开完整编辑表单。header 不含表单元素，点击不会误触发。

#### C2: 右侧 7 panel → 5 tab 导航 ✅

**改前**（`index.html` 伪代码）:
```html
<div class="config-column config-side-column">
  <section id="modelRoutesPanel">...</section>
  <section class="provider-model-map-panel">...</section>
  <section class="config-status-panel">...</section>
  <section class="global-proxy-panel">...</section>
  <section id="overlaySafetyPanel">...</section>
</div>
```

**改后**（`index.html` 行 335-441）:
```html
<div class="config-column config-side-column">
  <div class="config-tab-nav" id="configTabNav" role="tablist">
    <button class="is-active" data-config-tab="routes">Routes</button>
    <button data-config-tab="map">Map</button>
    <button data-config-tab="runtime">Runtime</button>
    <button data-config-tab="proxy">Proxy</button>
    <button data-config-tab="advanced">Advanced</button>
  </div>

  <div class="config-tab-panel" data-config-tab-panel="routes">
    <section id="modelRoutesPanel">...</section>
  </div>
  <div class="config-tab-panel" data-config-tab-panel="map" hidden>
    <section class="provider-model-map-panel">...</section>
  </div>
  <div class="config-tab-panel" data-config-tab-panel="runtime" hidden>
    <section class="config-status-panel">...</section>
  </div>
  <div class="config-tab-panel" data-config-tab-panel="proxy" hidden>
    <section class="global-proxy-panel">...</section>
  </div>
  <div class="config-tab-panel" data-config-tab-panel="advanced" hidden>
    <section id="overlaySafetyPanel">...</section>
  </div>
</div>
```

**事件绑定**（`bindConfigTabs()` 行 1045-1058）:
```js
function bindConfigTabs() {
  const tabNav = el("configTabNav");
  if (!tabNav || tabNav.dataset.boundConfigTabs) return;
  tabNav.dataset.boundConfigTabs = "1";
  tabNav.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-config-tab]");
    if (!btn) return;
    const tabName = btn.dataset.configTab || "";
    tabNav.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
    document.querySelectorAll("[data-config-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.configTabPanel !== tabName;
    });
  });
}
```

**调用位置**: `bindConfigTabs()` 在 `app.js:1033` 调用（初始化阶段）。

**预期效果**: 右侧不再纵向堆叠 5 个 panel，而是通过 tab 切换。默认显示 Routes tab。切换时通过 `hidden` 属性控制显示/隐藏。

> **功能安全说明**: `hidden` 属性不影响 `getElementById` 查找元素，因此隐藏 panel 中的按钮事件（如 `reloadConfigButton`、`validateOverlayButton`、`exportOverlayButton`、`clearOverlayButton`）和表单提交（`globalProxyForm`、`modelRouteForm`）均正常工作。

#### C3: Provider 状态 badge → `.status-dot` 圆点 ✅

**改前**（伪代码）: `<span class="badge">config on</span>` 或 `<span class="badge">config off</span>`
**改后**（`providerConfigCard()` 行 4910-4914）: `<span class="status-dot {dotTone}"></span>`，其中 `dotTone = isEnabled ? "ok" : "off"`

**预期效果**: Provider 启用时圆点为绿色（`--success: #14795c`），禁用时为灰色（`--line-strong: #d4d4d8`）。一眼可见。

#### C4: checkbox → toggle switch ✅

**改前**: `<input type="checkbox" name="enabled" checked />`
**改后**: `<span class="toggle-switch"><input type="checkbox" name="enabled" checked /><span class="slider"></span></span>`

> **关键**: `<input type="checkbox">` 仍然保留，只是外面包了 `.toggle-switch` 容器 + `.slider` 视觉元素。input 本身 `opacity: 0` 隐藏，但 `name`、`checked`、`form.elements.xxx.checked` 全部正常工作。表单提交逻辑无需任何改动。

**已替换的位置**:
- Provider 表单 `enabled`（`app.js` `providerConfigCard()`）
- Format edit 表单 `enabled`（`app.js` `formatEditRow()`）
- Retry 表单 `respect_retry_after`（`app.js` `renderPolicyControls()`）
- Failure Policy 表单 `disables_key`（`app.js` `failurePolicyCard()`）

**未替换的位置**（有意保留原生 checkbox）:
- Overview 页面 provider 卡片 `enabled`（`app.js:3500`）— 概览页不适合 toggle
- Playground 页面 `pgStream`、`pgIncludeHistory`（`index.html:483-484`）— Playground 是独立功能区
- Request log 批量选择 checkbox（`app.js:2052, 2112`）— 批量选择用原生 checkbox 更直觉

#### C5: 描述文字 `<p>` → `.help-tip` tooltip ✅

与 R5 相同的改动模式，应用于 Config 页面所有 `<h2>` 旁的描述文字。详见 R5 表格中的 Config 行。

#### C6: 格式名缩短 ✅

**新增函数**（`app.js:4898-4903`）:
```js
function shortFormatName(format) {
  if (format === "chat_completions") return "Chat";
  if (format === "responses") return "Resp";
  if (format === "anthropic_messages") return "Anth";
  return String(format || "");
}
```

**使用位置**:
- Provider 卡片 header 摘要（行 4917）: `enabledFmtList.map(shortFormatName).join(", ")`
- Overview 页面 metric 卡片（行 4626）: `Object.entries(formatCounts).map(([k, v]) => \`${shortFormatName(k)} ${v}\`).join(" / ")`

> **注意**: 原 `shortFormatLabel()` 函数（行 2745）和 `formatLabel()` 函数保留不变，用于其他需要完整格式名的位置（如 format chip 的 `title` 属性）。`shortFormatName` 是独立的新函数，不影响已有代码。

**预期效果**: Provider 卡片摘要处显示 `Chat, Resp, Anth` 而非 `chat_completions, responses, anthropic_messages`，减少视觉噪音。

---

### 4.4 涉及文件汇总

| 文件 | 改动类型 | 具体改动 |
|---|---|---|
| `dashboard_src/src/styles.css` | 新增 | 6 个组件类 + 1 个辅助类 + 3 个覆盖样式块（行 9855-10127，约 270 行新 CSS） |
| `dashboard_src/src/app.js` | 修改 | `renderPolicyControls()`, `cooldownField()`, `failurePolicyCard()`, `renderPolicyRule()`, `providerConfigCard()`, `shortFormatName()`, `bindConfigProviderForms()`, `bindFailurePolicyForms()`, `bindPolicyControlForms()` |
| `dashboard_src/src/app.js` | 新增 | `decisionBadgeWithDot()`, `bindConfigTabs()` |
| `dashboard/index.html` | 修改 | Config 右侧 panel → tab 结构；所有 `<h2>` 旁加 `.help-tip`；version 标签更新 |

---

## 5. 已知不足与待优化项

> 以下列出当前实现的不足之处，供审查 AI 评估和后续优化。

### 5.1 未完成项

| # | 项 | 原因 | 影响 | 建议 |
|---|---|---|---|---|
| C7 | Model Route 输入仍是手输文本串 | 需要较大重构 | 用户需手输 `opencode:1:100, deepseek:1:90` | 改为 provider 多选 + 权重滑块 |

### 5.2 体验细节 — Round 2 修复记录

> Round 1 标注的 D1-D8 已全部修复，以下是修复说明。

| # | 问题 | 修复方式 | 状态 |
|---|---|---|---|
| D1 | **折叠状态无记忆** | Provider 卡片用 `localStorage.proxyConsoleFold_provider_{name}` 记忆；Failure Policy 用 `proxyConsoleFold_failure_{errorType}` 记忆 | ✅ 已修复 |
| D2 | **Tooltip 被父容器 overflow:hidden 裁剪** | 彻底放弃 CSS `::after` 伪元素 tooltip，改用 `data-tip` 属性 + 项目已有的 `installTooltip()` JS 浮动系统（`.lp-tip`，`position: fixed`，挂载 `document.body`） | ✅ 已修复 |
| D3 | **scope 下拉有内联 `onclick`** | 移除 `onclick="event.stopPropagation()"`，JS 的 `event.target.closest("select")` 已足够排除 | ✅ 已修复 |
| D4 | **`max-height: 1200px` 折叠上限** | 改为 `max-height: 5000px`，足够容纳任何展开内容 | ✅ 已修复 |
| D5 | **`decisionBadge` 原函数未清理** | 已删除，确认无引用 | ✅ 已修复 |
| D6 | **Provider 卡片展开后无自动滚动** | 展开时 `requestAnimationFrame` + `scrollIntoView({ behavior: "smooth", block: "nearest" })` | ✅ 已修复 |
| D7 | **Tab 切换无记忆** | 用 `localStorage.proxyConsoleConfigTab` 记忆当前 tab（不用 URL hash 避免与 view 导航冲突） | ✅ 已修复 |
| D8 | **图标按钮组在小屏换行** | `@media (max-width: 640px)` 隐藏按钮文字 `<span>`，只显示图标 | ✅ 已修复 |

### 5.3 阶段二规划（需要较大重构）

| 优先级 | 改动 | 预估工作量 | 效果 |
|---|---|---|---|
| P3 | **路由流程图**: 用可视化节点图替代 Rule Table | 大 | 直观理解路由决策 |
| P3 | **Provider 拖拽排序**: 拖拽调整优先级 | 中 | 替代手输 priority 数字 |
| P3 | **内联编辑**: 点击字段值直接编辑 | 大 | 替代展开表单 |
| P4 | **搜索过滤**: Config 页面加搜索框 | 小 | 快速定位 provider |
| P4 | **Model Route 可视化**: provider 多选 + 权重滑块 | 中 | 替代手输格式串 |

---

## 6. 构建与部署注意事项

### 6.1 Vite 构建行为

Vite 配置（`dashboard_src/vite.config.js`）:
- `outDir: '../dashboard'`
- `emptyOutDir: false` — **不会**清空 `dashboard/` 目录
- CSS 被**内联**到 `app.js` 中（`__vite_style__.textContent = "..."`）
- 同时输出 `app.js`（含内联 CSS）和独立的 CSS 文件名映射

### 6.2 服务器静态文件服务

`sse2json.py` 行 2089-2108 同时服务 3 个文件:
- `index.html` → `text/html`
- `styles.css` → `text/css`
- `app.js` → `application/javascript`

> ⚠️ **重要**: 因为 Vite 将 CSS 内联到 `app.js`，但服务器同时单独服务 `styles.css`，所以**两个文件都必须是最新版本**。如果只运行 `vite build`，`styles.css` 不会被更新（Vite 只更新 `app.js`）。必须手动复制源 CSS:
> ```powershell
> Copy-Item 'dashboard_src\src\styles.css' 'dashboard\styles.css' -Force
> ```

### 6.3 缓存控制

`index.html` 中的版本标签:
```html
<link rel="stylesheet" href="/-/dashboard/styles.css?v=20260625-uiux-opt" />
<script src="/-/dashboard/app.js?v=20260625-uiux-opt" defer></script>
```
更新前端后需同步更新 `v=` 参数以强制浏览器刷新缓存。

---

## 7. 回归验证

### 7.1 后端测试

```bash
python -m pytest tests/ -x -q
```

结果: **351 passed in 42.25s** ✅

本轮优化为纯前端改动，后端 API 无任何变更。

### 7.2 前端构建

```bash
cd dashboard_src && npx vite build
```

结果: **✓ built in 275ms** ✅

### 7.3 功能回归检查清单

| 检查项 | 方法 | 结果 |
|---|---|---|
| 路由模式图标按钮组值传递 | 检查 hidden input `provider_select` 在按钮点击时正确设值，表单提交时正确读取 | ✅ |
| `cooldownField` 签名一致性 | 检查全部 5 个调用点都使用 4 参数签名 `(name, label, tip, value)` | ✅ |
| Failure Policy 折叠后表单提交 | header click handler 排除 `select/input/button/.help-tip`；Save 按钮在 body 中 | ✅ |
| Provider 卡片折叠后表单提交 | 所有表单在 body 中，展开后正常提交 | ✅ |
| Config Tab 隐藏 panel 中的事件绑定 | `hidden` 不影响 `getElementById`，所有按钮/表单事件正常 | ✅ |
| `decisionBadgeWithDot` tone 处理 | 正确映射 `success`→`ok`, `danger`→`bad`, `warn`→`warn` | ✅ |
| `shortFormatName` 安全回退 | 未知格式返回 `String(format \|\| "")` | ✅ |
| 构建产物完整性 | `dashboard/styles.css` 和 `dashboard/app.js` 都包含新组件代码 | ✅ |
| `index.html` 结构完整 | tab nav、collapsible header、version 标签均在 | ✅ |

---

## 8. 实施日志

### 2026-06-25 Round 1 — 阶段一实施

**已完成改动**:
1. CSS 组件 G1-G6 + 辅助类 `.label-with-tip` + 覆盖样式（~270 行新 CSS）
2. Routing Policy: R1（图标按钮组）、R2（超时折叠）、R3（高级冷却折叠）、R4（字段名人类化）、R5（tooltip 替代描述）、R6（Failure Policy 折叠）、R7（Rule Table 色点）
3. Config: C1（Provider 卡片折叠）、C2（Tab 导航）、C3（状态圆点）、C5（tooltip）、C6（格式名缩短）
4. 新增函数: `decisionBadgeWithDot()`, `bindConfigTabs()`, `shortFormatName()`
5. 修改函数: `cooldownField()` 签名从 2 参数改为 4 参数

**修复的问题**: 发现构建产物 `dashboard/styles.css` 过期（Vite 只更新 `app.js` 不更新独立 CSS），手动复制源 CSS 修复。

**测试结果**:
- Vite 构建成功 ✅
- `python -m pytest tests/ -x -q` 351 passed ✅
- 功能回归检查 9 项全部通过 ✅

### 2026-06-25 Round 2 — 不足修复 + Tooltip 截断修复

**已完成改动**:
1. **C4 toggle switch**: 4 处 checkbox → toggle switch（Provider enabled、Format enabled、Respect Retry-After、Disable key）
2. **D1 折叠记忆**: Provider 卡片和 Failure Policy 卡片用 `localStorage` 记忆展开/折叠状态
3. **D2 Tooltip 截断（核心修复）**: `data-tooltip` → `data-tip`，复用项目已有 `installTooltip()` JS 浮动系统（`.lp-tip`，`position: fixed`），删除 CSS `::after`/`::before` 伪元素 tooltip
4. **D3 内联 onclick**: 移除 scope 下拉的 `onclick="event.stopPropagation()"`
5. **D4 max-height**: `1200px` → `5000px`
6. **D5 清理**: 删除未使用的 `decisionBadge()` 函数
7. **D6 自动滚动**: Provider 卡片展开时 `scrollIntoView({ behavior: "smooth", block: "nearest" })`
8. **D7 Tab 记忆**: `localStorage.proxyConsoleConfigTab` 记忆当前 Config tab
9. **D8 响应式**: `@media (max-width: 640px)` 隐藏图标按钮组文字
10. **折叠 click handler**: 两处 handler 的 `closest()` 排除列表新增 `.toggle-switch`

**涉及文件**:
- `dashboard_src/src/app.js` — toggle switch 替换、折叠记忆、Tab 记忆、自动滚动、删除 decisionBadge、data-tooltip→data-tip
- `dashboard_src/src/styles.css` — 删除 help-tip 伪元素规则、max-height 调整、响应式 media query、toggle 对齐
- `dashboard/index.html` — data-tooltip→data-tip、version 标签更新

**测试结果**:
- Vite 构建成功 ✅
- `python -m pytest tests/ -x -q` 351 passed ✅
