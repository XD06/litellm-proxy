#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional
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
    kind: str
    build_payload: Callable[[str], Dict[str, Any]]


def chat_payload(model: str) -> Dict[str, Any]:
    return {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": "In three concise sentences, explain how a proxy can route one model across multiple upstream providers.",
            }
        ],
        "temperature": 0.2,
        "max_tokens": 220,
        "stream": False,
    }


def responses_payload(model: str) -> Dict[str, Any]:
    return {
        "model": model,
        "input": "In three concise sentences, explain how a proxy can route one model across multiple upstream providers.",
        "temperature": 0.2,
        "max_output_tokens": 220,
        "stream": False,
    }


def messages_payload(model: str) -> Dict[str, Any]:
    return {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": "In three concise sentences, explain how a proxy can route one model across multiple upstream providers.",
            }
        ],
        "temperature": 0.2,
        "max_tokens": 220,
        "stream": False,
    }


def chat_tool_payload(model: str) -> Dict[str, Any]:
    payload = chat_payload(model)
    payload["messages"] = [
        {
            "role": "user",
            "content": "Call the provided tool with location=Shanghai and unit=celsius. Do not answer directly.",
        }
    ]
    payload["tools"] = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get weather for a city.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"},
                        "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                    },
                    "required": ["location"],
                },
            },
        }
    ]
    payload["tool_choice"] = "auto"
    return payload


def responses_tool_payload(model: str) -> Dict[str, Any]:
    payload = responses_payload(model)
    payload["input"] = "Call the provided tool with location=Shanghai and unit=celsius. Do not answer directly."
    payload["tools"] = [
        {
            "type": "function",
            "name": "get_weather",
            "description": "Get weather for a city.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["location"],
            },
        }
    ]
    payload["tool_choice"] = "auto"
    return payload


def messages_tool_payload(model: str) -> Dict[str, Any]:
    payload = messages_payload(model)
    payload["messages"] = [
        {
            "role": "user",
            "content": "Call the provided tool with location=Shanghai and unit=celsius. Do not answer directly.",
        }
    ]
    payload["tools"] = [
        {
            "name": "get_weather",
            "description": "Get weather for a city.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["location"],
            },
        }
    ]
    payload["tool_choice"] = {"type": "auto"}
    return payload


def build_scenarios(chat_model: str, responses_model: str, include_tools: bool) -> List[Scenario]:
    scenarios = [
        Scenario("chat_plain_deepseek", "chat_completions", "/v1/chat/completions", chat_model, "plain", chat_payload),
        Scenario("responses_plain_gpt", "responses", "/openai/v1/responses", responses_model, "plain", responses_payload),
        Scenario("messages_plain_deepseek", "anthropic_messages", "/anthropic/v1/messages", chat_model, "plain", messages_payload),
        Scenario("chat_cross_responses_model", "chat_completions", "/v1/chat/completions", responses_model, "plain", chat_payload),
        Scenario("responses_cross_deepseek", "responses", "/openai/v1/responses", chat_model, "plain", responses_payload),
        Scenario("messages_cross_deepseek", "anthropic_messages", "/anthropic/v1/messages", chat_model, "plain", messages_payload),
    ]
    if include_tools:
        scenarios.extend(
            [
                Scenario("chat_tool_deepseek", "chat_completions", "/v1/chat/completions", chat_model, "tool", chat_tool_payload),
                Scenario("responses_tool_gpt", "responses", "/openai/v1/responses", responses_model, "tool", responses_tool_payload),
                Scenario("messages_tool_deepseek", "anthropic_messages", "/anthropic/v1/messages", chat_model, "tool", messages_tool_payload),
            ]
        )
    return scenarios


def request_json(url: str, payload: Dict[str, Any], timeout_s: int) -> Dict[str, Any]:
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "real-upstream-matrix/1.0",
            "X-Request-ID": f"matrix-{uuid.uuid4().hex}",
        },
        method="POST",
    )
    with urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read()
        data = json.loads(raw.decode("utf-8", errors="replace")) if raw else {}
        return {"status_code": resp.status, "body": data}


def extract_visible_signal(client_format: str, body: Dict[str, Any]) -> Dict[str, Any]:
    text_parts: List[str] = []
    tool_calls = 0
    if client_format == "chat_completions":
        for choice in body.get("choices") or []:
            msg = (choice or {}).get("message") or {}
            content = msg.get("content")
            if isinstance(content, str):
                text_parts.append(content)
            tool_calls += len(msg.get("tool_calls") or [])
    elif client_format == "responses":
        output_text = body.get("output_text")
        if isinstance(output_text, str):
            text_parts.append(output_text)
        for item in body.get("output") or []:
            if not isinstance(item, dict):
                continue
            if item.get("type") in ("function_call", "tool_call"):
                tool_calls += 1
            for content in item.get("content") or []:
                if isinstance(content, dict) and isinstance(content.get("text"), str):
                    text_parts.append(content["text"])
    elif client_format == "anthropic_messages":
        for item in body.get("content") or []:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text" and isinstance(item.get("text"), str):
                text_parts.append(item["text"])
            if item.get("type") == "tool_use":
                tool_calls += 1
    text = "\n".join(part for part in text_parts if part)
    return {
        "visible_chars": len(text.strip()),
        "tool_calls": tool_calls,
        "sample": text.strip()[:240],
    }


def run_scenario(base_url: str, scenario: Scenario, timeout_s: int) -> Dict[str, Any]:
    url = base_url.rstrip("/") + scenario.path
    payload = scenario.build_payload(scenario.model)
    started = time.perf_counter()
    try:
        resp = request_json(url, payload, timeout_s)
        duration_ms = int((time.perf_counter() - started) * 1000)
        body = resp["body"]
        signal = extract_visible_signal(scenario.client_format, body if isinstance(body, dict) else {})
        ok = 200 <= int(resp["status_code"]) < 300 and (signal["visible_chars"] > 0 or signal["tool_calls"] > 0)
        return {
            "id": scenario.scenario_id,
            "client_format": scenario.client_format,
            "path": scenario.path,
            "model": scenario.model,
            "kind": scenario.kind,
            "ok": ok,
            "status_code": resp["status_code"],
            "duration_ms": duration_ms,
            **signal,
        }
    except HTTPError as err:
        duration_ms = int((time.perf_counter() - started) * 1000)
        body = err.read().decode("utf-8", errors="replace")[:1000]
        return {
            "id": scenario.scenario_id,
            "client_format": scenario.client_format,
            "path": scenario.path,
            "model": scenario.model,
            "kind": scenario.kind,
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
            "kind": scenario.kind,
            "ok": False,
            "status_code": 0,
            "duration_ms": duration_ms,
            "error": str(err)[:1000],
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a bounded real-upstream proxy regression matrix.")
    parser.add_argument("--base-url", default=os.environ.get("PROXY_MATRIX_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--chat-model", default=os.environ.get("PROXY_MATRIX_CHAT_MODEL", DEFAULT_CHAT_MODEL))
    parser.add_argument("--responses-model", default=os.environ.get("PROXY_MATRIX_RESPONSES_MODEL", DEFAULT_RESPONSES_MODEL))
    parser.add_argument("--timeout-s", type=int, default=int(os.environ.get("PROXY_MATRIX_TIMEOUT_S", "90")))
    parser.add_argument("--max-cases", type=int, default=0, help="Limit number of selected cases. 0 means no limit.")
    parser.add_argument("--only", default="", help="Comma-separated scenario ids to run.")
    parser.add_argument("--include-tools", action="store_true")
    parser.add_argument("--run", action="store_true", help="Required to send real upstream requests.")
    parser.add_argument("--output", default="", help="Optional JSON report path.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    scenarios = build_scenarios(args.chat_model, args.responses_model, args.include_tools)
    if args.only:
        wanted = {item.strip() for item in args.only.split(",") if item.strip()}
        scenarios = [scenario for scenario in scenarios if scenario.scenario_id in wanted]
    if args.max_cases > 0:
        scenarios = scenarios[: args.max_cases]

    report = {
        "base_url": args.base_url,
        "chat_model": args.chat_model,
        "responses_model": args.responses_model,
        "include_tools": bool(args.include_tools),
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
                "kind": scenario.kind,
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
                f"visible_chars={result.get('visible_chars', 0)} tool_calls={result.get('tool_calls', 0)}",
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
