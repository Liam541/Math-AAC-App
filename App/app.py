"""Serve the browser-based Math AAC workspace."""

from __future__ import annotations

import argparse
from collections import OrderedDict
import functools
import http.server
import io
import json
import math
import os
import pathlib
import sys
import threading
import webbrowser


APP_DIR = pathlib.Path(__file__).resolve().parent
# Kokoro is loaded from a short Windows path to avoid PyTorch long-path failures.
KOKORO_PACKAGE_DIR = pathlib.Path(os.environ.get("KOKORO_PACKAGE_DIR", r"C:\MathAAC-Kokoro"))
if KOKORO_PACKAGE_DIR.is_dir() and str(KOKORO_PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(KOKORO_PACKAGE_DIR))


class KokoroEngine:
    # Local neural speech with resident models and a bounded in-memory audio cache.
    def __init__(self) -> None:
        self.pipelines = {}
        self.cache = OrderedDict()
        self.cache_bytes = 0
        self.ready = False
        self.error = ""
        self.lock = threading.Lock()

    def synthesize(self, text: str, voice: str = "af_heart", speed: float = 1.0) -> bytes:
        with self.lock:
            key = (text, voice, speed)
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key]
            if os.environ.get("HF_HUB_OFFLINE") == "1" and not self.pipelines:
                import spacy
                if not spacy.util.is_package("en_core_web_sm"):
                    raise RuntimeError("Run python App/app.py --setup-voices once while online.")
            from kokoro import KPipeline
            language = voice[0]
            if language not in self.pipelines:
                options = {"model": next(iter(self.pipelines.values())).model} if self.pipelines else {}
                self.pipelines[language] = KPipeline(lang_code=language, repo_id="hexgrad/Kokoro-82M", **options)
            pipeline = self.pipelines[language]
            import numpy as np
            import soundfile as sf

            chunks = []
            for result in pipeline(text, voice=voice, speed=speed):
                audio = result.audio
                if audio is None:
                    continue
                chunks.append(np.asarray(audio.detach().cpu().numpy()))
            if not chunks:
                raise ValueError("Kokoro returned no audio.")
            output = io.BytesIO()
            sf.write(output, np.concatenate(chunks), 24000, format="WAV", subtype="PCM_16")
            audio = output.getvalue()
            if len(audio) <= 16 * 1024 * 1024:
                self.cache[key] = audio
                self.cache_bytes += len(audio)
                while self.cache_bytes > 16 * 1024 * 1024 or len(self.cache) > 64:
                    self.cache_bytes -= len(self.cache.popitem(last=False)[1])
            self.ready = True
            self.error = ""
            return audio

    def warmup(self) -> None:
        try:
            self.synthesize("Ready.")
        except Exception as error:
            self.error = str(error)
            print(f"Local speech unavailable: {error}")


KOKORO = KokoroEngine()
LOCAL_VOICES = {"af_heart", "af_bella", "af_sarah", "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"}

class AACRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Serves the PWA files and exposes speech/status endpoints for the browser frontend.
    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/index%20(1).html")
            self.end_headers()
            return
        if self.path == "/api/tts-status":
            self.send_json({"kokoro": KOKORO.ready, "error": KOKORO.error,
                            "loading": not KOKORO.ready and not KOKORO.error})
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
            engine = str(request.get("engine", "kokoro"))
            speed = float(request.get("speed", 1.0))
            volume = int(request.get("volume", 100))
            if engine != "kokoro":
                raise ValueError("Choose the local Kokoro speech engine.")
            if not math.isfinite(speed) or speed <= 0 or not 0 <= volume <= 100:
                raise ValueError("Use a positive finite speed and a volume from 0 to 100.")
            voice_used = request.get("voice", request.get("kokoro_voice", "af_heart"))
            if not isinstance(voice_used, str) or voice_used not in LOCAL_VOICES:
                raise ValueError("Choose an installed Kokoro voice.")
        except (ValueError, TypeError, OverflowError) as error:
            self.send_json({"error": str(error)}, status=400)
            return
        try:
            audio = KOKORO.synthesize(text, voice_used, speed)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("X-TTS-Engine", "kokoro")
            self.send_header("X-TTS-Voice", voice_used)
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
    parser.add_argument("--setup-voices", action="store_true", help="Download local model and voices once, then exit.")
    args = parser.parse_args()
    if args.setup_voices:
        os.environ["HF_HUB_OFFLINE"] = "0"
        os.environ["TRANSFORMERS_OFFLINE"] = "0"
        for voice in sorted(LOCAL_VOICES):
            print(f"Preparing {voice}...")
            KOKORO.synthesize("Ready.", voice)
        print("Local voices are installed. Start the app normally to use them offline.")
        return
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    threading.Thread(target=KOKORO.warmup, daemon=True).start()
    handler = functools.partial(AACRequestHandler, directory=str(APP_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    url = f"http://127.0.0.1:{args.port}/index%20(1).html?v=31"
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
