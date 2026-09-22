"""HTTP contract regressions; optional speech packages are mocked."""
import http.client
import importlib.util
import json
import pathlib
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('aac_app', pathlib.Path(__file__).parents[1] / 'app.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class SpeechAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = app.http.server.ThreadingHTTPServer(('127.0.0.1', 0), app.AACRequestHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, payload, path='/api/speak', method='POST'):
        connection = http.client.HTTPConnection(*self.server.server_address)
        connection.request(method, path, json.dumps(payload) if payload is not None else None, {'Content-Type': 'application/json'})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_bad_requests_never_synthesize(self):
        with patch.object(app.KOKORO, 'synthesize') as mock:
            for payload in [[], {'text': ''}, {'text': None}, {'text': 'x' * 2001}, {'text': 'ok', 'engine': 'bad'}, {'text': 'ok', 'speed': 'nan'}, {'text': 'ok', 'speed': 100}, {'text': 'ok', 'kokoro_voice': '../bad'}]:
                with self.subTest(payload=str(payload)[:80]):
                    self.assertEqual(self.request(payload)[0], 400)
            mock.assert_not_called()

    def test_local_default_and_audio_headers(self):
        with patch.object(app.KOKORO, 'synthesize', return_value=b'RIFFaudio') as mock:
            status, headers, body = self.request({'text': 'hello'})
            self.assertEqual(status, 200)
            self.assertEqual(body, b'RIFFaudio')
            self.assertEqual(headers['Cache-Control'], 'no-store')
            self.assertEqual(headers['X-TTS-Engine'], 'kokoro')
            mock.assert_called_once_with('hello', 'af_heart', 1.0)

    def test_cloud_failure_returns_promptly_without_chained_fallback(self):
        with patch.object(app.GOOGLE_CLOUD, 'synthesize', side_effect=RuntimeError('private credentials detail')), patch.object(app.KOKORO, 'synthesize') as local:
            status, _, body = self.request({'text': 'hello', 'engine': 'google'})
            self.assertEqual(status, 503)
            self.assertNotIn(b'private credentials', body)
            local.assert_not_called()

    def test_status_does_not_load_models(self):
        with patch.object(app, 'package_available', return_value=True):
            status, headers, body = self.request(None, '/api/tts-status', 'GET')
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(body)['kokoro'])
            self.assertEqual(headers['Cache-Control'], 'no-store')

    def test_body_limit(self):
        self.assertEqual(self.request({'text': 'x' * 40000})[0], 413)

    def test_busy_engine_does_not_queue_more_utterances(self):
        with app.KOKORO.lock:
            status, _, _ = self.request({'text': 'newer message'})
            self.assertEqual(status, 503)

    def test_updated_shell_is_revalidated(self):
        status, headers, body = self.request(None, '/App/index.html?v=21', 'GET')
        self.assertEqual(status, 200)
        self.assertEqual(headers['Cache-Control'], 'no-cache')
        self.assertNotIn(b'data-tab="chemistry"', body)
        self.assertIn(b'id="appearance"', body)


if __name__ == '__main__':
    unittest.main()
