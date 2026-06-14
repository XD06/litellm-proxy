# Artificial Analysis Model Summary

从 [artificialanalysis.ai](https://artificialanalysis.ai) 获取 LLM 模型评测摘要数据。
支持 **Python 库直接嵌入** 和 **独立 HTTP 服务** 两种使用方式。

## 安装

```bash
pip install httpx beautifulsoup4 fastapi uvicorn
```

## 用法

### 方式一：Python 库（推荐，2ms 缓存命中）

```python
from artificial_analysis_api import aa

# 一行获取（自动缓存）
data = aa.get("gpt-5.5")
print(data["summary"]["intelligence"]["score"])  # 60.2

# 智能匹配
aa.get("anthropic/claude-opus-4.8")   # 斜杠
aa.get("claude opus 4.8")             # 空格
aa.get("gpt-5.5")                     # 点号

# 代理 + 强制刷新
aa.get("deepseek-v4-flash", proxy="http://127.0.0.1:8005", refresh=True)

# 模型列表（500个）
models = aa.list_models()
print(f"共 {models['total']} 个模型")

# 搜索
aa.search("claude")
```

**自定义缓存目录：**

```python
from artificial_analysis_api import ModelSummary

ms = ModelSummary(cache_dir="./my_cache")
summary = ms.get("deepseek-v4-flash")
```

### 方式二：独立 HTTP 服务

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8898
```

```bash
curl http://localhost:8898/api/model-summary/gpt-5.5
curl http://localhost:8898/api/models
curl "http://localhost:8898/api/model-summary/deepseek-v4-flash?refresh=true"
curl "http://localhost:8898/api/model-summary/anthropic/claude-opus-4.8"
```

### 方式三：挂载到已有 FastAPI 项目

```python
from fastapi import FastAPI
from artificial_analysis_api.router import router

app = FastAPI()
app.include_router(router)  # 获得 /api/model-summary 等路由
```

---

## API 参考

### 模型摘要

```
GET /api/model-summary/{model}
```

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| `model` | 路径 | **是** | 模型名称，支持智能匹配 |
| `proxy` | 查询 | 否 | HTTP 代理 |
| `refresh` | 查询 | 否 | `true` 时强制拉取并更新缓存 |

**请求示例：**

```bash
curl http://localhost:8898/api/model-summary/deepseek-v4-flash
curl "http://localhost:8898/api/model-summary/anthropic/claude-opus-4.8?proxy=http://127.0.0.1:8014"
curl "http://localhost:8898/api/model-summary/deepseek-v4-flash?refresh=true"
```

**响应结构：**

```json
{
  "model": "deepseek-v4-flash",
  "summary": {
    "intelligence":   { "rank": 11, "total": 12, "score": 46.5 },
    "speed":          { "rank": 5, "total": 11, "tokens_per_second": 89.4 },
    "pricing":        { "rank": 2, "total": 20, "cache_hit": 0.0028, "input": 0.14, "output": 0.28 },
    "price_blended":  { "rank": 2, "total": 11, "price_per_1m_tokens": 0.058 },
    "openness":       { "rank": 2, "total": 18, "score": 50 },
    "context_window": { "rank": 1, "total": 20, "tokens": 1000000 },
    "latency":        { "rank": 18, "total": 20, "input_time_s": 1.23, "reasoning_time_s": 62.79, "answer_time_s": 5.59 },
    "model_size":     { "rank": 17, "total": 20, "active_params_b": 13, "total_params_b": 284 },
    "verbosity":      { "rank": 2, "total": 20, "reasoning_tokens": 227867531, "answer_tokens": 13193287 },
    "eval_cost":      { "rank": 20, "total": 20, "total_usd": 112.86 }
  },
  "cached": true,
  "source_url": "https://artificialanalysis.ai/models/deepseek-v4-flash"
}
```

#### 字段说明

| 路径 | 含义 | 单位 |
|------|------|------|
| `intelligence.score` | Artificial Analysis 智能指数 | 0-100 |
| `speed.tokens_per_second` | 输出速度 | tokens/s |
| `pricing.input` | 输入价格 | USD/1M tokens |
| `pricing.output` | 输出价格 | USD/1M tokens |
| `pricing.cache_hit` | 缓存命中价格 | USD/1M tokens |
| `price_blended.price_per_1m_tokens` | 混合价格(7:2:1 cache:input:output) | USD/1M tokens |
| `context_window.tokens` | 上下文窗口大小 | tokens |
| `model_size.active_params_b` | 推理时激活参数量 | billion |
| `model_size.total_params_b` | 总参数量 | billion |
| `latency.input_time_s` | 首 token 延迟 | 秒 |
| `latency.reasoning_time_s` | 推理思考时间 | 秒 |
| `latency.answer_time_s` | 生成 500 token 时间 | 秒 |
| `openness.score` | 开放性指数 | 0-100 |
| `verbosity.reasoning_tokens` / `answer_tokens` | 评测中推理/回答 token 用量 | tokens |
| `eval_cost.total_usd` | AA 智能指数评测总费用 | USD |
| `rank / total` | 在该数据集中的排名 | 如 `11/12` |

> **注意：** 部分字段（如 `price_blended`、`latency`、`verbosity` 等）可能为 `null`，取决于 AA 是否有该模型的数据。字段缺失 = AA 未收录该维度的数据。

### 模型列表

```
GET /api/models
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `proxy` | 否 | HTTP 代理 |
| `refresh` | 否 | `true` 时重新建索引 |

**请求示例：**

```bash
curl http://localhost:8898/api/models
curl "http://localhost:8898/api/models?proxy=http://127.0.0.1:8014"
curl "http://localhost:8898/api/models?refresh=true"
```

**响应结构：**

```json
{
  "total": 500,
  "models": [
    { "slug": "deepseek-v4-flash",       "name": "DeepSeek V4 Flash (Max)" },
    { "slug": "gpt-5-5",                 "name": "GPT-5.5 (xhigh)" },
    { "slug": "claude-opus-4-8",         "name": "Claude Opus 4.8 (max)" },
    { "slug": "gemini-3-5-flash",        "name": "Gemini 3.5 Flash" }
  ]
}
```

### 搜索

```
GET /api/search?q={关键词}
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `q` | **是** | 搜索关键词 |
| `proxy` | 否 | HTTP 代理 |

**请求示例：**

```bash
curl "http://localhost:8898/api/search?q=claude"
```

**响应结构：**

```json
{
  "query": "claude",
  "results": [
    { "slug": "claude-2",              "name": "Claude 2.0",          "score": 0.8 },
    { "slug": "claude-opus-4-8",       "name": "Claude Opus 4.8",     "score": 0.8 },
    { "slug": "claude-sonnet-4-6",     "name": "Claude Sonnet 4.6",   "score": 0.8 }
  ]
}
```

---

## 代理说明

**直连 AA 非常慢**（~25s），强烈建议使用代理，具体如下：

```python
aa.get("gpt-5.5", proxy="http://127.0.0.1:8014")
```

代理可大幅提速（实测 **1.1~1.3s**），同时享受 CDN 缓存收益。

---

## 缓存 & 性能

### 缓存链路

```
内存缓存 (0ms) → 文件缓存 (0.2ms) → AA 远程 (走代理 ~1.3s)
↑ 命中即返回       ↑ 读盘后进内存       ↑ refresh=true
```

### 基准测试

| 场景 | 直接 import | HTTP 服务 |
|------|-----------|-----------|
| 缓存命中 | **2ms** | **210ms** |
| 首次远程拉取(无代理) | ~20s | ~25s |
| 首次远程拉取(有代理) | **~1.3s** | **~2.5s** |
| 模型列表 | **3ms** | 215ms |

> HTTP 服务的 200ms 主要是 uvicorn 框架开销。直接 import 只要 2ms。
> 远程拉取的速度取决于网络，**强烈建议使用代理**。

### 缓存策略

- **不设 TTL** — 缓存永不过期，除非明确 `refresh=true`
- **直接覆盖** — 不比对、不增量，新数据直接替换旧文件
- **预置索引** — 内置 500 个模型的索引文件，首次使用无需拉取 AA 模型列表
- **内存上限** — 最多缓存 200 个模型摘要（~400KB）

---

## 错误码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 404 | 模型未找到（AA 无此模型或名称不匹配） |
| 502 | 上游 AA 不可用 / 结构变化 / 代理或网络问题 |
