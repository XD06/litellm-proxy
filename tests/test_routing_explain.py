from routing_explain import enrich_request


def test_no_attempt_summary_uses_routing_trace_blockers():
    detail = enrich_request(
        {
            "request_id": "req-no-candidate",
            "status_code": 503,
            "attempts": [],
            "routing_trace": [
                {
                    "stage": "format_compatibility",
                    "code": "format_blocked_by_parameter",
                    "owner": "proxy_conversion",
                    "target_format": "chat_completions",
                    "field": "context_management",
                },
                {
                    "stage": "routing",
                    "code": "no_candidate",
                    "owner": "proxy_routing",
                },
            ],
        }
    )

    summary = detail["routing_summary"]
    assert summary["outcome"] == "no_attempts"
    assert "chat_completions" in summary["headline"]
    assert "context_management" in summary["headline"]
    assert summary["owner"] == "proxy_routing"
