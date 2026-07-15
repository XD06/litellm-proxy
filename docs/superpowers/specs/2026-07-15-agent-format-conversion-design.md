# Agent 级三协议格式转换设计

日期：2026-07-15  
状态：已批准  
范围：OpenAI Chat Completions、OpenAI Responses、Anthropic Messages

## 1. 目标

把现有以普通聊天为主的转换层升级为 Agent 级协议转换核心，使 Codex、Claude Code 及普通 SDK 客户端可以在三种客户端格式与三种上游格式之间可靠路由。高优先级供应商即使格式不同，只要请求语义可安全表达，也应进入候选并完成请求、响应和流式事件转换。

完成后必须满足：

- 同格式保持原生透传，转换层不得改写正常请求或 SSE 字节流。
- 三种格式两两转换请求、非流式响应、流式响应和错误。
- 工具定义、工具选择、并行工具调用、调用历史和工具结果完整闭环。
- 支持 Codex 使用的 Responses function/custom tools 和 Claude Code 使用的 Messages tool_use/tool_result。
- 支持文本、图片、文件中可映射部分、结构化输出、reasoning/thinking 配置和可安全表达的 reasoning 输出。
- 支持 Responses `previous_response_id` 的跨格式会话展开。
- 无等价语义时显式阻断或记录安全降级，禁止静默丢失 Agent 关键字段。
- 所有转换决定进入 routing trace 和请求详情，能够说明映射、降级或阻断原因。

## 2. 现状与问题

当前 `protocol_adapters.py` 提供六个方向的基础转换，`format_adapters.py` 负责调度，`stream_adapters.py` 分别实现六条 SSE 路径，`parameter_compatibility.py` 在路由前阻断不能转换的字段。

主要缺口：

- Anthropic 与 Responses 通过 Chat 中转，类型化 item、顺序和扩展字段会丢失。
- 典型 Codex 请求中的 `reasoning`、`text`、`include`、`prompt_cache_key` 等被整体判为原生专属，导致跨格式候选不可用。
- Responses `custom` tool 及 `custom_tool_call` 未形成双向闭环。
- `required ↔ any`、`parallel_tool_calls ↔ disable_parallel_tool_use` 等语义映射不完整。
- 工具参数 JSON 异常时会变为 `{}`，掩盖数据损坏并导致错误工具调用。
- 六条流式路径独立维护，缺少统一的 item 生命周期和分片聚合规则。
- `previous_response_id` 没有本地会话存储，跨格式时无法恢复上下文。
- 跨供应商无法生成真实 Anthropic thinking signature，当前伪签名可能污染后续历史。

## 3. 设计选择

采用类型化 Agent IR，不继续扩张六套直接映射，也不把 LiteLLM 整体引入为依赖。

原因：

- 三种协议已包含消息、类型化 item、工具、reasoning、状态和多套流式事件；继续以 Chat 为中心会不可避免地丢语义。
- 统一 IR 使请求、响应、兼容判定和 SSE 共享同一套规则，可以用往返性质测试证明一致性。
- LiteLLM 作为行为参考和夹具来源，但其活跃工具历史、参数丢失和流式分片问题必须主动防御。

## 4. 模块边界

新增 `conversion_core` 包：

### 4.1 `model.py`

定义与供应商无关的类型化结构：

- `AgentRequest`：模型、system/instructions、turn/item 序列、工具、工具选择、reasoning、结构化输出、采样参数、token/stop、状态引用和提示字段。
- `AgentResponse`：有序输出 item、状态、usage、停止原因和错误。
- 内容 item：text、image、file、refusal、reasoning、tool_call、tool_result、opaque。
- 工具：function、custom、hosted，并保留原始工具名和规范化工具名的双向映射。
- `ConversionReport`：每个字段的 `preserved / mapped / safe_drop / stateful / blocked` 结果。

IR 只保存语义，不保存某协议偶然的包装结构。无法解释但需要同格式回传的字段放入带来源命名空间的 opaque 数据；跨格式不得假装已支持。

### 4.2 `codecs/chat.py`

负责 Chat Completions 请求/响应与 IR 的解析和输出：

- system/developer/user/assistant/tool 角色；字符串和多模态 content。
- assistant `tool_calls` 与独立 tool 消息。
- `reasoning_content`、`reasoning_effort`、`response_format`。
- `tool_choice`、`parallel_tool_calls`、token/stop/usage/finish reason。

### 4.3 `codecs/responses.py`

负责 Responses 请求/响应与 IR 的解析和输出：

- instructions、input message、function_call/output、reasoning、refusal。
- function tool 和 Codex custom tool。
- custom tool 使用 `content:string` function 包装，返回时恢复 `custom_tool_call` 及 raw input。
- text.format、reasoning、include、prompt cache、store、previous response/conversation。
- 保持 output item 顺序、call_id、item id 和 status。

### 4.4 `codecs/anthropic.py`

负责 Messages 请求/响应与 IR 的解析和输出：

- 顶层 system、user/assistant 交替、text/image/document/tool_use/tool_result。
- thinking/redacted_thinking 的安全处理和签名来源标记。
- tools、tool_choice、并行开关、output_config、context_management。
- max_tokens 必填和 stop reason/usage。

### 4.5 `compatibility.py`

在路由选候选前解析一次客户端请求并生成目标格式报告：

- `lossless`：可原样表达。
- `mapped`：语义等价但字段或包装改变。
- `safe_drop`：仅缓存键、追踪提示等不影响模型语义的字段被省略。
- `stateful`：依赖本地会话展开后可转换。
- `blocked`：hosted tool、后台任务、无法恢复的会话或其他无等价语义。

默认 `safe` 模式允许前三类和已成功展开的 `stateful`；`strict` 模式只允许 lossless/mapped。报告写入 routing trace，替换当前仅按字段名维护的粗粒度白名单。

### 4.6 `streaming.py`

实现协议解析器 → 统一增量事件 → 协议输出器：

- 事件：response start、item start、text/reasoning/refusal delta、tool argument delta、item end、usage、response end、error。
- 每个 tool call 按稳定 call id 和源 index 建状态，参数只追加字符串，不逐片解析。
- item 结束时验证完整 JSON；失败时保留 raw 参数并输出明确转换错误，不替换为空对象。
- Responses `sequence_number` 单调递增；Anthropic block index 与开始/结束严格配对；Chat tool index 稳定。
- 只缓存工具参数和必要元数据，文本/推理增量立即转发，避免整段缓冲。
- 上游中断时输出客户端协议允许的错误事件，并保留已写出事实，禁止透明切换另一个候选。

现有六个 stream 函数保留为薄兼容外壳，内部调用统一状态机。

### 4.7 `session_store.py`

使用独立 SQLite 表保存允许持久化的 Responses 会话：

- 以代理生成的 response id 为键，保存规范化请求输入和规范化输出。
- `previous_response_id` 沿父链展开并检测循环、缺失和超深链。
- `store:false` 不落盘；此类请求若仅提供不可恢复的 previous id，跨格式候选明确阻断。
- 默认 TTL 24 小时、最多 10,000 个响应、总量 256 MiB、单响应 4 MiB、父链深度 64；均可配置，写入后及启动时增量清理。
- 删除请求历史时级联删除关联转换会话。
- 不存 API key、Authorization 或管理凭据；超限和损坏记录返回确定性错误。

### 4.8 `errors.py`

定义统一错误类别：client schema、conversion blocked、conversion invalid、session missing、upstream HTTP、transport、stream interrupted。

输出规则：

- Chat/Responses 使用 OpenAI error envelope，并带稳定 `type/code/param`。
- Anthropic 使用 `type:error` 和 Anthropic error object。
- 已开始的 SSE 使用目标协议 error event；未开始写客户端响应时允许路由继续下一个候选。
- 请求详情必须区分客户端输入错误、代理转换错误和上游错误。

## 5. 关键映射策略

### 5.1 工具调用

- Chat `function.arguments` 和 Responses `arguments` 始终是字符串；Anthropic `input` 始终是对象。
- 非流式 JSON 解析失败不再生成 `{}`。目标需要对象时报告 `invalid_tool_arguments`；目标允许字符串时保留原值。
- 多个并行调用保持一个 assistant turn 内的顺序；多个结果合并为一个 Anthropic user turn。
- `required ↔ any`；指定函数 ↔ 指定工具；并行开关按 Anthropic 语义取反。
- 工具名规范化必须同步修改定义和历史调用，并保存反向映射供客户端响应恢复。
- 孤儿/重复工具结果默认报告输入无效，不自动伪造业务结果；兼容修复仅在显式配置允许时启用。

### 5.2 Reasoning 与 thinking

- 配置层在 `reasoning effort` 与 Anthropic thinking budget/effort 之间映射并记录近似等级。
- 可见 reasoning summary 可以映射为 Responses reasoning item 或 Chat `reasoning_content`。
- Anthropic 原生签名只在同格式透传或来源确为 Anthropic 时保留。
- 非 Anthropic 上游产生的 reasoning 不伪造成可回传签名；面向 Anthropic 客户端默认省略不安全 thinking block，并记录 safe degradation。
- encrypted reasoning 和 redacted thinking 仅在目标协议明确支持时透传。跨格式时，如果同一 assistant turn 仍有可见文本或工具调用，则省略 opaque reasoning 并记录 `safe_drop`；如果省略后会删除整个 turn 或破坏工具调用链，则阻断候选。不能解密或伪造。

### 5.3 结构化输出

- Responses `text.format`、Chat `response_format`、Anthropic `output_config.format` 优先使用目标协议原生 JSON Schema。
- 目标只支持工具模式时，转换为保留名称的强制单一 synthetic tool，并在响应阶段解包。
- schema、strict、name 和 description 按目标协议允许的字段完整保留。仅注释性关键字无法表达时可 `safe_drop`；约束性关键字无法表达时阻断候选并列出关键字。

### 5.4 多模态与内置工具

- URL/base64 图片在三协议间转换；文件引用只在有可用 URL/data 时转换。
- tool_result 中的文本、图片和文件按目标协议能力保留，不把非文本内容静默拼成字符串。
- hosted web/file/computer/code interpreter/MCP/shell/apply_patch 等仅在存在明确等价映射时转换。
- Codex custom apply_patch/shell 属客户端执行的 custom tool，可包装为 function；供应商托管工具不等同于客户端工具，不能混淆。

## 6. 路由集成

- `priority_first` 继续作为默认策略：供应商优先级决定全局顺序，同优先级时同格式优先。
- 每个请求只解析一次 IR；每个目标格式的兼容报告和基础 payload 按格式缓存。
- provider model、key model、格式、熔断和兼容报告共同决定候选，不因为格式不同提前排除可安全转换的高优先级供应商。
- 单个候选转换失败必须记录 attempt 和阶段；未写客户端响应时继续下一候选。

## 7. 迁移方式

1. 先建立 IR、三个非流式 codec 和兼容报告，以现有公开函数作为适配外壳。
2. 切换请求与非流式响应，保持现有代理入口和路由 API 不变。
3. 建立统一流式状态机，逐方向替换六个旧实现。
4. 增加 session store，并开放 previous_response_id 跨格式候选。
5. 完善错误转换、routing trace 和请求详情。
6. 删除不再使用的重复转换逻辑，但保留公共函数签名，避免测试和外部导入破坏。

每一步都有独立回归测试；不得一次性删除旧路径后再补测试。

## 8. 测试与验收

### 8.1 单元测试

- 三协议解析/输出的字段矩阵。
- 15 条 Agent edge cases。
- LiteLLM #25669、#27469、#29491 防御测试。
- function/custom tools、并行调用、工具名、非法 JSON、图片/文件、结构化输出和 reasoning。
- previous response 展开、循环、过期、store false、容量限制。

### 8.2 性质与分片测试

- 对可表达子集执行 source → IR → target → IR，比较语义等价而非随机 id。
- 对工具参数在每个字节边界和随机边界切片，证明最终参数完全一致。
- 验证 Responses sequence number、Anthropic block 生命周期和 Chat tool index 不变量。

### 8.3 代理集成测试

- 三个客户端端点 × 三个上游格式 × stream/non-stream。
- 文本、工具、并行工具、reasoning、结构化输出、错误和中断。
- Codex Responses 夹具与 Claude Code Messages 夹具完成至少两轮工具调用闭环。
- 高优先级跨格式供应商先于低优先级同格式供应商的路由断言。

### 8.4 完成门槛

- 新转换测试全部通过。
- 现有后端全量测试通过。
- 前端测试与生产构建通过（请求详情变更时）。
- 大工具参数流式压力测试无丢片、重复或内存随文本长度线性增长。
- routing trace 能对每个格式候选说明 fidelity、转换和阻断原因。
- 不存在静默清空工具参数、伪造工具结果或伪造可回传 thinking signature 的路径。

## 9. 参考依据

- 用户资料目录 `C:\Users\dsk\Desktop\Llmapi_format_conversions` 中的官方 SDK/OpenAPI 字段、LiteLLM 精简源码和 edge case 汇总。
- LiteLLM custom tool、Responses session handler、Responses streaming iterator、Anthropic transformation 和 Claude Code E2E 测试。
- LiteLLM 活跃问题 #25669、#27469、#29491。

实现可以借鉴其算法与测试思路，但必须保持本项目模块边界、路由可观测性和无静默丢失原则。
