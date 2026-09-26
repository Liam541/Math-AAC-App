"""Serve the browser-based Math AAC workspace."""

from __future__ import annotations

import argparse
import base64
import functools
import http.server
import io
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


class GoogleCloudEngine:
    # Google is preferred when credentials exist; the request handler falls back to Kokoro.
    def __init__(self) -> None:
        self.client = None
        self.lock = threading.Lock()

    def synthesize(self, text: str, voice: str, speed: float = 1.0, volume: int = 100) -> bytes:
        api_key = os.environ.get("GOOGLE_TTS_API_KEY", "").strip()
        if api_key:
            return self.synthesize_with_api_key(text, voice, speed, volume, api_key)
        with self.lock:
            if self.client is None:
                from google.cloud import texttospeech
                self.client = texttospeech.TextToSpeechClient()
            from google.cloud import texttospeech

            language_code = "-".join(voice.split("-")[:2]) if voice.startswith("en-") else "en-US"
            request = texttospeech.SynthesizeSpeechRequest(
                input=texttospeech.SynthesisInput(text=text),
                voice=texttospeech.VoiceSelectionParams(name=voice, language_code=language_code),
                audio_config=texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.LINEAR16,
                    speaking_rate=max(0.25, min(speed, 4.0)),
                    volume_gain_db=max(-10.0, min((volume - 100) / 5, 10.0)),
                ),
            )
            return self.client.synthesize_speech(request=request).audio_content

    @staticmethod
    def synthesize_with_api_key(text: str, voice: str, speed: float, volume: int, api_key: str) -> bytes:
        language_code = "-".join(voice.split("-")[:2]) if voice.startswith("en-") else "en-US"
        payload = json.dumps({
            "input": {"text": text},
            "voice": {"languageCode": language_code, "name": voice},
            "audioConfig": {"audioEncoding": "LINEAR16", "speakingRate": max(0.25, min(speed, 4.0)), "volumeGainDb": max(-10.0, min((volume - 100) / 5, 10.0))},
        }).encode("utf-8")
        request = urllib.request.Request(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return base64.b64decode(json.loads(response.read())["audioContent"])
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Google Cloud API error {error.code}: {detail}") from error


class KokoroEngine:
    # Offline neural speech engine used when Google is unavailable or the device is offline.
    def __init__(self) -> None:
        self.pipeline = None
        self.lock = threading.Lock()

    def synthesize(self, text: str, voice: str = "af_heart", speed: float = 1.0) -> bytes:
        with self.lock:
            if self.pipeline is None:
                from kokoro import KPipeline
                self.pipeline = KPipeline(lang_code="a")
            import numpy as np
            import soundfile as sf

            chunks = []
            for result in self.pipeline(text, voice=voice, speed=speed):
                audio = result.audio
                if audio is None:
                    continue
                chunks.append(np.asarray(audio.detach().cpu().numpy()))
            if not chunks:
                raise ValueError("Kokoro returned no audio.")
            output = io.BytesIO()
            sf.write(output, np.concatenate(chunks), 24000, format="WAV", subtype="PCM_16")
            return output.getvalue()


KOKORO = KokoroEngine()
GOOGLE_CLOUD = GoogleCloudEngine()

class AACRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Serves the PWA files and exposes speech/status endpoints for the browser frontend.
    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/index%20(1).html")
            self.end_headers()
            return
        if self.path == "/api/tts-status":
            try:
                import kokoro  # type: ignore # noqa: F401
                available = True
                error = ""
            except Exception as exception:
                available = False
                error = str(exception)
            try:
                from google.cloud import texttospeech  # type: ignore # noqa: F401
                google_available = True
            except Exception:
                google_available = False
            self.send_json({"google_cloud": google_available, "google_configured": bool(os.environ.get("GOOGLE_TTS_API_KEY") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")), "kokoro": available, "package_dir": str(KOKORO_PACKAGE_DIR), "error": error})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/speak":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 65536:
                raise ValueError("Speech requests must contain 1 to 65,536 bytes.")
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Speech requests must be JSON objects.")
            text = request.get("text", "")
            if not isinstance(text, str) or not text.strip():
                raise ValueError("Enter text to speak.")
            engine = str(request.get("engine", "google"))
            speed = float(request.get("speed", 1.0))
            volume = int(request.get("volume", 100))
            if engine not in {"google", "kokoro"}:
                raise ValueError("Choose the google or kokoro speech engine.")
            if not math.isfinite(speed) or speed <= 0 or not 0 <= volume <= 100:
                raise ValueError("Use a positive finite speed and a volume from 0 to 100.")
            for key in ("voice", "kokoro_voice"):
                voice = request.get(key, "")
                if not isinstance(voice, str) or any(ord(character) < 32 or ord(character) > 126 for character in voice):
                    raise ValueError("Voice names must use printable ASCII characters.")
        except (ValueError, TypeError, OverflowError) as error:
            self.send_json({"error": str(error)}, status=400)
            return
        try:
            engine_used = engine
            voice_used = str(request.get("voice", "en-US-Chirp3-HD-Achernar"))
            fallback_reason = ""
            if engine == "google":
                try:
                    audio = GOOGLE_CLOUD.synthesize(text, voice_used, speed, volume)
                except Exception as google_error:
                    fallback_reason = str(google_error)
                    try:
                        voice_used = str(request.get("kokoro_voice", "af_heart"))
                        audio = KOKORO.synthesize(text, voice_used, speed)
                        engine_used = "kokoro"
                    except Exception as kokoro_error:
                        raise RuntimeError(f"Google Cloud unavailable ({google_error}); Kokoro fallback unavailable ({kokoro_error})") from google_error
            else:
                voice_used = str(request.get("kokoro_voice", "af_heart"))
                audio = KOKORO.synthesize(text, voice_used, speed)
                engine_used = "kokoro"
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("X-TTS-Engine", engine_used)
            self.send_header("X-TTS-Voice", voice_used)
            if fallback_reason:
                self.send_header("X-TTS-Fallback", "Kokoro")
                # SDK errors can contain newlines and Unicode; HTTP headers cannot.
                reason = " ".join(fallback_reason.splitlines())[:500]
                self.send_header("X-TTS-Fallback-Reason", reason.encode("latin-1", errors="replace").decode("latin-1"))
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except Exception as error:
            self.send_json({"error": str(error)}, status=503)

    def send_json(self, value: dict[str, object], status: int = 200) -> None:
        payload = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Math AAC web workspace.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    handler = functools.partial(AACRequestHandler, directory=str(APP_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    url = f"http://127.0.0.1:{args.port}/index%20(1).html?v=30"
    print(f"Math AAC is running at {url}")
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
