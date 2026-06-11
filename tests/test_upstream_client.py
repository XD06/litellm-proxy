import unittest

from upstream_client import OpenAIUpstreamClient


class OpenerCacheTests(unittest.TestCase):
    def setUp(self):
        self.client = OpenAIUpstreamClient({"routing": {}})

    def test_direct_requests_use_shared_default_opener(self):
        a = self.client._opener_for(None)
        b = self.client._opener_for("")
        c = self.client._opener_for("   ")
        self.assertIs(a, self.client._default_opener)
        self.assertIs(b, self.client._default_opener)
        self.assertIs(c, self.client._default_opener)

    def test_same_proxy_url_reuses_one_opener(self):
        first = self.client._opener_for("http://127.0.0.1:8888")
        second = self.client._opener_for("http://127.0.0.1:8888")
        self.assertIs(first, second)
        self.assertIsNot(first, self.client._default_opener)

    def test_proxy_url_whitespace_is_normalized(self):
        a = self.client._opener_for("http://127.0.0.1:8888")
        b = self.client._opener_for("  http://127.0.0.1:8888  ")
        self.assertIs(a, b)

    def test_different_proxy_urls_get_different_openers(self):
        a = self.client._opener_for("http://127.0.0.1:8888")
        b = self.client._opener_for("http://127.0.0.1:9999")
        self.assertIsNot(a, b)


if __name__ == "__main__":
    unittest.main()
