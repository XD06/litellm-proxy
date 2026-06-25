# Playground 设计文档

> 在控制台内嵌一个模型操练场，用于实时测试、调试模型路由与响应质量。

## 1. 背景与目标

用户需要一个 Playground 页面，在 Proxy Console 内直接向代理发送请求，观察：

- 模型是否可达、响应内容是否正确
- 路由命中了哪个 provider / key
- failover 链路是否按预期工作
- 延迟、token 用量、估算成本

**无需新增后端 API**——Playground 直接调用代理已有的三个端点：

| 格式 | 端点 | 路由分类 |
|---|---|---|
| OpenAI Chat | `POST /v1/chat/completions` | `classify_post` → `chat_completions` |
| Anthropic | `POST /v1/messages` | `classify_post` → `anthropic` |
| OpenAI Responses | `POST /v1/responses` | `classify_post` → `responses` |

模型列表来自 `GET /v1/models`，已有路由。

## 2. 设计体系

严格沿用现有 Proxy Console 设计语言（与 `minimalist-ui` skill 理念一致）：

| 维度 | 规范 | 来源 |
|---|---|---|
| 字体 | `Geist Sans` / `SF Pro Display` 正文，`Geist Mono` 代码 | `styles.css :43-44` |
| 色板 | 暖色单色调，`#f4f4f5` 背景、`#09090b` 文字、语义色仅用于状态 | `:root :1-45` |
| 卡片 | `1px solid var(--line)` 边框、`9px` 圆角、极淡阴影 | `.panel :983-992` |
| 按钮 | `7px` 圆角、`36px` 高度、`680` 字重、四种变体 | `.button :384-480` |
| 代码块 | 深色反转 `#18181b` 背景 + `#f4f4f5` 文字 | `.code-block :3804-3812` |
| 布局 | 240px 侧栏 + 弹性主区，CSS Grid 驱动 | `.shell :86-90` |
| 导航 | 左竖排 `.nav-item`，active 态左侧色条 | `.nav-item :255-294` |
| 表单 | `.field` label 灰色 `11px/720` + `.control` 输入框 | `.field :4342-4354` |

**禁止**：渐变、3D 玻璃态、重阴影、pill 形大容器、emoji（用 SVG 原语替代）。

## 3. 页面结构

```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar │  Topbar: "Playground" / "Test models with live    │
│         │            routing feedback"                      │
│ ─────── │                                                     │
│ Overv.  │  ┌─────────────────────┬────────────────────────┐ │
│ Request │  │   配置面板 (左)      │  对话区 (右)            │ │
│ Provider│  │                     │                        │ │
│ Policy  │  │  Model: [select ▾]  │  ┌──────────────────┐  │ │
│ Config  │  │  Temp:  [___0.7_]   │  │ system           │  │ │
│─────────│  │  Max:   [___4096_]  │  │ user             │  │ │
│▶Playgrnd│  │  Stream: [✓]        │  │ assistant (stream)│  │ │
│─────────│  │  Format: [chat ▾]   │  └──────────────────┘  │ │
│ Refresh │  │                     │  [输入框         ] [↵]  │ │
│ Pause   │  │  ── 路由追踪 ──     │                        │ │
│         │  │  Provider: alpha    │                        │ │
│ ●Online │  │  Key idx: 0         │                        │ │
└─────────┴──┴─────────────────────┴────────────────────────┘
```

### 布局

```css
.playground-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);  /* 配置栏 + 对话栏 */
  gap: 20px;
  padding: 20px;
}
```

窄屏（<760px）切换为单列，配置栏折叠为 `<details>` 手风琴。

## 4. 组件清单与复用

| 组件 | 复用现有 class | 新增 class | 说明 |
|---|---|---|---|
| 参数面板 | `.panel` `.field` `.control` `.check-field` | `.playground-config` | Temperature / MaxTokens / TopP / Stream 开关 |
| 模型选择 | `.control` (select) | — | 从 `/v1/models` 动态拉取 |
| 格式切换 | `.segmented-control` `.segmented-button` | — | Chat / Responses / Anthropic 三段式 |
| 对话区 | `.panel` `.code-block` | `.playground-chat` | 消息列表用深色 code-block 风格 |
| 消息气泡 | `.badge` `.tag` | `.pg-message` `.pg-role` | 角色标签用现有 badge 色 |
| 输入框 | `.control` | `.pg-input` | 多行 textarea + Enter 发送 |
| 发送按钮 | `.button.primary` | — | 复用主按钮 |
| 路由追踪 | `.panel` `.tag` | `.pg-trace` | 显示 provider / key / latency |
| Token 计数 | `.badge` | `.pg-usage` | 显示 input / output tokens |
| 停止按钮 | `.button.danger` | — | 流式响应中可中断 |

## 5. 消息渲染设计

对话区使用深色 `.code-block` 风格（与现有 Raw Snapshot / Overlay Preview 一致），消息按角色着色：

```
┌──────────────────────────────────────────┐
│  [system]                         badge  │
│  You are a helpful assistant.            │
├──────────────────────────────────────────┤
│  [user]                           badge  │
│  Hello, what model are you?              │
├──────────────────────────────────────────┤
│  [assistant]  provider:alpha      badge  │
│  I'm running on DeepSeek...              │
│  ████  (流式光标)                         │
├──────────────────────────────────────────┤
│  120ms first byte · 1.2s total           │
│  45 in · 128 out · $0.0003               │
└──────────────────────────────────────────┘
```

角色标签配色：

| 角色 | badge 色 | CSS 变量 |
|---|---|---|
| system | `--compat-soft` / `--compat` | 淡紫 |
| user | `--info-soft` / `--info` | 淡绿 |
| assistant | `--success-soft` / `--success` | 深绿 |
| error | `--danger-soft` / `--danger` | 淡红 |

## 6. 路由追踪面板

Playground 的核心价值——**让调试者看到代理内部的路由决策**：

```
── Routing Trace ──────────────────────
  Provider     alpha
  Key index    0
  Upstream     chat_completions
  Attempts     1 (no failover)
  First byte   120ms
  Total        1.24s
  Tokens       45 in / 128 out
  Est. cost    $0.0003
───────────────────────────────────────
```

发生 failover 时显示完整 attempt 链：

```
  Attempts     2
  ├─ #1 alpha/key:0  → 429 rate_limited (cooldown 30s)
  └─ #2 beta/key:0   → 200 success
```

## 7. 核心交互流程

```
用户输入消息
    │
    ├─→ 选择 model + 参数 (temperature, max_tokens, stream, format)
    │
    ├─→ POST /v1/chat/completions  (或 /v1/messages, /v1/responses)
    │     headers: X-Admin-Key (复用 state.adminKey)
    │     body: { model, messages, temperature, max_tokens, stream: true }
    │
    ├─→ 流式响应: SSE 逐字渲染到对话区
    │     解析 data: 行，增量追加到 assistant 气泡
    │
    ├─→ 完成后: 显示路由追踪面板
    │     · 命中 provider / key_index
    │     · 首字节延迟 / 总延迟
    │     · input_tokens / output_tokens / 估算成本
    │     · attempt 链（如果发生了 failover）
    │
    └─→ 错误时: 红色 .danger 气泡 + error message + retry 按钮
```

## 8. 实现步骤

### Step 1: HTML 结构
- 在 `index.html` 侧栏 `<nav id="sectionNav">` 末尾添加 `<button class="nav-item" data-view="playground">Playground</button>`
- 在 `<main class="workspace">` 末尾添加 `<section id="playgroundView" class="view">`

### Step 2: constants.js 注册 view
- 在 `views` 对象中添加 `playground` 条目

### Step 3: app.js 交互逻辑
- 新增 `renderPlayground()` 函数，在 `renderAll()` 中注册
- 新增 `playgroundState` 管理消息列表、模型列表、参数
- 新增 `pgSend()` 处理发送（含 SSE 流式解析）
- 新增 `pgStop()` 中断流式请求
- 新增 `pgClear()` 清空对话

### Step 4: styles.css 样式
- `.playground-layout` 双栏网格
- `.pg-message` 消息气泡
- `.pg-role-*` 角色标签配色
- `.pg-trace` 路由追踪面板
- `.pg-input` 输入区
- `.pg-stream-cursor` 流式光标动画
- 响应式断点

### Step 5: 构建验证
- `node --check dashboard/app.js` 语法检查
- 全量回归测试 `python -m pytest tests/`

## 9. 高级功能（第二阶段）

| 功能 | 说明 |
|---|---|
| 请求重放 | 从 Requests 页面点击某条请求 → 直接载入 Playground 回放 |
| 参数预设 | 保存常用参数组合为 preset |
| 对比模式 | 同一 prompt 并排发送到两个 model |
| Raw JSON | 切换查看原始请求/响应 JSON |
| cURL 导出 | 一键导出当前请求为 cURL 命令 |

## 10. 实现进度

| 步骤 | 状态 | 备注 |
|---|---|---|
| Step 1: HTML 结构 | 已完成 | `index.html` 添加 nav-item + playgroundView section |
| Step 2: constants.js | 已完成 | `views` 对象注册 playground 配置 |
| Step 3: app.js 逻辑 | 已完成 | 模型加载、消息发送、SSE 流式解析、路由追踪、清空、停止 |
| Step 4: styles.css | 已完成 | 双栏布局、消息气泡、角色配色、流式光标、路由追踪、响应式 |
| Step 5: 构建验证 | 已完成 | Vite 构建成功，`node --check` 通过，无 linter 错误 |
| Step 6: 回归测试 | 已完成 | 351 passed in 46.16s |
| Step 7: 路由 Trace 头注入 | 已完成 | 后端注入 `X-Route-*` 响应头，前端提取并展示 |
| Step 8: 模型搜索 | 已完成 | 可搜索 combobox 替换原 `<select>`，每次进入拉取最新模型列表 |

## 11. 路由 Trace 头注入（Step 7）

### 问题

Playground 的路由追踪面板需要知道代理实际选择了哪个供应商、密钥、上游格式。但后端原有的响应中不包含任何路由信息，前端无法获取。

### 后端改动 (`sse2json.py`)

新增 `_send_route_trace_headers(attempt, key_masked)` 方法，在所有 6 条成功响应路径（3 条流式 SSE + 3 条非流式 JSON）注入以下响应头：

| 响应头 | 内容 |
|---|---|
| `X-Route-Provider` | 选中的供应商名称 |
| `X-Route-Key` | 脱敏后的密钥标识 |
| `X-Route-Format` | 实际使用的上游格式（chat_completions / responses / anthropic_messages） |
| `X-Route-Model` | 供应商端的实际模型名 |
| `X-Route-Attempt` | 第几次尝试才成功（从 1 开始） |

同时为 `_resp_json` 方法新增 `extra_headers` 参数（默认 `None`，不传则行为不变，向后兼容）。

### 前端改动 (`dashboard_src/src/app.js`)

- 新增 `pgExtractRouteHeaders(resp)` 从 `fetch` 响应头提取路由信息
- `pgSend()` 在收到响应后立即提取并填充到 `assistantMsg`
- `pgRenderTrace()` 在 trace strip 中展示：provider、key、format、upstream model、首字节延迟、总耗时、token 用量

## 12. 模型搜索与最新数据（Step 8）

### 模型搜索 Combobox

将原来的 `<select id="pgModel">` 替换为可搜索的自定义 combobox：

```html
<div class="pg-model-combo" id="pgModelCombo">
  <input id="pgModelSearch" type="text" placeholder="Search model..." />
  <div class="pg-model-dropdown" id="pgModelDropdown" hidden></div>
</div>
<input id="pgModel" type="hidden" />
```

交互行为：
- 聚焦或输入时展开下拉列表，实时过滤匹配的模型
- 键盘 Enter 选择第一个匹配项，Escape 关闭下拉
- 点击外部自动关闭
- 选中项高亮显示

### 每次拉取最新模型

`pgLoadModels()` 移除了原有的缓存判断（`if (pg.models.length) return`），改为每次切换到 Playground 都重新从 `GET /v1/models` 拉取模型列表，确保显示的是最新数据。
