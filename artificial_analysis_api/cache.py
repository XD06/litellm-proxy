"""内存 + 文件两级缓存"""
import json
import time
from pathlib import Path
from typing import Optional


class ModelCache:
    def __init__(self, cache_dir: str | Path, mem_max: int = 200):
        self._dir = Path(cache_dir)
        self._mem: dict[str, dict] = {}
        self._mem_max = mem_max

    def _path(self, slug: str) -> Path:
        return self._dir / f"{slug}.json"

    def get(self, slug: str) -> Optional[dict]:
        if slug in self._mem:
            return self._mem[slug]
        p = self._path(slug)
        if p.exists():
            try:
                data = json.loads(p.read_text()).get("summary")
                if data:
                    self._mem[slug] = data
                return data
            except (json.JSONDecodeError, KeyError):
                pass
        return None

    def set(self, slug: str, summary: dict):
        self._mem[slug] = summary
        if len(self._mem) > self._mem_max:
            self._mem.pop(next(iter(self._mem)))
        self._dir.mkdir(parents=True, exist_ok=True)
        self._path(slug).write_text(
            json.dumps({"slug": slug, "cached_at": time.time(), "summary": summary})
        )

    def list_slugs(self) -> list:
        """Return all slugs that have a cached summary (in memory or on disk).

        Read-only and side-effect free apart from populating the in-memory
        cache entry when a file is found. Used by batch pricing lookups.
        """
        slugs = set(self._mem.keys())
        try:
            if self._dir.exists():
                for p in self._dir.glob("*.json"):
                    slugs.add(p.stem)
        except Exception:
            pass
        return sorted(slugs)
