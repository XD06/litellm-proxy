# 系统重构架构指南（上篇）：探测保活与状态持久化解耦 (Phase 1 & Phase 2)

> **文档定位**：本指南为重构实施的**第一阶段与第二阶段工程执行蓝图**。详细定义健康探测（Idle & Patrol Probe）与运行时状态持久化（State Store）从 `sse2json.py` 剥离的模块边界、类契约、迁移时序以及双重测试验收标准。

---

## 1. 现状解构与痛点分析

当前 `sse2json.py` 内部耦合了两个核心后台任务：
1. **状态持久化（L140 ~ L420）**：`_ROUTER_STATE_FILE`（`tmp/router_state.json`）的序列化、加载、防抖保存与快照恢复。
2. **健康探测保活（L490 ~ L1880）**：
   - **Idle Health Checker**：根据请求间隙自适应调整探测频率（30s ~ 6h），遇首个健康 Key 即停止。
   - **Patrol Health Checker**：固定长间隔全量扫描所有 Provider 的所有 Key，支持后台手动触发与并发锁控制。
   - **Health Score Updater**：定时每 15s 计算 0-100 分数并喂给 Router。

### 存在的问题与隐患
* **状态穿透与竞态**：探测线程直接读写 `sse2json.ROUTER._lock` 与全局变量，缺乏边界封装。
* **文件体积膨胀**：探测与状态代码占据 `sse2json.py` 近 **1500 行** 代码，掩盖了 HTTP 网关的主转发主线。
* **单元测试脆弱**：测试探针行为时必须实例化整个 `sse2json` 环境与 HTTP 服务器。

---

## 2. 目标架构设计 (Target Architecture)

```
                       ┌──────────────────────────────────────┐
                       │             sse2json.py              │
                       │     (HTTP Server & Request Entry)    │
                       └──────────────────┬───────────────────┘
                                          │ 委托启动 / 状态同步
                 ┌────────────────────────┼────────────────────────┐
                 │                        │                        │
                 ▼                        ▼                        ▼
  ┌───────────────────────────┐ ┌───────────────────┐ ┌───────────────────────────┐
  │      probe_manager.py     │ │   state_store.py  │ │    health_evaluator.py    │
  │   (Probe Coordinator)     │ │(State Persistence)│ │   (Health Score Updater)  │
  ├───────────────────────────┤ ├───────────────────┤ ├───────────────────────────┤
  │ - IdleHealthChecker       │ │ - StatePersistence│ │ - HealthScoreUpdater      │
  │ - PatrolHealthChecker     │ │ - SnapshotAdapter │ │ - ProviderPenaltyCalculator│
  │ - KeyProber (Single Probe)│ │ - AtomicFileWriter│ └───────────────────────────┘
  └──────────────┬────────────┘ └─────────┬─────────┘
                 │                        │
                 ▼                        ▼
  ┌─────────────────────────────────────────────────┐
  │                   router.py                     │
  │          (UpstreamRouter Core State)            │
  └─────────────────────────────────────────────────┘
```

---

## 3. Phase 1：健康探测与保活系统剥离 (Probe Subsystem)

### 3.1 新建模块：`probe_manager.py`

#### 接口定义与核心类
```python
# probe_manager.py
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple
import threading
import time

@dataclass
class ProbeTarget:
    provider: str
    key_index: int
    raw_model: str
    canonical_model: str
    upstream_format: str

class ProbeCoordinator:
    """负责单次探测的执行，与 HTTP 传输层解耦"""
    def __init__(self, upstream_client, config_loader_fn):
        self.client = upstream_client
        self.get_config = config_loader_fn

    def probe_key_once(self, target: ProbeTarget) -> Dict[str, Any]:
        """执行单次 Key 探测（带超时与首字节流式熔断）"""
        pass

class IdleHealthChecker:
    """空闲期自适应探测守护线程"""
    def __init__(self, coordinator: ProbeCoordinator, router, observability):
        self.coordinator = coordinator
        self.router = router
        self.obs = observability
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None: ...
    def stop(self) -> None: ...
    def tick_round(self) -> None: ...

class PatrolHealthChecker:
    """周期性全量巡检守护线程"""
    def __init__(self, coordinator: ProbeCoordinator, router, observability):
        self.coordinator = coordinator
        self.router = router
        self.obs = observability
        self._trigger_lock = threading.Lock()

    def start(self) -> None: ...
    def trigger_now(self) -> Dict[str, Any]: ...
    def schedule_snapshot(self) -> Dict[str, Any]: ...
```

### 3.2 迁移实施步骤（Strangler Pattern）
1. **代码下沉**：将 `_idle_probe_one_provider`、`_patrol_probe_one_key`、`_trigger_patrol_now`、`_patrol_schedule_snapshot` 平移至 `probe_manager.py`。
2. **门面保留**：在 `sse2json.py` 中保留原有函数符号，内部实现改为直接委托：
   ```python
   # sse2json.py (门面适配)
   import probe_manager

   PROBE_COORDINATOR = probe_manager.ProbeCoordinator(...)
   IDLE_CHECKER = probe_manager.IdleHealthChecker(...)
   PATROL_CHECKER = probe_manager.PatrolHealthChecker(...)

   def _trigger_patrol_now():
       return PATROL_CHECKER.trigger_now()

   def _patrol_schedule_snapshot():
       return PATROL_CHECKER.schedule_snapshot()
   ```
3. **消除隐式引用**：探测过程中需要读写的 `router`、`config`、`observability` 一律通过构造函数显式注入。

---

## 4. Phase 2：运行时状态持久化解耦 (State Store Subsystem)

### 4.1 新建模块：`state_store.py`

#### 接口定义与核心类
```python
# state_store.py
import json
import os
import time
from typing import Dict, Any, Optional

class RouterStateStore:
    """负责 router_state.json 的原子写入、校验与快照恢复"""
    def __init__(self, file_path: str, interval_s: int = 15):
        self.file_path = file_path
        self.interval_s = interval_s
        self._last_saved_at: float = 0.0

    def load_state(self) -> Optional[Dict[str, Any]]:
        """读取并校验持久化状态文件"""
        if not os.path.exists(self.file_path):
            return None
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def save_state_atomic(self, payload: Dict[str, Any]) -> bool:
        """通过 .tmp 临时文件实现原子替换保存，防止并发截断"""
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        tmp_path = self.file_path + ".tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.file_path)
            self._last_saved_at = time.time()
            return True
        except Exception:
            return False

    def start_autosave_loop(self, state_provider_fn) -> None:
        """后台定时持久化守护线程"""
        pass
```

### 4.2 迁移实施步骤
1. 将 `_ROUTER_STATE_FILE`、`_save_router_state`、`_load_router_state`、`_start_state_autosave` 下沉至 `state_store.py`。
2. 保持 `tmp/router_state.json` 磁盘数据结构 100% 不变：
   ```json
   {
     "saved_at": 1786812883,
     "router": { "providers_state": {}, "keys_state": {} },
     "provider_model_capabilities": {},
     "models_union_snapshot": {}
   }
   ```
3. 在 `sse2json.py` 初始化处调用 `state_store.load_state()` 完成启动恢复。

---

## 5. 双重测试与验收清单 (Verification Gates)

1. **单元测试回归（本地）**：
   - 运行 `python -m pytest tests/test_probe_coordinator.py tests/test_auto_routing.py`。
   - 运行本地全量测试（821 tests），确保 100% 通过。
2. **端到端契约校验（本地/VPS）**：
   - 调用 `POST /-/admin/health/patrol/trigger`，验证手动巡检是否返回正确 summary。
   - 调用 `GET /-/admin/health/patrol/schedule`，比对 JSON 字段完整性。
   - 重启容器，检查日志是否包含 `[proxy] runtime state restored (saved Ns ago)`。
