"""Vercel Python serverless function — HTTP wrapper around worker.analyze.

POST /api/analyze
  Headers:  Authorization: Bearer <supabase user access_token>
  Body:     {"analysis_id": "<uuid>"}

Flow:
  1. Verify the JWT against SUPABASE_JWT_SECRET (HS256). Reject 401 if bad.
  2. Read the analyses row (service_role bypasses RLS). Confirm the row's
     user_id matches the JWT subject. Reject 403 if not.
  3. Call worker.analyze.main(analysis_id). That function performs the
     CAS (pending → running), the parse + simulate + write-back, and the
     fail-path (status='failed' + error_message).
  4. Return 200 with the exit code. The client polls the DB; the response
     body is informational.
"""

from __future__ import annotations

import json
import os
import re
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

import dotenv
import jwt as pyjwt
from supabase import create_client

# Vercel includes the project root on sys.path, so `from worker...` works
# both in production and under `vercel dev`.
from worker.analyze import main as run_analysis

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

_ASYM_ALGS = ("ES256", "RS256", "EdDSA")

# Cached JWKS clients keyed by JWKS URL. Avoids refetching the key set on
# every request. PyJWKClient itself caches inside the instance; we just need
# to reuse the instance.
_jwks_clients: dict[str, "pyjwt.PyJWKClient"] = {}


def _get_jwks_client(supabase_url: str) -> "pyjwt.PyJWKClient":
    url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    client = _jwks_clients.get(url)
    if client is None:
        client = pyjwt.PyJWKClient(url, cache_keys=True)
        _jwks_clients[url] = client
    return client


def _verify_supabase_jwt(
    token: str, supabase_url: str, hs256_secret: str | None
) -> dict:
    """Verify a Supabase user session JWT. Returns the claims dict on
    success, or raises a pyjwt.PyJWTError-derived exception on failure.

    Handles both:
      - Legacy HS256 tokens signed with the project's shared JWT secret.
      - Modern asymmetric tokens (ES256 / RS256 / EdDSA) verified against
        the project's published JWKS.
    """
    header = pyjwt.get_unverified_header(token)
    alg = header.get("alg", "")

    if alg == "HS256":
        if not hs256_secret:
            raise pyjwt.InvalidTokenError(
                "HS256 token but server has no SUPABASE_JWT_SECRET configured"
            )
        return pyjwt.decode(
            token,
            hs256_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )

    if alg in _ASYM_ALGS:
        jwks = _get_jwks_client(supabase_url)
        signing_key = jwks.get_signing_key_from_jwt(token)
        return pyjwt.decode(
            token,
            signing_key.key,
            algorithms=[alg],
            audience="authenticated",
        )

    raise pyjwt.InvalidTokenError(f"unsupported JWT alg: {alg!r}")


def _load_env() -> None:
    # No-op if .env.local is absent (i.e. in production on Vercel — env vars
    # come from project config there). Locally under `vercel dev`, this picks
    # up SUPABASE_JWT_SECRET etc.
    repo_root = Path(__file__).resolve().parent.parent
    dotenv.load_dotenv(repo_root / ".env.local")


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires this name
    def _send_json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 — http.server convention
        try:
            _load_env()

            # --- Parse body ---
            try:
                length = int(self.headers.get("Content-Length") or "0")
                raw = self.rfile.read(length) if length else b""
                body = json.loads(raw.decode("utf-8") or "{}")
            except (ValueError, json.JSONDecodeError) as e:
                self._send_json(400, {"ok": False, "error": f"invalid JSON body: {e}"})
                return

            analysis_id = body.get("analysis_id")
            if not isinstance(analysis_id, str) or not _UUID_RE.match(analysis_id):
                self._send_json(
                    400,
                    {"ok": False, "error": "missing or malformed analysis_id"},
                )
                return

            # --- Read env (we need url for both JWKS lookup and the
            # service_role client below) ---
            url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            srk = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            if not url or not srk:
                self._send_json(
                    500,
                    {
                        "ok": False,
                        "error": "server missing supabase url or service role key",
                    },
                )
                return

            # --- Verify JWT ---
            auth = self.headers.get("Authorization") or ""
            if not auth.startswith("Bearer "):
                self._send_json(
                    401, {"ok": False, "error": "missing Authorization bearer"}
                )
                return
            token = auth[len("Bearer ") :].strip()

            hs256_secret = os.environ.get("SUPABASE_JWT_SECRET")

            try:
                claims = _verify_supabase_jwt(token, url, hs256_secret)
            except pyjwt.PyJWTError as e:
                self._send_json(
                    401, {"ok": False, "error": f"invalid token: {e}"}
                )
                return

            jwt_sub = claims.get("sub")
            if not isinstance(jwt_sub, str):
                self._send_json(
                    401, {"ok": False, "error": "token missing sub claim"}
                )
                return

            sb = create_client(url, srk)
            row = (
                sb.table("analyses")
                .select("id,user_id,status")
                .eq("id", analysis_id)
                .maybe_single()
                .execute()
            )
            if not row or not row.data:
                # Don't leak existence: 403 either way.
                self._send_json(
                    403, {"ok": False, "error": "not authorized for this analysis"}
                )
                return
            if row.data["user_id"] != jwt_sub:
                self._send_json(
                    403, {"ok": False, "error": "not authorized for this analysis"}
                )
                return

            # --- Run the worker. CAS inside main() makes this idempotent. ---
            exit_code = run_analysis(analysis_id)

            self._send_json(
                200,
                {
                    "ok": exit_code == 0,
                    "analysis_id": analysis_id,
                    "exit_code": exit_code,
                },
            )
            return

        except Exception as e:  # noqa: BLE001
            tb = traceback.format_exc()
            print(f"api/analyze.py unhandled error: {e}\n{tb}", file=sys.stderr)
            try:
                self._send_json(
                    500, {"ok": False, "error": f"{type(e).__name__}: {e}"}
                )
            except Exception:  # noqa: BLE001
                pass

    def do_GET(self) -> None:  # noqa: N802
        self._send_json(
            405, {"ok": False, "error": "method not allowed; use POST"}
        )
