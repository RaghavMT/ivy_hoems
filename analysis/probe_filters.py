#!/usr/bin/env python3
"""
analysis/probe_filters.py — test every documented filter and sort parameter.

The two categories the dump never covered. For each documented parameter the
question is three-way, and the three answers are three different findings:

  HONOURED  the result set narrows / reorders as documented        -> no finding
  IGNORED   200 OK, result set unchanged from no-parameter         -> filters / sorting
  REJECTED  4xx                                                    -> a different finding

"Ignored" is the one the assignment is pointing at: the frontend requirement says
filters "must actually filter, whether or not the server helps you". That phrasing
only makes sense if some of them don't.

Roughly 30 requests. Run it from the repo root:

    python analysis/probe_filters.py

Writes data/_probe/filters.json.
"""

import json
import os
import time
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ["BASE_URL"].rstrip("/")
KEY = os.environ["API_KEY"]
EMAIL = os.environ.get("DEMO_EMAIL", "demo1@ivy.homes")
PASSWORD = os.environ.get("DEMO_PASSWORD", "")

DELAY = 0.15


def login():
    r = requests.post(f"{BASE}/auth/login", headers={"X-API-Key": KEY},
                      json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    body = r.json()
    return body.get("access_token") or body.get("token")


def get(path, params, token):
    r = requests.get(f"{BASE}{path}",
                     headers={"X-API-Key": KEY, "Authorization": f"Bearer {token}"},
                     params=params, timeout=30)
    time.sleep(DELAY)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, None


def ids(body):
    if not isinstance(body, dict):
        return []
    return [r.get("listing_id") or r.get("project_id")
            for r in body.get("results", [])]


# Every filter documented for /v1/listings, with a value known to exist in the
# dump so that a genuine filter must return a strict subset.
FILTER_CASES = [
    ("/v1/listings", {"locality": "madhapur"},        "locality",      lambda r: r.get("locality") == "madhapur"),
    ("/v1/listings", {"bhk": 2},                      "bhk",           lambda r: r.get("bedroom") == 2),
    ("/v1/listings", {"property_type": "villa"},      "property_type", lambda r: r.get("property_type") == "villa"),
    ("/v1/listings", {"min_price": 20000000},         "min_price",     lambda r: (r.get("price") or 0) >= 20000000),
    ("/v1/listings", {"max_price": 5000000},          "max_price",     lambda r: (r.get("price") or 0) <= 5000000),
    ("/v1/listings", {"furnishing": "unfurnished"},   "furnishing",    lambda r: r.get("furnishing") == "unfurnished"),
    ("/v1/rentals",  {"locality": "madhapur"},        "locality",      lambda r: r.get("locality") == "madhapur"),
    ("/v1/rentals",  {"bhk": 2},                      "bhk",           lambda r: r.get("bedroom") == 2),
    ("/v1/rentals",  {"furnishing": "unfurnished"},   "furnishing",    lambda r: r.get("furnishing") == "unfurnished"),
    ("/v1/projects", {"locality": "madhapur"},        "locality",      lambda r: r.get("locality") == "madhapur"),
    ("/v1/projects", {"project_status": "ready to move"}, "project_status", lambda r: r.get("project_status") == "ready to move"),
    # documented nowhere, but the projects doc claims total_listings agrees with it
    ("/v1/listings", {"project_id": "P20165"},        "project_id",    lambda r: r.get("project_id") == "P20165"),
]

SORT_CASES = [
    ("/v1/listings", "price", "asc"),
    ("/v1/listings", "price", "desc"),
    ("/v1/listings", "carpet_area", "asc"),
    ("/v1/listings", "posted_at", "desc"),
    ("/v1/listings", "bedroom", "asc"),
    ("/v1/projects", "price_max", "desc"),
]


def main():
    token = login()
    report = {"filters": [], "sorting": []}

    baselines = {}
    for path in ("/v1/listings", "/v1/rentals", "/v1/projects"):
        status, body = get(path, {"limit": 50}, token)
        baselines[path] = ids(body)
        print(f"baseline {path}: {status}, first id {baselines[path][:1]}")

    print("\n--- filters ---")
    for path, params, name, predicate in FILTER_CASES:
        status, body = get(path, dict(params, limit=50), token)
        got = ids(body)
        rows = body.get("results", []) if isinstance(body, dict) else []
        matching = sum(1 for r in rows if predicate(r))
        unchanged = got == baselines[path]

        if status >= 400:
            verdict = "REJECTED"
        elif unchanged:
            verdict = "IGNORED"
        elif rows and matching == len(rows):
            verdict = "HONOURED"
        else:
            verdict = "PARTIAL"

        report["filters"].append({
            "endpoint": path, "param": name, "value": params,
            "status": status, "returned": len(rows),
            "matching_the_filter": matching,
            "identical_to_unfiltered_page": unchanged,
            "reported_total": body.get("total") if isinstance(body, dict) else None,
            "verdict": verdict,
            "first_ids": got[:5],
            "detail": body.get("detail") if isinstance(body, dict) else None,
        })
        print(f"  {path:15s} {name:15s} {status} {verdict:9s} "
              f"{matching}/{len(rows)} match")

    print("\n--- sorting ---")
    for path, field, order in SORT_CASES:
        status, body = get(path, {"sort_by": field, "order": order, "limit": 50}, token)
        rows = body.get("results", []) if isinstance(body, dict) else []
        vals = [r.get(field) for r in rows if r.get(field) is not None]
        want = sorted(vals, reverse=(order == "desc"))
        unchanged = ids(body) == baselines[path]

        if status >= 400:
            verdict = "REJECTED"
        elif unchanged:
            verdict = "IGNORED"
        elif vals == want:
            verdict = "HONOURED"
        else:
            verdict = "NOT_SORTED"

        report["sorting"].append({
            "endpoint": path, "sort_by": field, "order": order,
            "status": status, "returned": len(rows),
            "is_sorted": vals == want,
            "identical_to_unsorted_page": unchanged,
            "verdict": verdict,
            "first_values": vals[:8],
            "detail": body.get("detail") if isinstance(body, dict) else None,
        })
        print(f"  {path:15s} {field:12s} {order:4s} {status} {verdict}")

    out = ROOT / "data" / "_probe" / "filters.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print(f"\nwrote {out}")
    print("\nAnything marked IGNORED is a `filters` or `sorting` finding.")
    print("Anything marked HONOURED is a documented claim that held — README material.")


if __name__ == "__main__":
    main()
