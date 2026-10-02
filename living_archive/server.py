#!/usr/bin/env python3
"""Serve the archive and write archive.json when the page saves."""

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "archive.json"
MAX_BYTES = 5_000_000


class ArchiveHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/archive":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BYTES:
            self.send_error(400, "Unexpected archive size")
            return

        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(400, "Invalid JSON")
            return

        weeks = data.get("weeks") if isinstance(data, dict) else None
        if not isinstance(weeks, list) or any(not valid_week(week) for week in weeks):
            self.send_error(400, "Expected a weeks list")
            return

        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        temporary = ARCHIVE.with_suffix(".json.tmp")
        temporary.write_text(text, encoding="utf-8")
        temporary.replace(ARCHIVE)

        body = b'{"ok":true}\n'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def valid_week(week):
    return isinstance(week, dict) and isinstance(week.get("id"), str) and week.get("id")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8091), ArchiveHandler)
    print("Serving http://127.0.0.1:8091")
    server.serve_forever()
