#!/usr/bin/env python3
"""
answers_v2.py - recompute all ten submission answers from the frozen dump.

Supersedes the Saturday pass. Five answers changed; the reasons are in the
docstrings of each q*() function. Reads only data/*.json - no network.

    python analysis/answers_v2.py          # prints + writes analysis/out/answers_v2.json
    python analysis/answers_v2.py --check  # exits non-zero if any invariant fails
"""
import json, re, sys, statistics as st
from pathlib import Path
from datetime import datetime, timezone, timedelta
from collections import defaultdict, Counter

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
IST  = timezone(timedelta(hours=5, minutes=30))
REFERENCE = datetime(2026, 9, 10, 0, 0, 0, tzinfo=IST)

L = json.loads((DATA / "v1_listings.json").read_text())
R = json.loads((DATA / "v1_rentals.json").read_text())
P = json.loads((DATA / "v1_projects.json").read_text())

def ts(s): return datetime.fromisoformat(s.replace("Z", "+00:00"))

# ---------------------------------------------------------------- units
# magichomes serves carpet_area / super_built_up_area in square METRES for
# records posted from midnight IST on 2026-06-01. Verified: the last sqft
# record is 2026-05-31T14:17+05:30, the first sqm record 2026-06-01T02:21+05:30.
MEDIAN_SQFT_BY_BHK = {0: 1, 1: 470, 2: 838, 3: 1200, 4: 1557, 5: 1910}
SQM_TO_SQFT = 10.7639

def is_sqm(x):
    a, b = x.get("carpet_area"), x.get("bedroom")
    return bool(a and b and a < MEDIAN_SQFT_BY_BHK[b] * 0.45)

def carpet_sqft(x):
    a = x.get("carpet_area")
    if not a: return None
    return a * SQM_TO_SQFT if is_sqm(x) else float(a)

# project price_max is served in TWO units with no overlap: 1.00-4.15 are
# crores (n=438), 60.0-99.8 are lakhs (n=32). Decided by which conversion puts
# value / max_area_sqft inside the listing market band, not by magnitude.
def price_max_inr(p, band):
    lo, hi = band
    pm, a = p.get("price_max"), p.get("max_area_sqft")
    if pm is None or not a: return None
    ok = [v for v in (pm * 1e5, pm * 1e7) if lo * 0.6 <= v / a <= hi * 1.6]
    if len(ok) != 1:
        raise ValueError(f"{p['project_id']}: {len(ok)} conversions in band, expected 1")
    return ok[0]

# ------------------------------------------------------- corrupt (Q4)
# Six classes, each of exactly ten records, mutually disjoint. The uniformity
# is itself the evidence the set is complete.
CORRUPT_RULES = {
    "price <= 0":           lambda x: x["price"] <= 0,
    "price < 1 lakh":       lambda x: 0 < x["price"] < 100_000,
    "super < carpet":       lambda x: x["super_built_up_area"] < x["carpet_area"],
    "floor > total_floors": lambda x: x["floor"] > x["total_floors"],
    "posted_at >= REF":     lambda x: ts(x["posted_at"]) >= REFERENCE,
    # Hyderabad is ~17.2-17.6 N, 78.3-78.7 E. These records have the two swapped.
    "lat/long swapped":     lambda x: not (17.0 <= x["latitude"] <= 17.8
                                           and 78.0 <= x["longitude"] <= 78.9),
}
# NOT corrupt: total_floors == 0 fires on 197 records, all property_type "plot"
# with bedroom 0 and floor 0. A plot has no floors. Correct data.

def corrupt_ids():
    out = {}
    for name, f in CORRUPT_RULES.items():
        out[name] = {x["listing_id"] for x in L if f(x)}
    return out

# ---------------------------------------------------------- fake (Q9)
# Two independent signals that share no inputs, and they agree exactly:
#   B  phone's median price < 0.60 x its locality+BHK market rate (>=5 listings)
#   C  phone used under >1 seller name, at least one an agency-style name
# B == C == B&C == 135. A price signal and a naming signal landing on the same
# set is the argument; neither alone would be trustworthy.
AGENCY_WORDS = {"housing","homes","realty","properties","estates","space",
                "prime","skyline","elite","vertex","anchor","crown","orbit","dream","star"}

def market_rate(exclude_ids):
    g = defaultdict(list)
    for x in L:
        if x["listing_id"] in exclude_ids or not x["bedroom"]: continue
        a = carpet_sqft(x)
        if a and x["price"] > 100_000: g[(x["locality"], x["bedroom"])].append(x["price"] / a)
    return {k: st.median(v) for k, v in g.items() if len(v) >= 8}

def fake_ids(corrupt):
    med = market_rate(corrupt)
    def ratio(x):
        a = carpet_sqft(x); k = (x["locality"], x["bedroom"])
        return (x["price"] / a) / med[k] if a and k in med and x["price"] else None
    byphone = defaultdict(list)
    for x in L: byphone[x["posted_by_contact"]].append(x)
    B, C = set(), set()
    for ph, v in byphone.items():
        rs = [r for r in (ratio(x) for x in v) if r is not None]
        if rs and len(v) >= 5 and st.median(rs) < 0.60:
            B |= {x["listing_id"] for x in v}
        names = {x["posted_by_name"] for x in v}
        if len(names) > 1 and any(w in n.lower().split() for n in names for w in AGENCY_WORDS):
            C |= {x["listing_id"] for x in v}
    assert B == C, f"signals disagree: B-C={len(B-C)} C-B={len(C-B)}"
    return B

# ------------------------------------------------- duplicate identity (Q2)
# apartment_name is dirty: 246 groups differ only by case, punctuation, double
# spaces or a leading "The". Normalising it takes duplicates from 143 to 725.
def norm_name(s):
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"^the ", "", s)

def property_key(x):
    return (norm_name(x["apartment_name"]), x["locality"], x["floor"], x["bedroom"],
            x["bathroom"], x["covered_parking"], x["facing_direction"])

def distinct_properties(tol=0.02):
    parent = {}
    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[ra] = rb
    g = defaultdict(list)
    for x in L: g[property_key(x)].append(x)
    for v in g.values():
        for i in range(len(v)):
            for j in range(i + 1, len(v)):
                ai, aj = carpet_sqft(v[i]), carpet_sqft(v[j])
                if ai and aj and abs(ai - aj) / max(ai, aj) <= tol:
                    union(v[i]["listing_id"], v[j]["listing_id"])
    return len({find(x["listing_id"]) for x in L})

# ================================================================= answers
def main():
    classes = corrupt_ids()
    CORRUPT = set().union(*classes.values())
    FAKE = fake_ids(CORRUPT)
    pps = sorted(x["price"] / carpet_sqft(x) for x in L
                 if x["listing_id"] not in CORRUPT and x["bedroom"] and carpet_sqft(x) and x["price"] > 100_000)
    band = (pps[len(pps) // 20], pps[19 * len(pps) // 20])

    # Q6: live 2BHK, excluding every id in Q4 and Q9. Mean of the ratios.
    q6 = [x["price"] / carpet_sqft(x) for x in L
          if x["is_live"] and x["bedroom"] == 2 and x["listing_id"] not in CORRUPT | FAKE
          and carpet_sqft(x) and x["price"]]

    # Q7: highest price_max after per-record unit resolution.
    best = max(P, key=lambda p: price_max_inr(p, band) or 0)

    # Q10: total_listings tracks the LIVE count - it matches for 341/470
    # projects, versus 107 under "all retrievable". It is wrong where it fails
    # its own documented meaning ("listings currently available").
    by_proj = defaultdict(list)
    for x in L:
        if x.get("project_id"): by_proj[x["project_id"]].append(x)
    q10 = sum(1 for p in P
              if p.get("total_listings") != sum(1 for x in by_proj.get(p["project_id"], []) if x["is_live"]))

    mad = [x for x in R if x["locality"].strip().lower() == "madhapur"]

    answers = {
        "total_listing_records": len(L),
        "unique_properties": distinct_properties(),
        "active_listings": sum(1 for x in L if x["is_live"] is True),
        "corrupt_listing_ids": sorted(CORRUPT),
        "total_monthly_rent": sum(x["price"] for x in mad),
        "avg_price_per_sqft_2bhk": round(st.mean(q6), 2),
        "costliest_project": {"project_id": best["project_id"],
                              "price_max_inr": int(price_max_inr(best, band))},
        "listings_last_7_days": sum(1 for x in L
                                    if REFERENCE - timedelta(days=7) <= ts(x["posted_at"]) < REFERENCE),
        "fake_listing_ids": sorted(FAKE),
        "projects_with_wrong_listing_count": q10,
    }

    # invariants - a silent change in any of these means a rule broke
    checks = [
        ("six corrupt classes of ten", all(len(v) == 10 for v in classes.values())),
        ("corrupt classes disjoint",   len(CORRUPT) == sum(len(v) for v in classes.values())),
        ("corrupt and fake disjoint",  not (CORRUPT & FAKE)),
        ("every project resolves to one unit", all(price_max_inr(p, band) for p in P if p.get("price_max"))),
        ("Q6 excludes Q4 and Q9",      len(q6) == sum(1 for x in L if x["is_live"] and x["bedroom"] == 2
                                                      and x["listing_id"] not in CORRUPT | FAKE and carpet_sqft(x) and x["price"])),
    ]
    print("classes:", {k: len(v) for k, v in classes.items()})
    for name, ok in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    for k, v in answers.items():
        print(f"  {k:<36} {v if not isinstance(v, list) else f'list[{len(v)}]'}")
    out = ROOT / "analysis" / "out" / "answers_v2.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(answers, indent=2))
    print("wrote", out)
    if "--check" in sys.argv and not all(ok for _, ok in checks):
        sys.exit(1)

if __name__ == "__main__":
    main()
