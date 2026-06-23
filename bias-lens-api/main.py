from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.bias_detector import BiasDetector
from models.transcriber import VideoTranscriber
from schemas.request import (
    AnalyzeRequest,
    HfResult,
    TranscribeRequest,
    TranscribeAndAnalyzeResponse,
)

detector: BiasDetector | None = None
transcriber: VideoTranscriber | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, transcriber
    detector = BiasDetector()
    transcriber = VideoTranscriber()
    yield


app = FastAPI(title="BiasLens API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://bias-lens.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=HfResult)
async def analyze(req: AnalyzeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if len(req.text) > 10_000:
        raise HTTPException(status_code=400, detail="Text exceeds 10,000 character limit")

    result = detector.detect(req.text)
    return HfResult(**result, content_type=req.content_type)


@app.post("/transcribe-and-analyze", response_model=TranscribeAndAnalyzeResponse)
async def transcribe_and_analyze(req: TranscribeRequest):
    try:
        transcription = transcriber.transcribe(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to process video. Check the URL and try again.",
        )

    bias_result = detector.detect(transcription["transcript"])

    return TranscribeAndAnalyzeResponse(
        transcript=transcription["transcript"],
        language=transcription["language"],
        duration_seconds=transcription["duration_seconds"],
        segments=transcription["segments"],
        bias=HfResult(**bias_result, content_type="short_form"),
    )
