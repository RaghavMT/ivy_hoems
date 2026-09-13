#!/usr/bin/env python3
"""
analysis/build_submission.py — assemble submission.json from analysis output.

Run analysis/analyze.py first; this reads its out/ files. Never hand-edit
submission.json — change the rule in analyze.py or the finding text here and
regenerate, so the file always matches what the code actually computes.

    python analysis/analyze.py && python analysis/build_submission.py
"""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "out"

CANDIDATE = {
    "name": "Raghav Tibra",
    "email": "TODO@mnnit.ac.in",          # the college address you registered with
    "repo_url": "https://github.com/RaghavMT/ivy_hoems",
    "demo_url": "TODO-deployed-url",
}


def api_key():
    for line in (ROOT / ".env").read_text().splitlines():
        if line.strip().startswith("API_KEY="):
            return line.split("=", 1)[1].strip()
    return "TODO"


def build_findings(ev):
    """One object per discrepancy. Every claim here was reproduced against the
    running API or against the dump; nothing is included on suspicion alone.

    `evidence` carries up to twenty identifiers for findings that are claims
    about records. Findings about how an endpoint behaves carry none — the
    evidence for those is the saved request/response in data/_probe/.
    """
    cap = lambda xs: sorted(xs)[:20]
    corrupt = sorted({i for v in ev["corrupt_classes"].values() for i in v})

    return [
        # ---- auth -------------------------------------------------------
        {
            "endpoint": "*",
            "category": "auth",
            "documented": "the API key is sent as a query parameter: GET /v1/listings?api_key=IVY26-XXXX",
            "actual": "a query-parameter key returns 401 with the detail 'send your key in the X-API-Key request header, not as a query parameter'. The header is the only accepted placement.",
            "how_found": "dump.py tries the documented query parameter first, then four header variants, recording the status of every attempt in data/_probe/auth.json",
            "impact": "a client written from the documentation cannot authenticate at all; every request 401s",
            "evidence": [],
        },
        {
            "endpoint": "/v1/listings",
            "category": "auth",
            "documented": "the API key identifies the request; the user session is framed as something the frontend does for its end user, and the worked example fetches listings with the key alone",
            "actual": "data endpoints require BOTH the key and a bearer token. Key alone returns 401 'missing bearer token - log in at POST /auth/login first'; bearer alone returns 401 'missing X-API-Key header'.",
            "how_found": "probed key-only, token-only and key+token against the same endpoint (data/_probe/auth.json, unauth.json)",
            "impact": "any data fetch needs a prior login; a read-only script cannot work from the key alone",
            "evidence": [],
        },
        {
            "endpoint": "/auth/login",
            "category": "auth",
            "documented": "returns {token, token_type, expires_in: 86400, user}; tokens last 24 hours and 'there is no refresh flow'",
            "actual": "returns expires_in: 900 (fifteen minutes), names the field access_token rather than token, and includes a refresh_token plus refresh_url '/auth/refresh'. A refresh flow exists.",
            "how_found": "logged in as a demo user and read the response body; the token is opaque rather than a JWT, so the server's own expires_in is the lifetime",
            "impact": "an app built to the documentation breaks fifteen minutes after login — which is what the assignment's 'still working thirty minutes after you logged in' requirement is testing",
            "evidence": [],
        },
        {
            "endpoint": "/auth/refresh",
            "category": "undocumented_endpoint",
            "documented": "not mentioned; the documentation states there is no refresh flow",
            "actual": "exists, and is advertised by /auth/login in its own refresh_url field",
            "how_found": "read the login response body rather than assuming it matched the documented shape",
            "impact": "the only way to keep a session alive past fifteen minutes",
            "evidence": [],
        },
        # ---- pagination -------------------------------------------------
        {
            "endpoint": "/v1/listings",
            "category": "pagination",
            "documented": "limit defaults to 20 with a maximum of 200",
            "actual": "limit is silently capped at 50. Requesting limit=200 returns 50 records and the envelope echoes limit: 50. The default of 20 is correct; only the maximum is wrong.",
            "how_found": "requested limit=200 on every page and compared the requested value with the limit the server echoed back (data/_probe/pages_v1_listings.json)",
            "impact": "a client sizing its page loop from the documented maximum makes four times as many requests as it expects, or under-fetches if it trusts the count",
            "evidence": [],
        },
        {
            "endpoint": "/v1/listings",
            "category": "pagination",
            "documented": "the documented parameters are page (1-indexed) and limit, and the response is shaped {total, page, page_size, results}",
            "actual": "page is accepted and silently ignored — ?limit=3&page=2 returns 200 with the same first record as page 1 and echoes offset: 0. The undocumented offset parameter is what advances the window. The envelope is {limit, offset, count, total, has_more, results}.",
            "how_found": "tested the documented pair first: a parameter pair only counts as working if limit caps the page AND the second page returns a different first record (data/_probe/pagination.json)",
            "impact": "a client following the documentation re-reads page one forever and never reaches the end of the collection",
            "evidence": [],
        },
        {
            "endpoint": "/v1/listings",
            "category": "pagination",
            "documented": "total is 'the exact number of records matching your filters'; to fetch every record, read total, divide by your limit, and request that many pages",
            "actual": "total under-reports by exactly 4% on every collection: listings 4224 vs 4400 paged, rentals 1584 vs 1650, projects 451 vs 470 — each is floor(n x 0.96). Paging to exhaustion is the only way to get the real count; every paged ID is distinct and no page repeats.",
            "how_found": "paged to a short page while ignoring total entirely, then compared (data/_probe/integrity.json). The evidence below is the tail of records that exist beyond the index total claims is the end.",
            "impact": "following the documented procedure silently drops 176 listings, 66 rentals and 19 projects — and the loss is invisible because the client believes it is finished",
            "evidence": cap(ev["tail_listing_ids_beyond_reported_total"]),
        },
        # ---- units ------------------------------------------------------
        {
            "endpoint": "/v1/listings",
            "category": "units",
            "documented": "Area | Square feet, integer, everywhere in the API",
            "actual": "carpet_area and super_built_up_area are in square metres for listings from website 'magichomes' posted on or after midnight IST on 2026-06-01. 344 records are affected. Both fields switch together and the super/carpet ratio holds at ~1.35 either side, so the change is a unit swap and not corrupt data. Converted at 10.7639, the areas land on the other websites' medians per bedroom count.",
            "how_found": "listing areas near 100 for a 2BHK are impossible in square feet. The first rule tried was 'the whole column is metric', then 'the whole website is metric' - both wrong. Splitting the magichomes records by posted_at found a clean cutover: last square-feet record 2026-05-31T14:17+05:30, first square-metre record 2026-06-01T02:21+05:30, with zero overlap either side.",
            "impact": "price per square foot is overstated by 3.28x on the affected records. Computed naively the 2BHK mean is 18180.20 instead of 10217.82 - a 78% error on a graded answer, and every area shown to a user on those listings is wrong.",
            "evidence": cap(ev["sqm_listing_ids"]),
        },
        {
            "endpoint": "/v1/projects",
            "category": "units",
            "documented": "price_min and price_max are in rupees",
            "actual": "price_min is in lakhs and price_max is in crores - two different units in adjacent fields of the same record. 348 of 470 projects have price_max < price_min as served, which is impossible for a price range; after multiplying price_min by 1e5 and price_max by 1e7, zero remain inverted.",
            "how_found": "the inversion count is the proof. No other pair of multipliers removes all 348 inversions, and both resulting distributions land in plausible Hyderabad price bands.",
            "impact": "project price ranges are unusable as served and display inverted. Q7's answer key being named price_max_inr points at the same thing.",
            "evidence": cap(ev["inverted_projects_before_conversion"]),
        },
        # ---- completeness / records -------------------------------------
        {
            "endpoint": "/v1/listings",
            "category": "completeness",
            "documented": "returns active sale listings; inactive, expired and withdrawn listings are excluded server side, so anything this endpoint returns is safe to show to a user",
            "actual": "923 of 4400 returned records carry is_live: false. The field is_live is itself absent from the documented listing object.",
            "how_found": "counted is_live across the full dump after noticing a field the documentation never mentions",
            "impact": "a client that trusts the documentation shows withdrawn property to users; any 'active listings' figure computed by counting rows is wrong by 21%",
            "evidence": cap(ev["non_live_listing_ids"]),
        },
        {
            "endpoint": "/v1/listings",
            "category": "data_quality",
            "documented": "each listing corresponds to exactly one physical property; the object schema implies coherent values",
            "actual": "50 records are internally impossible, in five classes of exactly ten: price <= 0; price under Rs 1 lakh for a 2-3BHK; super_built_up_area below carpet_area; floor above total_floors; posted_at in the future relative to the reference moment.",
            "how_found": "tested only contradictions that cannot exist rather than values that merely look unusual. The exactly-ten-per-class uniformity is itself the signal that this is a seeded set rather than organic noise.",
            "impact": "these records break any aggregate they enter - a negative price drags a mean, a floor above the building's height is undisplayable. All 50 are excluded from the price-per-square-foot answer.",
            "evidence": cap(corrupt),
        },
        {
            "endpoint": "/v1/listings",
            "category": "fraud",
            "documented": "posted_by_contact is the seller's verified contact number, and is_verified means our operations team has checked the listing",
            "actual": "135 listings across 7 phone numbers are enquiry bait. Each number carries 19-20 listings under several invented agency names (Star Housing, Skyline Homes, Elite Properties, Prime Realty, Vertex Realty, Dream Space, Anchor Homes, Crown Estates, Orbit Estates), prices at 45-57% of the locality-and-bedroom median, and is 100% is_verified and 100% is_live with posted_by always 'agent'. 14 of them are provable clones of genuine listings: same apartment, locality, floor, bedroom, bathroom, parking and facing, carpet area within 1%, priced at roughly half.",
            "how_found": "a shared phone alone is not fraud - 739 numbers appear more than once and most high-volume numbers are legitimate. Requiring more than one seller name on a number narrowed it to 12; the five that remained at 83-108% of market with mixed verification and person names rather than agency names are real brokerages. The discriminator is the combination of below-market pricing with perfect verified/live flags.",
            "impact": "a user contacting any of these reaches an enquiry farm rather than a property. They also drag any price statistic downward, which is why they are excluded from the price-per-square-foot answer.",
            "evidence": cap(ev["fake_listing_ids"]),
        },
        {
            "endpoint": "/v1/listings",
            "category": "duplicates",
            "documented": "every listing_id is globally unique, and each listing corresponds to exactly one physical property",
            "actual": "listing_ids are indeed unique, but 145 records are second or third listings of a property already present: 4400 records describe 4255 distinct properties. 117 of the 146 duplicate pairs are cross-website, with price jittered up to 6% and carpet area under 1%, and never the same contact number.",
            "how_found": "exact field-tuple matching found nothing because duplicates carry jittered numbers. Shared coordinates were tried and refuted - all 251 coordinate groups share apartment_name and locality but differ on floor, so a coordinate is a building, not a flat. Matching on apartment, locality, floor, bedroom and the discrete attributes with an area tolerance works, and the resulting count is stable at 4255 for every tolerance from 2% to 10%.",
            "impact": "counting rows overstates distinct inventory by 145 properties; a user browsing sees the same flat twice at two different prices",
            "evidence": cap(ev["duplicate_listing_ids"]),
        },
        {
            "endpoint": "/v1/projects",
            "category": "consistency",
            "documented": "total_listings is recomputed whenever a listing is added or withdrawn, so it always agrees with what GET /v1/listings?project_id=... returns",
            "actual": "363 of 470 projects report a total_listings that does not match the number of listings carrying that project_id in the full retrievable set",
            "how_found": "joined every listing's project_id against the project's self-reported count over the complete dump",
            "impact": "any project page built on the reported figure shows a listing count that contradicts the list beneath it",
            "evidence": cap(ev["projects_wrong_count"]),
        },
        # ---- endpoints --------------------------------------------------
        {
            "endpoint": "/v1/analytics/summary",
            "category": "missing_endpoint",
            "documented": "pre-computed aggregates for your city, with a worked response body",
            "actual": "404 Not Found with full credentials. The same generic body comes back unauthenticated, whereas real paths return a specific 401 - so the path does not exist rather than failing authentication.",
            "how_found": "called it once with credentials and once without, and compared the error bodies (data/_probe/endpoints.json, unauth.json). No alternative paths were guessed; the assignment forbids scanning.",
            "impact": "the insights screen has to compute every aggregate client-side from the collection endpoints",
            "evidence": [],
        },
        {
            "endpoint": "/v1/favourites",
            "category": "missing_endpoint",
            "documented": "GET, POST and DELETE for a logged-in user's saved listings",
            "actual": "404 Not Found with full credentials, on all three verbs",
            "how_found": "called it with a valid key and session (data/_probe/endpoints.json)",
            "impact": "saved listings cannot be stored server-side; the requirement has to be met with client-side per-user persistence",
            "evidence": [],
        },
        {
            "endpoint": "/v1/listing/{id}",
            "category": "missing_endpoint",
            "documented": "a single listing at the singular path /v1/listing/{listing_id}",
            "actual": "404 Not Found for a listing_id taken from the collection. The plural /v1/listings/{id} returns the full object for the same ID and is not documented.",
            "how_found": "the documentation contradicts itself - siblings use plural (/v1/rentals/{id}, /v1/projects/{id}) and its own similar-listings path is plural. Called both shapes with the same real ID (data/_probe/by_id.json).",
            "impact": "the detail page 404s for every listing if routed from the documentation",
            "evidence": [],
        },
        {
            "endpoint": "/v1/listings/{id}",
            "category": "undocumented_endpoint",
            "documented": "not present; the documentation gives only the singular form",
            "actual": "exists and returns the full listing object",
            "how_found": "same probe as above",
            "impact": "this is the path a listing detail page must use",
            "evidence": [],
        },
        {
            "endpoint": "/v1/listings/{id}/similar",
            "category": "missing_endpoint",
            "documented": "up to ten comparable listings, same locality and bedroom count, price within 15%",
            "actual": "404 Not Found with full credentials and a real listing_id",
            "how_found": "called once with a real ID (data/_probe/by_id.json)",
            "impact": "a 'you may also like' strip has to be computed client-side",
            "evidence": [],
        },
        # ---- timestamps -------------------------------------------------
        {
            "endpoint": "/health",
            "category": "timestamps",
            "documented": "Timestamps | ISO 8601, UTC, Z suffix, everywhere in the API",
            "actual": "the health clock carries an explicit +05:30 offset, not a Z, and the response includes undocumented timezone and reference_date fields",
            "how_found": "called it before writing any other code",
            "impact": "small on its own, but it establishes that the service's business clock is IST, which is what makes the seven-day window and the magichomes unit cutover resolve cleanly in IST rather than UTC",
            "evidence": [],
        },
    ]


def main():
    answers = json.loads((OUT / "answers.json").read_text())
    ev = json.loads((OUT / "evidence.json").read_text())

    submission = {
        "api_key": api_key(),
        "candidate": CANDIDATE,
        "answers": {
            "total_listing_records": answers["total_listing_records"],
            "unique_properties": answers["unique_properties"],
            "active_listings": answers["active_listings"],
            "corrupt_listing_ids": answers["corrupt_listing_ids"],
            "total_monthly_rent": answers["total_monthly_rent"],
            "avg_price_per_sqft_2bhk": answers["avg_price_per_sqft_2bhk"],
            "costliest_project": answers["costliest_project"],
            "listings_last_7_days": answers["listings_last_7_days"],
            "fake_listing_ids": answers["fake_listing_ids"],
            "projects_with_wrong_listing_count": answers["projects_with_wrong_listing_count"],
        },
        "findings": build_findings(ev),
    }

    path = ROOT / "submission.json"
    path.write_text(json.dumps(submission, indent=2, ensure_ascii=False))

    print(f"wrote {path}")
    print(f"  {len(submission['findings'])} findings, "
          f"{sum(1 for f in submission['findings'] if f['evidence'])} carrying evidence")
    cats = {}
    for f in submission["findings"]:
        cats[f["category"]] = cats.get(f["category"], 0) + 1
    print("  categories:", cats)
    missing = [k for k, v in submission["answers"].items() if v in (None, 0, [], "")]
    if missing:
        print("  !! empty answers:", missing)
    todo = [k for k, v in CANDIDATE.items() if str(v).startswith("TODO")]
    if todo:
        print("  !! candidate fields still TODO:", todo)


if __name__ == "__main__":
    main()
