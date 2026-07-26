import unittest

from probe_coordinator import ProbeCoordinator


class ProbeCoordinatorTests(unittest.TestCase):
    def test_success_clears_only_the_matching_probe_scope(self):
        coordinator = ProbeCoordinator(min_interval_s=0)
        coordinator.should_apply_failure("alpha", "network_error")
        coordinator.should_apply_failure("alpha", "server_error")
        coordinator.should_apply_failure("beta", "network_error")

        coordinator.record_success("alpha")

        self.assertEqual(coordinator.snapshot()["failure_scopes"], 1)
        self.assertFalse(coordinator.should_apply_failure("alpha", "network_error"))
        self.assertTrue(coordinator.should_apply_failure("beta", "network_error"))

    def test_failure_scopes_are_bounded(self):
        coordinator = ProbeCoordinator(min_interval_s=0, max_failure_scopes=3)
        for index in range(10):
            coordinator.should_apply_failure(f"provider-{index}", "network_error")

        self.assertEqual(coordinator.snapshot()["failure_scopes"], 3)


if __name__ == "__main__":
    unittest.main()
