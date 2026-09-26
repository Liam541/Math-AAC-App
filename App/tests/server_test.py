"""Speech endpoint regressions with local, mocked speech engines."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("aac_app", Path(__file__).parents[1] / "app.py")
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class SpeechEndpointTests(unittest.TestCase):
    def test_root_and_old_bookmarks_redirect_to_the_only_entry_page(self):
        for path in ("/", "/index%20(1).html", "/index%20(1).html?v=29"):
            handler = app.AACRequestHandler.__new__(app.AACRequestHandler)
            handler.path = path
            handler.send_response = Mock()
            handler.send_header = Mock()
            handler.end_headers = Mock()
            handler.do_GET()
            handler.send_response.assert_called_once_with(302)
            handler.send_header.assert_called_once_with("Location", "/index.html")
        self.assertTrue((Path(__file__).parents[1] / "index.html").is_file())
        self.assertFalse((Path(__file__).parents[1] / "index (1).html").exists())

    def test_invalid_requests_are_rejected_before_calling_speech_engines(self):
        for payload in ([], {"text": ""}, {"text": "hello", "speed": float("nan")},
                        {"text": "hello", "volume": 101}, {"text": "hello", "engine": "remote"}, {"text": "hello", "voice": "../../file.pt"}, {"text": "hello", "voice": "bad\r\nheader"}):
            with self.subTest(payload=payload):
                body = json.dumps(payload).encode()
                handler = app.AACRequestHandler.__new__(app.AACRequestHandler)
                handler.path = "/api/speak"
                handler.headers = {"Content-Length": str(len(body))}
                handler.rfile = io.BytesIO(body)
                handler.send_json = Mock()
                with patch.object(app.KOKORO, "synthesize") as kokoro:
                    handler.do_POST()
                self.assertEqual(handler.send_json.call_args.kwargs["status"], 400)
                kokoro.assert_not_called()

    def test_invalid_body_lengths_are_rejected_without_reading(self):
        for length in ("-1", "0", "65537", "invalid"):
            with self.subTest(length=length):
                handler = app.AACRequestHandler.__new__(app.AACRequestHandler)
                handler.path = "/api/speak"
                handler.headers = {"Content-Length": length}
                handler.rfile = Mock()
                handler.send_json = Mock()
                handler.do_POST()
                handler.rfile.read.assert_not_called()
                self.assertEqual(handler.send_json.call_args.kwargs["status"], 400)

    def test_default_speech_uses_local_kokoro(self):
        handler = app.AACRequestHandler.__new__(app.AACRequestHandler)
        body = json.dumps({"text": "hello"}).encode()
        handler.path = "/api/speak"
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = io.BytesIO(body)
        handler.wfile = io.BytesIO()
        handler.send_response = Mock()
        handler.end_headers = Mock()
        headers = {}

        def send_header(key, value):
            self.assertNotIn("\n", value)
            self.assertNotIn("\r", value)
            value.encode("latin-1")
            headers[key] = value

        handler.send_header = send_header
        with patch.object(app.KOKORO, "synthesize", return_value=b"wave") as kokoro:
            handler.do_POST()
        kokoro.assert_called_once_with("hello", "af_heart", 1.0)
        handler.send_response.assert_called_once_with(200)
        self.assertEqual(headers["X-TTS-Engine"], "kokoro")
        self.assertEqual(handler.wfile.getvalue(), b"wave")


if __name__ == "__main__":
    unittest.main()
