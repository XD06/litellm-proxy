# 模型生命周期与路由决策全景指南 (Model Routing & Lifecycle Guide)

> 本文档详细阐述系统中模型的命名规范、解析优先级、自动发现机制、重命名与变体规则，以及路由选择的全链路决策流。

---

## 1. 核心命名概念与数据结构

系统在处理模型标识时，严格区分以下三个层次的概念：

| 概念 | 术语 | 示例 | 说明 |
| :--- | :--- | :--- | :--- |
| **对外展示名** | **Canonical ID** | `deepseek-v4-flash-plus`, `gpt-4o` | 客户端（如 Cherry Studio, NextChat）请求时填写的名字，也是 `/v1/models` 对外公布的名字。 |
| **上游原始名** | **Raw ID** | `deepseek/deepseek-v4-flash-0731`, `doubao-seed-2-0-pro` | 供应商上游 API 实际识别并接收的模型标识，最终放入 HTTP 请求 Body 的 `"model"` 字段中。 |
| **自动归一化名** | **Normalized ID** | `deepseek-v4-flash` | 系统自动发现算法从 Raw ID 中剥离厂商前缀（如 `doubleword/`）和日期快照（如 `-0731`）后生成的标准名。 |

### 关键数据结构存储位置

```
config.json / runtime_config.json
├── models/
│   ├── provider_model_map/         # 管理员手动重命名映射 {provider: {canonical: raw}}
│   ├── provider_model_variants/    # 变体回退列表 {provider: {canonical: [{model: raw, priority: N}]}}
│   ├── provider_model_disabled/    # 模型显式禁用标志 {provider: {model_id: true}}
│   ├── routes/                     # 自定义路由拓扑 {canonical: {providers: [...], format_preference: "..."}}
│   └── provider_model_capabilities/# [动态缓存] 供应商自动发现快照
│       └── {provider: {status: "ok", models: [raw1, raw2], canonical_map: {normalized: raw}}}
└── providers/
    └── {provider: {
            "keys": [
                "sk-string-key",                     # 模式 A: 纯字符串 Key (无限制)
                {"key": "sk-xxx", "models": [...]}   # 模式 B: 显式白名单限制 Key
            ],
            "static_models": ["unlisted-raw-model"]  # 模式 C: 静态管理员断言 (跳过 discovery 校验)
        }}
```

---

## 2. 请求路由决策全链路（Decision Flowchart）

当客户端发送 `POST /v1/chat/completions` (指定 `model: "deepseek-v4-flash-plus"`) 时，系统内部经历以下 5 个核心决策阶段：

```
[客户端请求: model="X"]
       │
       ▼
【阶段 1: 筛选候选供应商 (Provider Selection)】
   ├─► 是否在 models.routes["X"] 中配置了特定供应商？
   │      ├─ 是 ──► 按 routes 列表中指定的供应商及优先级排序
   │      └─ 否 ──► 遍历所有 enabled=true 的供应商
   │
   ├─► 过滤掉显式禁用该模型的供应商 (provider_model_disabled[p]["X"] == True)
   ├─► 过滤掉处于健康冷却期或断路的供应商 (providers_state.available == False)
   └─► 过滤掉不支持该模型的供应商 (根据 provider_supports_model 判定)
       │
       ▼
【阶段 2: 解析上游原始模型名 (Canonical → Raw Model Resolution)】
   对每个候选供应商，按以下【严格优先级】解析出待尝试的 Raw Model 候选列表：
   │
   ├─► [优先级 1: 变体列表] provider_model_variants[provider]["X"]
   │      └─ 命中则返回变体列表中的 Raw ID（按 priority 降序）
   │
   ├─► [优先级 2: Key 手动模型映射] key["models"][canonical] (如果 key 为 dict)
   │
   ├─► [优先级 3: 供应商手动重命名] provider_model_map[provider]["X"]
   │      └─ 命中则返回配置的目标 Raw ID (如 "deepseek/deepseek-v4-flash-0731")
   │
   ├─► [优先级 4: 自动发现映射] provider_model_capabilities[provider].canonical_map["X"]
   │      └─ 命中则返回归一化自动关联的 Raw ID
   │
   └─► [优先级 5: 原样兜底] 直接使用 "X" 作为 Raw ID
       │
       ▼
【阶段 3: 筛选有效密钥 (Key Validation & Whitelist Check)】
   对候选供应商下的每个 Key (按配置顺序或轮询)，调用 key_supports_provider_model：
   │
   ├─► 是否在供应商 static_models 中？
   │      └─ 是 ──► 允许使用 (True)
   │
   ├─► Key 是否配置了显式 models 白名单？
   │      ├─ 配置了且包含目标模型 ──► 允许使用 (True)
   │      └─ 配置了但不包含目标模型 ──► 拒绝使用 (False)
   │
   ├─► 是否已有该 Key 的自动发现快照 (provider_key_model_capabilities)？
   │      ├─ 目标 Raw ID 在该 Key 的 models 列表中 ──► 允许使用 (True)
   │      └─ 目标 Raw ID 不在列表中 ──► 拒绝使用 (False，判定为“密钥不支持该模型”)
   │
   └─► 无任何限制且无发现数据 ──► 允许使用 (None/True)
       │
       ▼
【阶段 4: 协议与格式协商 (Protocol Adaptation)】
   ├─► 检查供应商支持的 upstream_format (chat_completions / responses / messages)
   ├─► 根据 format_preference (priority_first vs native_first) 确定格式排期
   └─► 如格式不一致，自动调用 conversion_core 转码 Body / Stream
       │
       ▼
【阶段 5: 上游 URL 拼接与发送 (URL Assembly & Execution)】
   ├─► Base URL 结尾带 `/` ──► 触发【前缀模式】(保持根路径，直接拼接 /chat/completions)
   ├─► Base URL 结尾无 `/` ──► 触发【标准模式】(拼接 base_url + /v1/chat/completions)
   └─► 发送请求并监听响应：
          ├─ HTTP 200 ──► 返回客户端，记录成功，重置失败计数
          └─ 异常/报错 ──► 触发 Scheduler Policy 冷却阶梯，尝试下一个候选 Key/Provider
```

---

## 3. 自动发现与手动重命名的协同机制

### 自动去重与隐藏（Auto-Hide 规则）
为了保证前端 `/v1/models` 输出干净，系统在重构联合模型快照（`rebuild_models_union_snapshot`）时遵循以下规则：
1. **未重命名的模型**：对外公布自动归一化出的标准名（例如 `deepseek-v4-flash`）。
2. **已手动重命名的模型**：
   * 管理员配置了 `"deepseek-v4-flash-plus": "deepseek/deepseek-v4-flash-0731"`；
   * 系统通过 `provider_model_auto_hidden_by_manual_map` **自动隐藏**该供应商原有的 `deepseek-v4-flash`；
   * 最终列表中**只出现重命名后的 `deepseek-v4-flash-plus`**，避免同源模型在列表里出现重复。

### 刷新保护（Refresh Safety）
后台定期触发模型刷新（`fetch_upstream_models`）时：
* **只写入**：`provider_model_capabilities`（动态运行时缓存）。
* **绝不修改**：`provider_model_map`、`provider_model_variants`、`provider_model_disabled`、`static_models`。
* **用户配置享有终生不可变性**，刷新永远不会回退或篡改管理员的修改。

---

## 4. 最佳实践建议

1. **对接聚合型平台（Requesty / OpenRouter 等）**：
   * 优先使用 **模型变体列表 (`provider_model_variants`)** 绑定多个候选版本，如：
     `[{"model": "deepseek/deepseek-v4-flash-0731", "priority": 10}, {"model": "doubleword/deepseek-v4-flash", "priority": 5}]`
   * 这样当上游弃用某个子版本时，系统会自动平滑降级，零人工干预。

2. **特殊私有/非标模型**：
   * 如果供应商接口不返回 `/v1/models`（或模型是内部隐式开放的），在供应商中配置 `static_models: ["my-private-model"]`，即可免受自动发现白名单拦截。
