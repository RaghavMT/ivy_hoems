#!/usr/bin/env python3
"""
analysis/probe_price_bounds.py - is min_price inclusive? (H-034)

max_price was settled offline from data/_probe/filters.json. min_price can't be,
because no listing sits exactly on the bound that probe used. This asks for
min_price=5000000, where two listings are priced exactly 5,000,000, and compares
the server's reported total with the dump counted both ways.

The server's total is round(0.96 x true count) (see H-034), so the two readings
predict different totals. Two requests: login, one filtered page of size 1.
Writes data/_probe/price_bounds.json.
"""
import json, os, time
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
EMAIL = os.environ.get("DEMO_EMAIL", "demo1@ivy.homes")
PASSWORD = os.environ.get("DEMO_PASSWORD", "")
BOUND = 5_000_000


def reported(n):
    return round(n * 0.96)


def main():
    data = json.loads((ROOT / "data" / "v1_listings.json").read_text(encoding="utf-8"))
    listings = data if isinstance(data, list) else data["results"]
    at_or_above = sum(1 for r in listings if r["price"] >= BOUND)
    above = sum(1 for r in listings if r["price"] > BOUND)
    on_bound = [r["listing_id"] for r in listings if r["price"] == BOUND]

    h = {"X-API-Key": KEY}
    r = requests.post(f"{BASE}/auth/login", headers=h,
                      json={"email": EMAIL, "password": PASSWORD}, timeout=90)
    r.raise_for_status()
    h["Authorization"] = f"Bearer {r.json()['access_token']}"
    time.sleep(0.15)

    resp = requests.get(f"{BASE}/v1/listings", headers=h,
                        params={"min_price": BOUND, "limit": 1}, timeout=90)
    body = resp.json()
    total = body.get("total")

    result = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "request": {"path": "/v1/listings", "params": {"min_price": BOUND, "limit": 1}},
        "status": resp.status_code,
        "reported_total": total,
        "listings_on_bound": on_bound,
        "dump_count_inclusive": at_or_above,
        "dump_count_exclusive": above,
        "predicted_total_if_inclusive": reported(at_or_above),
        "predicted_total_if_exclusive": reported(above),
        "verdict": ("INCLUSIVE" if total == reported(at_or_above) and total != reported(above)
                    else "EXCLUSIVE" if total == reported(above) and total != reported(at_or_above)
                    else "UNDETERMINED"),
    }
    out = ROOT / "data" / "_probe" / "price_bounds.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "run_at"}, indent=1))


if __name__ == "__main__":
    main()
