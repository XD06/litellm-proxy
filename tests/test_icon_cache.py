"""品牌图标本地代理缓存单测（无网络，磁盘隔离到临时目录）。"""
import os
import unittest

import icon_cache


class _Base(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self._orig_dir = icon_cache._cache_dir
        icon_cache._cache_dir = lambda: self._tmp.name  # noqa: E731
        icon_cache._mem.clear()
        with icon_cache._key_locks_guard:
            icon_cache._key_locks.clear()
        self._orig_fetch = icon_cache._fetch_upstream

    def tearDown(self):
        icon_cache._cache_dir = self._orig_dir
        icon_cache._fetch_upstream = self._orig_fetch
        icon_cache._mem.clear()
        with icon_cache._key_locks_guard:
            icon_cache._key_locks.clear()
        self._tmp.cleanup()


class NormalizeTests(_Base):
    def test_valid_slug_and_type(self):
        self.assertEqual(icon_cache.normalize("openai", "color"), ("openai", "color"))
        self.assertEqual(icon_cache.normalize("Qwen", "COLOR"), ("qwen", "color"))

    def test_rejects_bad_slugs_without_network(self):
        calls = []
        icon_cache._fetch_upstream = lambda s, t: calls.append((s, t)) or None
        for bad in ("", "../x", "a/b", "a b", "x" * 41, "-lead", "UPPER OK"):
            self.assertIsNone(icon_cache.get_icon(bad))
        self.assertEqual(calls, [])

    def test_bad_type_falls_back_to_mono(self):
        self.assertEqual(icon_cache.normalize("openai", "evil")[1], "mono")


class UpstreamUrlTests(unittest.TestCase):
    def test_matches_lobe_static_svg_layout(self):
        mono, color = icon_cache.upstream_urls("openai", "mono"), icon_cache.upstream_urls("qwen", "color")
        # npmmirror 优先（国内快），unpkg 兜底；mono 无后缀，color 加 -color
        self.assertTrue(mono[0].startswith("https://registry.npmmirror.com/"))
        self.assertTrue(mono[0].endswith("/icons/openai.svg"))
        self.assertTrue(mono[1].startswith("https://unpkg.com/"))
        self.assertTrue(color[0].endswith("/icons/qwen-color.svg"))


class CacheFlowTests(_Base):
    SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>'

    def test_disk_hit_serves_without_upstream(self):
        with open(os.path.join(self._tmp.name, "openai-mono.svg"), "wb") as f:
            f.write(self.SVG)
        icon_cache._fetch_upstream = lambda s, t: (_ for _ in ()).throw(AssertionError("must not fetch"))
        self.assertEqual(icon_cache.get_icon("openai"), self.SVG)

    def test_upstream_result_is_persisted_to_disk_and_memory(self):
        icon_cache._fetch_upstream = lambda s, t: self.SVG
        self.assertEqual(icon_cache.get_icon("deepseek", "color"), self.SVG)
        self.assertTrue(os.path.isfile(os.path.join(self._tmp.name, "deepseek-color.svg")))
        # 磁盘删掉后内存仍命中，不再走上游
        os.remove(os.path.join(self._tmp.name, "deepseek-color.svg"))
        icon_cache._fetch_upstream = lambda s, t: (_ for _ in ()).throw(AssertionError("must use memory"))
        self.assertEqual(icon_cache.get_icon("deepseek", "color"), self.SVG)

    def test_rejects_non_svg_bytes(self):
        self.assertFalse(icon_cache._valid_svg(b"<html>nope</html>"))
        self.assertFalse(icon_cache._valid_svg(b""))
        self.assertFalse(icon_cache._valid_svg(b"x" * (icon_cache._MAX_BYTES + 1)))
        self.assertTrue(icon_cache._valid_svg(b'  <svg viewBox="0 0 1 1"/>'))
        icon_cache._fetch_upstream = lambda s, t: b"<html>nope</html>"
        self.assertIsNone(icon_cache.get_icon("openai"))
        self.assertFalse(os.path.exists(os.path.join(self._tmp.name, "openai-mono.svg")))

    def test_upstream_failure_returns_none(self):
        icon_cache._fetch_upstream = lambda s, t: None
        self.assertIsNone(icon_cache.get_icon("openai"))


if __name__ == "__main__":
    unittest.main()
