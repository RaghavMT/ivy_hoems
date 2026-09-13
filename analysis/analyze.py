#!/usr/bin/env python3
"""
analysis/analyze.py — regenerate every classification and answer from data/*.json.

No network. Deterministic. Run it and the numbers in submission.json fall out.

    python analysis/analyze.py

Writes:
    analysis/out/classified.json   per-record flags (corrupt class, fake, unit-corrected areas)
    analysis/out/answers.json      the ten answers
    analysis/out/evidence.json     evidence ID lists for the findings array
"""

import json
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))
REFERENCE = datetime(2026, 9, 10, 0, 0, 0, tzinfo=IST)
SQM_TO_SQFT = 10.7639

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = Path(__file__).resolve().parent / "out"

ASSIGNED_LOCALITY = "madhapur"

# The magichomes area-unit cutover. See docs/hypotheses.md H-002.
MAGIC_CUTOVER = datetime(2026, 6, 1, 0, 0, 0, tzinfo=IST)


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def parse_ts(s):
    """posted_at is serialised with a Z. Parse as UTC, return IST."""
    if s is None:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(IST)


# ---------------------------------------------------------------------------
# Unit correction
# ---------------------------------------------------------------------------

def area_is_sqm(rec):
    """True when this listing's area fields are in square metres, not square feet.

    Established rule (docs/hypotheses.md H-002): only website 'magichomes', and only
    records posted at or after midnight IST on 2026-06-01. Both area fields switch
    together; the super/carpet ratio is unchanged either side of the cutover.
    """
    if rec.get("website") != "magichomes":
        return False
    ts = parse_ts(rec.get("posted_at"))
    return ts is not None and ts >= MAGIC_CUTOVER


def corrected_areas(rec):
    carpet = rec.get("carpet_area")
    super_ = rec.get("super_built_up_area", rec.get("super_builtup_area"))
    if area_is_sqm(rec):
        carpet = carpet * SQM_TO_SQFT if carpet is not None else None
        super_ = super_ * SQM_TO_SQFT if super_ is not None else None
    return carpet, super_


# ---------------------------------------------------------------------------
# Corruption (Q4) — five classes of internal impossibility
# ---------------------------------------------------------------------------

def property_clusters(listings, tol=0.02):
    """Group listing records that describe the same physical property (Q2).

    Rule (docs/hypotheses.md H-009): records match on
    (apartment_name, locality, floor, bedroom) and on the discrete attributes
    bathroom / covered_parking / facing_direction, with carpet area within `tol`.

    Why area needs a tolerance: cross-portal duplicates carry jittered numbers.
    Observed jitter is under 1% on area and under 6% on price, so the same flat
    never matches exactly. The count is stable at 4255 for every tol from 0.02
    to 0.10, which is why 0.02 is safe rather than tuned.

    Coordinates are NOT used as identity: 251 coordinate groups exist but every
    one shares apartment_name and locality while differing on floor — a
    coordinate is a building, not a flat. (lat, long, floor) is unique across
    all 4400 records, so it cannot merge anything.
    """
    groups = defaultdict(list)
    for r in listings:
        groups[(r.get("apartment_name"), r.get("locality"),
                r.get("floor"), r.get("bedroom"))].append(r)

    clusters = []
    for recs in groups.values():
        parent = list(range(len(recs)))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for i in range(len(recs)):
            for j in range(i + 1, len(recs)):
                a, b = recs[i], recs[j]
                aa, _ = corrected_areas(a)
                bb, _ = corrected_areas(b)
                if aa is None or bb is None or max(aa, bb) == 0:
                    continue
                if abs(aa - bb) / max(aa, bb) > tol:
                    continue
                if (a.get("bathroom") != b.get("bathroom")
                        or a.get("covered_parking") != b.get("covered_parking")
                        or a.get("facing_direction") != b.get("facing_direction")):
                    continue
                ra, rb = find(i), find(j)
                if ra != rb:
                    parent[ra] = rb

        merged = defaultdict(list)
        for i, r in enumerate(recs):
            merged[find(i)].append(r["listing_id"])
        clusters.extend(sorted(v) for v in merged.values())

    return clusters


def corrupt_classes(listings):
    classes = defaultdict(list)
    for r in listings:
        lid = r["listing_id"]
        price = r.get("price")
        carpet, super_ = corrected_areas(r)
        floor, total_floors = r.get("floor"), r.get("total_floors")
        ts = parse_ts(r.get("posted_at"))

        if price is not None and price <= 0:
            classes["price_non_positive"].append(lid)
        elif price is not None and price < 100_000:
            # A sale price three orders of magnitude below any real flat.
            # Distinct from bait pricing, which is 30-50% below market and plausible.
            classes["price_impossibly_low"].append(lid)

        if carpet is not None and super_ is not None and super_ < carpet:
            classes["super_lt_carpet"].append(lid)

        if floor is not None and total_floors is not None and floor > total_floors:
            classes["floor_gt_total"].append(lid)

        if ts is not None and ts >= REFERENCE:
            classes["posted_in_future"].append(lid)

    return {k: sorted(v) for k, v in classes.items()}


# ---------------------------------------------------------------------------
# Fraud (Q9) — bait farms, separated from legitimate brokerages
# ---------------------------------------------------------------------------

def market_rate_table(listings, corrupt_ids):
    """Median price per (locality, bedroom) over non-corrupt records."""
    buckets = defaultdict(list)
    for r in listings:
        if r["listing_id"] in corrupt_ids:
            continue
        if r.get("price") and r.get("locality") and r.get("bedroom") is not None:
            buckets[(r["locality"], r["bedroom"])].append(r["price"])
    return {k: statistics.median(v) for k, v in buckets.items() if len(v) >= 5}


def fake_analysis(listings, corrupt_ids):
    by_phone = defaultdict(list)
    for r in listings:
        phone = r.get("posted_by_contact")
        if phone:
            by_phone[phone].append(r)

    market = market_rate_table(listings, corrupt_ids)
    rows = []

    for phone, recs in by_phone.items():
        names = {r.get("posted_by_name") for r in recs if r.get("posted_by_name")}
        if len(names) < 2:
            continue  # Rule 2: one phone must carry more than one seller name

        ratios = []
        for r in recs:
            if r["listing_id"] in corrupt_ids:
                continue
            key = (r.get("locality"), r.get("bedroom"))
            if key in market and market[key] and r.get("price"):
                ratios.append(r["price"] / market[key])
        if not ratios:
            continue

        rows.append({
            "phone": phone,
            "n": len(recs),
            "n_names": len(names),
            "names": sorted(names),
            "median_price_ratio": round(statistics.median(ratios), 3),
            "pct_verified": round(100 * sum(bool(r.get("is_verified")) for r in recs) / len(recs)),
            "pct_live": round(100 * sum(bool(r.get("is_live")) for r in recs) / len(recs)),
            "posted_by": sorted({r.get("posted_by") for r in recs}),
            "listing_ids": sorted(r["listing_id"] for r in recs),
        })

    rows.sort(key=lambda x: x["median_price_ratio"])

    # Rule 3: multi-name phone AND priced below 60% of the locality+bedroom market rate.
    # Volume floor of 5 excludes tiny groups whose median is dragged by corrupt records.
    bait = [r for r in rows if r["median_price_ratio"] < 0.60 and r["n"] >= 5]
    brokers = [r for r in rows if r not in bait]
    return rows, bait, brokers


# ---------------------------------------------------------------------------

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    listings = load("v1_listings.json")
    rentals = load("v1_rentals.json")
    projects = load("v1_projects.json")

    # --- timestamp sanity: is the Z honest, or is it IST wearing a UTC suffix? ---
    raw_hours = Counter(int(r["posted_at"][11:13]) for r in listings if r.get("posted_at"))
    ist_hours = Counter(parse_ts(r["posted_at"]).hour for r in listings if r.get("posted_at"))
    print("hour-of-day if Z taken literally (UTC):",
          " ".join(f"{h}:{raw_hours.get(h,0)}" for h in range(24)))
    print("hour-of-day converted to IST:          ",
          " ".join(f"{h}:{ist_hours.get(h,0)}" for h in range(24)))

    # --- corruption ---
    classes = corrupt_classes(listings)
    corrupt_ids = sorted({i for v in classes.values() for i in v})
    print("\ncorrupt classes:", {k: len(v) for k, v in classes.items()},
          "-> distinct", len(corrupt_ids))

    # --- fraud ---
    rows, bait, brokers = fake_analysis(listings, set(corrupt_ids))
    fake_ids = sorted({i for r in bait for i in r["listing_ids"]})
    print(f"multi-name phones: {len(rows)}  bait: {len(bait)} phones / {len(fake_ids)} listings")
    for r in rows:
        tag = "BAIT " if r in bait else "broker"
        print(f"  {tag} {r['phone']} n={r['n']:>3} ratio={r['median_price_ratio']:.2f} "
              f"verified={r['pct_verified']:>3}% live={r['pct_live']:>3}% "
              f"by={','.join(r['posted_by'])} names={r['n_names']}")

    excluded = set(corrupt_ids) | set(fake_ids)
    print("overlap corrupt/fake:", len(set(corrupt_ids) & set(fake_ids)))

    # --- answers ---
    answers = {}
    answers["total_listing_records"] = len(listings)
    answers["active_listings"] = sum(1 for r in listings if r.get("is_live"))
    answers["corrupt_listing_ids"] = corrupt_ids
    answers["fake_listing_ids"] = fake_ids

    # Q5 — assigned locality rentals
    loc_rentals = [r for r in rentals if (r.get("locality") or "").lower() == ASSIGNED_LOCALITY]
    answers["total_monthly_rent"] = sum(r.get("price") or 0 for r in loc_rentals)
    print(f"\nQ5: {len(loc_rentals)} {ASSIGNED_LOCALITY} rentals -> {answers['total_monthly_rent']}")

    # how many rentals have a title naming a different locality than the field?
    mismatch = []
    for r in rentals:
        t = (r.get("title") or "").lower()
        loc = (r.get("locality") or "").lower()
        if loc and t and loc not in t:
            mismatch.append(r["listing_id"])
    print(f"    rentals whose title does not contain the locality field: {len(mismatch)}")
    title_says_assigned = [r["listing_id"] for r in rentals
                           if ASSIGNED_LOCALITY in (r.get("title") or "").lower()
                           and (r.get("locality") or "").lower() != ASSIGNED_LOCALITY]
    print(f"    title says {ASSIGNED_LOCALITY} but field does not: {len(title_says_assigned)}")

    # Q6 — mean price per sqft, live 2BHK, excluding corrupt and fake
    ratios = []
    for r in listings:
        if r["listing_id"] in excluded:
            continue
        if not r.get("is_live") or r.get("bedroom") != 2:
            continue
        carpet, _ = corrected_areas(r)
        if carpet and r.get("price"):
            ratios.append(r["price"] / carpet)
    answers["avg_price_per_sqft_2bhk"] = round(sum(ratios) / len(ratios), 2)
    print(f"Q6: {len(ratios)} records -> {answers['avg_price_per_sqft_2bhk']}")

    # same figure WITHOUT the unit correction, to show what the error would cost
    raw_ratios = []
    for r in listings:
        if r["listing_id"] in excluded or not r.get("is_live") or r.get("bedroom") != 2:
            continue
        if r.get("carpet_area") and r.get("price"):
            raw_ratios.append(r["price"] / r["carpet_area"])
    print(f"    without the sqm correction it would be "
          f"{round(sum(raw_ratios)/len(raw_ratios), 2)}")

    # Q7 — costliest project. price_min in lakhs, price_max in crores.
    inverted_before = sum(1 for p in projects
                          if p.get("price_max") is not None and p.get("price_min") is not None
                          and p["price_max"] < p["price_min"])
    conv = []
    for p in projects:
        if p.get("price_min") is None or p.get("price_max") is None:
            continue
        conv.append({
            "project_id": p["project_id"],
            "min_inr": int(round(p["price_min"] * 1e5)),
            "max_inr": int(round(p["price_max"] * 1e7)),
        })
    inverted_after = sum(1 for c in conv if c["max_inr"] < c["min_inr"])
    top = max(conv, key=lambda c: c["max_inr"])
    answers["costliest_project"] = {"project_id": top["project_id"], "price_max_inr": top["max_inr"]}
    print(f"Q7: inverted before conversion {inverted_before}/{len(projects)}, "
          f"after {inverted_after} -> {answers['costliest_project']}")

    # Q8 — posted in [REFERENCE - 7d, REFERENCE) in IST
    lo = REFERENCE - timedelta(days=7)
    in_window = [r["listing_id"] for r in listings
                 if (ts := parse_ts(r.get("posted_at"))) and lo <= ts < REFERENCE]
    answers["listings_last_7_days"] = len(in_window)
    print(f"Q8: {len(in_window)} in [{lo.isoformat()}, {REFERENCE.isoformat()})")

    # Q10 — projects whose self-reported total_listings is wrong
    actual = Counter(r.get("project_id") for r in listings if r.get("project_id"))
    wrong, wrong_ids = 0, []
    for p in projects:
        if p.get("total_listings") is None:
            continue
        if p["total_listings"] != actual.get(p["project_id"], 0):
            wrong += 1
            wrong_ids.append(p["project_id"])
    answers["projects_with_wrong_listing_count"] = wrong
    print(f"Q10: {wrong}/{len(projects)} projects disagree")

    # Q2 — distinct properties, genuine or not
    clusters = property_clusters(listings)
    answers["unique_properties"] = len(clusters)
    dup_clusters = [c for c in clusters if len(c) > 1]
    dup_ids = sorted(i for c in dup_clusters for i in c)
    print(f"\nQ2: {len(clusters)} distinct properties "
          f"({len(dup_clusters)} clusters hold >1 record; {len(listings) - len(clusters)} "
          f"records are duplicates of another)")
    # stability check — the answer must not depend on the tolerance
    print("    stability:", {t: len(property_clusters(listings, t))
                             for t in (0.005, 0.01, 0.02, 0.05, 0.10)})
    # do bait listings clone genuine ones? (catalogue H-014)
    cloned = [c for c in dup_clusters
              if any(i in set(fake_ids) for i in c) and any(i not in set(fake_ids) for i in c)]
    print(f"    clusters pairing a bait listing with a genuine one: {len(cloned)}")

    (OUT / "answers.json").write_text(json.dumps(answers, indent=2))
    (OUT / "evidence.json").write_text(json.dumps({
        "corrupt_classes": classes,
        "bait_phones": [{k: v for k, v in r.items() if k != "listing_ids"} for r in bait],
        "broker_phones": [{k: v for k, v in r.items() if k != "listing_ids"} for r in brokers],
        "fake_listing_ids": fake_ids,
        "sqm_listing_ids": sorted(r["listing_id"] for r in listings if area_is_sqm(r)),
        "inverted_projects_before_conversion": sorted(
            p["project_id"] for p in projects
            if p.get("price_max") is not None and p.get("price_min") is not None
            and p["price_max"] < p["price_min"]),
        "projects_wrong_count": sorted(wrong_ids),
        "rentals_title_locality_mismatch": sorted(mismatch),
        "non_live_listing_ids": sorted(r["listing_id"] for r in listings if not r.get("is_live")),
        "duplicate_listing_ids": dup_ids,
        "duplicate_clusters": dup_clusters,
        "bait_clones_of_genuine": cloned,
        "tail_listing_ids_beyond_reported_total": sorted(
            r["listing_id"] for r in listings)[4224:],
    }, indent=2))
    print(f"\nwrote {OUT}/answers.json and {OUT}/evidence.json")


if __name__ == "__main__":
    main()
