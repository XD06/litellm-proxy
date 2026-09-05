# 系统重构架构指南（下篇）：核心网关瘦身与纯净流水线 (Phase 5)

> **文档定位**：本指南为重构实施的**终局阶段工程执行蓝图**。详细定义将核心网关 `sse2json.py` 瘦身为纯净 HTTP 管道（从 5500 行精简至 <600 行）的拆分方案、中间件管道设计、流式适配编排与生产级割接方案。

---

## 1. 终局架构全景 (Ultimate Clean Architecture)

经过 Phase 1 ~ 4 的外围与支撑模块剥离后，系统在 Phase 5 将形成高度分层、职责极其明确的微内核拓扑：

```
                      ┌─────────────────────────────────┐
                      │          gateway.py             │
                      │(主 HTTP 入口 / 请求路由分类挂载)   │
                      └────────────────┬────────────────┘
                                       │
                      ┌────────────────▼────────────────┐
                      │       proxy_pipeline.py         │
                      │  (统一请求处理流水线中间件)       │
                      └────────────────┬────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│ chat_proxy.py │              │messages_proxy │              │responses_proxy│
│ (OpenAI Chat) │              │  (Anthropic)  │              │(OpenAI Resp)  │
└───────┬───────┘              └───────┬───────┘              └───────┬───────┘
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       │
                  ┌────────────────────┴────────────────────┐
                  │                                         │
                  ▼                                         ▼
   ┌─────────────────────────────┐           ┌─────────────────────────────┐
   │     stream_pipeline.py      │           │     protocol_adapters.py    │
   │ (SSE 流式转换与背压泵送)       │           │   (非流式双向数据结构转码)     │
   └──────────────┬──────────────┘           └──────────────┬──────────────┘
                  │                                         │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │     upstream_client.py      │
                        │(基于 urllib3 的安全 HTTP 传输)│
                        └─────────────────────────────┘
```

---

## 2. 核心拆分与模块职责清单

| 拆分后模块 | 预估行数 | 核心单一职责 |
| :--- | :--- | :--- |
| **`gateway.py`**（原 `sse2json.py` 瘦身） | ~500 行 | 仅保留 HTTP 服务器初始化、线程池管理、TLS/端口绑定与顶级 URL 路由分发。 |
| **`proxy_pipeline.py`** | ~450 行 | 统一封装 Attempt 重试循环、超时预算控制（`TimeoutBudget`）、`RuntimeContext` 快照捕获与最终错误封包。 |
| **`stream_pipeline.py`** | ~400 行 | 专门负责 SSE 响应头协商、前置缓冲（`BufferedSSEWriter`）、首字节探测（`prefetch`）与客户端断开监听。 |
| **`chat_proxy.py`** | ~250 行 | 纯净的 OpenAI Chat Completions 协议接入与响应装配。 |
| **`anthropic_proxy.py`** | ~250 行 | 纯净的 Anthropic Messages 协议接入与响应装配。 |
| **`responses_proxy.py`** | ~200 行 | 纯净的 OpenAI Responses 实验性协议接入与响应装配。 |

---

## 3. 核心流水线规范 (Proxy Pipeline Pipeline)

将主转发中的 Attempt 重试、协议转码、错误记录抽象为标准的流水线模式：

```python
# proxy_pipeline.py
from dataclasses import dataclass
from typing import Generator, Optional, Any, Dict

@dataclass
class ProxyRequest:
    request_id: str
    client_format: str       # "chat_completions" | "anthropic_messages" | "responses"
    canonical_model: str
    raw_payload: Dict[str, Any]
    is_stream: bool
    headers: Dict[str, str]

class ProxyPipeline:
    def __init__(self, router, upstream_client, observability, error_recorder):
        self.router = router
        self.client = upstream_client
        self.obs = observability
        self.recorder = error_recorder

    def execute(self, req: ProxyRequest) -> Any:
        """执行端到端路由与重试，屏蔽底层传输与重试细节"""
        attempts = self.router.iter_attempts(
            req.canonical_model,
            is_stream=req.is_stream,
            request_id=req.request_id,
            client_format=req.client_format,
        )
        
        attempt_errors = []
        for attempt in attempts:
            try:
                # 1. 协议转码与准备
                adapted_payload = self._adapt_payload(req, attempt)
                
                # 2. 向上游发起调用 (流式或非流式)
                if req.is_stream:
                    return self._handle_stream(req, attempt, adapted_payload)
                else:
                    return self._handle_non_stream(req, attempt, adapted_payload)
            except Exception as e:
                # 3. 失败记录与故障转移 (Failover)
                decision = self.recorder.record_failure(req, attempt, e)
                if not decision.should_retry:
                    raise
        
        # 4. 所有 Attempt 耗尽，抛出 502/503 规范错误
        raise AllAttemptsFailedError(req.request_id, attempt_errors)
```

---

## 4. 向后兼容与平滑过渡策略 (Backward Compatibility)

为了保证完全不破坏任何既有依赖与测试：
1. **保留 `sse2json.py` 符号**：
   重构后的 `sse2json.py` 变为系统总装配入口（Facade），仅仅 `import` 并重新导出所有核心函数：
   ```python
   # sse2json.py (瘦身后的终态)
   from gateway import run_server, Handler
   from proxy_pipeline import ProxyPipeline
   from probe_manager import PROBE_COORDINATOR
   # ... 保留外部测试所引用的全部符号别名
   ```
2. **零中断命令行启动**：
   `python sse2json.py` 保持 100% 可直接启动，CLI 参数和 Docker Entrypoint 无需任何修改。

---

## 5. 终极验收标准 (Final Verification)

1. **测试全量跑绿**：
   - 886 个本地 pytest 测试 100% 通过（零断代，`python -m pytest tests/ --collect-only` 实测值）。
2. **三大协议双向转码基准测试**：
   - OpenAI SDK 请求 $\rightarrow$ Anthropic 上游
   - Claude Code / Cursor 请求 $\rightarrow$ OpenAI 上游
   - 双向流式（思考过程 `reasoning_content` / `thinking`、Tool Calls 工具调用）实时推流无丢包。
3. **生产环境金丝雀验证**：
   - VPS Docker 镜像重新构建，发送连续 100 次混合协议请求，验证零 5xx 异常，平均延迟无退化。
