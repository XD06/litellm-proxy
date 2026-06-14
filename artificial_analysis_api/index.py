"""模型索引：从 AA 页面 RSC 中提取模型列表 + 模糊匹配"""
import json
import re
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional


def _normalize(s: str) -> str:
    s = s.lower().strip()
    for ch in (".", " ", "/"):
        s = s.replace(ch, "-")
    for ch in ("(", ")", ":", ","):
        s = s.replace(ch, "")
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


class ModelIndex:
    def __init__(self, cache_dir: str | Path):
        self._cache_file = Path(cache_dir) / "model_index.json"
        self._models: dict[str, str] = {}  # slug -> short_name

    # ---- load / save ----

    def load_local(self) -> bool:
        if self._cache_file.exists():
            try:
                self._models = json.loads(self._cache_file.read_text()).get("models", {})
                return bool(self._models)
            except (json.JSONDecodeError, KeyError):
                pass
        return False

    def save(self):
        self._cache_file.parent.mkdir(parents=True, exist_ok=True)
        self._cache_file.write_text(
            json.dumps({"updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "models": self._models})
        )

    # ---- build from RSC ----

    def build_from_html(self, html: str):
        pairs: dict[str, str] = {}
        pos = 0
        while True:
            i = html.find('slug\\":\\"', pos)
            if i == -1:
                break
            vs = i + 9
            ve = html.find('\\"', vs)
            slug = html[vs:ve]
            if not slug or len(slug) < 6:
                pos = ve + 2
                continue
            if '\\"deprecated\\"' not in html[ve:ve + 250]:
                pos = ve + 2
                continue

            j2 = html.find('name\\":\\"', ve)
            if j2 == -1 or j2 - ve > 300:
                pos = ve + 2
                continue
            ns = j2 + 9
            ne = html.find('\\"', ns)

            j3 = html.find('shortName\\":\\"', ne)
            if j3 == -1 or j3 - ne > 300:
                pos = ne + 2
                continue
            ss = j3 + 14
            se = html.find('\\"', ss)
            pairs[slug] = html[ss:se]
            pos = se + 2

        self._models = pairs

    @property
    def models(self) -> dict[str, str]:
        return dict(self._models)

    @property
    def size(self) -> int:
        return len(self._models)

    # ---- resolve ----

    def resolve(self, query: str) -> Optional[str]:
        q = query.strip().lower()
        if q in self._models:
            return q

        name_to_slug = {v.lower(): k for k, v in self._models.items()}
        if q in name_to_slug:
            return name_to_slug[q]

        parts = re.split(r"[/\s]+", q)
        last = parts[-1]
        if last != q:
            return self.resolve(last)

        normalized = _normalize(q)
        if normalized in self._models:
            return normalized

        candidates: list[tuple[str, float]] = []
        for slug, name in self._models.items():
            nm = name.lower()
            if q in nm or normalized in nm:
                candidates.append((slug, 1.0))
            elif q in slug or normalized in slug:
                candidates.append((slug, 0.9))

        if not candidates:
            for slug, name in self._models.items():
                score = max(
                    SequenceMatcher(None, q, slug).ratio(),
                    SequenceMatcher(None, q, name.lower()).ratio(),
                    SequenceMatcher(None, normalized, _normalize(name)).ratio(),
                )
                if score > 0.55:
                    candidates.append((slug, score))

        candidates.sort(key=lambda x: (-x[1], len(x[0])))
        return candidates[0][0] if candidates else None

    def search(self, query: str, limit: int = 30) -> list[dict]:
        q = query.lower().strip()
        results = []
        for slug, name in self._models.items():
            score = 0
            if q == slug or q == name.lower():
                score = 1.0
            elif q in slug or q in name.lower():
                score = 0.8
            else:
                ratio = max(SequenceMatcher(None, q, slug).ratio(),
                            SequenceMatcher(None, q, name.lower()).ratio())
                if ratio > 0.5:
                    score = ratio
            if score > 0:
                results.append({"slug": slug, "name": name, "score": round(score, 3)})
        results.sort(key=lambda x: (-x["score"], x["slug"]))
        return results[:limit]
