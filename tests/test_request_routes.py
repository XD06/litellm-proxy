import unittest

from request_routes import classify_get, classify_post


class RequestRouteTests(unittest.TestCase):
    def test_classifies_v1_chat_completions_as_chat_namespace(self):
        route = classify_post("/v1/chat/completions")
        self.assertEqual(route.family, "chat_completions")
        self.assertEqual(route.endpoint, "chat_completions")
        self.assertTrue(route.implemented)
        self.assertFalse(route.legacy)

    def test_classifies_legacy_anthropic_routes(self):
        self.assertEqual(classify_get("/health").endpoint, "health")
        self.assertEqual(classify_get("/v1/models").endpoint, "models")

        messages = classify_post("/v1/messages")
        self.assertEqual(messages.family, "anthropic")
        self.assertEqual(messages.endpoint, "messages")
        self.assertTrue(messages.implemented)
        self.assertTrue(messages.legacy)

        count_tokens = classify_post("/v1/messages/count_tokens")
        self.assertEqual(count_tokens.family, "anthropic")
        self.assertEqual(count_tokens.endpoint, "count_tokens")
        self.assertTrue(count_tokens.legacy)

    def test_classifies_anthropic_namespace_aliases(self):
        models = classify_get("/anthropic/v1/models")
        self.assertEqual(models.family, "anthropic")
        self.assertEqual(models.endpoint, "models")

        messages = classify_post("/anthropic/v1/messages")
        self.assertEqual(messages.family, "anthropic")
        self.assertEqual(messages.endpoint, "messages")
        self.assertEqual(messages.canonical_path, "/v1/messages")
        self.assertFalse(messages.legacy)

    def test_classifies_openai_responses_namespace(self):
        models = classify_get("/openai/v1/models")
        self.assertEqual(models.family, "responses")
        self.assertEqual(models.endpoint, "models")

        unified = classify_post("/v1/responses")
        self.assertEqual(unified.family, "responses")
        self.assertEqual(unified.endpoint, "responses")
        self.assertEqual(unified.canonical_path, "/v1/responses")
        self.assertTrue(unified.implemented)

        responses = classify_post("/openai/v1/responses")
        self.assertEqual(responses.family, "responses")
        self.assertEqual(responses.endpoint, "responses")
        self.assertTrue(responses.implemented)
        self.assertFalse(responses.legacy)

    def test_openai_chat_completions_is_not_a_primary_route(self):
        chat = classify_post("/openai/v1/chat/completions")
        self.assertEqual(chat.endpoint, "unknown")
        self.assertFalse(chat.implemented)

    def test_unknown_route_is_not_implemented(self):
        route = classify_post("/something/else")
        self.assertEqual(route.endpoint, "unknown")
        self.assertFalse(route.implemented)
        self.assertTrue(route.is_unknown)

    def test_classifies_admin_get_routes(self):
        route = classify_get("/-/admin/status")
        self.assertEqual(route.family, "admin")
        self.assertEqual(route.endpoint, "status")
        self.assertTrue(route.implemented)

        requests = classify_get("/-/admin/requests/req-1")
        self.assertEqual(requests.family, "admin")
        self.assertEqual(requests.endpoint, "requests/req-1")
        self.assertTrue(requests.implemented)

    def test_classifies_dashboard_routes(self):
        root = classify_get("/")
        self.assertEqual(root.family, "dashboard")
        self.assertEqual(root.endpoint, "index.html")
        self.assertTrue(root.implemented)

        index = classify_get("/-/dashboard")
        self.assertEqual(index.family, "dashboard")
        self.assertEqual(index.endpoint, "index.html")
        self.assertTrue(index.implemented)

        app = classify_get("/-/dashboard/app.js")
        self.assertEqual(app.family, "dashboard")
        self.assertEqual(app.endpoint, "app.js")
        self.assertTrue(app.implemented)

    def test_classifies_admin_post_routes(self):
        route = classify_post("/-/admin/providers/alpha/disable")
        self.assertEqual(route.family, "admin")
        self.assertEqual(route.endpoint, "providers/alpha/disable")
        self.assertTrue(route.implemented)


if __name__ == "__main__":
    unittest.main()
