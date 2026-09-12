#!/usr/bin/env python3
"""
dump.py — pull the entire API down once, then stop touching the network.

Design note (this is the point of the script, read it before you change anything):

The documentation for this API is known to be wrong in places. So this script
assumes NOTHING the documentation says. It discovers, empirically:

  - which auth mechanism the key actually works with (and records every one tried)
  - which of the documented endpoint paths actually exist
  - where the records live in the response envelope
  - which pagination parameter names the server actually honours
  - what limit/offset the server SAYS it used on every page, vs what was asked
  - when a collection is exhausted, and whether the server's own "more remain"
    signal agrees with the page being short

Everything it learns is written to disk alongside the data, because "the server
told me it used limit=50 when I asked for limit=200" IS a finding for Part 3.
Raw pages are kept verbatim, never just the merged records — the envelopes are
the evidence. Nothing is normalised here; that is a separate pass.

Usage:
    cp .env.example .env      # fill in BASE_URL and API_KEY
    pip install requests python-dotenv
    python dump.py

Output:
    data/raw/<collection>/page_0000.json   every response body, untouched
    data/<collection>.json                 merged records, deduped by nothing
    data/_probe/auth.json                  status of every auth scheme tried
    data/_probe/unauth.json                every endpoint called with no key
    data/_probe/endpoints.json             status + shape of every path tried
    data/_probe/pagination.json            which param names actually paginate
    data/_probe/pages_<collection>.json    per-page requested vs echoed vs returned
    data/_probe/integrity.json             cross-page duplicate IDs, total vs paged
    data/_probe/by_id.json                 documented single-record paths, probed
    data/_probe/requests.jsonl             every request made, with timing
    data/_manifest.json                    summary: counts, sha256, config
"""

import base64
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # .env optional; env vars work fine on their own


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("BASE_URL", "").rstrip("/") + "/"
API_KEY = os.environ.get("API_KEY", "")

if not BASE_URL.strip("/") or not API_KEY:
    sys.exit("Set BASE_URL and API_KEY (copy .env.example to .env and fill it in).")

CITY = os.environ.get("CITY", "")
ASSIGNED_LOCALITY = os.environ.get("ASSIGNED_LOCALITY", "")

# The data endpoints reject a bare key with "missing bearer token - log in at
# POST /auth/login first", so the dump logs in as a demo user before paging.
DEMO_EMAIL = os.environ.get("DEMO_EMAIL", "demo1@ivy.homes")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "")
LOGIN_PATH = "/auth/login"

OUT = Path(os.environ.get("OUT_DIR", "data"))
RAW = OUT / "raw"
PROBE = OUT / "_probe"

# Be a good citizen. The limit is 1200/min; this is ~6/sec, nowhere near it.
DELAY_SECONDS = float(os.environ.get("DELAY_SECONDS", "0.15"))
TIMEOUT = 30
MAX_PAGES = 500          # safety net against an infinite pagination loop
HARD_REQUEST_CAP = 1500  # absolute ceiling; script aborts rather than hammering

# The documentation says limit max is 200. Ask for that on every page and
# record what the server actually used. If it caps lower, that is H-006.
REQUESTED_LIMIT = 200

# Endpoint paths to try — every collection path the documentation mentions.
# Nothing here is a guess: the assignment forbids scanning. Single-record paths
# (which need a real ID) are probed separately after the dump, see BY_ID_PATHS.
CANDIDATE_ENDPOINTS = [
    "/health",
    "/v1/listings",
    "/v1/rentals",
    "/v1/projects",
    "/v1/analytics/summary",
    "/v1/favourites",
]

# Documented single-record paths, probed once each with a real ID from the dump.
# The documentation itself is inconsistent — singular /v1/listing/{id} but plural
# /v1/rentals/{id} and /v1/projects/{id} — so the plural listing variant is a
# documented-shape check, not a scan.
BY_ID_PATHS = [
    ("/v1/listings", "/v1/listing/{id}"),
    ("/v1/listings", "/v1/listings/{id}"),
    ("/v1/listings", "/v1/listings/{id}/similar"),
    ("/v1/rentals",  "/v1/rentals/{id}"),
    ("/v1/projects", "/v1/projects/{id}"),
]

# Which of the above are paginated collections we want dumped in full.
# Filled in automatically from the probe, but you can pin it here if needed.
COLLECTIONS_OVERRIDE = []  # e.g. ["/v1/listings", "/v1/rentals", "/v1/projects"]

# Where the API key might go. The DOCUMENTED placement goes first (query param
# api_key). Every placement is tried — alone, then combined with a session
# token — and every status recorded, because which one works is itself an
# `auth` finding. The documented placement is used if it works, otherwise the
# first that does.
KEY_SCHEMES = [
    ("query",  "api_key", "{key}"),
    ("header", "X-API-Key", "{key}"),
    ("header", "api-key", "{key}"),
]

# Pagination param-name pairs to test. The DOCUMENTED pair (limit + page,
# 1-indexed) goes first. A pair only "works" if limit actually caps the page
# AND the page/offset param actually shifts the window.
PAGINATION_SCHEMES = [
    ("limit", "page"),
    ("limit", "offset"),
    ("per_page", "page"),
    ("page_size", "page"),
    ("limit", "skip"),
]

# Envelope keys the server might use to echo what it did. Checked in order.
ECHO_LIMIT_KEYS = ("limit", "page_size", "per_page")
ECHO_OFFSET_KEYS = ("offset", "page", "skip")
ECHO_TOTAL_KEYS = ("total", "total_count", "count")
ECHO_MORE_KEYS = ("has_more", "hasMore", "has_next", "next")

REQUEST_LOG = []
REQUEST_COUNT = 0


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def call(path, params=None, creds=None, note="", method="GET", json_body=None):
    """One request. Logs everything. Backs off on 429. Never raises on 4xx/5xx.

    `creds` is a list of (kind, name, value) triples — kind is "header" or
    "query" — so a key placement and a session token can be combined.
    """
    global REQUEST_COUNT

    if REQUEST_COUNT >= HARD_REQUEST_CAP:
        sys.exit(f"Hit the {HARD_REQUEST_CAP}-request safety cap. Something is looping.")

    url = urljoin(BASE_URL, path.lstrip("/"))
    headers = {"Accept": "application/json"}
    params = dict(params or {})

    for kind, name, value in (creds or []):
        (headers if kind == "header" else params)[name] = value

    for attempt in range(4):
        started = time.monotonic()
        try:
            resp = requests.request(method, url, headers=headers, params=params,
                                    json=json_body, timeout=TIMEOUT)
        except requests.RequestException as exc:
            REQUEST_COUNT += 1
            REQUEST_LOG.append({"path": path, "params": params, "error": str(exc), "note": note})
            return None, {"error": str(exc)}
        elapsed = time.monotonic() - started
        REQUEST_COUNT += 1

        # Redact the key before anything touches disk.
        safe_params = {k: ("<key>" if API_KEY and API_KEY in str(v) else v)
                       for k, v in params.items()}
        REQUEST_LOG.append({
            "at": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "path": path,
            "params": safe_params,
            "status": resp.status_code,
            "ms": round(elapsed * 1000),
            "bytes": len(resp.content),
            "note": note,
        })

        if resp.status_code == 429:
            wait = float(resp.headers.get("Retry-After", 2 ** attempt))
            print(f"  429 rate limited, waiting {wait}s")
            time.sleep(wait)
            continue

        time.sleep(DELAY_SECONDS)

        try:
            body = resp.json()
        except ValueError:
            body = None

        return resp, body

    return None, {"error": "gave up after repeated 429s"}


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def find_records(body):
    """Locate the list of record dicts in an unknown envelope shape.

    Returns (key_path, records). key_path is None if the body IS the list.
    """
    if isinstance(body, list):
        return None, body
    if not isinstance(body, dict):
        return None, []

    # Documented name first, then other conventional ones, then "first key
    # holding dicts".
    for key in ("results", "data", "items", "records", "listings", "rentals", "projects"):
        val = body.get(key)
        if isinstance(val, list) and (not val or isinstance(val[0], dict)):
            return key, val

    for key, val in body.items():
        if isinstance(val, list) and val and isinstance(val[0], dict):
            return key, val

    return None, []


def echo(body, keys):
    """First scalar the envelope exposes under any of `keys`, else None."""
    if not isinstance(body, dict):
        return None
    for k in keys:
        if k in body and not isinstance(body[k], (list, dict)):
            return body[k]
    return None


def record_id(rec):
    for k in ("listing_id", "project_id", "id"):
        if k in rec:
            return rec[k]
    return None


def key_cred(scheme):
    kind, name, template = scheme
    return (kind, name, template.format(key=API_KEY))


def jwt_claims(token):
    """Decode the payload of a JWT without verifying it. None if not a JWT."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return None


def status_of(resp):
    # requests.Response is falsy on 4xx/5xx, so never write `if resp`.
    return resp.status_code if resp is not None else None


def login(key_scheme):
    """POST /auth/login as the demo user. Returns (token, record) or (None, record)."""
    if not DEMO_PASSWORD:
        return None, {"skipped": "DEMO_PASSWORD not set in .env"}
    resp, body = call(LOGIN_PATH, creds=[key_cred(key_scheme)], method="POST",
                      json_body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
                      note=f"login via {key_scheme[1]}")
    status = status_of(resp)
    # Documented field is `token`; the server actually sends `access_token`.
    token = None
    if isinstance(body, dict):
        token = body.get("access_token") or body.get("token")
    claims = jwt_claims(token) if token else None
    safe_body = dict(body) if isinstance(body, dict) else body
    if isinstance(safe_body, dict):
        for secret in ("token", "access_token", "refresh_token"):
            if secret in safe_body:
                safe_body[secret] = "<redacted>"
    record = {
        "key_scheme": list(key_scheme),
        "status": status,
        "body": safe_body,
        "jwt_claims": claims,
        "lifetime_from_claims_seconds": (claims["exp"] - claims["iat"])
        if claims and "exp" in claims and "iat" in claims else None,
    }
    return token, record


def detect_auth():
    """Work out what the data endpoints actually require. Record everything.

    Three phases, each written to data/_probe/auth.json:
      1. key alone, every placement          - does the documented one work?
      2. login, trying each placement          - which does /auth/login accept?
      3. key + session token, every placement  - what do data endpoints want?
    """
    target = next((p for p in CANDIDATE_ENDPOINTS if p != "/health"), "/health")
    report = {"documented_key_placement": list(KEY_SCHEMES[0]),
              "key_only": [], "login": [], "key_plus_token": []}

    print("  phase 1: key only")
    for scheme in KEY_SCHEMES:
        resp, body = call(target, creds=[key_cred(scheme)], note="auth probe: key only")
        status = status_of(resp)
        detail = body.get("detail") if isinstance(body, dict) else None
        report["key_only"].append({"scheme": list(scheme), "status": status, "detail": detail})
        print(f"    {scheme[0]}:{scheme[1]} -> {status}  {detail or ''}")
        if status == 200:
            report["chosen"] = {"key": list(scheme), "token": False}
            write_json(PROBE / "auth.json", report)
            return [key_cred(scheme)]

    print("  phase 2: login")
    token, token_scheme = None, None
    for scheme in KEY_SCHEMES:
        tok, rec = login(scheme)
        report["login"].append(rec)
        print(f"    login via {scheme[0]}:{scheme[1]} -> {rec.get('status', rec.get('skipped'))}")
        if tok:
            token, token_scheme = tok, scheme
            break

    if not token:
        write_json(PROBE / "auth.json", report)
        sys.exit("Could not log in. Data endpoints demand a bearer token; set "
                 "DEMO_EMAIL and DEMO_PASSWORD in .env (they are in the registration "
                 "email) and check data/_probe/auth.json for what the server said.")

    bearer = ("header", "Authorization", f"Bearer {token}")

    print("  phase 3: key + token")
    working = []
    for scheme in KEY_SCHEMES:
        resp, body = call(target, creds=[key_cred(scheme), bearer],
                          note="auth probe: key + token")
        status = status_of(resp)
        detail = body.get("detail") if isinstance(body, dict) else None
        report["key_plus_token"].append({"scheme": list(scheme), "status": status, "detail": detail})
        print(f"    {scheme[0]}:{scheme[1]} + bearer -> {status}  {detail or ''}")
        if status == 200:
            working.append(scheme)

    # Token alone, no key: is the key even checked once a session exists?
    resp, body = call(target, creds=[bearer], note="auth probe: token only")
    report["token_only"] = {"status": status_of(resp),
                            "detail": body.get("detail") if isinstance(body, dict) else None}
    print(f"    token only -> {report['token_only']['status']}  {report['token_only']['detail'] or ''}")

    chosen = working[0] if working else None
    report["chosen"] = {"key": list(chosen) if chosen else None, "token": True,
                        "login_key_scheme": list(token_scheme)}
    write_json(PROBE / "auth.json", report)
    if not chosen:
        sys.exit("Logged in, but no key placement + token combination returned 200. "
                 "Read data/_probe/auth.json.")
    return [key_cred(chosen), bearer]


def probe_unauthenticated():
    """Every candidate path with no key at all. Evidence for the `auth` category."""
    report = {}
    for path in CANDIDATE_ENDPOINTS:
        resp, body = call(path, note="unauth probe")
        report[path] = {
            "status": status_of(resp),
            "body": body,
        }
        print(f"  {path} (no key): {report[path]['status']}")
    write_json(PROBE / "unauth.json", report)
    return report


def probe_endpoints(creds):
    """Hit every candidate path once. Record what exists and what it looks like."""
    report = {}
    for path in CANDIDATE_ENDPOINTS:
        resp, body = call(path, creds=creds, note="endpoint probe")
        status = status_of(resp)
        key, records = find_records(body)
        report[path] = {
            "status": status,
            "envelope_keys": sorted(body.keys()) if isinstance(body, dict) else None,
            "records_key": key,
            "records_in_first_response": len(records),
            "sample_record_keys": sorted(records[0].keys()) if records else None,
            "looks_paginated": bool(records),
            # Keep a small slice of the body so findings can quote it later.
            "body_sample": body if not records else {
                k: v for k, v in (body or {}).items() if k != key
            },
        }
        print(f"  {path}: {status} "
              f"({len(records)} records, envelope={report[path]['envelope_keys']})")
    write_json(PROBE / "endpoints.json", report)
    return report


def detect_pagination(path, creds):
    """Prove which param names actually paginate. Assume nothing.

    A scheme passes only if BOTH hold:
      1. limit=3 returns at most 3 records (the limit param is honoured)
      2. the second-page param returns a different first record (it is honoured)

    A scheme that fails test 1 or 2 while being the documented one is a
    'pagination' finding for Part 3 — that's why every attempt is recorded.
    """
    attempts = []

    _, baseline_body = call(path, creds=creds, note="pagination baseline")
    _, baseline_records = find_records(baseline_body)
    default_page_size = len(baseline_records)
    baseline_echo = {k: v for k, v in (baseline_body or {}).items()
                     if not isinstance(v, (list, dict))}

    for limit_p, offset_p in PAGINATION_SCHEMES:
        # page-number schemes are 1-based; offset schemes are 0-based
        second_page_value = 2 if offset_p == "page" else 3

        _, body_a = call(path, {limit_p: 3}, creds=creds, note=f"pagination {limit_p}")
        _, recs_a = find_records(body_a)
        _, body_b = call(path, {limit_p: 3, offset_p: second_page_value},
                         creds=creds, note=f"pagination {limit_p}+{offset_p}")
        _, recs_b = find_records(body_b)

        limit_honoured = 0 < len(recs_a) <= 3
        offset_honoured = bool(recs_a and recs_b and recs_a[0] != recs_b[0])

        attempts.append({
            "limit_param": limit_p,
            "offset_param": offset_p,
            "returned_with_limit_3": len(recs_a),
            "limit_honoured": limit_honoured,
            "offset_honoured": offset_honoured,
            # What the server SAYS it did — compare this to what we asked for.
            "server_echo_page1": {k: v for k, v in (body_a or {}).items()
                                  if not isinstance(v, (list, dict))},
            "server_echo_page2": {k: v for k, v in (body_b or {}).items()
                                  if not isinstance(v, (list, dict))},
        })
        print(f"  {path} [{limit_p}/{offset_p}]: "
              f"limit={'ok' if limit_honoured else 'IGNORED'} "
              f"offset={'ok' if offset_honoured else 'IGNORED'}")

        if limit_honoured and offset_honoured:
            return {
                "path": path,
                "limit_param": limit_p,
                "offset_param": offset_p,
                "zero_based": offset_p != "page",
                "documented_scheme_works": (limit_p, offset_p) == PAGINATION_SCHEMES[0],
                "default_page_size": default_page_size,
                "baseline_echo": baseline_echo,
                "attempts": attempts,
            }

    return {"path": path, "limit_param": None, "offset_param": None,
            "documented_scheme_works": False,
            "default_page_size": default_page_size,
            "baseline_echo": baseline_echo, "attempts": attempts}


# ---------------------------------------------------------------------------
# Dumping
# ---------------------------------------------------------------------------

def dump_collection(path, creds, scheme):
    """Page to the very end, recording what was asked vs what the server did.

    Advances by what the server actually returned, never by what was requested.
    Stops when the page is short. If the server also exposes a more-remaining
    flag, checks that it agrees — a disagreement is logged, not silently resolved.
    """
    name = path.strip("/").replace("/", "_")
    raw_dir = RAW / name
    raw_dir.mkdir(parents=True, exist_ok=True)

    limit_p = scheme["limit_param"]
    offset_p = scheme["offset_param"]
    page_based = offset_p == "page"

    all_records = []
    page_log = []
    seen_signatures = set()
    page_no = 0
    cursor = 1 if page_based else 0
    stop_reason = None

    while page_no < MAX_PAGES:
        params = {}
        if limit_p:
            params[limit_p] = REQUESTED_LIMIT
            params[offset_p] = cursor
        elif page_no > 0:
            stop_reason = "no working pagination params; one response is all we can get"
            break

        resp, body = call(path, params, creds=creds, note=f"dump {name} page {page_no}")
        if status_of(resp) != 200:
            stop_reason = f"page {page_no} returned {status_of(resp) or 'error'}"
            print(f"  {stop_reason}, stopping")
            break

        key, records = find_records(body)
        write_json(raw_dir / f"page_{page_no:04d}.json", body)

        echoed_limit = echo(body, ECHO_LIMIT_KEYS)
        echoed_offset = echo(body, ECHO_OFFSET_KEYS)
        echoed_total = echo(body, ECHO_TOTAL_KEYS)
        more = echo(body, ECHO_MORE_KEYS)
        page_short = bool(echoed_limit) and len(records) < echoed_limit

        entry = {
            "page": page_no,
            "requested": params,
            "echoed_limit": echoed_limit,
            "echoed_offset": echoed_offset,
            "echoed_total": echoed_total,
            "more_remaining_signal": more,
            "returned": len(records),
            "page_short": page_short,
        }
        page_log.append(entry)

        if not records:
            stop_reason = "empty page"
            break

        # Guard against a server that ignores the page param and hands back
        # page 1 forever.
        signature = json.dumps(records[0], sort_keys=True)[:500]
        if signature in seen_signatures:
            stop_reason = f"page {page_no} repeats an earlier page — pagination is not advancing"
            print(f"  {stop_reason}. Stopping and flagging this.")
            entry["repeated_page"] = True
            break
        seen_signatures.add(signature)

        all_records.extend(records)
        print(f"  page {page_no}: asked {REQUESTED_LIMIT}, server says limit={echoed_limit} "
              f"{offset_p}={echoed_offset}, got {len(records)} (total {len(all_records)})")

        # Stop rule: a short page means the end. The server's more-remaining flag,
        # if present, should agree. If it does not, that is a finding — record it
        # and let the short page decide, but do NOT stop early on the flag alone
        # when the page is full.
        if more is not None:
            server_says_more = bool(more) if not isinstance(more, bool) else more
            if page_short and server_says_more:
                entry["disagreement"] = "page short but server says more remain"
                print(f"  ! {entry['disagreement']}")
            if not page_short and not server_says_more:
                entry["disagreement"] = "page full but server says no more remain"
                print(f"  ! {entry['disagreement']} — fetching one more page to check")
                # fall through: the next page will be empty if the server was right

        if page_short:
            stop_reason = "short page"
            break

        cursor += 1 if page_based else len(records)
        page_no += 1

    if page_no >= MAX_PAGES:
        stop_reason = f"hit MAX_PAGES={MAX_PAGES}"

    write_json(OUT / f"{name}.json", all_records)
    write_json(PROBE / f"pages_{name}.json", {
        "path": path, "stop_reason": stop_reason, "pages": page_log,
    })
    return all_records, page_log


def integrity_check(path, records, page_log):
    """Cross-page duplicate IDs and total-vs-paged agreement."""
    ids = [record_id(r) for r in records]
    seen, dups = set(), []
    for i in ids:
        if i in seen and i not in dups:
            dups.append(i)
        seen.add(i)

    totals = {e["echoed_total"] for e in page_log if e["echoed_total"] is not None}
    echoed_total = totals.pop() if len(totals) == 1 else (sorted(totals) if totals else None)

    limits = {e["echoed_limit"] for e in page_log if e["echoed_limit"] is not None}

    return {
        "path": path,
        "records_paged": len(records),
        "distinct_ids": len(seen),
        "ids_missing": sum(1 for i in ids if i is None),
        "ids_repeated": dups[:50],
        "ids_repeated_count": len(dups),
        "echoed_total": echoed_total,
        "total_matches_paged": (echoed_total == len(records)) if isinstance(echoed_total, int) else None,
        "requested_limit": REQUESTED_LIMIT,
        "echoed_limits_seen": sorted(limits),
        "limit_capped": bool(limits) and max(limits) < REQUESTED_LIMIT,
    }


def probe_by_id(creds, dumped):
    """Documented single-record paths, once each, with a real ID from the dump."""
    report = {}
    for collection, template in BY_ID_PATHS:
        records = dumped.get(collection) or []
        rid = record_id(records[0]) if records else None
        if rid is None:
            report[template] = {"status": None, "skipped": "no record to take an id from"}
            continue
        path = template.replace("{id}", str(rid))
        resp, body = call(path, creds=creds, note="by-id probe")
        status = status_of(resp)
        _, recs = find_records(body)
        report[template] = {
            "status": status,
            "tried_with": rid,
            "envelope_keys": sorted(body.keys()) if isinstance(body, dict) else None,
            "records_returned": len(recs) if recs else (1 if isinstance(body, dict) and status == 200 else 0),
            "body_sample": body if not recs else {k: v for k, v in body.items() if not isinstance(v, list)},
        }
        print(f"  {template}: {status}")
    write_json(PROBE / "by_id.json", report)
    return report


# ---------------------------------------------------------------------------

def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, default=str),
                    encoding="utf-8")


def sha256_of_raw(name):
    h = hashlib.sha256()
    for page in sorted((RAW / name).glob("page_*.json")):
        h.update(page.read_bytes())
    return h.hexdigest()


def main():
    started = time.time()
    for d in (OUT, RAW, PROBE):
        d.mkdir(parents=True, exist_ok=True)

    print("\n1. Unauthenticated probe (evidence for `auth`)")
    probe_unauthenticated()

    print("\n2. Detecting auth scheme")
    creds = detect_auth()
    print(f"   -> using {' + '.join(f'{k}:{n}' for k, n, _ in creds)}")

    print("\n3. Probing endpoints")
    endpoints = probe_endpoints(creds)

    collections = COLLECTIONS_OVERRIDE or [
        p for p, info in endpoints.items()
        if info["status"] == 200 and info["looks_paginated"]
    ]
    print(f"\n   collections to dump: {collections}")

    print("\n4. Detecting pagination")
    schemes = {p: detect_pagination(p, creds) for p in collections}
    write_json(PROBE / "pagination.json", schemes)

    print("\n5. Dumping")
    dumped, integrity, counts = {}, {}, {}
    for path in collections:
        print(f"\n  {path}")
        records, page_log = dump_collection(path, creds, schemes[path])
        dumped[path] = records
        counts[path] = len(records)
        integrity[path] = integrity_check(path, records, page_log)
        ic = integrity[path]
        print(f"  -> {ic['records_paged']} records, {ic['distinct_ids']} distinct ids, "
              f"{ic['ids_repeated_count']} repeated, echoed total={ic['echoed_total']}, "
              f"limit capped={ic['limit_capped']}")
    write_json(PROBE / "integrity.json", integrity)

    print("\n6. Probing documented single-record paths")
    probe_by_id(creds, dumped)

    (PROBE / "requests.jsonl").write_text(
        "\n".join(json.dumps(r) for r in REQUEST_LOG), encoding="utf-8"
    )
    write_json(OUT / "_manifest.json", {
        "dumped_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE_URL,
        "key_fingerprint": API_KEY[-4:],
        "city": CITY,
        "assigned_locality": ASSIGNED_LOCALITY,
        "record_counts": counts,
        "total_requests": REQUEST_COUNT,
        "duration_seconds": round(time.time() - started, 1),
        "auth": [f"{kind}:{name}" for kind, name, _ in creds],
        "requested_limit": REQUESTED_LIMIT,
        "pagination_schemes": {p: {k: v for k, v in s.items() if k != "attempts"}
                               for p, s in schemes.items()},
        "resources": {
            p.strip("/").replace("/", "_"): {
                "records": counts[p],
                "pages": len(list((RAW / p.strip("/").replace("/", "_")).glob("page_*.json"))),
                "echoed_limits": integrity[p]["echoed_limits_seen"],
                "sha256": sha256_of_raw(p.strip("/").replace("/", "_")),
            } for p in collections
        },
    })

    print(f"\nDone. {REQUEST_COUNT} requests, "
          f"{sum(counts.values())} records, "
          f"{round(time.time() - started, 1)}s")
    for path, n in counts.items():
        print(f"  {path}: {n}")
    print(f"\nWritten to {OUT}/ — now stop calling the API and work from these files.")


if __name__ == "__main__":
    main()
