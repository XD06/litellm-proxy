import unittest

from proxy_utils import resolve_client_ip


class ClientIdentityTests(unittest.TestCase):
    def test_untrusted_peer_cannot_spoof_forwarded_headers(self):
        ip, source = resolve_client_ip(
            "203.0.113.10",
            {"X-Forwarded-For": "198.51.100.20"},
            ["10.0.0.0/8"],
        )

        self.assertEqual((ip, source), ("203.0.113.10", "peer"))

    def test_trusted_proxy_uses_first_untrusted_hop_from_right(self):
        ip, source = resolve_client_ip(
            "10.0.0.2",
            {"X-Forwarded-For": "198.51.100.20, 10.0.0.1"},
            ["10.0.0.0/8"],
        )

        self.assertEqual((ip, source), ("198.51.100.20", "x-forwarded-for"))

    def test_docker_bridge_proxy_uses_forwarded_client_ip(self):
        ip, source = resolve_client_ip(
            "172.21.0.1",
            {"X-Forwarded-For": "198.51.100.20, 172.21.0.1"},
            ["172.16.0.0/12"],
        )

        self.assertEqual((ip, source), ("198.51.100.20", "x-forwarded-for"))

    def test_trusted_proxy_accepts_nginx_real_ip_header(self):
        ip, source = resolve_client_ip(
            "172.21.0.1",
            {"X-Real-IP": "198.51.100.21"},
            ["172.21.0.0/16"],
        )

        self.assertEqual((ip, source), ("198.51.100.21", "x-real-ip"))

    def test_forwarded_header_accepts_quoted_ipv6(self):
        ip, source = resolve_client_ip(
            "127.0.0.1",
            {"Forwarded": 'for="[2001:db8::1]";proto=https'},
            ["127.0.0.0/8"],
        )

        self.assertEqual((ip, source), ("2001:db8::1", "forwarded"))

    def test_invalid_forwarded_value_falls_back_to_peer(self):
        ip, source = resolve_client_ip(
            "127.0.0.1",
            {"CF-Connecting-IP": "not-an-ip"},
            ["127.0.0.0/8"],
        )

        self.assertEqual((ip, source), ("127.0.0.1", "peer"))


if __name__ == "__main__":
    unittest.main()
