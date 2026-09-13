#!/usr/bin/env python3
"""
analysis/probe_session.py - what the frontend's session handling has to cope with.

The dump established that login returns expires_in: 900 plus a refresh_token, and
that one refresh call works. The app needs more than that before it can promise
"still working thirty minutes after login":

  quick mode (default, 10 requests, demo2):
    - what a wrong password returns, so the login screen can show it
    - whether a refresh token is single-use (rotation), which decides whether two
      tabs or a double-fired effect refreshing at once can log the user out
    - whether the old access token keeps working after a refresh
    - whether the documented POST /auth/logout exists and what it invalidates

  --lifetime (5 requests over 31 minutes, demo3):
    - log in, wait past the 900 s access-token lifetime and past the 30-minute
      requirement, then check the stale access token, refresh, and fetch data

Separate demo users keep this from logging out a browser session under test.
Tokens never reach disk: only status codes, error details and booleans.
Writes data/_probe/session.json or data/_probe/session_lifetime.json.
"""
import argparse, json, os, time
from datetime import datetime, timezone
from pathlib import Path
import requests
try:
    from dotenv import load_dotenv; load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ["BASE_URL"].rstrip("/")
KEY = os.environ["API_KEY"]
PASSWORD = os.environ.get("DEMO_PASSWORD", "")
DELAY = float(os.environ.get("DELAY_SECONDS", "0.15"))
H = {"X-API-Key": KEY, "Accept": "application/json"}


def now():
    return datetime.now(timezone.utc).isoformat()


def call(method, path, token=None, body=None, note=""):
    headers = dict(H)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    params = {"limit": 1} if path.startswith("/v1/") else None
    r = requests.request(method, f"{BASE}{path}", headers=headers, json=body,
                         params=params, timeout=90)
    time.sleep(DELAY)
    try:
        payload = r.json()
    except ValueError:
        payload = None
    detail = payload.get("detail") if isinstance(payload, dict) else None
    keys = sorted(payload.keys()) if isinstance(payload, dict) else None
    # Short scalar fields such as logout's `ok` and `note`; never the tokens.
    scalars = ({k: v for k, v in payload.items()
                if k not in ("access_token", "refresh_token", "token", "results")
                and isinstance(v, (str, int, float, bool))}
               if isinstance(payload, dict) else None)
    ms = round(r.elapsed.total_seconds() * 1000)
    print(f"  {r.status_code}  {ms:>6} ms  {method} {path:<16} {note}  {detail or ''}")
    return r.status_code, payload, {"at": now(), "method": method, "path": path,
                                    "note": note, "status": r.status_code, "ms": ms,
                                    "detail": detail, "body_keys": keys,
                                    "scalars": scalars}


def tokens(payload):
    if not isinstance(payload, dict):
        return None, None
    return payload.get("access_token"), payload.get("refresh_token")


def quick(email):
    steps = []

    s, _, rec = call("POST", "/auth/login", body={"email": email, "password": "wrong-password"},
                     note="wrong password")
    steps.append(rec)

    s, _, rec = call("POST", "/auth/login", body={"email": "nobody@ivy.homes", "password": "x"},
                     note="unknown user")
    steps.append(rec)

    s, p, rec = call("POST", "/auth/login", body={"email": email, "password": PASSWORD},
                     note="login")
    steps.append(rec)
    if s != 200:
        raise SystemExit("login failed; nothing else to test")
    at1, rt1 = tokens(p)

    s, p, rec = call("POST", "/auth/refresh", body={"refresh_token": rt1}, note="refresh #1 with rt1")
    at2, rt2 = tokens(p)
    rec["access_token_changed"] = at2 is not None and at2 != at1
    rec["refresh_token_changed"] = rt2 is not None and rt2 != rt1
    steps.append(rec)

    s, _, rec = call("POST", "/auth/refresh", body={"refresh_token": rt1},
                     note="reuse rt1 (is it single-use?)")
    steps.append(rec)

    s, _, rec = call("GET", "/v1/listings", token=at1, note="old access token after refresh")
    steps.append(rec)

    s, _, rec = call("GET", "/v1/listings", token=at2, note="new access token")
    steps.append(rec)

    s, _, rec = call("POST", "/auth/logout", token=at2, note="documented logout")
    steps.append(rec)

    s, _, rec = call("GET", "/v1/listings", token=at2, note="access token after logout")
    steps.append(rec)

    s, _, rec = call("POST", "/auth/refresh", body={"refresh_token": rt2},
                     note="refresh token after logout")
    steps.append(rec)

    return {"mode": "quick", "user": email, "steps": steps}


def lifetime(email, wait_seconds):
    steps = []
    s, p, rec = call("POST", "/auth/login", body={"email": email, "password": PASSWORD}, note="login")
    steps.append(rec)
    if s != 200:
        raise SystemExit("login failed")
    at1, rt1 = tokens(p)
    rec["expires_in"] = p.get("expires_in")

    print(f"  waiting {wait_seconds}s ...", flush=True)
    time.sleep(wait_seconds)

    s, _, rec = call("GET", "/v1/listings", token=at1, note=f"access token after {wait_seconds}s")
    steps.append(rec)

    s, p, rec = call("POST", "/auth/refresh", body={"refresh_token": rt1},
                     note=f"refresh token after {wait_seconds}s")
    steps.append(rec)
    at2, _ = tokens(p)

    if at2:
        s, _, rec = call("GET", "/v1/listings", token=at2, note="data call with refreshed token")
        steps.append(rec)

    return {"mode": "lifetime", "user": email, "waited_seconds": wait_seconds, "steps": steps}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lifetime", action="store_true")
    ap.add_argument("--wait", type=int, default=31 * 60)
    args = ap.parse_args()

    if args.lifetime:
        result = lifetime("demo3@ivy.homes", args.wait)
        out = ROOT / "data" / "_probe" / "session_lifetime.json"
    else:
        result = quick("demo2@ivy.homes")
        out = ROOT / "data" / "_probe" / "session.json"

    result["run_at"] = now()
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
