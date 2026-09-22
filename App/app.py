"""Serve the browser-based Math AAC workspace."""

from __future__ import annotations

import argparse
import base64
import contextlib
import functools
import http.server
import io
import importlib.util
import json
import math
import os
import pathlib
import sys
import threading
import urllib.error
import urllib.request
import webbrowser


APP_DIR = pathlib.Path(__file__).resolve().parent
# Kokoro is loaded from a short Windows path to avoid PyTorch long-path failures.
KOKORO_PACKAGE_DIR = pathlib.Path(os.environ.get("KOKORO_PACKAGE_DIR", r"C:\MathAAC-Kokoro"))
if KOKORO_PACKAGE_DIR.is_dir() and str(KOKORO_PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(KOKORO_PACKAGE_DIR))


@contextlib.contextmanager
def speech_slot(lock: threading.Lock):
    """Do not queue obsolete utterances behind a slow model load or synthesis."""
    if not lock.acquire(blocking=False):
        raise RuntimeError("Speech engine is busy. Use device speech while it finishes.")
    try:
        yield
    finally:
        lock.release()


class GoogleCloudEngine:
    # Optional cloud speech. Device speech is the browser's default.
    def __init__(self) -> None:
        self.client = None
        self.lock = threading.Lock()

    def synthesize(self, text: str, voice: str, speed: float = 1.0) -> bytes:
        with speech_slot(self.lock):
            api_key = os.environ.get("GOOGLE_TTS_API_KEY", "").strip()
            if api_key:
                return self.synthesize_with_api_key(text, voice, speed, api_key)
            from google.cloud import texttospeech

            if self.client is None:
                self.client = texttospeech.TextToSpeechClient()

            language_code = "-".join(voice.split("-")[:2]) if voice.startswith("en-") else "en-US"
            request = texttospeech.SynthesizeSpeechRequest(
                input=texttospeech.SynthesisInput(text=text),
                voice=texttospeech.VoiceSelectionParams(name=voice, language_code=language_code),
                audio_config=texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.LINEAR16,
                    speaking_rate=speed,
                ),
            )
            return self.client.synthesize_speech(request=request, timeout=5, retry=None).audio_content

    @staticmethod
    def synthesize_with_api_key(text: str, voice: str, speed: float, api_key: str) -> bytes:
        language_code = "-".join(voice.split("-")[:2]) if voice.startswith("en-") else "en-US"
        payload = json.dumps({
            "input": {"text": text},
            "voice": {"languageCode": language_code, "name": voice},
            "audioConfig": {"audioEncoding": "LINEAR16", "speakingRate": speed},
        }).encode("utf-8")
        request = urllib.request.Request(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return base64.b64decode(json.loads(response.read())["audioContent"])
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Google Cloud API error {error.code}.") from error


class KokoroEngine:
    # Optional local neural speech; the browser handles device-voice fallback.
    def __init__(self) -> None:
        self.pipelines = {}
        self.lock = threading.Lock()

    def synthesize(self, text: str, voice: str = "af_heart", speed: float = 1.0) -> bytes:
        with speech_slot(self.lock):
            language = "b" if voice.startswith("b") else "a"
            if language not in self.pipelines:
                from kokoro import KPipeline
                self.pipelines[language] = KPipeline(lang_code=language)
            import numpy as np
            import soundfile as sf

            chunks = []
            for _, _, audio in self.pipelines[language](text, voice=voice, speed=speed):
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().numpy()
                chunks.append(np.asarray(audio))
            if not chunks:
                raise ValueError("Kokoro returned no audio.")
            output = io.BytesIO()
            sf.write(output, np.concatenate(chunks), 24000, format="WAV", subtype="PCM_16")
            return output.getvalue()


KOKORO = KokoroEngine()
GOOGLE_CLOUD = GoogleCloudEngine()

GOOGLE_VOICES = {
    "en-US-Chirp3-HD-Achernar", "en-US-Neural2-F", "en-US-Neural2-D",
    "en-US-Wavenet-F", "en-US-Wavenet-D", "en-GB-Neural2-A", "en-GB-Neural2-B",
}
KOKORO_VOICES = {"af_heart", "af_bella", "af_sarah", "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"}


def package_available(name: str) -> bool:
    """Probe installation without loading a neural model during a status request."""
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError, AttributeError):
        return False


class AACRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Serves the PWA files and exposes speech/status endpoints for the browser frontend.
    def log_request(self, code="-", size="-") -> None:
        # Routine file loads and cache checks are not useful console output.
        if code != "-" and int(code) >= 400:
            super().log_request(code, size)

    def end_headers(self) -> None:
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/tts-status":
            self.send_json({
                "google_cloud": bool(os.environ.get("GOOGLE_TTS_API_KEY")) or package_available("google.cloud.texttospeech"),
                "google_configured": bool(os.environ.get("GOOGLE_TTS_API_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")),
                "kokoro": package_available("kokoro"),
            })
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/speak":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 32768:
                self.send_json({"error": "Speech request must be between 1 and 32768 bytes."}, status=413)
                return
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Expected a JSON object.")
            text = request.get("text", "")
            if not isinstance(text, str) or not text.strip() or len(text) > 2000:
                raise ValueError("Enter between 1 and 2000 characters of speech.")
            engine = request.get("engine", "kokoro")
            if engine not in ("google", "kokoro"):
                raise ValueError("Choose google or kokoro for server speech.")
            speed = float(request.get("speed", 1.0))
            if not math.isfinite(speed) or not 0.5 <= speed <= 2:
                raise ValueError("Speech speed must be between 0.5 and 2.")
            voice_used = request.get("voice", "en-US-Neural2-F") if engine == "google" else request.get("kokoro_voice", "af_heart")
            if not isinstance(voice_used, str) or voice_used not in (GOOGLE_VOICES if engine == "google" else KOKORO_VOICES):
                raise ValueError("Choose a supported voice.")
        except (ValueError, TypeError, OverflowError) as error:
            self.send_json({"error": str(error)}, status=400)
            return
        try:
            # Fail promptly; the browser owns cancellation and immediate device fallback.
            if engine == "google":
                audio = GOOGLE_CLOUD.synthesize(text, voice_used, speed)
            else:
                audio = KOKORO.synthesize(text, voice_used, speed)
        except Exception:
            self.send_json({"error": f"{engine} speech is unavailable. Check the selected engine's installation and configuration."}, status=503)
            return
        self.send_payload(audio, "audio/wav", headers={"X-TTS-Engine": engine, "X-TTS-Voice": voice_used})

    def send_json(self, value: dict[str, object], status: int = 200) -> None:
        self.send_payload(json.dumps(value).encode("utf-8"), "application/json", status)

    def send_payload(self, payload: bytes, content_type: str, status: int = 200, headers: dict | None = None) -> None:
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # The user stopped speech or replaced the utterance.


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Math AAC web workspace.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    handler = functools.partial(AACRequestHandler, directory=str(APP_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    url = f"http://127.0.0.1:{args.port}/index.html?v=22"
    print(f"Math AAC: {url}\nPress Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nMath AAC stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
