# 项目优化战略规划

> **核心产品哲学：复杂、智能、高效的内核，撑起直观、体验好的外壳。**
>
> 用户不买"功能列表"，用户买"我打开就能用，用起来不费脑"。
> 三格式互转、智能路由、per-key cooldown 这些都是强大的内核——
> 但用户不应该需要知道这些词。他们只需要：启动代理 → 填个 Key → 发请求，通了 → 打开 Dashboard，看到一切正常。

---

## 目录

- [第一部分：用户体验四层模型](#第一部分用户体验四层模型)
  - [第一层：开箱即用（零配置启动）](#第一层开箱即用零配置启动)
  - [第二层：所见即所得（Dashboard 即配置）](#第二层所见即所得dashboard-即配置)
  - [第三层：智能到无感（复杂逻辑自动运转）](#第三层智能到无感复杂逻辑自动运转)
  - [第四层：错误也能优雅（失败不是灾难）](#第四层错误也能优雅失败不是灾难)
- [第二部分：技术内核加固](#第二部分技术内核加固)
- [第三部分：可发现性与传播](#第三部分可发现性与传播)
- [第四部分：降低采用门槛](#第四部分降低采用门槛)
- [第五部分：产品化延伸](#第五部分产品化延伸)
- [优先级总表](#优先级总表)

---

## 第一部分：用户体验四层模型

### 第一层：开箱即用（零配置启动）

#### 现状问题

当前启动流程要求用户：

1. 复制 `config.example.jsonc` 为 `config.json`
2. 理解 `server`、`routing`、`retry`、`providers`、`formats`、`models.routes`、`models.provider_model_map` 等概念
3. 手动填写 provider 的 `base_url`、`keys`、`formats` 路径
4. 手动配置模型路由和映射
5. 执行 `python sse2json.py`

`config.example.jsonc` 有 350+ 行带注释的配置，虽然注释详尽，但对首次使用者构成了认知负担。这在个人开发者群体中尤其致命——他们想的是"5 分钟跑起来"，而不是"读 10 分钟配置文档"。

#### 目标状态

**环境变量零配置模式：**

```bash
# 用户只需要这一行
OPENAI_API_KEY=sk-xxx ANTHROPIC_API_KEY=sk-ant-xxx python sse2json.py
```

系统在 `config_loader.py` 的 `load_config()` 阶段检测到没有 `config.json` 时，自动从常见环境变量推断默认配置：

| 环境变量 | 自动推断的 Provider | 上游格式 | Base URL |
|---|---|---|---|
| `OPENAI_API_KEY` | `openai` | `chat_completions` + `responses` | `https://api.openai.com` |
| `ANTHROPIC_API_KEY` | `anthropic` | `anthropic_messages` | `https://api.anthropic.com` |
| `DEEPSEEK_API_KEY` | `deepseek` | `chat_completions` + `anthropic_messages` | `https://api.deepseek.com` |
| `OPENROUTER_API_KEY` | `openrouter` | `chat_completions` | `https://openrouter.ai/api` |
| `GROQ_API_KEY` | `groq` | `chat_completions` | `https://api.groq.com/openai` |

自动生成的配置包含：
- `server.admin_key`：随机生成（打印到终端）
- `routing.provider_select`：`priority_failover`（最安全默认值）
- `routing.default_provider_pool`：所有检测到的 provider
- `models.models_source`：`union`（自动拉取并合并所有 provider 的模型列表）
- 每个 provider 的 `formats` 根据上游实际支持自动启用

**交互式引导模式：**

如果没有环境变量，也没有 `config.json`，启动时进入引导模式：

```
[proxy] 未检测到配置文件。进入引导模式。

[1/3] 添加 Provider
  名称 (默认: openai): _
  API Key: sk-xxx
  Base URL (留空使用默认): _

[2/3] 添加另一个 Provider？(y/n): n

[3/3] 配置已生成并保存到 config.json
  Admin Key: sk-admin-a1b2c3d4
  Dashboard: http://127.0.0.1:4894

按 Enter 启动代理...
```

**实现路径：**

- 在 `config_loader.py` 中新增 `generate_config_from_env()` 函数
- 在 `sse2json.py` 的 `__main__` 入口增加 `config.json` 存在性检查
- 引导模式使用标准 `input()` 交互，不引入额外依赖
- 生成的 `config.json` 包带注释版本，方便后续手动编辑

#### 配置分层策略

明确"零配置 → 环境变量 → config.json → runtime_config.json"的优先级：

```
零配置（环境变量推断）
  ↓ 被覆盖
config.json（手动编辑，持久化）
  ↓ 被覆盖
runtime_config.json（Dashboard 在线编辑，运行时覆盖）
  ↓ 被覆盖
环境变量 override（PROXY_PROVIDER_KEYS__xxx 等，临时调试）
```

每一层都是"可选的增强"，而非"必需的步骤"。用户可以从零配置直接开始，需要精细控制时再加 config.json。

---

### 第二层：所见即所得（Dashboard 即配置）

#### 现状问题

Dashboard 已经具备了强大的功能——Provider 管理、路由策略编辑、模型映射、请求历史、Playground。但首次打开时存在几个体验断点：

1. **空状态缺乏引导**：新用户打开 Dashboard 第一眼看到的是空的指标卡片和 "No providers configured"，没有明确的"下一步"指引
2. **配置概念暴露过多**：Provider 编辑表单要求用户理解 `formats.chat_completions.path`、`native_stream_mode`、`native_nonstream_mode` 等专业术语
3. **操作路径过长**：添加一个新 Provider 需要填写 8+ 个字段，其中多数有合理默认值

#### 目标状态

**首次打开的引导式体验：**

```
┌──────────────────────────────────────────────────┐
│  欢迎使用 LLM Proxy                       2 Providers │
│                                                    │
│  ✅ 代理运行中          地址: 127.0.0.1:4894        │
│                                                    │
│  ┌──────────────┐  ┌──────────────┐               │
│  │  deepseek     │  │  opencode     │               │
│  │  ● 运行中     │  │  ● 运行中     │               │
│  │  3 个模型     │  │  5 个模型     │               │
│  │  P50: 320ms   │  │  P50: 580ms   │               │
│  │  0 cooldown   │  │  0 cooldown   │               │
│  └──────────────┘  └──────────────┘               │
│                                                    │
│  ┌─ 快速开始 ──────────────────────────────────┐    │
│  │  [ 发送测试请求 ]  [ 查看模型列表 ]          │    │
│  │  [ 添加 Provider ]  [ 编辑路由策略 ]         │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Provider 添加向导（三步走）：**

```
步骤 1/3: 基本信息
  ┌──────────────────────────────────┐
  │ Provider 类型:  [DeepSeek ▼]      │  ← 预设模板，自动填 base_url + formats
  │ 显示名称:     [ deepseek       ]  │
  │ API Key:      [ sk-*********** ]  │
  └──────────────────────────────────┘
  预设: OpenAI / Anthropic / DeepSeek / OpenRouter / Groq / 自定义

步骤 2/3: 高级设置（可跳过）
  > Base URL, 代理, 超时, 格式路径...  [折叠]

步骤 3/3: 确认
  ✅ Provider "deepseek" 已添加
  ✅ 已自动发现 3 个模型: deepseek-v4-flash, deepseek-v4-pro, ...
  ✅ 已加入默认路由池
```

**关键设计原则：渐进式披露**

| 层级 | 用户看到的 | 用户需要理解的 |
|---|---|---|
| 首次打开 | 运行状态 + Provider 卡片 + 快速操作 | "代理在跑，Provider 正常" |
| 点击 Provider | 详情页：模型列表、Key 状态、延迟图表 | "这个 Provider 有什么模型，健康吗" |
| 点击"高级设置" | Base URL、格式路径、代理配置、超时 | "我想精细调优" |
| 点击"原始配置" | JSON 编辑器 | "我知道我在做什么" |

每一层都是"可选的深入"，不是"必需的经过"。95% 的用户停在前两层。

#### Dashboard 交互打磨方向

**Provider 卡片优化（在已有基础上继续）：**

当前 Provider 卡片已实现优先级标签（`priority-chip`）、动态延迟配色（`prio-hi/mid/lo`）、冷却状态计数。继续打磨方向：

- 卡片点击直接展开详情 Drawer（当前已实现），但首屏信息层级要更清晰
- 延迟迷你图表保持当前的 Catmull-Rom 平滑曲线 + 动态单色系
- 状态行精简为一句话："3 keys · 1 cooldown · P50 320ms"，不用多个 badge 堆叠

**请求列表优化：**

- 默认只显示最近 20 条，按状态色标（绿=成功、橙=failover 后成功、红=失败）
- 每行信息精简：时间、模型、状态、延迟，点击展开详情
- 详情 Drawer 顶部清晰展示：客户端模型 vs 上游模型（已实现），加上 attempt timeline 的可视化

**移动端体验：**

当前已修复 Provider 卡片 footer 在窄屏下的重叠问题。继续确保：
- 所有页面在 390px 宽度下无水平溢出
- 移动端导航使用底部 Tab Bar 而非侧边栏
- 触控目标不小于 44×44px

---

### 第三层：智能到无感（复杂逻辑自动运转）

这是"复杂、智能、高效的内核"真正发力的地方。核心理念是：**用户不应该需要选择策略，系统应该自己做出最优决策。**

#### 路由策略：从"手动选择"到"智能默认"

##### 现状

当前 `routing.provider_select` 提供 4 种模式，用户需要在 Dashboard 上理解并选择：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| `priority_failover` | 按优先级排序，失败时故障转移 | 生产默认（当前默认值） |
| `round_robin` | 均匀轮询 | 负载均衡 |
| `weighted_rr` | 按权重分配 | 比例分流 |
| `random` | 随机选择 | 测试/压测 |

用户需要理解这 4 种模式的区别才能做出选择。但实际上，大多数用户根本不应该需要选。

##### 目标：新增 `auto` 智能模式

```jsonc
{
  "routing": {
    "provider_select": "auto"  // 新增：智能路由
  }
}
```

`auto` 模式的行为逻辑：

```
启动时：
- 只有 1 个 provider → 直通，不需要路由
- 有 2+ 个 provider → 默认 priority_failover

运行中（基于 observability 数据动态调整）：
- 某个 provider 连续 3 次失败 → 自动降权（priority -10）
- 某个 provider P50 延迟 > 3000ms → 自动降权
- 某个 provider 恢复正常（连续 5 次成功）→ 恢复原权重
- 高并发场景（>10 req/s）→ 自动启用 round_robin 分流
- 某个 provider 进入 cooldown → 自动跳过（现有行为）
```

Dashboard 上的呈现：

```
┌─ 路由策略 ───────────────────────────────┐
│  模式: [智能路由 ✓] [优先级] [轮询] [加权] [随机]  │
│                                                  │
│  ℹ 智能路由已启用。系统根据实时延迟和成功率        │
│    自动选择最优 Provider。                        │
│    [查看调整详情]  [切换为手动模式]               │
└──────────────────────────────────────────────────┘
```

用户看到的是一个"智能路由"开关，95% 的人不点。需要手动控制的人点一下就切换到传统模式。

##### 实现路径

- 在 `router.py` 的 `UpstreamRouter` 中新增 `auto` 模式分支
- `auto` 模式内部根据 `observability.py` 的 `snapshot()` 数据动态计算 provider 排序
- 初始实现可以简单：`auto = priority_failover + 动态权重调整`
- 后续迭代加入更多启发式规则

#### 模型映射：从"手动配置"到"自动发现"

##### 现状

当前用户需要在 `models.provider_model_map` 中手动配置每个 provider 的模型映射：

```jsonc
{
  "models": {
    "provider_model_map": {
      "deepseek": {
        "claude-3-5-sonnet": "deepseek-v4-flash"
      }
    }
  }
}
```

用户需要知道：客户端发什么模型名、上游实际叫什么模型名、两者如何对应。这完全是可以自动化的。

##### 目标

用户只需要说"我要用 deepseek-v4-flash"，系统自动搞定剩下的事：

```
用户在 Dashboard 输入框打：claude-3-5-sonnet

系统自动：
1. 查找哪些 provider 支持这个模型名（或其变体/别名）
2. 如果 deepseek 的 /v1/models 返回了 deepseek-v4-flash → 自动建立映射
3. 如果找不到精确匹配 → 模糊匹配（claude-3-5-sonnet → deepseek-v4-flash 等价类）
4. 如果仍找不到 → 提示"未找到，要手动映射吗？"
5. 映射建立后，用户发的 claude-3-5-sonnet 自动路由到 deepseek
```

##### 实现路径

- `model_registry.py` 已有 `rebuild_models_union_snapshot()` 和模型发现队列
- 新增 `_safe_model_id()` 的反向映射：从 canonical model 查找所有 provider 的 raw model
- Dashboard 模型映射页面增加"自动推断"按钮
- 系统启动时自动尝试推断映射，推断结果标记为 `auto`（区别于 `manual`）

#### 格式转换：从"用户感知"到"完全透明"

##### 现状

项目已实现三种格式的双向转换（9 种组合），包括流式 SSE。用户通过 URL 路径选择客户端格式：

| 端点 | 客户端格式 |
|---|---|
| `POST /v1/chat/completions` | OpenAI Chat Completions |
| `POST /openai/v1/responses` | OpenAI Responses |
| `POST /anthropic/v1/messages` | Anthropic Messages |

用户不需要知道上游 provider 用什么格式——系统自动判断并转换。这一层目前已经做到了"无感"，是最成熟的部分。

##### 继续打磨方向

- **多模态内容转换**：当前未覆盖图片/文件等多模态内容。这是用户最常遇到的缺口（详见[第二部分](#第二部分技术内核加固)）
- **转换质量监控**：在 `observability.py` 中记录"是否发生了格式转换"和"转换类型"，Dashboard 可展示"X% 的请求需要格式转换"
- **Playground 格式自动检测**：用户在 Playground 粘贴任意格式的请求体，系统自动识别格式并选择对应端点

---

### 第四层：错误也能优雅（失败不是灾难）

#### 现状问题

Provider 挂了，系统会 failover，但用户体验上有几个断点：

1. **请求详情中的失败信息不够直观**：当前显示 error reason 文本，但缺乏"系统帮你兜住了"的视觉反馈
2. **冷却状态不够显眼**：虽然已在 Provider 卡片上增加了 cooldown 计数，但用户需要主动查看才能发现
3. **流式中途断流体验差**：上游 SSE 连接中断时，客户端收到不完整响应，缺乏明确的错误收尾

#### 目标状态

**Failover 可视化：**

```
┌─ 请求 #1234 ──────────────────────────────┐
│  ✅ 成功 (通过 failover)                     │
│                                              │
│  ┌─ Attempt 1 ── deepseek ──────────────┐   │
│  │  ❌ 超时 (1.2s)  Key: sk-***a1        │   │
│  └────────────────────────────────────────┘   │
│  ┌─ Attempt 2 ── opencode ──────────────┐   │
│  │  ✅ 成功 (480ms)  Key: sk-***b2       │   │
│  │  上游格式: chat_completions → 客户端: anthropic_messages │
│  └────────────────────────────────────────┘   │
│                                              │
│  客户端模型: claude-3-5-sonnet               │
│  上游模型:   deepseek-v4-flash               │
│  Token: 1,234 in / 567 out                   │
└──────────────────────────────────────────────┘
```

用户看到的不是"失败了"，而是"系统帮你兜住了"。这种安全感才是体验。

**流式中途断流的优雅收尾：**

当前行为：上游 SSE 连接中途断开时抛出异常。如果已经向客户端发送了部分 SSE 事件，客户端收到不完整的响应。

目标行为：

```
上游在首字节（first byte）之前失败
  → 正常重试到下一个 provider（现有行为）

上游在首字节之后失败
  → 向客户端发送一个 error 事件 + [DONE]
  → stop_reason 标记为 "upstream_error"
  → 记录到 observability，标记为 "stream_interrupted"
  → Dashboard 请求详情中高亮显示"流式中断"
```

**Provider 健康度可视化：**

在 Overview 页面增加一个"健康度"概览：

```
┌─ 健康概览 ─────────────────────────────────┐
│                                              │
│  deepseek    ████████████░░░  85%  正常     │
│  opencode    ██████████████  100%  正常     │
│  rawchat     ████░░░░░░░░░░  30%  ⚠ 降级    │
│                                              │
│  过去 30 分钟 · 234 请求 · 2 次 failover     │
└──────────────────────────────────────────────┘
```

健康度计算（基于 `observability.py` 的数据）：
- 成功率 × 0.5
- 平均延迟得分（P50 < 1000ms = 满分，线性衰减到 5000ms = 0）× 0.3
- Key 可用率（usable/total）× 0.2

---

## 第二部分：技术内核加固

内核是外壳的支撑。以下优化不直接面向用户，但决定了外壳能做到多"无感"。

> **性能优化的验证方法：** 所有性能优化必须通过 `benchmark_perf.py` 量化验证。详见 [性能基准测试指南](benchmark-guide.md)。

### 2.1 多模态内容跨格式转换

#### 现状

`protocol_adapters.py` 处理文本、思考块和工具调用，但未覆盖图片/文件等多模态内容。`docs/release-checkpoint.md` 明确列出 "Complex multimodal content chunks" 为已知限制。

这是用户最常遇到的功能缺口。用户发一个带图片的请求，如果需要跨格式转换（如 Anthropic 客户端 → Chat Completions 上游），图片内容会丢失。

#### 需要实现的转换路径

| 源格式 | 内容结构 | 目标格式 | 内容结构 |
|---|---|---|---|
| Chat Completions | `{"type": "image_url", "image_url": {"url": "https://..."}}` | Anthropic Messages | `{"type": "image", "source": {"type": "url", "url": "https://..."}}` |
| Chat Completions | `{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}` | Anthropic Messages | `{"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}}` |
| Anthropic Messages | `{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "..."}}` | Chat Completions | `{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}` |
| Responses | `{"type": "input_image", "image_url": "https://..."}` | Chat Completions | `{"type": "image_url", "image_url": {"url": "https://..."}}` |

#### 实现位置

- `protocol_adapters.py` 的 `to_openai_request()` 和 `openai_chat_request_to_anthropic_request()` 函数
- 流式场景：`stream_adapters.py` 的 6 个转换函数（多模态内容主要在请求侧，响应侧通常是文本）

#### 测试策略

在 `tests/test_conversions.py` 和 `tests/test_format_adapters.py` 中新增多模态转换测试用例，覆盖：
- URL 来源的图片
- base64 编码的图片
- 混合内容（文本 + 图片 + 工具调用）
- 多张图片
- 不同 media_type（png, jpeg, gif, webp）

### 2.2 流式 tool call 参数拼接鲁棒性

#### 现状

`stream_adapters.py` 中处理流式 tool call 参数时，通过 `input_json_delta` / `function.arguments` 逐片拼接。实际场景中上游可能发送：

- 不完整的 JSON 片段（如 `{"q": "hel` 后断流再续）
- 多个 tool call 交替输出（index 0 和 index 1 的 delta 交错到达）
- 空参数 `{}`
- 非 JSON 格式的参数（某些 provider 不规范）

#### 优化方向

在 `stream_adapters.py` 的 6 个流式转换函数中增加容错：

```python
# 当前：直接拼接 partial_json，最终 json.loads
block["_arguments_buffer"] += chunk

# 优化：增量解析 + 容错
try:
    block["_parsed_input"] = json.loads(block["_arguments_buffer"])
except json.JSONDecodeError:
    # 保留 buffer，等下一个 delta 拼接后重试
    # 如果是最后一个 delta 仍解析失败，保留原始字符串作为 input
    if is_final:
        block["_parsed_input"] = {"_raw": block["_arguments_buffer"]}
```

### 2.3 热加载路由策略

#### 现状

修改路由配置（priority、provider_select、default_provider_pool）需要调用 `_apply_runtime_config()`，重建 `UpstreamRouter`、`OpenAIUpstreamClient`、`ProxyObservability` 等全部运行时对象。虽然 `migrate_state_from()` 保留了 cooldown 和计数器状态，但重建过程有性能开销，且 Dashboard 上的修改不是即时生效的。

#### 优化方向

**轻量级权重热调：**

在 `router.py` 的 `UpstreamRouter` 中增加方法：

```python
def update_provider_priority(self, provider: str, priority: int):
    """热更新单个 provider 优先级，不重建 Router。"""
    with self._lock:
        self._provider_priorities[provider] = priority

def update_provider_weight(self, provider: str, weight: int):
    """热更新路由权重。"""
    with self._lock:
        self._provider_weights[provider] = weight
```

Admin API 新增轻量端点 `PATCH /-/admin/providers/{provider}/priority`，不走全量 `_apply_runtime_config()` 重建，Dashboard 上的优先级修改即时生效。

### 2.4 费用看板与预算告警

#### 现状

项目已有 `usage_accounting.py` 做 token 归一化和费用估算，`observability.py` 记录 per-request 和 per-attempt 的 token/cost，Dashboard 显示总费用和 per-provider 费用条形图。但缺乏趋势分析和预算控制。

#### 优化方向

**Dashboard 新增"费用分析"视图：**

数据来源：`history_store.py` 的 SQLite 查询，已有 `cost_usd` 字段。

新增 API 端点：

```
GET /-/admin/cost/summary?range=30d&group_by=provider
GET /-/admin/cost/summary?range=30d&group_by=model
GET /-/admin/cost/timeseries?range=30d&bucket=1d
```

Dashboard 面板：
- 日/周/月费用趋势折线图
- 按 provider 分组的费用占比饼图
- 按 model 分组的费用排行榜
- 费用异常告警：某日费用超过近 7 日均值的 200% 时标红

**预算告警机制：**

```jsonc
{
  "budget": {
    "daily_limit_usd": 10.0,
    "monthly_limit_usd": 200.0,
    "alert_threshold_pct": 80,
    "action": "warn"  // "warn" 或 "block"
  }
}
```

在 `observability.py` 的 `record_request_end()` 中检查累计费用，超阈值时：
- `warn`：Admin API 响应头加 `X-Budget-Warning: daily 85%`，Dashboard 顶部显示告警条
- `block`：拒绝后续非 admin 请求，返回 429 + 错误信息

---

## 第三部分：可发现性与传播

### 3.1 技术博客

#### 核心叙事

项目最大的故事点是"三格式双向流式转换"——这在开源 LLM proxy 生态中几乎没有竞品。但文章不应该只讲技术，应该讲"为什么用户需要这个"。

#### 推荐标题

- 《为什么我的 LLM Proxy 不是简单的转发：三格式互转的路由设计》
- 《OpenAI、Anthropic、Responses 三格式互转：LLM Proxy 的流式转换实践》

#### 文章结构

1. **痛点引入** — "Claude SDK 发 Anthropic 格式，OpenAI SDK 发 Chat Completions，不同 provider 支持不同格式。用户需要一个统一入口"
2. **技术挑战** — 流式 SSE 事件边界处理、thinking blocks 跨格式映射、tool call 参数碎片拼接
3. **架构设计** — 为什么选择 Chat Completions 作为 hub 格式（避免 N² 转换矩阵），同格式直通优先策略
4. **路由策略** — 4 种选择模式、per-key cooldown、candidate 去重（讲完技术后回到用户体验："但用户不需要选，系统自动搞定"）
5. **可观测性** — SQLite 持久化、per-attempt 追踪、路由可解释性
6. **Dashboard 截图** — 放 4 张图，展示 provider 卡片、请求详情、延迟图表

#### 发布渠道

| 渠道 | 目标受众 | 预期效果 |
|---|---|---|
| 知乎（技术专栏） | 中文开发者 | 长尾搜索流量 |
| V2EX (节点: 分享创造) | 独立开发者 | 即时讨论和反馈 |
| GitHub Discussions | 开源社区 | 沉淀技术问答 |
| 掘金 / SegmentFault | 前端+后端开发者 | SEO 长尾 |
| HackerNews | 英文开发者 | 国际曝光（需英文版） |
| Reddit r/LocalLLaMA | 本地 LLM 爱好者 | 高质量用户 |

### 3.2 提交 Awesome 列表

| 仓库 | 分类 | 说明 |
|---|---|---|
| `awesome-llm` | Tools / Proxy | LLM 综合资源列表 |
| `awesome-openai` | Tools | OpenAI 生态工具 |
| `awesome-selfhosted` | Software / Communication | 自托管服务 |
| `awesome-api-gateway` | Proxy | API 网关相关 |

PR 格式：

```markdown
- [litellm-proxy](https://github.com/XD06/litellm-proxy) - LLM API proxy with 3-format conversion (OpenAI/Anthropic), smart routing, failover & web dashboard.
```

### 3.3 在线 Demo

用 Docker 部署一个只读 Demo，让用户在浏览器里直接体验 Dashboard，无需自行部署。

#### 实现方案

1. 在 VPS 上部署 litellm-proxy，配置 mock provider（返回固定响应，不消耗真实 API 额度）
2. Nginx 反向代理 + HTTPS
3. 设置只读 admin key，禁用所有写操作（POST/PATCH/DELETE admin API 返回 403）
4. 定期清理 SQLite 历史数据（cron job 每日清理 7 天前数据）
5. README 中添加 "Live Demo" 链接

```markdown
## Live Demo

Try the dashboard without installing: [https://litellm-proxy-demo.example.com](https://litellm-proxy-demo.example.com)

Admin Key: `demo-demo-demo`
```

---

## 第四部分：降低采用门槛

### 4.1 CI/CD Pipeline

创建 `.github/workflows/ci.yml`，包含：

- **多版本 Python 测试矩阵**（3.10 / 3.11 / 3.12 / 3.13）
- **Dashboard 语法检查 + Vite 构建**
- **Docker 镜像构建 + 冒烟测试**（启动容器 → curl /health → 停止）
- **编译检查**（`py_compile` 所有核心模块）

README 顶部加 CI badge：

```
![CI](https://github.com/XD06/litellm-proxy/actions/workflows/ci.yml/badge.svg)
```

### 4.2 Docker Hub 自动发布

创建 `.github/workflows/docker-publish.yml`，在 push main 和打 tag 时自动构建并推送 Docker 镜像。

用户使用：

```bash
docker pull xd06/litellm-proxy:latest
docker run -d -p 4894:4894 -v ./config.json:/app/config.json xd06/litellm-proxy
```

### 4.3 PyPI 包

创建 `pyproject.toml`，将项目打包为可安装的 Python 包：

```bash
pip install litellm-proxy
litellm-proxy --config config.json
```

在 `sse2json.py` 中添加 `main()` 入口函数，支持命令行参数（`--config`、`--init`、`--port`）。

### 4.4 贡献指南与 Issue 模板

创建 `CONTRIBUTING.md`，包含：
- 开发环境搭建（clone、venv、pip install、dashboard_src 构建）
- 测试规范（`python -m pytest tests/ -q`）
- 代码结构（指向 `PROJECT_OVERVIEW.md`）
- 提交规范（Conventional Commits：feat/fix/docs/refactor/test）
- PR 流程（fork → branch → commit → push → PR）
- Dashboard 开发（`dashboard_src/` 源码 → `npm run build` → `dashboard/` 产物）

创建 `.github/ISSUE_TEMPLATE/bug_report.md` 和 `feature_request.md`，标准化 Issue 报告格式。

---

## 第五部分：产品化延伸

以下方向适合在核心体验打磨完成后，作为功能扩展推进。

### 5.1 API Key 多用户管理

#### 现状

当前系统只有一个 `server.admin_key`，所有客户端用同一个 key 访问代理。多用户场景下无法区分请求来源、控制访问权限或设置配额。

#### 设计方案

在 `config.json` 中增加 `api_keys` 配置：

```jsonc
{
  "api_keys": [
    {
      "key": "sk-proxy-user-alice",
      "name": "Alice",
      "enabled": true,
      "allowed_providers": ["deepseek", "opencode"],
      "allowed_models": ["deepseek-v4-flash", "deepseek-v4-pro"],
      "daily_budget_usd": 5.0,
      "rate_limit_rpm": 60
    }
  ]
}
```

#### 实现路径

1. 新建 `api_key_manager.py`，负责 key 验证、权限检查、配额追踪
2. 在 `request_routes.py` 的请求分类阶段增加 key 鉴权中间件
3. `observability.py` 记录 `api_key_id` 字段到 request history
4. Dashboard 新增 "API Keys" 管理页面：创建/编辑/禁用 key、查看用量
5. 不配置 `api_keys` 时，行为与现在一致（向后兼容）

### 5.2 Prometheus Metrics 端点

新增 `GET /metrics`，返回 Prometheus 文本格式，接入 Grafana 等监控系统：

```text
# HELP litellm_proxy_requests_total Total requests by status
# TYPE litellm_proxy_requests_total counter
litellm_proxy_requests_total{status="success"} 1234
litellm_proxy_requests_total{status="failed"} 56

# HELP litellm_proxy_first_byte_ms First byte latency in milliseconds
# TYPE litellm_proxy_first_byte_ms histogram
litellm_proxy_first_byte_ms_bucket{le="500"} 800
litellm_proxy_first_byte_ms_bucket{le="1000"} 1100
litellm_proxy_first_byte_ms_bucket{le="+Inf"} 1234
litellm_proxy_first_byte_ms_sum 456789
litellm_proxy_first_byte_ms_count 1234

# HELP litellm_proxy_cost_usd_total Total estimated cost in USD
# TYPE litellm_proxy_cost_usd_total counter
litellm_proxy_cost_usd_total 1.23
```

实现位置：新建 `metrics_exporter.py`，从 `observability.py` 的 `snapshot()` 读取数据并转换为 Prometheus 格式。

### 5.3 插件/中间件机制

提供 Python hook 接口，用户在 `plugins/` 目录下放置 `.py` 文件即可加载：

```python
# plugins/log_requests.py
def before_forward(request, provider, model, upstream_format):
    """请求转发前调用。返回 dict 替换请求体，返回 None 不修改。"""
    return None

def after_response(response, provider, model, status_code):
    """收到上游响应后调用。返回 dict 替换响应体，返回 None 不修改。"""
    return None

def on_error(error, provider, model, attempt_no):
    """上游失败时调用。返回 True 阻止重试，返回 None 或 False 继续重试。"""
    return None
```

使用场景：请求日志、内容过滤、动态路由、响应缓存、自定义 token 计数。

---

## 优先级总表

### 第一阶段：体验打磨（最高优先级）

| 优先级 | 方向 | 预计工作量 | 核心价值 |
|---|---|---|---|
| **P0** | 零配置启动（环境变量推断 + 引导模式） | 2-3 天 | 消除首次使用门槛 |
| **P0** | Dashboard 首次引导 + Provider 添加向导 | 2-3 天 | 首次体验决定留存 |
| **P0** | 技术博客 + awesome 列表提交 | 1-2 天 | 0 成本，最大曝光 |
| **P1** | 智能路由 `auto` 模式 | 2-3 天 | 用户不需要选策略 |
| **P1** | CI/CD pipeline | 0.5 天 | 绿色 badge 增加信任 |
| **P1** | Failover 可视化 + 健康度概览 | 1-2 天 | "系统帮你兜住了" |

### 第二阶段：内核加固

| 优先级 | 方向 | 预计工作量 | 核心价值 |
|---|---|---|---|
| **P1** | 多模态内容跨格式转换 | 2-3 天 | 补全最大功能缺口 |
| **P1** | 流式 tool call 参数拼接鲁棒性 | 1-2 天 | 减少边缘场景失败 |
| **P2** | 流式中途断流优雅收尾 | 1 天 | 失败不是灾难 |
| **P2** | 模型映射自动发现 | 2 天 | 减少手动配置 |
| **P2** | 热加载路由策略 | 2 天 | Dashboard 修改即时生效 |

### 第三阶段：门槛降低

| 优先级 | 方向 | 预计工作量 | 核心价值 |
|---|---|---|---|
| **P2** | Docker Hub 自动发布 | 0.5 天 | 降低部署门槛 |
| **P2** | CONTRIBUTING.md + Issue 模板 | 0.5 天 | 降低贡献门槛 |
| **P2** | 在线 Demo | 1 天 | 转化率提升 |
| **P3** | PyPI 包 | 1 天 | 一键安装 |

### 第四阶段：产品化延伸

| 优先级 | 方向 | 预计工作量 | 核心价值 |
|---|---|---|---|
| **P3** | 费用看板 + 预算告警 | 2-3 天 | 运维价值 |
| **P3** | API Key 多用户管理 | 3-5 天 | 多租户场景 |
| **P3** | Prometheus metrics | 1 天 | 企业用户友好 |
| **P3** | 插件/中间件机制 | 3-5 天 | 可扩展性 |

---

## 设计原则备忘

在实现任何功能时，回到这三条原则检查：

1. **用户不应该需要知道这个词** — 三格式互转、per-key cooldown、priority_failover 这些都是实现细节，不是用户界面语言
2. **零配置是默认值，复杂配置是 escape hatch** — 大多数用户永远不需要碰 JSON，需要精细控制的人能找到入口
3. **失败不是灾难，是系统在工作** — 每次 failover 都应该让用户感到"系统在保护我"，而不是"又出错了"
