"""OpenAPI 响应模型 + 示例"""
from typing import Any, Optional

from pydantic import BaseModel, Field


class RankTotal(BaseModel):
    rank: Optional[int] = None
    total: Optional[int] = None


class Intelligence(RankTotal):
    score: Optional[float] = None


class Speed(RankTotal):
    tokens_per_second: Optional[float] = None


class Pricing(RankTotal):
    cache_hit: Optional[float] = None
    input: Optional[float] = None
    output: Optional[float] = None


class ContextWindow(RankTotal):
    tokens: Optional[int] = None


class ModelSize(RankTotal):
    active_params_b: Optional[int] = None
    total_params_b: Optional[int] = None


class Latency(RankTotal):
    input_time_s: Optional[float] = None
    reasoning_time_s: Optional[float] = None
    answer_time_s: Optional[float] = None


class Openness(RankTotal):
    score: Optional[float] = None


class Verbosity(RankTotal):
    reasoning_tokens: Optional[int] = None
    answer_tokens: Optional[int] = None


class EvalCost(RankTotal):
    total_usd: Optional[float] = None


class Summary(BaseModel):
    intelligence: Optional[Intelligence] = None
    speed: Optional[Speed] = None
    pricing: Optional[Pricing] = None
    context_window: Optional[ContextWindow] = None
    model_size: Optional[ModelSize] = None
    latency: Optional[Latency] = None
    openness: Optional[Openness] = None
    verbosity: Optional[Verbosity] = None
    eval_cost: Optional[EvalCost] = None


class ModelSummaryResponse(BaseModel):
    model: str = Field(example="deepseek-v4-flash")
    summary: Summary
    cached: Optional[bool] = Field(default=False, example=True)
    source_url: Optional[str] = Field(default=None, example="https://artificialanalysis.ai/models/deepseek-v4-flash")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "model": "deepseek-v4-flash",
                    "summary": {
                        "intelligence": {"rank": 11, "total": 12, "score": 46.5},
                        "speed": {"rank": 5, "total": 11, "tokens_per_second": 89.4},
                        "pricing": {"rank": 2, "total": 20, "cache_hit": 0.0028, "input": 0.14, "output": 0.28},
                        "context_window": {"rank": 1, "total": 20, "tokens": 1000000},
                        "model_size": {"rank": 17, "total": 20, "active_params_b": 13, "total_params_b": 284},
                        "latency": {"rank": 18, "total": 20, "input_time_s": 1.23, "reasoning_time_s": 62.79, "answer_time_s": 5.59},
                        "openness": {"rank": 2, "total": 18, "score": 50},
                        "verbosity": {"rank": 2, "total": 20, "reasoning_tokens": 227867531, "answer_tokens": 13193287},
                        "eval_cost": {"rank": 20, "total": 20, "total_usd": 112.86},
                    },
                    "cached": True,
                    "source_url": "https://artificialanalysis.ai/models/deepseek-v4-flash",
                }
            ]
        }
    }


class ModelsItem(BaseModel):
    slug: str = Field(example="deepseek-v4-flash")
    name: str = Field(example="DeepSeek V4 Flash (Max)")


class ModelsResponse(BaseModel):
    total: int = Field(example=500)
    models: list[ModelsItem]


class SearchResult(BaseModel):
    slug: str = Field(example="claude-opus-4-8")
    name: str = Field(example="Claude Opus 4.8 (max)")
    score: float = Field(example=0.8)


class SearchResponse(BaseModel):
    query: str = Field(example="claude")
    results: list[SearchResult]
