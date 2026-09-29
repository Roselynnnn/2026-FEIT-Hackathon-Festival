#!/usr/bin/env python3
"""Serve the static QVM digital-twin demo locally."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import errno
import os
import sys


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8080"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> int:
    url = f"http://127.0.0.1:{PORT}"

    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise

        print(f"Port {PORT} is already in use.", file=sys.stderr)
        print(f"The app may already be running at {url}", file=sys.stderr)
        print(
            f"To start another copy, run: PORT={PORT + 1} python3 serve.py",
            file=sys.stderr,
        )
        return 1

    print(f"QVM Works Digital Twin: {url}")
    print("Press Control-C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
