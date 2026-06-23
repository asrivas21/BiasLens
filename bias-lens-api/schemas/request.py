from pydantic import BaseModel
from typing import Literal


class AnalyzeRequest(BaseModel):
    text: str
    content_type: Literal["article", "short_form", "transcript"] = "article"
    source_name: str | None = None


class HfResult(BaseModel):
    label: str          # "biased" | "non-biased"
    score: float        # 0.0 – 1.0 confidence
    emotional_intensity: float
    top_phrases: list[str]
    content_type: str


class TranscribeRequest(BaseModel):
    url: str
    source_name: str | None = None


class TranscribeAndAnalyzeResponse(BaseModel):
    transcript: str
    language: str
    duration_seconds: int
    segments: list[dict]
    bias: HfResult
