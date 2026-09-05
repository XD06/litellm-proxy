# 系统重构架构指南（中篇）：模型决策引擎与管理端点解耦 (Phase 3 & Phase 4)

> **文档定位**：本指南为重构实施的**第三阶段与第四阶段工程执行蓝图**。详细定义模型判定决策链路收敛（Model Evaluator）与 Admin API 路由完全自包含解耦（Admin Sub-application）的架构设计、接口契约与测试防护网。

---

## 1. 现状解构与痛点分析

### 1.1 模型判定逻辑分散（Phase 3 痛点）
当前模型有效性、别名解析与 Key 支持度的判断分散在 3 个文件、多达 7 个函数中：
1. `model_registry.resolve_provider_model_candidates`（变体/映射/发现解析）
2. `model_registry.key_supports_provider_model`（Key 鉴权与白名单过滤）
3. `model_registry.provider_supports_model`（供应商支持度判断）
4. `model_registry.provider_model_auto_hidden_by_manual_map`（去重与隐藏）
5. `router._provider_model_candidates` & `_prepared_key_candidates`（带版本号的缓存包裹层）

**后果**：每次增加新的优先级规则（如本次修复手动映射免受发现拦截），必须同时修改多个函数并小心维持时序，容易顾此失彼。

### 1.2 Admin API 与主代理混合（Phase 4 痛点）
* `admin_routes.py` 虽封装了大部分管理端点，但与 `sse2json.py` 之间通过 `AdminRoutesMixin` **类多重继承**绑定。
* 内部大量直接读写 `sse.CONFIG`、`sse.ROUTER`、`sse.HISTORY_STORE` 等全局上下文，导致管理接口与数据流高度耦合。

---

## 2. 目标架构设计 (Target Architecture)

```
      ┌────────────────────────────────────────────────────────┐
      │                      Admin API                         │
      │                (admin_dispatcher.py)                   │
      ├────────────────────────────────────────────────────────┤
      │  - 独立路由表 (Path → Handler)                          │
      │  - 纯上下文注入 (通过 AdminContext 访问存储与配置)         │
      │  - 零全局变量依赖                                       │
      └──────────────────────────┬─────────────────────────────┘
                                 │
                                 ▼
      ┌────────────────────────────────────────────────────────┐
      │               model_evaluator.py (新增)                │
      │           (Unified Model Evaluation Engine)            │
      ├────────────────────────────────────────────────────────┤
      │  - evaluate_candidate(provider, canonical, key_entry)  │
      │  - resolve_raw_models(provider, canonical)             │
      │  - is_key_authorized(provider, key_entry, raw_model)   │
      │  - should_auto_hide(provider, canonical)               │
      └──────────────────────────┬─────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
  ┌─────────────────────────────┐ ┌─────────────────────────────┐
  │      model_registry.py      │ │          router.py          │
  │ (Data Models & Capabilities)│ │   (Load Balancing & State)  │
  └─────────────────────────────┘ └─────────────────────────────┘
```

---

## 3. Phase 3：模型决策引擎统一化 (Model Evaluator Engine)

### 3.1 新建模块：`model_evaluator.py`

将所有模型判定、白名单判定、变体解析下沉为纯函数或统一评测类：

```python
# model_evaluator.py
from dataclasses import dataclass
from typing import Dict, Any, List, Optional, Tuple

@dataclass(frozen=True)
class ModelCandidate:
    raw_model: str
    priority: int
    source: str  # "variant" | "manual_map" | "key_manual" | "discovered" | "static" | "fallback"

@dataclass(frozen=True)
class KeySupportResult:
    authorized: bool
    reason: str  # "static_model" | "explicit_whitelist" | "manual_declaration" | "discovery_match" | "unrestricted"

class ModelEvaluator:
    """单一出口的模型解析与评测引擎"""

    @staticmethod
    def resolve_raw_candidates(config: Dict[str, Any], provider: str, canonical_model: str) -> List[ModelCandidate]:
        """按照 [变体 -> Key手动 -> 供应商映射 -> 自动发现 -> 兜底] 的确定性顺序输出候选列表"""
        pass

    @staticmethod
    def check_key_support(
        config: Dict[str, Any],
        provider: str,
        key_entry: Any,
        canonical_model: str,
        provider_model: str,
    ) -> KeySupportResult:
        """单一入口校验 Key 是否支持该模型，杜绝多处 if-else 分支不一致"""
        pass

    @staticmethod
    def is_provider_supporting(config: Dict[str, Any], provider: str, canonical_model: str) -> bool:
        """判断供应商是否在宏观上支持该模型"""
        pass
```

### 3.2 收益与保障
* **单一真理来源（Single Source of Truth）**：以后任何关于“模型命名/白名单/优先级”的业务改动，只改动 `model_evaluator.py` 一处。
* **原模块兼容**：`model_registry.py` 和 `router.py` 中的旧函数保留为薄包装，直接调用 `ModelEvaluator`，现有测试用例 100% 保持通过。

---

## 4. Phase 4：Admin API 路由彻底自包含 (Admin Sub-application)

### 4.1 重构目标：消除 `AdminRoutesMixin` 多重继承

将 `admin_routes.py` 改造为独立的调度器：

```python
# admin_routes.py (重构后)
class AdminContext:
    """显式封装 Admin 所需的一切环境依赖"""
    def __init__(self, config_manager, router, history_store, audit_store, observability):
        self.config_manager = config_manager
        self.router = router
        self.history_store = history_store
        self.audit_store = audit_store
        self.observability = observability

class AdminDispatcher:
    """自包含的 Admin 路由分发器"""
    def __init__(self, context: AdminContext):
        self.ctx = context

    def handle_get(self, path: str, query_params: dict, headers: dict) -> Tuple[int, dict]: ...
    def handle_post(self, path: str, body: dict, headers: dict) -> Tuple[int, dict]: ...
    def handle_patch(self, path: str, body: dict, headers: dict) -> Tuple[int, dict]: ...
    def handle_delete(self, path: str, headers: dict) -> Tuple[int, dict]: ...
```

### 4.2 主服务器挂载简化（`sse2json.py`）
在 `sse2json.py` 的 HTTP Handler 中，管理端点分发收敛为单行委托：
```python
# sse2json.py do_GET / do_POST
if path.startswith("/-/admin/"):
    status, response_data = self.admin_dispatcher.dispatch(method, path, body, self.headers)
    self.send_json(status, response_data)
    return
```

---

## 5. 双重测试与验收清单 (Verification Gates)

1. **模型决策单元测试**：
   - 编写专门的 `tests/test_model_evaluator.py`，全量覆盖 5 级解析阶梯、大小写容错、别名隐藏与白名单。
2. **Admin API 完整回归**：
   - 运行 `python -m pytest tests/test_admin_api.py`，确保所有 CRUD 端点（Provider, Key, Model Mapping, Variants, Stats）无任何属性或状态丢失。
3. **全量回归验收**：
   - 本地 886 个测试全部跑绿（当前实测数，51 文件）。
