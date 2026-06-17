def _proxy_openai_responses(self, req, request_id, start_ts, path="/openai/v1/responses"):
        # Snapshot the live runtime once for whole-request consistency during
        # config hot-swap. See _proxy_openai_chat_completions for rationale.
        rt = _request_runtime()
        CONFIG = rt.config
        ROUTER = rt.router
        UPSTREAM_CLIENT = rt.upstream_client
        OBSERVABILITY = rt.observability
        is_stream = bool(req.get("stream", False))
        original_model = req.get("model", "")
        resolved_model = resolve_model(original_model or "")
        canonical_model = resolved_model
        OBSERVABILITY.record_request_start(
            request_id,
            client_format=RESPONSES,
            endpoint="responses",
            model=canonical_model,
            stream=is_stream,
            path=path,
        )
        print(f"[proxy] responses stream={is_stream} model={_hmodel(original_model)}", flush=True)
        if resolved_model != original_model:
            print(f"[proxy] model alias: {original_model} -> {resolved_model}", flush=True)

        allowed_formats = [RESPONSES, CHAT, ANTHROPIC]
        attempt_errors = []
        log_each = bool((CONFIG.get("observability") or {}).get("log_provider_on_each_request", True))
        has_attempt = False
        total_start = time.time()
        routing_cfg = CONFIG.get("routing") or {}
        connect_t = int(routing_cfg.get("connect_timeout_s", 15))
        read_t = int(routing_cfg.get("read_timeout_s", 120))
        first_byte_t = int(routing_cfg.get("first_token_timeout_s", 30))  # Total budget before first stream event.
        max_attempts = int(routing_cfg.get("max_attempts", 6))
        max_budget = (connect_t + read_t) * min(3, max(1, max_attempts))
        converted_payloads = {}

        for attempt in ROUTER.iter_attempts(
            canonical_model,
            is_stream,
            request_id,
            client_headers=self.headers,
            client_format="responses",
            allowed_upstream_formats=allowed_formats,
        ):
            has_attempt = True
            elapsed = time.time() - total_start
            remaining = max(connect_t, int(max_budget - elapsed))
            key_masked = ROUTER.masked_key(attempt.key)
            if log_each:
                proxy_tag = f" proxy={attempt.proxy_url}" if attempt.proxy_url else " proxy=direct"
                print(
                    f"[proxy] req={request_id} attempt={attempt.attempt_no} {_hprov(attempt.provider)} {_hkey(key_masked)}{proxy_tag} format={attempt.upstream_format} model={_hmodel(canonical_model)} {_harrow('->')} {_hmodel(attempt.provider_model)}",
                    flush=True,
                )

            attempt_started = time.time()
            fmt = attempt.upstream_format
            if fmt not in converted_payloads:
                try:
                    converted_payloads[fmt] = convert_request(
                        RESPONSES,
                        fmt,
                        req,
                        resolve_model=resolve_model,
                    )
                except ValueError as e:
                    _record_request_conversion_failure(request_id, attempt, RESPONSES, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    continue
            payload = dict(converted_payloads[fmt])
            payload["model"] = attempt.provider_model
            payload["stream"] = is_stream if attempt.upstream_format in (RESPONSES, CHAT, ANTHROPIC) else False
            _force_chat_reasoning_content_if_needed(attempt, payload, log_each=log_each)
            _force_anthropic_thinking_if_needed(attempt, payload, log_each=log_each)

            response_started = False
            upstream_conn = None
            try:
                if is_stream:
                    upstream_conn = _open_stream_with_compat_retry(
                        request_id,
                        attempt,
                        payload,
                        proxy_url=attempt.proxy_url,
                        remaining_timeout_s=remaining,
                        first_byte_timeout_s=first_byte_t if first_byte_t > 0 else None,
                        attempt_started_at=attempt_started,
                    )
                    first_event_remaining = _remaining_first_event_timeout(attempt_started, first_byte_t) if first_byte_t > 0 else None
                    if attempt.upstream_format in (RESPONSES, ANTHROPIC):
                        initial_lines = _prefetch_initial_stream_lines(upstream_conn, first_event_remaining)
                    else:
                        first_line = _prefetch_first_stream_line(upstream_conn, first_event_remaining)
                        initial_lines = [first_line] if first_line else None
                    OBSERVABILITY.record_first_byte(request_id)

                    self.close_connection = True
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("X-Accel-Buffering", "no")
                    self.end_headers()
                    response_started = True

                    interval_ms, flush_bytes = _stream_flush_policy()
                    from stream_adapters import BufferedSSEWriter
                    bwfile = BufferedSSEWriter(self.wfile, interval_ms, flush_bytes)

                    stream_resp = None
                    try:
                        if attempt.upstream_format == RESPONSES:
                            stream_resp = relay_sse_stream(upstream_conn, bwfile, initial_lines=initial_lines)
                        elif attempt.upstream_format == CHAT:
                            stream_resp = stream_openai_sse_to_responses(
                                upstream_conn,
                                bwfile,
                                original_model,
                                read_timeout_s=read_t,
                                initial_lines=initial_lines,
                            )
                        else:
                            stream_resp = stream_anthropic_sse_to_responses(
                                upstream_conn,
                                bwfile,
                                original_model,
                                read_timeout_s=read_t,
                                initial_lines=initial_lines,
                            )
                    finally:
                        bwfile.force_flush()

                    if stream_resp is None:
                        _record_stream_interrupted(
                            request_id,
                            attempt,
                            attempt_errors,
                            duration_ms=_attempt_duration_ms(attempt_started),
                        )
                        OBSERVABILITY.record_request_end(request_id, status_code=502, error="stream_interrupted")
                        return
                    ROUTER.report_success(attempt)
                    OBSERVABILITY.record_attempt(
                        request_id,
                        attempt,
                        outcome="success",
                        usage=_response_usage(stream_resp),
                        duration_ms=_attempt_duration_ms(attempt_started),
                    )
                    OBSERVABILITY.record_request_end(request_id, status_code=200)
                    return

                upstream_data = _request_json_with_compat_retry(
                    request_id,
                    attempt,
                    payload,
                    proxy_url=attempt.proxy_url,
                    remaining_timeout_s=remaining,
                )
                client_response = convert_response(
                    attempt.upstream_format,
                    RESPONSES,
                    upstream_data,
                    original_model=original_model,
                )
                if _is_empty_visible_output(
                    RESPONSES,
                    client_response,
                    upstream_format=attempt.upstream_format,
                    upstream_response=upstream_data,
                ):
                    _record_empty_visible_output_failure(request_id, attempt, attempt_errors)
                    continue
                ROUTER.report_success(attempt)
                OBSERVABILITY.record_attempt(
                    request_id,
                    attempt,
                    outcome="success",
                    usage=_response_usage(client_response, upstream_data),
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                OBSERVABILITY.record_request_end(request_id, status_code=200)
                return self._resp_json(client_response)

            except (HTTPError, CachedHTTPError) as e:
                status, error_body, headers = _http_error_details(e)
                retry_after_s = parse_retry_after_seconds(headers.get("Retry-After"))
                decision = scheduler_policy.classify_http_error(
                    CONFIG,
                    int(status),
                    error_body=error_body,
                    model_name=payload.get("model", ""),
                )
                _record_upstream_http_failure(
                    request_id,
                    attempt,
                    status,
                    error_body,
                    decision,
                    retry_after_s,
                    attempt_errors,
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                if decision.stop_attempts:
                    break
                continue

            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError) as e:
                if response_started:
                    print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                    OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                    return
                _record_transport_failure(request_id, attempt, e, attempt_errors, stage="client_disconnected", duration_ms=_attempt_duration_ms(attempt_started))
                continue

            except (URLError, socket.timeout) as e:
                # Once bytes were sent to the client, a disconnect-style error on
                # a write is the client going away, not an upstream failure.
                # Treat it as 499 and do NOT cool the provider/key.
                if response_started and is_client_disconnect_error(e):
                    print(f"[proxy] CLIENT DISCONNECTED req={request_id}: {type(e).__name__}", flush=True)
                    OBSERVABILITY.record_request_end(request_id, status_code=499, error=type(e).__name__)
                    return
                err_label = "timeout" if isinstance(e, socket.timeout) else "network_error"
                stage = "streaming_idle_timeout" if response_started and isinstance(e, socket.timeout) else _transport_stage_for_exception(e)
                _record_transport_failure(
                    request_id,
                    attempt,
                    e,
                    attempt_errors,
                    reason=err_label,
                    stage=stage,
                    duration_ms=_attempt_duration_ms(attempt_started),
                )
                if response_started:
                    OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                    return
                continue

            except Exception as e:
                if response_started:
                    print(f"[proxy] STREAM ERROR req={request_id} {_h(attempt.provider)}: {type(e).__name__}", flush=True)
                    _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                    OBSERVABILITY.record_request_end(request_id, status_code=502, error=type(e).__name__)
                    return
                _record_proxy_exception(request_id, attempt, e, attempt_errors, duration_ms=_attempt_duration_ms(attempt_started))
                continue

            finally:
                _close_upstream_conn(upstream_conn)

        if not has_attempt:
            if is_stream:
                OBSERVABILITY.record_request_end(request_id, status_code=501)
                return self._resp_json(
                    {
                        "error": {
                            "message": "Responses streaming currently requires a native Responses, Chat Completions, or Anthropic Messages upstream provider",
                            "request_id": request_id,
                        }
                    },
                    501,
                )
            OBSERVABILITY.record_request_end(request_id, status_code=400)
            return self._resp_json(
                {"error": {"message": f"No provider supports model '{canonical_model}'", "request_id": request_id}},
                400,
            )

        dur_ms = int((time.time() - start_ts) * 1000)
        err_msg = f"All upstream attempts failed (req={request_id}, {dur_ms}ms): " + "; ".join(attempt_errors[-10:])
        OBSERVABILITY.record_request_end(request_id, status_code=502, error=err_msg)
        return self._resp_json({"error": {"message": err_msg, "request_id": request_id}}, 502)
