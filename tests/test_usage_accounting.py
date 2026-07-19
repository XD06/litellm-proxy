import unittest
from types import SimpleNamespace
from unittest.mock import patch

import usage_accounting as accounting


class UsageAccountingTests(unittest.TestCase):
    def test_chat_usage_keeps_cache_and_reasoning_breakdown(self):
        usage = accounting.normalize_usage(
            {
                "prompt_tokens": 100,
                "completion_tokens": 40,
                "prompt_tokens_details": {"cached_tokens": 60},
                "completion_tokens_details": {"reasoning_tokens": 12},
            }
        )

        self.assertEqual(
            usage,
            {
                "input_tokens": 100,
                "uncached_input_tokens": 40,
                "cached_input_tokens": 60,
                "cache_write_tokens": 0,
                "output_tokens": 40,
                "reasoning_tokens": 12,
                "total_tokens": 140,
            },
        )

    def test_responses_usage_keeps_cache_and_reasoning_breakdown(self):
        usage = accounting.normalize_usage(
            {
                "input_tokens": 80,
                "output_tokens": 30,
                "input_tokens_details": {"cached_tokens": 20},
                "output_tokens_details": {"reasoning_tokens": 9},
            }
        )

        self.assertEqual(usage["uncached_input_tokens"], 60)
        self.assertEqual(usage["cached_input_tokens"], 20)
        self.assertEqual(usage["reasoning_tokens"], 9)
        self.assertEqual(usage["total_tokens"], 110)

    def test_anthropic_usage_treats_input_as_uncached_component(self):
        usage = accounting.normalize_usage(
            {
                "input_tokens": 25,
                "cache_read_input_tokens": 50,
                "cache_creation_input_tokens": 10,
                "output_tokens": 15,
            }
        )

        self.assertEqual(usage["input_tokens"], 85)
        self.assertEqual(usage["uncached_input_tokens"], 25)
        self.assertEqual(usage["cached_input_tokens"], 50)
        self.assertEqual(usage["cache_write_tokens"], 10)
        self.assertEqual(usage["total_tokens"], 100)

    def test_reasoning_is_not_added_twice_to_total_or_cost(self):
        usage = accounting.normalize_usage(
            {
                "input_tokens": 10,
                "output_tokens": 20,
                "output_tokens_details": {"reasoning_tokens": 8},
            }
        )
        snapshot = {
            "input_per_million": 1,
            "cache_read_per_million": 0.1,
            "cache_write_per_million": 1.2,
            "output_per_million": 2,
        }

        self.assertEqual(usage["total_tokens"], 30)
        self.assertEqual(accounting.calculate_cost_usd(usage, snapshot), 0.00005)

    def test_provider_pricing_uses_cache_specific_rates(self):
        cfg = {
            "providers": {
                "alpha": {
                    "pricing": {
                        "input_per_million": 2,
                        "cache_read_per_million": 0.2,
                        "cache_write_per_million": 2.5,
                        "output_per_million": 4,
                    }
                }
            }
        }
        result = accounting.price_usage(
            cfg,
            "alpha",
            "model-a",
            {
                "uncached_input_tokens": 10,
                "cached_input_tokens": 20,
                "cache_write_tokens": 30,
                "output_tokens": 40,
            },
        )

        self.assertEqual(result["cost_status"], "priced")
        self.assertEqual(result["pricing_source"], "provider_config")
        self.assertEqual(result["cost_usd"], 0.000259)

    def test_missing_cache_write_rate_is_estimated(self):
        cfg = {
            "providers": {
                "alpha": {
                    "pricing": {
                        "input_per_million": 2,
                        "cache_read_per_million": 0.2,
                        "output_per_million": 4,
                    }
                }
            }
        }

        result = accounting.price_usage(cfg, "alpha", "model-a", {"input_tokens": 1, "output_tokens": 1})

        self.assertEqual(result["cost_status"], "estimated")
        self.assertEqual(result["pricing_snapshot"]["cache_write_per_million"], 2)

    def test_missing_price_is_not_reported_as_known_zero(self):
        with patch.object(accounting, "_aa", None):
            pending = accounting.price_usage({}, "alpha", "unknown", {"input_tokens": 1})
            unpriced = accounting.price_usage(
                {}, "alpha", "unknown", {"input_tokens": 1}, resolve_missing=False
            )

        self.assertEqual(pending["cost_status"], "pending")
        self.assertEqual(unpriced["cost_status"], "unpriced")
        self.assertEqual(pending["cost_usd"], 0.0)

    def test_cached_summary_resolves_when_model_index_is_not_ready(self):
        fake_aa = SimpleNamespace(
            _index=SimpleNamespace(
                load_local=lambda: False,
                resolve=lambda _query: None,
            ),
            _cache=SimpleNamespace(
                get=lambda slug: {
                    "pricing": {"input": 0.14, "output": 0.28, "cache_hit": 0.0028}
                } if slug == "deepseek-v4-flash" else None,
                list_slugs=lambda: ["deepseek-v4-flash"],
            ),
        )
        with patch.object(accounting, "_aa", fake_aa):
            snapshot = accounting.resolve_price_snapshot({}, "alpha", "DeepSeek V4 Flash")

        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot["source"], "aa_cache")
        self.assertEqual(snapshot["resolved_model"], "deepseek-v4-flash")
        self.assertEqual(snapshot["cache_read_per_million"], 0.0028)


if __name__ == "__main__":
    unittest.main()
