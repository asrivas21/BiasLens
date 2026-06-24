import yt_dlp
import tempfile
import os
from faster_whisper import WhisperModel


class VideoTranscriber:
    SUPPORTED_DOMAINS = [
        "tiktok.com",
        "youtube.com",
        "youtu.be",
        "instagram.com",
        "twitter.com",
        "x.com",
    ]
    MAX_DURATION_SECONDS = 180

    def __init__(self):
        # "base" model, CPU inference. Upgrade to "small" for better accuracy.
        self.model = WhisperModel("base", device="cpu", compute_type="int8")

    def _is_supported(self, url: str) -> bool:
        return any(domain in url for domain in self.SUPPORTED_DOMAINS)

    def _download_audio(self, url: str, output_path: str) -> tuple[str, int]:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": output_path + ".%(ext)s",
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            ext = info.get("ext", "m4a")
            return output_path + f".{ext}", info.get("duration", 0)

    def transcribe(self, url: str) -> dict:
        if not self._is_supported(url):
            raise ValueError(
                f"Unsupported platform. Supported: {', '.join(self.SUPPORTED_DOMAINS)}"
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, "audio")
            actual_path, duration = self._download_audio(url, audio_path)

            if duration > self.MAX_DURATION_SECONDS:
                raise ValueError(
                    f"Video exceeds {self.MAX_DURATION_SECONDS}s limit for short-form analysis"
                )

            segments_iter, info = self.model.transcribe(actual_path, beam_size=5)
            segments = list(segments_iter)

            transcript = " ".join(s.text.strip() for s in segments)

            return {
                "transcript": transcript,
                "language": info.language,
                "duration_seconds": duration,
                "segments": [
                    {"start": s.start, "end": s.end, "text": s.text.strip()}
                    for s in segments
                ],
            }
