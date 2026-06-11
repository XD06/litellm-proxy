# Format Routing and Conversion Plan

## Goal

Build the proxy around three canonical API formats:

- OpenAI Chat Completions: `/v1/chat/completions`
- OpenAI Responses: `/v1/responses`
- Anthropic Messages: `/v1/messages`

The final client request path selects the canonical format the proxy should expose to that client. Providers can use whichever upstream interface they support; the proxy handles conversion, provider/key rotation, retry, cooldown, and runtime controls.

Web UI work is explicitly deferred. The current priority is:

1. Format conversion.
2. Provider/key rotation.
3. Runtime control and policy.
4. Web control console.

## Client-Facing Namespace Semantics

The preferred client-facing contract is a unified `/v1` base URL. Client SDKs append their own endpoint path, and the proxy classifies the final path.

| Client base URL | Canonical client protocol | Canonical endpoint |
| --- | --- | --- |
| `http://ip:port/v1` | OpenAI Chat Completions | `/v1/chat/completions` |
| `http://ip:port/v1` | OpenAI Responses | `/v1/responses` |
| `http://ip:port` or client-specific `/v1` handling | Anthropic Messages | `/v1/messages` |

The client may also send a full endpoint URL. These should be treated equivalently:

| Client request path | Interpreted as |
| --- | --- |
| `/v1/chat/completions` | Chat Completions client format |
| `/v1` plus a client-side `/chat/completions` suffix | Chat Completions client format |
| `/v1/responses` | Responses client format |
| `/v1` plus a client-side `/responses` suffix | Responses client format |
| `/v1/messages` | Anthropic Messages client format |
| `/v1/messages/count_tokens` | Anthropic token counting |
| `/openai/v1/responses` | Responses compatibility alias |
| `/anthropic/v1/messages` | Anthropic Messages compatibility alias |

`/openai` remains Responses-only for backward compatibility. `/openai/v1/chat/completions` is not a primary route and should not be treated as the Chat Completions entry.

The shared `/v1` paths are now permanent client-facing API surface:

- `/v1/messages`
- `/v1/messages/count_tokens`
- `/v1/responses`
- `/v1/models`

## Core Routing Model

Each request should be classified into a `RequestFormat` and an `EndpointKind`.

Suggested values:

```text
RequestFormat:
  chat_completions
  responses
  anthropic_messages

EndpointKind:
  generate
  count_tokens
  models
  health
```

This classification should happen before body parsing and before provider selection.

After classification, the proxy chooses a provider attempt using the existing router, but the attempt must include an upstream API format, not only provider/key/model.

Future `Attempt` shape:

```text
Attempt:
  provider
  key
  provider_model
  upstream_format
  url
  headers
  proxy_url
```

## Provider Capability Model

Current provider config assumes an OpenAI Chat Completions-compatible upstream. That is not enough once Responses and Anthropic Messages are first-class formats.

Each provider should be able to declare supported upstream formats:

```jsonc
{
  "providers": {
    "example": {
      "base_url": "https://api.example.com",
      "keys": ["..."],
      "formats": {
        "chat_completions": {
          "enabled": true,
          "path": "/v1/chat/completions"
        },
        "responses": {
          "enabled": false,
          "path": "/v1/responses"
        },
        "anthropic_messages": {
          "enabled": false,
          "path": "/v1/messages"
        }
      }
    }
  }
}
```

Backward compatibility rule:

- If `formats` is missing, treat the provider as `chat_completions` using the existing `chat_completions_path`.
- Existing configs should continue to work.
- If a provider gives a full endpoint URL, split it into `base_url` plus the matching format path.
- Current inference rules also recognize common base URL hints:
  - URLs containing `anthropic` default to `anthropic_messages` with `/v1/messages`.
  - URLs containing `responses`, `response`, or `codex` default to `responses` with `/v1/responses`.
  - A trailing `/v1` defaults to Chat Completions and is stripped from `base_url`.

## Conversion Matrix

The proxy should support conversion between all three canonical formats, but implementation can be staged.

There are nine client/upstream format combinations:

- Three same-format combinations are pass-through: Chat -> Chat, Responses -> Responses, Anthropic -> Anthropic.
- Six cross-format combinations require conversion:
  - Chat client -> Responses upstream.
  - Chat client -> Anthropic upstream.
  - Responses client -> Chat upstream.
  - Responses client -> Anthropic upstream.
  - Anthropic client -> Chat upstream.
  - Anthropic client -> Responses upstream.

Each cross-format combination is really a pair of conversions: client request -> upstream request, and upstream response/events -> client response/events. Streaming and tool-call deltas make this more complex than a simple JSON field rename.

| Client format | Preferred upstream format | Fallback conversion |
| --- | --- | --- |
| Chat Completions | Chat Completions | Responses or Messages -> Chat Completions |
| Responses | Responses | Chat Completions or Messages -> Responses |
| Anthropic Messages | Anthropic Messages | Chat Completions or Responses -> Messages |

Initial practical order:

1. Chat Completions client -> Chat Completions upstream.
2. Anthropic Messages client -> Chat Completions upstream -> Anthropic Messages client.
3. Responses client -> Chat Completions upstream -> Responses client.
4. Responses streaming conversion.
5. Native upstream Responses and native upstream Anthropic Messages support.
6. Cross-format fallbacks between all three formats.

When the client format and selected upstream format are the same, the proxy should pass the request/response through without conversion, apart from model/path/header adjustments required for routing.

## Internal Adapter Design

Avoid pairwise conversion explosion where every format directly knows every other format.

Recommended internal split:

```text
client request
  -> parse namespace/path
  -> decode client format
  -> normalized request/events
  -> choose provider + upstream format
  -> encode upstream request
  -> upstream response/events
  -> normalized response/events
  -> encode client response format
```

Existing modules already move in this direction:

- `request_routes.py`: path classification
- `format_adapters.py`: central non-streaming format conversion registry
- `protocol_adapters.py`: non-stream JSON conversion
- `stream_adapters.py`: SSE event conversion and relay
- `model_registry.py`: model listing and provider model mapping
- `router.py`: provider/key selection and cooldown
- `upstream_client.py`: upstream HTTP calls

The next adapters should be explicit:

```text
chat_completions_adapter.py
responses_adapter.py
anthropic_messages_adapter.py
```

## Streaming Rules

Streaming must remain first-class. Avoid buffering full outputs unless the target format cannot be streamed yet.

Rules:

- Chat Completions -> Chat Completions: relay upstream SSE directly.
- Chat Completions -> Anthropic Messages: current `stream_openai_sse_to_anthropic`.
- Chat Completions -> Responses: current `stream_openai_sse_to_responses`.
- Responses -> Chat Completions: current `stream_responses_sse_to_openai_chat`.
- Responses -> Responses: relay upstream SSE directly.
- Anthropic Messages -> Anthropic Messages: relay upstream SSE directly.
- Anthropic Messages -> Responses: current `stream_anthropic_sse_to_responses`.
- Responses -> Anthropic Messages: current `stream_responses_sse_to_anthropic`.
- Anthropic Messages -> Chat Completions: current `stream_anthropic_sse_to_openai_chat`.

Compatibility notes:

- Chat Completions -> Responses keeps `reasoning_content`/`reasoning`/`thinking` deltas as a Responses `reasoning` output item.
- Responses -> Chat Completions and Responses -> Anthropic Messages accept `response.reasoning_summary_text.delta`, `response.reasoning_summary.delta`, and `response.reasoning_text.delta` as reasoning stream variants.
- Responses output item order is significant. When one stream contains reasoning, text, and function calls, each item must receive a distinct `output_index` in emitted SSE events and in the final `response.completed.output` array.

For any streaming path that is not implemented, return a clear 501 rather than silently buffering or degrading behavior.

Current allowed streaming fallback sets:

| Client stream format | Allowed upstream stream formats |
| --- | --- |
| Chat Completions | Chat Completions, Responses, Anthropic Messages |
| Responses | Responses, Chat Completions, Anthropic Messages |
| Anthropic Messages | Anthropic Messages, Chat Completions, Responses |

If routing cannot find an attempt in the allowed set, the handler returns 501 before sending SSE headers.

## Routing and Retry Semantics

Provider rotation should remain format-aware.

A provider attempt is valid only if:

- Provider is enabled.
- Key is available.
- Provider supports the requested model.
- Provider supports the selected upstream format, or a configured fallback conversion path exists.

Selection preference:

- Prefer a provider that natively supports the client-requested format.
- If multiple native providers are available, apply normal provider/key routing rules.
- If native attempts fail or are unavailable, fall back to compatible providers that require conversion.
- Same-format attempts are pass-through and should not enter the conversion layer.

Retry policy should not change:

- Retry network errors, 429, and retryable 5xx.
- Cool down keys/providers as before.
- Stop early on client errors and model-not-found errors.
- Do not transparently retry once a streaming response has started.

## Runtime Control Scope

Before building the web console, runtime controls should be represented as config/state concepts:

- Enable/disable providers.
- Enable/disable keys.
- Provider weights.
- Per-format provider capability.
- Per-model routes.
- Cooldown visibility.
- Timeout policy.
- Request log level.
- Debug disk logging.

This gives the future web console something concrete to read and modify.

## Implementation Phases

### Phase 1: Lock the routing contract

- Update route classification to match the namespace semantics in this document.
- Preserve legacy endpoints.
- Add tests for base URL and full-path variants.
- Ensure `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/openai/v1/responses`, and `/anthropic/v1/messages` are unambiguous.

Status: completed in the current codebase. Route tests and HTTP dispatch tests cover `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/anthropic/v1/messages`, `/openai/v1/responses`, and rejection of `/openai/v1/chat/completions`.

### Phase 2: Formalize provider formats

- Extend provider config normalization to support `formats`.
- Keep backward compatibility with `chat_completions_path`.
- Extend `Attempt` with `upstream_format`.
- Add tests for format-aware provider filtering.

Status: completed for config normalization and router candidate selection. Providers now normalize into `formats`, `Attempt` includes `upstream_format`, and router selection can prefer the client-native upstream format before allowed fallback formats. Existing handlers still opt into only the upstream formats they can safely encode/decode.

### Phase 3: Responses non-streaming conversion

- Implement Responses request -> Chat Completions payload.
- Implement Chat Completions response -> Responses response.
- Wire `/v1/responses` and `/openai/v1/responses` non-streaming.
- Add fixture tests.

Status: completed for non-streaming text and function-tool basics. `/v1/responses` and `/openai/v1/responses` now support native Responses upstream pass-through, Chat Completions fallback conversion, and Anthropic fallback conversion for non-streaming requests.

### Phase 4: Responses streaming conversion

- Implement Chat Completions SSE -> Responses SSE.
- Return 501 for unsupported streaming conversion paths until implemented.
- Add stream fixture tests.

Status: completed for the current compatibility target: same-format stream pass-through plus all six cross-format stream adapters.

### Phase 5: Native upstream format support

- Add provider support for native Responses.
- Add provider support for native Anthropic Messages if needed.
- Prefer native upstream format when available.
- Fall back through conversion only when native format is unavailable.

Status: partially completed. Native Responses pass-through is wired for `/v1/responses` and `/openai/v1/responses`, and native Anthropic Messages pass-through is wired for `/v1/messages` and `/anthropic/v1/messages`. Both routes prefer same-format upstream attempts before Chat Completions fallback where that fallback is implemented.

Additional current status: non-streaming `/v1/chat/completions` can fall back through native Responses and native Anthropic Messages upstreams. Streaming cross-format fallback is wired through implemented adapters for all three client formats and all three upstream formats.

The non-streaming adapter registry now covers all nine format combinations. Same-format combinations are pass-through. The two direct pairs that were not exposed before, Responses -> Anthropic and Anthropic -> Responses, are composed through Chat Completions internally for now.

Stream boundary status: completed. Chat, Responses, and Anthropic stream handlers return 501 when no upstream stream candidate exists. They no longer reject Responses/Anthropic upstreams solely because the client requested Chat streaming.

### Phase 6: Runtime control model

- Add in-memory status snapshot for provider/key/model/format health.
- Expose a local admin API.
- Only then build the web console.

## Current Understanding

The user's intended mapping is:

- The final request path decides the client format.
- `/v1/chat/completions` means Chat Completions.
- `/v1/responses` means Responses.
- `/v1/messages` means Anthropic Messages.
- `/openai/v1/responses` and `/anthropic/v1/messages` remain compatibility aliases.
- `/openai/v1/chat/completions` stays unsupported to avoid ambiguous namespace behavior.
- Model aliases are global by default; namespace-specific overrides can be added later if needed.
- Conversion comes first.
- Provider/key rotation and runtime controls come next.
- Web console comes later.

## Decisions

1. `/openai` represents Responses, not Chat Completions.
2. Legacy `/v1/messages` remains short-term only.
3. Native upstream format is preferred. If client and upstream formats match, pass through without conversion.
4. Model aliases are global by default.
5. Request bodies are not fully logged by default; full body capture is debug-only.
6. Metrics start lightweight with in-memory data and can later move to SQLite.
7. Runtime edits write to an overlay config instead of directly mutating the base config.
8. Admin APIs require an admin key.
9. Full API keys are never returned by status or admin APIs.
10. Web console interface design is deferred; only backend interfaces are planned now.

## Real Provider Notes

Current real provider shape observed on 2026-06-09:

- `deepseek`: native Anthropic Messages, supports `deepseek-v4-flash` and `deepseek-v4-pro`.
- `opencode`: native Chat Completions, supports `deepseek-v4-flash`, `deepseek-v4-pro`, and others.
- `rawchat`: native Responses, supports `gpt-5.5` and related models from its `/v1/models` list.

This means format routing can be correct while model routing must still be model-aware. The current model registry keeps manual `provider_model_map` separate from automatic `provider_model_capabilities`, performs conservative model normalization, and filters route attempts by discovered provider support. Safe normalization covers case differences, vendor prefixes, and space/underscore/hyphen variants, so a provider model such as `deepseek-ai/DeepSeek_V4 Flash` becomes canonical `deepseek-v4-flash` while upstream requests still use the provider's real id. Example: after union discovery, `rawchat` should not be selected for canonical `deepseek-v4-flash` unless an explicit manual mapping says so.

Routing hardening on 2026-06-11: once any reliable provider capability snapshot is available, providers without a matching discovered model are excluded by default. Unknown providers can still participate only when no capability snapshot exists yet, or when that provider explicitly sets `assume_supports_unknown_models=true`.

Real compatibility smoke on 2026-06-09:

- Union model discovery returned 27 models.
- Native format routes succeeded for all three configured providers: deepseek Anthropic Messages, opencode Chat Completions, and rawchat Responses.
- Non-streaming cross-format routes returned HTTP 200 across the exercised matrix. Same-format routes remain pass-through.
- Common function/tool calls work for non-streaming native and fallback routes.
- DeepSeek thinking-mode providers reject forced `tool_choice`; the proxy now detects that upstream error, records `provider_compat` with reason `tool_choice_auto_retry`, downgrades to auto once, and retries the same provider/key without applying cooldown.
- Empty visible output handling is now part of non-streaming routing: after converting the upstream response into the client target format, the proxy checks for no visible text/tool call, presence of reasoning/thinking, and length truncation (`finish_reason=length`, `stop_reason=max_tokens`, or Responses incomplete state). If all three are true, the attempt is recorded as `empty_visible_output` and routing continues to the next provider without key cooldown.
- Real-test nuance: DeepSeek Anthropic native returned visible text at `1024` output tokens; the reasoning-only cutoff was reproduced on an opencode Chat Completions upstream path. Treat this as provider/path-specific behavior rather than a universal DeepSeek native limitation.
- Streaming empty-output detection is intentionally not implemented yet because once SSE headers/events are sent the proxy cannot transparently switch providers without a separate buffering strategy.
- Stream support boundary is explicit: no-candidate stream requests return 501 before SSE starts. The current 3 x 3 stream matrix covers common text, reasoning/thinking, function/tool-call argument deltas, stop reason mapping, and usage accounting. Hosted tools, multimodal stream chunks, and provider-specific extension events remain future hardening work.
- Real stream smoke on 2026-06-10 verified `/openai/v1/responses` stream fallback through the `deepseek` Anthropic Messages upstream for `deepseek-v4-flash`; the proxy returned Responses SSE `response.created`, text deltas, and `response.completed`.
- Real stream smoke on 2026-06-10 verified `/anthropic/v1/messages` stream fallback through the `rawchat` Responses upstream for `gpt-5.5`; the proxy returned Anthropic SSE `message_start`, text deltas, and `message_stop`.
- Real stream smoke on 2026-06-10 verified `/v1/chat/completions` stream fallback through both `rawchat` Responses for `gpt-5.5` and `deepseek` Anthropic Messages for `deepseek-v4-flash`; both returned Chat Completions SSE chunks and `[DONE]`.
