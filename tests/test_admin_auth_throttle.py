"""Brute-force throttle for admin auth (constant-time compare hides the key
but does not rate-limit guessing; these tests pin the throttle state machine)."""
import unittest

import admin_routes


class _FakeHandler(admin_routes.AdminRoutesMixin):
    def __init__(self, peer):
        self.client_address = (peer, 12345)


class AdminAuthThrottleTests(unittest.TestCase):
    def setUp(self):
        with admin_routes._admin_auth_lock:
            admin_routes._admin_auth_failures.clear()
            admin_routes._admin_auth_blocks.clear()

    def test_not_blocked_below_limit(self):
        handler = _FakeHandler("203.0.113.9")
        for _ in range(admin_routes._ADMIN_AUTH_FAIL_LIMIT - 1):
            handler._admin_auth_record_failure()
        self.assertFalse(handler._admin_auth_blocked())

    def test_blocked_at_limit(self):
        handler = _FakeHandler("203.0.113.9")
        for _ in range(admin_routes._ADMIN_AUTH_FAIL_LIMIT):
            handler._admin_auth_record_failure()
        self.assertTrue(handler._admin_auth_blocked())

    def test_success_resets_the_window(self):
        handler = _FakeHandler("203.0.113.10")
        for _ in range(admin_routes._ADMIN_AUTH_FAIL_LIMIT - 1):
            handler._admin_auth_record_failure()
        handler._admin_auth_reset()
        for _ in range(admin_routes._ADMIN_AUTH_FAIL_LIMIT - 1):
            handler._admin_auth_record_failure()
        self.assertFalse(handler._admin_auth_blocked())

    def test_stale_failures_expire_out_of_the_window(self):
        handler = _FakeHandler("203.0.113.11")
        now = admin_routes.time.monotonic()
        # Seed failures older than the window: they must not count.
        with admin_routes._admin_auth_lock:
            stale = admin_routes.collections.deque(
                [now - admin_routes._ADMIN_AUTH_FAIL_WINDOW_S - 5.0] * admin_routes._ADMIN_AUTH_FAIL_LIMIT
            )
            admin_routes._admin_auth_failures["203.0.113.11"] = stale
        handler._admin_auth_record_failure()
        self.assertFalse(handler._admin_auth_blocked())

    def test_trackers_are_isolated_per_ip(self):
        blocker = _FakeHandler("203.0.113.12")
        for _ in range(admin_routes._ADMIN_AUTH_FAIL_LIMIT):
            blocker._admin_auth_record_failure()
        self.assertTrue(blocker._admin_auth_blocked())
        self.assertFalse(_FakeHandler("198.51.100.7")._admin_auth_blocked())


if __name__ == "__main__":
    unittest.main()
