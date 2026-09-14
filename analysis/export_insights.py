#!/usr/bin/env python3
"""
export_insights.py - write the detail behind the insights screen.

answers_v2.py produces the ten answers but keeps the sets behind them (duplicate
groups, the six impossible-record classes, the projects with a wrong count) in
memory. evidence.json predates it and is stale on all three. This script imports
answers_v2's rules unchanged, rebuilds those sets, checks every count against
submission.json, and writes them for the web app's data build.

    python analysis/export_insights.py     # writes analysis/out/insights_evidence.json

Reads only data/*.json and submission.json - no network. Exits non-zero on any
mismatch with submission.json.
"""
import json, sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import answers_v2 as a  # noqa: E402  (module import loads the dump; main() is not run)

ROOT = a.ROOT
SUBMISSION = json.loads((ROOT / "submission.json").read_text())
ANSWERS = SUBMISSION["answers"]
EVIDENCE = json.loads((ROOT / "analysis" / "out" / "evidence.json").read_text())


def property_groups():
    """Same identity rule as answers_v2.distinct_properties, returning the groups."""
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    by_key = defaultdict(list)
    for x in a.L:
        by_key[a.property_key(x)].append(x)
    for v in by_key.values():
        for i in range(len(v)):
            for j in range(i + 1, len(v)):
                ai, aj = a.carpet_sqft(v[i]), a.carpet_sqft(v[j])
                if ai and aj and abs(ai - aj) / max(ai, aj) <= 0.02:
                    ri, rj = find(v[i]["listing_id"]), find(v[j]["listing_id"])
                    if ri != rj:
                        parent[ri] = rj
    groups = defaultdict(list)
    for x in a.L:
        groups[find(x["listing_id"])].append(x)
    return list(groups.values())


def main():
    failures = []

    def expect(label, actual, wanted):
        if actual != wanted:
            failures.append(f"{label}: got {actual}, submission says {wanted}")

    listings = {x["listing_id"]: x for x in a.L}

    # Q4: six classes of ten.
    classes = {name: sorted(ids) for name, ids in a.corrupt_ids().items()}
    corrupt = set().union(*classes.values())
    expect("impossible records", sorted(corrupt), ANSWERS["corrupt_listing_ids"])

    # Q9, with the provable clones oriented as [bait, genuine].
    fake = a.fake_ids(corrupt)
    expect("fake listings", sorted(fake), ANSWERS["fake_listing_ids"])
    clones = []
    for pair in EVIDENCE["bait_clones_of_genuine"]:
        bait = [i for i in pair if i in fake]
        genuine = [i for i in pair if i not in fake]
        if len(bait) != 1 or len(genuine) != 1:
            failures.append(f"clone pair {pair} is not one bait and one genuine listing")
            continue
        clones.append({
            "bait": bait[0], "genuine": genuine[0],
            "bait_price": listings[bait[0]]["price"], "genuine_price": listings[genuine[0]]["price"],
        })
    phones = sorted({listings[i]["posted_by_contact"] for i in fake})

    # Q2: repeat listings of one property.
    groups = property_groups()
    expect("distinct properties", len(groups), ANSWERS["unique_properties"])
    multi = sorted(
        ([x["listing_id"] for x in sorted(g, key=lambda x: x["listing_id"])] for g in groups if len(g) > 1),
        key=lambda ids: ids[0],
    )
    cross_site = sum(1 for g in groups if len(g) > 1 and len({x["website"] for x in g}) > 1)

    # Q10: total_listings against the project's live listings.
    live_by_project = defaultdict(int)
    for x in a.L:
        if x.get("project_id") and x["is_live"]:
            live_by_project[x["project_id"]] += 1
    wrong = [
        {"project_id": p["project_id"], "served": p["total_listings"], "live": live_by_project[p["project_id"]]}
        for p in a.P
        if p["total_listings"] != live_by_project[p["project_id"]]
    ]
    expect("projects with a wrong count", len(wrong), ANSWERS["projects_with_wrong_listing_count"])

    # Q3.
    not_live = sorted(x["listing_id"] for x in a.L if not x["is_live"])
    expect("listings not live", len(a.L) - len(not_live), ANSWERS["active_listings"])

    # H-022: rental titles naming another locality.
    title_mismatch = sorted(x["listing_id"] for x in a.R if x["locality"].lower() not in x["title"].lower())

    if failures:
        print("MISMATCH with submission.json:")
        for f in failures:
            print("  " + f)
        sys.exit(1)

    out = {
        "impossible_classes": classes,
        "fake": {"ids": sorted(fake), "phones": len(phones), "clones": clones},
        "duplicates": {
            "records": len(a.L),
            "distinct_properties": len(groups),
            "repeat_records": sum(len(g) - 1 for g in multi),
            "cross_site_groups": cross_site,
            "groups": multi,
        },
        "projects_wrong_count": wrong,
        "not_live_ids": not_live,
        "rental_title_mismatch": {"count": len(title_mismatch), "of": len(a.R), "examples": title_mismatch[:5]},
    }
    path = ROOT / "analysis" / "out" / "insights_evidence.json"
    path.write_text(json.dumps(out, indent=1))
    print(f"classes {({k: len(v) for k, v in classes.items()})}")
    print(f"fake {len(fake)} on {len(phones)} phones, {len(clones)} clones")
    print(f"duplicates: {len(multi)} groups, {out['duplicates']['repeat_records']} repeat records, {cross_site} cross-site")
    print(f"projects with a wrong count {len(wrong)}; not live {len(not_live)}; title mismatch {len(title_mismatch)}")
    print("wrote", path)


if __name__ == "__main__":
    main()
