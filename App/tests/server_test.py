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
    def test_multiline_unicode_cloud_error_does_not_break_kokoro_response(self):
        handler = app.AACRequestHandler.__new__(app.AACRequestHandler)
        body = json.dumps({"text": "hello", "engine": "google"}).encode()
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
        with patch.object(app.GOOGLE_CLOUD, "synthesize", side_effect=RuntimeError("Cloud failed\r\nVoice → unavailable")), patch.object(app.KOKORO, "synthesize", return_value=b"wave"):
            handler.do_POST()
        handler.send_response.assert_called_once_with(200)
        self.assertEqual(headers["X-TTS-Engine"], "kokoro")
        self.assertEqual(handler.wfile.getvalue(), b"wave")


if __name__ == "__main__":
    unittest.main()
