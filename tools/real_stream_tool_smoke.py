#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:4894"
DEFAULT_CHAT_MODEL = "deepseek-v4-flash"
DEFAULT_RESPONSES_MODEL = "gpt-5.5"


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    client_format: str
    path: str
    model: str
    build_payload: Callable[[str], Dict[str, Any]]


def weather_parameters() -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "location": {"type": "string"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
        },
        "required": ["location"],
    }


def chat_tool_payload(model: str) -> Dict[str, Any]:
    return {
        "model": model,
        "stream": True,
        "temperature": 0.1,
        "max_tokens": 220,
        "messages": [
            {
                "role": "user",
                "content": "Use the provided get_weather tool with location=Shanghai and unit=celsius. Do not answer directly.",
            }
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get weather for a city.",
                    "parameters": weather_parameters(),
                },
            }
        ],
        "tool_choice": "auto",
    }


def responses_tool_payload(model: str) -> Dict[str, Any]:
    return {
        "model": model,
        "stream": True,
        "temperature": 0.1,
        "max_output_tokens": 220,
        "input": "Use the provided get_weather tool with location=Shanghai and unit=celsius. Do not answer directly.",
        "tools": [
            {
                "type": "function",
                "name": "get_weather",
                "description": "Get weather for a city.",
                "parameters": weather_parameters(),
            }
        ],
        "tool_choice": "auto",
    }


def messages_tool_payload(model: str) -> Dict[str, Any]:
    return {
        "model": model,
        "stream": True,
        "temperature": 0.1,
        "max_tokens": 220,
        "messages": [
            {
                "role": "user",
                "content": "Use the provided get_weather tool with location=Shanghai and unit=celsius. Do not answer directly.",
            }
        ],
        "tools": [
            {
                "name": "get_weather",
                "description": "Get weather for a city.",
                "input_schema": weather_parameters(),
            }
        ],
        "tool_choice": {"type": "auto"},
    }


def build_scenarios(chat_model: str, responses_model: str) -> List[Scenario]:
    return [
        Scenario(
            "chat_stream_tool_responses_model",
            "chat_completions",
            "/v1/chat/completions",
            responses_model,
            chat_tool_payload,
        ),
        Scenario(
            "responses_stream_tool_chat_model",
            "responses",
            "/openai/v1/responses",
            chat_model,
            responses_tool_payload,
        ),
        Scenario(
            "messages_stream_tool_responses_model",
            "anthropic_messages",
            "/anthropic/v1/messages",
            responses_model,
            messages_tool_payload,
        ),
    ]


def parse_sse(content: str) -> List[Tuple[str, Dict[str, Any]]]:
    events: List[Tuple[str, Dict[str, Any]]] = []
    current_event = ""
    data_lines: List[str] = []
    for raw in content.splitlines():
        if raw.startswith("event: "):
            current_event = raw[len("event: ") :].strip()
            continue
        if raw.startswith("data: "):
            data = raw[len("data: ") :].strip()
            if data == "[DONE]":
                events.append(("done", {"type": "done"}))
            elif data:
                data_lines.append(data)
            continue
        if raw == "":
            if data_lines:
                joined = "\n".join(data_lines)
                try:
                    payload = json.loads(joined)
                except json.JSONDecodeError:
                    payload = {"_unparsed": joined[:200]}
                event_name = current_event or str(payload.get("type") or "message")
                events.append((event_name, payload))
            current_event = ""
            data_lines = []
    if data_lines:
        joined = "\n".join(data_lines)
        try:
            payload = json.loads(joined)
        except json.JSONDecodeError:
            payload = {"_unparsed": joined[:200]}
        events.append((current_event or str(payload.get("type") or "message"), payload))
    return events


def summarize_stream(client_format: str, content: str) -> Dict[str, Any]:
    events = parse_sse(content)
    event_names = [name for name, _payload in events]
    tool_calls = 0
    argument_deltas = 0
    stop_reasons: List[str] = []
    chat_tool_keys = set()

    for event_name, payload in events:
        if client_format == "chat_completions":
            for choice in payload.get("choices") or []:
                delta = choice.get("delta") or {}
                calls = delta.get("tool_calls") or []
                if calls:
                    for call in calls:
                        key = call.get("index")
                        if key is None:
                            key = call.get("id")
                        if key is not None:
                            chat_tool_keys.add(str(key))
                        fn = call.get("function") or {}
                        if fn.get("arguments"):
                            argument_deltas += 1
                if choice.get("finish_reason"):
                    stop_reasons.append(str(choice.get("finish_reason")))
        elif client_format == "responses":
            if event_name == "response.output_item.added":
                item = payload.get("item") or {}
                if item.get("type") == "function_call":
                    tool_calls += 1
            elif event_name == "response.function_call_arguments.delta":
                argument_deltas += 1
            elif event_name == "response.completed":
                response = payload.get("response") or {}
                if response.get("finish_reason"):
                    stop_reasons.append(str(response.get("finish_reason")))
                for item in response.get("output") or []:
                    if isinstance(item, dict) and item.get("type") == "function_call":
                        tool_calls = max(tool_calls, 1)
        elif client_format == "anthropic_messages":
            if event_name == "content_block_start":
                block = payload.get("content_block") or {}
                if block.get("type") == "tool_use":
                    tool_calls += 1
            elif event_name == "content_block_delta":
                delta = payload.get("delta") or {}
                if delta.get("type") == "input_json_delta":
                    argument_deltas += 1
            elif event_name == "message_delta":
                delta = payload.get("delta") or {}
                if delta.get("stop_reason"):
                    stop_reasons.append(str(delta.get("stop_reason")))

    if client_format == "chat_completions":
        tool_calls = len(chat_tool_keys)

    return {
        "bytes": len(content),
        "events": len(events),
        "has_done": "done" in event_names,
        "event_sample": sorted({name for name in event_names if name != "message"})[:10],
        "tool_calls": tool_calls,
        "argument_deltas": argument_deltas,
        "stop_reasons": stop_reasons[:5],
    }


def request_stream(url: str, payload: Dict[str, Any], timeout_s: int) -> Dict[str, Any]:
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "User-Agent": "real-stream-tool-smoke/1.0",
            "X-Request-ID": f"stream-tool-{uuid.uuid4().hex}",
        },
        method="POST",
    )
    with urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read()
        return {"status_code": resp.status, "content": raw.decode("utf-8", errors="replace")}


def run_scenario(base_url: str, scenario: Scenario, timeout_s: int) -> Dict[str, Any]:
    started = time.perf_counter()
    url = base_url.rstrip("/") + scenario.path
    try:
        response = request_stream(url, scenario.build_payload(scenario.model), timeout_s)
        duration_ms = int((time.perf_counter() - started) * 1000)
        summary = summarize_stream(scenario.client_format, response["content"])
        ok = 200 <= int(response["status_code"]) < 300 and summary["tool_calls"] > 0 and summary["argument_deltas"] > 0
        return {
            "id": scenario.scenario_id,
            "client_format": scenario.client_format,
            "path": scenario.path,
            "model": scenario.model,
            "ok": ok,
            "status_code": response["status_code"],
            "duration_ms": duration_ms,
            **summary,
        }
    except HTTPError as err:
        duration_ms = int((time.perf_counter() - started) * 1000)
        body = err.read().decode("utf-8", errors="replace")[:800]
        return {
            "id": scenario.scenario_id,
            "client_format": scenario.client_format,
            "path": scenario.path,
            "model": scenario.model,
            "ok": False,
            "status_code": err.code,
            "duration_ms": duration_ms,
            "error": body,
        }
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as err:
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "id": scenario.scenario_id,
            "client_format": scenario.client_format,
            "path": scenario.path,
            "model": scenario.model,
            "ok": False,
            "status_code": 0,
            "duration_ms": duration_ms,
            "error": str(err)[:800],
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run bounded real-upstream stream tool-call smoke tests.")
    parser.add_argument("--base-url", default=os.environ.get("PROXY_STREAM_TOOL_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--chat-model", default=os.environ.get("PROXY_STREAM_TOOL_CHAT_MODEL", DEFAULT_CHAT_MODEL))
    parser.add_argument(
        "--responses-model",
        default=os.environ.get("PROXY_STREAM_TOOL_RESPONSES_MODEL", DEFAULT_RESPONSES_MODEL),
    )
    parser.add_argument("--timeout-s", type=int, default=int(os.environ.get("PROXY_STREAM_TOOL_TIMEOUT_S", "120")))
    parser.add_argument("--only", default="", help="Comma-separated scenario ids to run.")
    parser.add_argument("--max-cases", type=int, default=0, help="Limit selected cases. 0 means no limit.")
    parser.add_argument("--run", action="store_true", help="Required to send real upstream requests.")
    parser.add_argument("--output", default="", help="Optional JSON report path.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    scenarios = build_scenarios(args.chat_model, args.responses_model)
    if args.only:
        wanted = {item.strip() for item in args.only.split(",") if item.strip()}
        scenarios = [scenario for scenario in scenarios if scenario.scenario_id in wanted]
    if args.max_cases > 0:
        scenarios = scenarios[: args.max_cases]

    report: Dict[str, Any] = {
        "base_url": args.base_url,
        "chat_model": args.chat_model,
        "responses_model": args.responses_model,
        "dry_run": not bool(args.run),
        "started_at": int(time.time()),
        "results": [],
    }

    if not args.run:
        report["planned"] = [
            {
                "id": scenario.scenario_id,
                "client_format": scenario.client_format,
                "path": scenario.path,
                "model": scenario.model,
            }
            for scenario in scenarios
        ]
    else:
        for scenario in scenarios:
            result = run_scenario(args.base_url, scenario, args.timeout_s)
            report["results"].append(result)
            status = "OK" if result.get("ok") else "FAIL"
            print(
                f"{status} {result['id']} status={result.get('status_code')} duration_ms={result.get('duration_ms')} "
                f"tool_calls={result.get('tool_calls', 0)} argument_deltas={result.get('argument_deltas', 0)}",
                flush=True,
            )

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
            f.write("\n")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))

    if args.run and any(not item.get("ok") for item in report["results"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
