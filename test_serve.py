import errno
import io
import unittest
import tempfile
from pathlib import Path
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

import serve


class FakeServer:
    def __init__(self, address, handler):
        self.address = address
        self.handler = handler
        self.closed = False
        self.served = False

    def serve_forever(self):
        self.served = True

    def server_close(self):
        self.closed = True


class ServeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "index.html").write_text("built application", encoding="utf-8")
        root_patch = patch.object(serve, "ROOT", self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)

    def test_missing_build_explains_new_workflow(self):
        stderr = io.StringIO()
        with patch.object(serve, "ROOT", self.root / "missing"):
            with patch.object(serve, "ThreadingHTTPServer") as server:
                with redirect_stderr(stderr):
                    self.assertEqual(serve.main(), 1)
                server.assert_not_called()
        self.assertIn("npm run build", stderr.getvalue())

    def test_starts_and_closes_server(self):
        fake_server = FakeServer(("127.0.0.1", serve.PORT), serve.Handler)

        with patch.object(serve, "ThreadingHTTPServer", return_value=fake_server):
            with redirect_stdout(io.StringIO()):
                result = serve.main()

        self.assertEqual(result, 0)
        self.assertTrue(fake_server.served)
        self.assertTrue(fake_server.closed)

    def test_reports_port_conflict_without_traceback(self):
        error = OSError(errno.EADDRINUSE, "Address already in use")
        stderr = io.StringIO()

        with patch.object(serve, "ThreadingHTTPServer", side_effect=error):
            with redirect_stderr(stderr):
                result = serve.main()

        self.assertEqual(result, 1)
        self.assertIn(f"Port {serve.PORT} is already in use.", stderr.getvalue())
        self.assertIn(f"PORT={serve.PORT + 1} python3 serve.py", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
