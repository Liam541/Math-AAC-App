"""Serve the browser-based Math AAC workspace."""

from __future__ import annotations

import argparse
import functools
import http.server
import io
import json
import os
import pathlib
import sys
import threading
import webbrowser


APP_DIR = pathlib.Path(__file__).resolve().parent
KOKORO_PACKAGE_DIR = pathlib.Path(os.environ.get("KOKORO_PACKAGE_DIR", r"C:\MathAAC-Kokoro"))
if KOKORO_PACKAGE_DIR.is_dir() and str(KOKORO_PACKAGE_DIR) not in sys.path:
    sys.path.insert(0, str(KOKORO_PACKAGE_DIR))


class KokoroEngine:
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
            for _, _, audio in self.pipeline(text, voice=voice, speed=speed):
                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().numpy()
                chunks.append(np.asarray(audio))
            if not chunks:
                raise ValueError("Kokoro returned no audio.")
            output = io.BytesIO()
            sf.write(output, np.concatenate(chunks), 24000, format="WAV", subtype="PCM_16")
            return output.getvalue()


KOKORO = KokoroEngine()


class AACRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/api/tts-status":
            try:
                import kokoro  # type: ignore # noqa: F401
                available = True
                error = ""
            except Exception as exception:
                available = False
                error = str(exception)
            self.send_json({"kokoro": available, "package_dir": str(KOKORO_PACKAGE_DIR), "error": error})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/speak":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length))
            audio = KOKORO.synthesize(str(request.get("text", "")), str(request.get("voice", "af_heart")), float(request.get("speed", 1.0)))
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
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
    url = f"http://127.0.0.1:{args.port}/index.html"
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
