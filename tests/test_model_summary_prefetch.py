import unittest

import sse2json


class ModelSummaryPrefetchTests(unittest.TestCase):
    def test_network_prefetch_is_disabled_by_default(self):
        self.assertFalse(sse2json._model_summary_network_prefetch_enabled({}))
        self.assertFalse(
            sse2json._model_summary_network_prefetch_enabled(
                {"observability": {"pricing": {}}}
            )
        )

    def test_network_prefetch_can_be_enabled_explicitly(self):
        self.assertTrue(
            sse2json._model_summary_network_prefetch_enabled(
                {
                    "observability": {
                        "pricing": {"prefetch_model_summaries": True}
                    }
                }
            )
        )


if __name__ == "__main__":
    unittest.main()
