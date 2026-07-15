from __future__ import annotations

import hashlib
import json
import re
import uuid
from typing import Any, Dict, Iterable, List, Optional

from .errors import ConversionError
from .model import ContentBlock


TOOL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def parse_json_object(value: Any, *, field: str) -> Dict[str, Any]:
    if value is None or value == "":
        return {}
    if isinstance(value, dict):
        return dict(value)
    if not isinstance(value, str):
        raise ConversionError(
            f"{field} must be a JSON object string",
            code="invalid_tool_arguments",
            field=field,
        )
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise ConversionError(
            f"{field} contains invalid JSON: {exc}",
            code="invalid_tool_arguments",
            field=field,
        ) from exc
    if not isinstance(parsed, dict):
        raise ConversionError(
            f"{field} must decode to a JSON object",
            code="invalid_tool_arguments",
            field=field,
        )
    return parsed


def content_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: List[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if item.get("type") in ("text", "input_text", "output_text", "summary_text"):
                    parts.append(str(item.get("text") or ""))
                elif "content" in item:
                    nested = content_text(item.get("content"))
                    if nested:
                        parts.append(nested)
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        return content_text([value])
    return str(value)


def reasoning_text(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("summary", "content", "text"):
            text = content_text(value.get(key))
            if text:
                return text
        return ""
    return content_text(value)


def normalize_stop(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return list(value)
    raise ConversionError("stop sequences must be a string or array of strings", code="invalid_stop_sequences", field="stop")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def normalize_tool_schema(schema: Any) -> Dict[str, Any]:
    if not isinstance(schema, dict):
        return {"type": "object", "properties": {}}
    out = dict(schema)
    if out.get("type") != "object":
        out["type"] = "object"
        out.setdefault("properties", {})
    return out


def custom_tool_description(name: str, description: str, fmt: Any) -> str:
    out = str(description or "")
    if isinstance(fmt, dict):
        definition = str(fmt.get("definition") or "")
        syntax = str(fmt.get("syntax") or fmt.get("type") or "")
        if definition:
            out += f"\n\nFormat:\n```{syntax}\n{definition}\n```"
    return out


def wrap_custom_tool_input(value: Any) -> str:
    if isinstance(value, str):
        content = value
    elif value is None:
        content = ""
    else:
        content = json_dumps(value)
    return json_dumps({"content": content})


def unwrap_custom_tool_arguments(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = json_dumps(value)
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError, ValueError):
        return value
    if isinstance(parsed, dict) and "content" in parsed:
        return str(parsed.get("content") or "")
    return value


def sanitize_tool_name(name: str, used: Optional[set[str]] = None) -> str:
    raw = str(name or "")
    if TOOL_NAME_RE.fullmatch(raw) and (used is None or raw not in used):
        if used is not None:
            used.add(raw)
        return raw
    base = re.sub(r"[^a-zA-Z0-9_-]", "_", raw).strip("_") or "tool"
    base = base[:128]
    candidate = base
    if used is not None and candidate in used:
        suffix = "_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8]
        candidate = (base[: 128 - len(suffix)] + suffix)[:128]
    if used is not None:
        used.add(candidate)
    return candidate


def text_block(text: Any, *, source_format: str = "") -> ContentBlock:
    return ContentBlock(kind="text", text=str(text or ""), source_format=source_format)


def first_nonempty(values: Iterable[Any], default: Any = None) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return default
