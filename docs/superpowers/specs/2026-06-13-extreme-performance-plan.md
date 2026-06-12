# Implementation Plan: Extreme Performance & Concurrency Hardening

**Date:** 2026-06-13  
**Status:** In Progress  

This document tracks the step-by-step implementation, testing, and completion status of the performance optimizations.

---

## Task Checklist & Progress Log

### [x] Step 1: connection Pooling with `urllib3` in `upstream_client.py`
- [x] Refactor `__init__` to use thread-safe pooled `PoolManager`/`ProxyManager` instead of `urllib.request` Openers.
- [x] Implement `HTTPResponseLineWrapper` with mock `fp` property and `io.BufferedReader` line-buffered reader.
- [x] Add manual `urllib.error.HTTPError` creation and raising for non-2xx statuses.
- [x] Update socket timeout retrieval to support connection-based timeout adjustment.
- **Status:** Completed (2026-06-13)

### [x] Step 2: Connection Pooling verification & Tests
- [x] Add unit test case verifying that requests using the same proxy / direct reuse the same manager.
- [x] Verify that HTTPError raised by the client carries the correct properties (`code`, `reason`, `headers`, and reads error body bytes successfully via `read()`).
- [x] Run test suite.
- **Status:** Completed (2026-06-13)

### [x] Step 3: Asynchronous SQLite History Writes in `history_store.py`
- [x] Add bounded `queue.Queue` and daemon background worker thread to `RequestHistoryStore`.
- [x] Implement `_write_loop()` to process database inserts asynchronously on the background thread.
- [x] Modify `record_request()` to submit jobs to queue non-blockingly, dropping records safely under `queue.Full`.
- [x] Drain the queue in `clear()`.
- **Status:** Completed (2026-06-13)

### [x] Step 4: History Write verification & Tests
- [x] Write a test verifying asynchronous inserts and queue draining during clear operations.
- [x] Run tests.
- **Status:** Completed (2026-06-13)

### [x] Step 5: Asynchronous Diagnostic Logging in `sse2json.py`
- [x] Implement background logging queue and daemon writer thread.
- [x] Re-route `_record_failed_attempt` and `_upstream_error_diagnostics` to use the background writer.
- **Status:** Completed (2026-06-13)

### [x] Step 6: Final Integration & Regression Testing
- [x] Verify all existing unittest test cases pass: `python -m unittest discover -s tests`.
- [x] Run stream smoke tests to verify Mock `fp` compatibility: `python tools\real_stream_tool_smoke.py`.
- **Status:** Completed (2026-06-13)
