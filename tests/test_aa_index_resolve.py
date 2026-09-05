"""ModelIndex 分级映射单测（纯本地，无网络）。

覆盖：exact / name / stripname / alias / family / segment /
substring 确定性命中，approximate 近似兜底（抓取但标记），
none（只给建议）与多家族拒绝猜测的护栏。
"""
import unittest

from artificial_analysis_api.index import ModelIndex, resolve_deterministic

MODELS = {
    "deepseek-v4-flash": "DeepSeek V4 Flash (Max)",
    "deepseek-v4-flash-high": "DeepSeek V4 Flash (High)",
    "qwen3-8-flash-next": "Qwen3.8-Flash-Next",
    "qwen3-32b-instruct": "Qwen3 32B Instruct",
    "qwen3-32b-instruct-reasoning": "Qwen3 32B Instruct (Reasoning)",
    "gpt-5-6-sol": "GPT-5.6 Sol (xhigh)",
    "gpt-5-6-sol-low": "GPT-5.6 Sol (low)",
    "gpt-5-5": "GPT-5.5 (xhigh)",
    "gpt-5-5-medium": "GPT-5.5 (medium)",
    "claude-opus-4-8": "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)",
    "claude-opus-4-5": "Claude Opus 4.5",
    "claude-fable-5": "Claude Fable 5 (Adaptive Reasoning, Max Effort, Opus 4.8 Fallback)",
    "kimi-k2-6": "Kimi K2.6",
    "my-model-x": "My Model (Special)",
    "gpt-4-5": "GPT-4.5",
}


def _idx() -> ModelIndex:
    idx = ModelIndex(cache_dir=":memory:")
    idx._models = dict(MODELS)
    return idx


class ResolveKindTests(unittest.TestCase):
    def test_exact_slug(self):
        self.assertEqual(
            _idx().resolve_kind("deepseek-v4-flash"),
            ("deepseek-v4-flash", "exact"),
        )

    def test_display_name(self):
        self.assertEqual(
            _idx().resolve_kind("DeepSeek V4 Flash (Max)"),
            ("deepseek-v4-flash", "name"),
        )

    def test_stripped_display_name_unique(self):
        # 查询带了过时的括号后缀，括号外全索引唯一 -> stripname
        self.assertEqual(
            _idx().resolve_kind("My Model (Old Name)"),
            ("my-model-x", "stripname"),
        )

    def test_stripped_display_name_ambiguous(self):
        # 括号外 "GPT-5.5" 对应 xhigh/medium 多个变体 -> 拒绝猜测
        slug, kind = _idx().resolve_kind("GPT-5.5 (ultra)")
        self.assertIsNone(slug)
        self.assertEqual(kind, "none")

    def test_alias_dot_form(self):
        self.assertEqual(
            _idx().resolve_kind("gpt-5.6-sol"), ("gpt-5-6-sol", "alias")
        )

    def test_alias_vendor_dash(self):
        # qwen-3.8-flash -> qwen3-8-flash-next（单家族默认）
        self.assertEqual(
            _idx().resolve_kind("qwen-3.8-flash"),
            ("qwen3-8-flash-next", "family"),
        )

    def test_space_separated_with_dots(self):
        # "claude opus 4.8" 整体即 claude-opus-4-8，绝不能误配 fable-5
        self.assertEqual(
            _idx().resolve_kind("claude opus 4.8"),
            ("claude-opus-4-8", "alias"),
        )

    def test_union_id_last_segment(self):
        self.assertEqual(
            _idx().resolve_kind("Pro/Qwen/Qwen3-32B")[0], "qwen3-32b-instruct"
        )
        self.assertEqual(
            _idx().resolve_kind("anthropic/claude-opus-4.8"),
            ("claude-opus-4-8", "segment"),
        )

    def test_substring_unique(self):
        # 缺厂商前缀，但子串全索引唯一 -> substring
        self.assertEqual(
            _idx().resolve_kind("opus-4.8"), ("claude-opus-4-8", "substring")
        )

    def test_approximate_typo(self):
        slug, kind = _idx().resolve_kind("deepsek-v4-flash")
        self.assertEqual(slug, "deepseek-v4-flash")
        self.assertEqual(kind, "approximate")
        self.assertFalse(_idx().is_exact_resolve("deepsek-v4-flash", slug))

    def test_approximate_rejects_digit_transposition(self):
        # 顺序不可变：claude-opus-5-4（5,4）vs claude-opus-4-5（4,5）
        # 字符相似度 0.867，旧逻辑会误命中，数字转置必须否决，只能给建议
        from difflib import SequenceMatcher as _S

        self.assertGreaterEqual(
            _S(None, "claude-opus-5-4", "claude-opus-4-5").ratio(), 0.85
        )
        slug, kind = _idx().resolve_kind("claude-opus-5-4")
        self.assertIsNone(slug)
        self.assertEqual(kind, "none")

    def test_approximate_rejects_vendor_swap(self):
        # 前缀不可变：grok ≠ gpt即便后面完全相同
        from artificial_analysis_api.index import (
            _prefix_compatible,
            _digit_compatible,
        )

        self.assertFalse(_prefix_compatible("grok", "gpt"))
        self.assertTrue(_prefix_compatible("deepsek", "deepseek"))
        self.assertTrue(_prefix_compatible("qwen", "qwen3"))
        self.assertFalse(_prefix_compatible("o1", "o3"))
        self.assertFalse(_digit_compatible("gpt-5-4", "gpt-4-5"))
        self.assertTrue(_digit_compatible("gpt-5", "gpt-5-5"))

    def test_none_for_garbage(self):
        self.assertEqual(
            _idx().resolve_kind("unknown-xyz-model"), (None, "none")
        )
        # "flash" 命中多个家族 -> 不猜
        self.assertEqual(_idx().resolve_kind("flash"), (None, "none"))

    def test_none_for_ambiguous_short_query(self):
        # gpt-5 可能是任一 GPT-5 变体（0.833 达不到 0.85 阈值）-> 不抓取
        self.assertEqual(_idx().resolve_kind("gpt-5"), (None, "none"))

    def test_is_exact_resolve(self):
        idx = _idx()
        slug = idx.resolve("qwen-3.8-flash")
        self.assertEqual(slug, "qwen3-8-flash-next")
        self.assertTrue(idx.is_exact_resolve("qwen-3.8-flash", slug))
        self.assertFalse(idx.is_exact_resolve("qwen-3.8-flash", "other-slug"))
        self.assertFalse(idx.is_exact_resolve("qwen-3.8-flash", None))

    def test_search_alias_boost(self):
        top = _idx().search("qwen-3.8-flash", limit=3)
        self.assertTrue(top)
        self.assertEqual(top[0]["slug"], "qwen3-8-flash-next")

    def test_warm_only_caches_deterministic(self):
        idx = _idx()
        # 确定性命中进缓存
        self.assertEqual(idx.warm("qwen-3.8-flash"), "qwen3-8-flash-next")
        self.assertIn("qwen-3.8-flash", idx._resolve_cache)
        # 未知模型不跑慢路径、不进缓存（按需 resolve 仍走完整管线）
        self.assertIsNone(idx.warm("Pro/Custom/some-embedding-model-x-v2"))
        self.assertNotIn(
            "pro/custom/some-embedding-model-x-v2", idx._resolve_cache
        )
        slug, kind = idx.resolve_kind("deepsek-v4-flash")
        self.assertEqual((slug, kind), ("deepseek-v4-flash", "approximate"))

    def test_resolve_deterministic_never_approximates(self):
        # 定价批量路径：拼写错误也不猜（价格错配比缺价格危害大），且无慢路径
        self.assertEqual(
            resolve_deterministic(MODELS, "deepsek-v4-flash"), (None, "none")
        )
        self.assertEqual(
            resolve_deterministic(MODELS, "qwen-3.8-flash"),
            ("qwen3-8-flash-next", "family"),
        )
        self.assertEqual(
            resolve_deterministic(MODELS, "Pro/Qwen/Qwen3-32B")[0],
            "qwen3-32b-instruct",
        )


if __name__ == "__main__":
    unittest.main()
