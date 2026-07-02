#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""性能基准测试脚本 - 量化测量每个优化点的实际效果"""
from __future__ import annotations

import sys, io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import gc
import io
import json
import os
import sys
import tempfile
import threading
import time
from collections import deque
from typing import Any, Dict, List


# ── 工具函数 ──────────────────────────────────────────────

def _make_attempt(i: int) -> Dict[str, Any]:
    return {
        "attempt_no": i,
        "provider": f"provider-{i % 5}",
        "key_index": i % 3,
        "provider_model": f"model-{i % 10}",
        "upstream_format": "chat_completions",
        "outcome": "success" if i % 3 != 0 else "failed",
        "duration_ms": 100 + i * 10,
        "error_type": "" if i % 3 != 0 else "server_error",
        "reason": "" if i % 3 != 0 else "timeout",
        "http_status": 200 if i % 3 != 0 else 502,
        "usage": {
            "input_tokens": 100 * i,
            "output_tokens": 50 * i,
            "total_tokens": 150 * i,
        },
        "cost_usd": 0.001 * i,
    }


def _make_recent_item(i: int) -> Dict[str, Any]:
    return {
        "request_id": f"req-{i:04d}",
        "client_format": "chat_completions",
        "endpoint": "chat_completions",
        "model": f"model-{i % 10}",
        "stream": i % 2 == 0,
        "path": "/v1/chat/completions",
        "status_code": 200 if i % 4 != 0 else 502,
        "duration_ms": 200 + i * 5,
        "first_byte_ms": 50 + i,
        "attempts": [_make_attempt(j) for j in range(1, min(i + 1, 5))],
        "finished_at": int(time.time()) - i * 10,
        "usage": {
            "input_tokens": 200 * i,
            "output_tokens": 100 * i,
            "total_tokens": 300 * i,
        },
        "cost_usd": 0.002 * i,
    }


def _fmt_ms(ns: float) -> str:
    return f"{ns / 1e6:.2f} ms"


def _fmt_us(ns: float) -> str:
    return f"{ns / 1e3:.1f} µs"


def _run_bench(name: str, func, iterations: int = 1000, warmup: int = 50) -> Dict[str, Any]:
    """运行基准测试并返回统计信息"""
    # 预热
    for _ in range(warmup):
        func()

    # 强制 GC 消除干扰
    gc.collect()

    # 正式测量
    times_ns: List[int] = []
    for _ in range(iterations):
        t0 = time.perf_counter_ns()
        func()
        t1 = time.perf_counter_ns()
        times_ns.append(t1 - t0)

    times_ns.sort()
    total = sum(times_ns)
    avg = total / iterations
    p50 = times_ns[iterations // 2]
    p95 = times_ns[int(iterations * 0.95)]
    p99 = times_ns[int(iterations * 0.99)]
    min_t = times_ns[0]
    max_t = times_ns[-1]

    return {
        "name": name,
        "iterations": iterations,
        "total_ms": total / 1e6,
        "avg_ns": avg,
        "p50_ns": p50,
        "p95_ns": p95,
        "p99_ns": p99,
        "min_ns": min_t,
        "max_ns": max_t,
    }


# ── 基准测试 1: observability.py snapshot() ──────────────────

def bench_observability_snapshot():
    """测试 ProxyObservability.snapshot() 性能"""
    from observability import ProxyObservability

    cfg = {
        "observability": {
            "recent_requests_limit": 200,
        },
    }
    obs = ProxyObservability(cfg)

    # 填充数据
    for i in range(200):
        rid = f"req-{i:04d}"
        obs.record_request_start(
            rid,
            client_format="chat_completions",
            endpoint="chat_completions",
            model=f"model-{i % 10}",
            stream=i % 2 == 0,
            path="/v1/chat/completions",
        )
        obs.record_attempt(
            rid,
            type("Attempt", (), {
                "request_id": rid, "attempt_no": 1, "provider": "alpha",
                "key_index": 0, "key": "raw-key", "url": "https://alpha.example",
                "headers": {}, "provider_model": "gpt-4",
                "upstream_format": "chat_completions",
            })(),
            outcome="success",
            http_status=200,
            duration_ms=100,
            usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        obs.record_request_end(rid, status_code=200)

    return _run_bench("observability.snapshot()", obs.snapshot, iterations=500)


# ── 基准测试 2: observability.py snapshot_lite() ───────────────

def bench_observability_snapshot_lite():
    """测试 ProxyObservability.snapshot_lite() 性能"""
    from observability import ProxyObservability

    cfg = {"observability": {"recent_requests_limit": 200}}
    obs = ProxyObservability(cfg)

    for i in range(200):
        rid = f"req-{i:04d}"
        obs.record_request_start(
            rid, client_format="chat_completions", endpoint="chat_completions",
            model=f"model-{i % 10}", stream=i % 2 == 0, path="/v1/chat/completions",
        )
        obs.record_attempt(
            rid,
            type("Attempt", (), {
                "request_id": rid, "attempt_no": 1, "provider": "alpha",
                "key_index": 0, "key": "raw-key", "url": "https://alpha.example",
                "headers": {}, "provider_model": "gpt-4",
                "upstream_format": "chat_completions",
            })(),
            outcome="success", http_status=200, duration_ms=100,
            usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        obs.record_request_end(rid, status_code=200)

    return _run_bench("observability.snapshot_lite()", obs.snapshot_lite, iterations=500)


# ── 基准测试 3: observability.py provider_activity_summary() ───

def bench_provider_activity_summary():
    """测试 ProxyObservability.provider_activity_summary() 性能"""
    from observability import ProxyObservability

    cfg = {"observability": {"recent_requests_limit": 200}}
    obs = ProxyObservability(cfg)

    for i in range(200):
        rid = f"req-{i:04d}"
        obs.record_request_start(
            rid, client_format="chat_completions", endpoint="chat_completions",
            model=f"model-{i % 10}", stream=i % 2 == 0, path="/v1/chat/completions",
        )
        obs.record_attempt(
            rid,
            type("Attempt", (), {
                "request_id": rid, "attempt_no": 1, "provider": f"provider-{i % 5}",
                "key_index": 0, "key": "raw-key", "url": "https://alpha.example",
                "headers": {}, "provider_model": "gpt-4",
                "upstream_format": "chat_completions",
            })(),
            outcome="success" if i % 4 != 0 else "failed",
            http_status=200 if i % 4 != 0 else 502,
            duration_ms=100,
            usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        )
        obs.record_request_end(rid, status_code=200 if i % 4 != 0 else 502)

    return _run_bench("observability.provider_activity_summary()",
                      lambda: obs.provider_activity_summary(limit=60),
                      iterations=500)


# ── 基准测试 4: stream_adapters.py relay_sse_stream flush ──────

def bench_relay_sse_stream():
    """测试 relay_sse_stream 的 flush 行为"""
    from stream_adapters import relay_sse_stream

    # 模拟 200 行 SSE 数据
    sse_lines = []
    for i in range(200):
        sse_lines.append(f'data: {{"id":"chatcmpl-{i}","choices":[{{"delta":{{"content":"token {i} "}}}}]}}\n\n'.encode())
    sse_lines.append(b'data: [DONE]\n\n')

    class FakeUpstream:
        def __iter__(self):
            for line in sse_lines:
                yield line

    class CountingWfile:
        """计数 wfile - 统计 write 和 flush 调用次数"""
        def __init__(self):
            self.data = io.BytesIO()
            self.write_count = 0
            self.flush_count = 0
            self.total_bytes = 0

        def write(self, data):
            self.data.write(data)
            self.write_count += 1
            self.total_bytes += len(data)

        def flush(self):
            self.flush_count += 1

    wfile = CountingWfile()
    upstream = FakeUpstream()
    usage = relay_sse_stream(upstream, wfile, collect_usage=True, client_format="chat_completions")

    return {
        "name": "stream_adapters.relay_sse_stream (200 lines)",
        "write_count": wfile.write_count,
        "flush_count": wfile.flush_count,
        "total_bytes": wfile.total_bytes,
        "flush_ratio": f"{wfile.flush_count}/{wfile.write_count}" if wfile.write_count else "N/A",
    }


# ── 基准测试 5: stream_adapters.py _usage_from_sse_line ────────

def bench_usage_from_sse_line():
    """测试 _usage_from_sse_line 解析性能"""
    from stream_adapters import _usage_from_sse_line

    # 混合 SSE 行: 大部分不含 usage, 少数含 usage
    lines = []
    for i in range(200):
        lines.append(f'data: {{"id":"chatcmpl-{i}","choices":[{{"delta":{{"content":"token {i}"}}}}]}}\n'.encode())
    # 添加几行含 usage 的
    lines.append(b'data: {"usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150}}\n')
    lines.append(b'data: {"usage":{"prompt_tokens":200,"completion_tokens":100,"total_tokens":300}}\n')
    lines.append(b': comment\n')
    lines.append(b'\n')

    def parse_all():
        for line in lines:
            _usage_from_sse_line(line)

    return _run_bench("stream_adapters._usage_from_sse_line (204 lines)", parse_all, iterations=2000)


# ── 基准测试 6: router.py provider_supports_model 缓存 ─────────

def bench_router_provider_support():
    """测试 router 的 provider_supports_model 调用性能"""
    from router import UpstreamRouter

    cfg = {
        "providers": {
            f"provider-{i}": {
                "base_url": f"https://provider-{i}.example",
                "keys": [f"key-{i}"],
                "enabled": True,
            }
            for i in range(10)
        },
        "routing": {
            "default_provider_pool": [f"provider-{i}" for i in range(10)],
            "max_attempts": 3,
        },
        "models": {},
    }
    router = UpstreamRouter(cfg)

    # 预热路由器状态
    for i in range(10):
        try:
            list(router.iter_attempts("gpt-4", False, f"warmup-{i}"))
        except Exception:
            pass

    # 测试多次调用 iter_attempts
    def route():
        try:
            list(router.iter_attempts("gpt-4", False, "bench-req"))
        except Exception:
            pass

    return _run_bench("router.iter_attempts (10 providers)", route, iterations=500)


# ── 基准测试 7: history_store.py 连接复用 ─────────────────────

def bench_history_store_connection():
    """测试 history_store 连接管理性能"""
    from history_store import RequestHistoryStore

    tmpdir = tempfile.mkdtemp()
    db_path = os.path.join(tmpdir, "bench.sqlite3")

    cfg = {
        "observability": {
            "history": {
                "enabled": True,
                "path": db_path,
                "retention_days": 30,
            }
        }
    }
    store = RequestHistoryStore(cfg)
    store.initialize()

    # 填充一些数据
    for i in range(50):
        item = _make_recent_item(i)
        store.record_request(item)

    # 等待异步写入完成
    time.sleep(0.5)

    # 测试 list_requests 性能
    def list_reqs():
        store.list_requests(limit=50)

    return _run_bench("history_store.list_requests (50 records)", list_reqs, iterations=200)


# ── 基准测试 8: observability.py 并发 snapshot ─────────────────

def bench_concurrent_snapshot():
    """测试多线程并发调用 snapshot 的性能"""
    from observability import ProxyObservability

    cfg = {"observability": {"recent_requests_limit": 200}}
    obs = ProxyObservability(cfg)

    for i in range(200):
        rid = f"req-{i:04d}"
        obs.record_request_start(
            rid, client_format="chat_completions", endpoint="chat_completions",
            model=f"model-{i % 10}", stream=i % 2 == 0, path="/v1/chat/completions",
        )
        obs.record_request_end(rid, status_code=200)

    barrier = threading.Barrier(4)
    results = [None] * 4

    def worker(idx):
        barrier.wait()
        t0 = time.perf_counter_ns()
        for _ in range(100):
            obs.snapshot()
        t1 = time.perf_counter_ns()
        results[idx] = t1 - t0

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    total_ns = sum(results)
    max_ns = max(results)
    min_ns = min(results)

    return {
        "name": "observability.snapshot() (4 concurrent threads x 100 calls)",
        "total_ms": total_ns / 1e6,
        "max_thread_ms": max_ns / 1e6,
        "min_thread_ms": min_ns / 1e6,
        "avg_thread_ms": (total_ns / 4) / 1e6,
    }


# ── 主函数 ──────────────────────────────────────────────────

def main():
    print("=" * 80)
    print("  性能基准测试 — 量化测量优化效果")
    print("=" * 80)
    print()

    benchmarks = [
        ("1. observability.snapshot()", bench_observability_snapshot),
        ("2. observability.snapshot_lite()", bench_observability_snapshot_lite),
        ("3. observability.provider_activity_summary()", bench_provider_activity_summary),
        ("4. stream_adapters.relay_sse_stream flush", bench_relay_sse_stream),
        ("5. stream_adapters._usage_from_sse_line", bench_usage_from_sse_line),
        ("6. router.iter_attempts (缓存效果)", bench_router_provider_support),
        ("7. history_store.list_requests (连接复用)", bench_history_store_connection),
        ("8. observability.snapshot() 并发", bench_concurrent_snapshot),
    ]

    results = []
    for label, func in benchmarks:
        print(f"  运行: {label} ...", end=" ", flush=True)
        try:
            result = func()
            results.append(result)
            print("完成")
        except Exception as e:
            print(f"失败: {e}")
            import traceback
            traceback.print_exc()
            results.append({"name": label, "error": str(e)})

    print()
    print("=" * 80)
    print("  详细结果")
    print("=" * 80)

    for r in results:
        print()
        if "error" in r:
            print(f"  [X] {r['name']}: ERROR - {r['error']}")
            continue

        name = r.get("name", "unknown")
        print(f"  [BENCH] {name}")

        if "avg_ns" in r:
            print(f"     迭代次数:   {r['iterations']}")
            print(f"     总耗时:     {r['total_ms']:.2f} ms")
            print(f"     平均:       {_fmt_us(r['avg_ns'])}")
            print(f"     P50:        {_fmt_us(r['p50_ns'])}")
            print(f"     P95:        {_fmt_us(r['p95_ns'])}")
            print(f"     P99:        {_fmt_us(r['p99_ns'])}")
            print(f"     最小:       {_fmt_us(r['min_ns'])}")
            print(f"     最大:       {_fmt_us(r['max_ns'])}")
        elif "total_ms" in r and "avg_thread_ms" in r:
            print(f"     总耗时:     {r['total_ms']:.2f} ms")
            print(f"     最慢线程:   {r['max_thread_ms']:.2f} ms")
            print(f"     最快线程:   {r['min_thread_ms']:.2f} ms")
            print(f"     平均线程:   {r['avg_thread_ms']:.2f} ms")
        else:
            for k, v in r.items():
                if k != "name":
                    print(f"     {k}: {v}")

    # 输出 JSON 以便对比
    print()
    print("=" * 80)
    print("  JSON 输出 (用于优化前后对比)")
    print("=" * 80)
    print(json.dumps(results, indent=2, default=str, ensure_ascii=False))


if __name__ == "__main__":
    main()
