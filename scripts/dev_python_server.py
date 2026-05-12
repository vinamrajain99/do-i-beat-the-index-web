"""Local dev server for api/analyze.py — Vercel-CLI-free alternative.

Runs the same `handler` class that Vercel's Python runtime invokes in
production, on a side port. Pair with the dev-only rewrite in
next.config.ts: the browser POSTs to /api/analyze on Next.js's port (3000),
Next.js proxies the request to this server on PY_DEV_PORT.

Run:
    source .venv/bin/activate
    python scripts/dev_python_server.py
"""

from __future__ import annotations

import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

# Ensure the project root is on sys.path so `from api.analyze import handler`
# resolves whether this script is run from the root or from scripts/.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.analyze import handler  # noqa: E402


def main() -> int:
    port = int(os.environ.get("PY_DEV_PORT", "3001"))
    bind = "127.0.0.1"
    server = ThreadingHTTPServer((bind, port), handler)
    print(
        f"Python dev server: http://{bind}:{port}/api/analyze  "
        f"(POST only). Next.js dev rewrite forwards /api/analyze here."
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
