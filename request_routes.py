#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class Route:
    family: str
    endpoint: str
    clean_path: str
    canonical_path: str
    implemented: bool = True
    legacy: bool = False

    @property
    def is_unknown(self) -> bool:
        return self.endpoint == "unknown"


def _split_namespace(clean_path: str) -> Tuple[str, str]:
    path = clean_path or "/"
    for namespace in ("anthropic", "openai"):
        prefix = f"/{namespace}"
        if path == prefix:
            return namespace, "/"
        if path.startswith(prefix + "/"):
            rest = path[len(prefix) :]
            return namespace, rest or "/"
    return "legacy", path


def classify_get(clean_path: str) -> Route:
    namespace, path = _split_namespace(clean_path)
    family_by_namespace = {
        "legacy": "chat_completions",
        "anthropic": "anthropic",
        "openai": "responses",
    }
    family = family_by_namespace.get(namespace, namespace)

    if namespace == "legacy" and path == "/":
        return Route("dashboard", "index.html", clean_path, "/")
    if namespace == "legacy" and path == "/health":
        return Route("shared", "health", clean_path, "/health")
    if namespace == "legacy" and (path == "/-/dashboard" or path.startswith("/-/dashboard/")):
        endpoint = path[len("/-/dashboard") :].strip("/") or "index.html"
        return Route("dashboard", endpoint, clean_path, path)
    if namespace == "legacy" and path.startswith("/-/admin/"):
        return Route("admin", path[len("/-/admin/") :], clean_path, path)
    if namespace in ("legacy", "anthropic", "openai") and path == "/v1/models":
        return Route(family, "models", clean_path, "/v1/models")

    return Route(family, "unknown", clean_path, path, implemented=False)


def classify_post(clean_path: str) -> Route:
    namespace, path = _split_namespace(clean_path)
    family_by_namespace = {
        "legacy": "chat_completions",
        "anthropic": "anthropic",
        "openai": "responses",
    }
    family = family_by_namespace.get(namespace, namespace)

    if namespace == "legacy" and path.startswith("/-/admin/"):
        return Route("admin", path[len("/-/admin/") :], clean_path, path)

    if namespace == "legacy" and path == "/v1/chat/completions":
        return Route("chat_completions", "chat_completions", clean_path, "/v1/chat/completions")

    if namespace == "legacy" and path == "/v1/responses":
        return Route("responses", "responses", clean_path, "/v1/responses")

    if namespace == "legacy" and "count_tokens" in path:
        return Route("anthropic", "count_tokens", clean_path, "/v1/messages/count_tokens", legacy=True)
    if namespace == "anthropic" and "count_tokens" in path:
        return Route("anthropic", "count_tokens", clean_path, "/v1/messages/count_tokens")

    if namespace == "legacy" and path == "/v1/messages":
        return Route("anthropic", "messages", clean_path, "/v1/messages", legacy=True)
    if namespace == "anthropic" and path == "/v1/messages":
        return Route("anthropic", "messages", clean_path, "/v1/messages")

    if namespace == "openai" and path == "/v1/responses":
        return Route("responses", "responses", clean_path, path)

    return Route(family, "unknown", clean_path, path, implemented=False)
