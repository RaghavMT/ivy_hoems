#!/usr/bin/env python3
"""
analysis/probe_sort_detail.py — follow-up to probe_filters.py.

probe_filters.py keeps only eight values per page, which is enough to spot that
something is wrong with sorting but not enough to say *what*. This saves the
full 50-row page for each sort case that failed, plus one control, so the
failure mode can be stated exactly. Five requests. Writes
data/_probe/sorting_full.json.
"""
import json, os, time
from pathlib import Path
import requests
try:
    from dotenv import load_dotenv; load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ["BASE_URL"].rstrip("/")
KEY = os.environ["API_KEY"]
EMAIL = os.environ.get("DEMO_EMAIL", "demo1@ivy.homes")
PASSWORD = os.environ.get("DEMO_PASSWORD", "")
H = {"X-API-Key": KEY}

CASES = [
    ("/v1/listings", {"sort_by": "price", "order": "desc"}),
    ("/v1/listings", {"sort_by": "carpet_area", "order": "asc"}),
    ("/v1/listings", {"sort_by": "posted_at", "order": "desc"}),
    ("/v1/listings", {"sort_by": "bedroom", "order": "desc"}),   # control: asc was honoured
    ("/v1/projects", {"sort_by": "price_max", "order": "desc"}),
]

def monotone(vals, desc):
    return all((a >= b) if desc else (a <= b) for a, b in zip(vals, vals[1:]))

def main():
    r = requests.post(f"{BASE}/auth/login", headers=H,
                      json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    tok = r.json().get("access_token") or r.json().get("token")
    hdr = dict(H, Authorization=f"Bearer {tok}")
    out = []
    for path, params in CASES:
        q = dict(params, limit=50)
        resp = requests.get(f"{BASE}{path}", headers=hdr, params=q, timeout=30)
        time.sleep(0.15)
        body = resp.json()
        rows = body.get("results", [])
        f = params["sort_by"]
        vals = [row.get(f) for row in rows]
        nn = [v for v in vals if v is not None]
        rec = {
            "request": {"path": path, "params": q},
            "status": resp.status_code,
            "returned": len(rows),
            "values_in_order": vals,
            "nulls": len(vals) - len(nn),
            "sorted_asc": monotone(nn, False),
            "sorted_desc": monotone(nn, True),
            "sorted_as_strings_asc": monotone([str(v) for v in nn], False),
            "ids": [row.get("listing_id") or row.get("project_id") for row in rows],
        }
        out.append(rec)
        print(f"{path} {q}: {resp.status_code} n={len(rows)} nulls={rec['nulls']} "
              f"asc={rec['sorted_asc']} desc={rec['sorted_desc']} str_asc={rec['sorted_as_strings_asc']}")
    p = ROOT / "data" / "_probe" / "sorting_full.json"
    p.write_text(json.dumps(out, indent=2))
    print("wrote", p)

if __name__ == "__main__":
    main()
