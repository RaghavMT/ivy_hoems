# Findings inbox

Findings and corrections that surfaced while building the web app, handed to whoever maintains
`submission.json`.

Every item below was reproduced with a saved artifact, and every `documented` quote was copied from
`API_REFERENCE.md`. JSON blocks use the exact seven-key schema.

**How to use:** merge an item into `submission.json`, then mark its status line MERGED, or REJECTED
with a reason. Don't delete items; the history of what was decided matters.

---

## New findings

### 1. `/auth/logout` does not invalidate anything

Status: MERGED (analysis session, verified against the dump). Artifact: `data/_probe/session.json` (run twice, same result). Hypothesis: H-031.

```json
{
  "endpoint": "/auth/logout",
  "category": "auth",
  "documented": "POST /auth/logout: 'Invalidates the current token server side.'",
  "actual": "returns 200 with {\"ok\": true, \"note\": \"tokens are stateless; discard them client side\"}. Afterwards the same access token still reads /v1/listings (200) and the same refresh token still mints a new token pair (200). Nothing is invalidated.",
  "how_found": "logged in, refreshed, called POST /auth/logout with the current access token, then reused that access token on /v1/listings and the refresh token on /auth/refresh. Both still returned 200. Control: the same access token returned 200 on /v1/listings before logout, so logout made no difference to it. Run twice.",
  "impact": "a client that trusts the documentation treats logout as ending the session server-side, so a leaked or shared token keeps working after the user logs out. Logout has to be implemented by the client discarding its tokens.",
  "evidence": []
}
```

### 2. `order=desc` is accepted and ignored

Status: MERGED (analysis session, verified against the dump). Already reproduced by the analysis session and logged as a finding in H-017, but not
present in `submission.json`. Artifacts: `data/_probe/filters.json` (`sorting`),
`data/_probe/sorting_full.json`.

```json
{
  "endpoint": "/v1/listings",
  "category": "sorting",
  "documented": "query parameter order: 'asc (default) or desc'",
  "actual": "order=desc returns 200 with results in ascending order. sort_by=price&order=desc starts at -19260000 and ends at 2720000, and its first eight values are identical to the order=asc request. The same happens on /v1/projects: sort_by=price_max&order=desc ascends. sort_by itself is honoured.",
  "how_found": "requested the same sort_by with order=asc and order=desc and compared the returned sequences. Ascending is honoured; descending returns the ascending sequence. Full 50-row pages saved for the descending cases.",
  "impact": "a 'highest price first' or 'newest first' view built from the documentation shows the cheapest or oldest records instead. Descending order has to be sorted client-side.",
  "evidence": []
}
```

### 3. `project_id` on `/v1/listings` is accepted and ignored

Status: MERGED (analysis session, verified against the dump). Already reproduced by the analysis session and logged as a finding in H-016, but not
present in `submission.json`. Artifact: `data/_probe/filters.json`.

```json
{
  "endpoint": "/v1/listings",
  "category": "filters",
  "documented": "total_listings 'always agrees with what GET /v1/listings?project_id=... returns', which presents project_id as a working filter on /v1/listings",
  "actual": "GET /v1/listings?project_id=P20165 returns 200 with a page identical to the unfiltered page: 0 of 50 records belong to P20165, and total is 4224, the unfiltered total.",
  "how_found": "requested one page with project_id=P20165 and one page with no filter, all else identical, and compared the returned ID lists and totals. Identical. Every documented filter in the parameter table was tested the same way and honoured, so this is specific to project_id.",
  "impact": "the documented way to check a project's listing count returns every listing in the city, so the cross-check the documentation promises cannot be done through the API. Per-project listings have to be filtered client-side.",
  "evidence": []
}
```

### 4. Candidate, lower confidence: `sort_by=posted_at` orders by IST calendar day only

Status: REJECTED. The docs list posted_at as a sort_by value without stating granularity, so ordering by IST day is still ordering by posted_at. Reporting it needs "sorts by posted_at" to mean "by timestamp" - our reading, not their claim. README material, not a finding.

The returned page is ascending by IST date, with arbitrary order within each day. The documentation
lists `posted_at` as a `sort_by` value without stating granularity, so whether this is a documented
claim being wrong is arguable. Only add it if you judge "sorts by posted_at" to mean by timestamp.
Otherwise leave it out; precision counts as much as recall.

### 4b. Rental `deposit` is served as months of rent by one website

Status: MERGED (analysis session, verified against the dump). Found while building the rentals page. Hypothesis: H-036. Artifact: the dump; the frontend test
`web/src/test/normalise.test.ts` checks every rental.

```json
{
  "endpoint": "/v1/rentals",
  "category": "units",
  "documented": "'deposit is the security deposit in rupees'",
  "actual": "for every rental from website zerobroker (344 records) deposit is a number of months of rent, a whole number from 2 to 10, not rupees. R2000514 serves rent 7800 with deposit 6, meaning Rs 46,800. Every other website's deposit is rupees (Rs 21,600 and up) and is an exact whole multiple of 2 to 10 times the monthly rent for all 1,306 of them. Nothing is served between 10 and 21,600.",
  "how_found": "a deposit of 6 on a Rs 7,800 rent while building the rentals page. Profiled deposit over all 1,650 rentals: a separate cluster of 344 values from 2 to 10, all zerobroker and every zerobroker rental, with no date boundary. On the other websites deposit divided by rent is an exact integer 2-10 on every record, so 'months of rent' is the unit the low cluster is written in. The value spread in the low cluster (29-45 per value) matches the ratio spread elsewhere (129-167 per value).",
  "impact": "a client showing deposit as documented tells renters a zerobroker flat needs a Rs 2 to Rs 10 security deposit, and any deposit statistic across websites is wrong by four orders of magnitude on a fifth of the records.",
  "evidence": [
    "R2000002",
    "R2000003",
    "R2000009",
    "R2000018",
    "R2000022",
    "R2000034",
    "R2000045",
    "R2000066",
    "R2000081",
    "R2001491",
    "R2001507",
    "R2001536",
    "R2001579",
    "R2001617",
    "R2001629",
    "R2001635",
    "R2001637",
    "R2001639"
  ]
}
```

---

## Corrections to existing findings

### 5. `/v1/projects` `units`: `price_min` is also served in two units

Status: MERGED (analysis session, verified against the dump). Hypothesis: H-035. Artifact: the dump, reproducible with the check in H-035.

Current text says: "price_min is in lakhs."

Replace with: "price_min is served in two units with nothing between them: 90 projects in crores
(raw 1.00–1.43) and 380 in lakhs (raw 31.4–99.9). Read as lakhs, the 90 low values give ₹75–105 per
sq ft at min_area_sqft; read as crores, ₹7,505–10,522, all inside the listing market band."

Suggested evidence, all 20 re-checked to sit near the middle of the band only under the crore
reading. Replace or merge with the current list, keeping the total at 20 or fewer:

```json
["P20018", "P20041", "P20064", "P20086", "P20087", "P20088", "P20109", "P20129", "P20193", "P20202",
 "P20225", "P20241", "P20248", "P20276", "P20308", "P20331", "P20354", "P20375", "P20437", "P20464"]
```

Effect on answers: none. Q7 uses `price_max` only.

### 6. `/v1/listings` `units`: 358 records are affected, not 344

Status: MERGED (analysis session, verified against the dump). Artifact: `analysis/out/evidence.json` (`sqm_listing_ids`, 358 IDs).

Current text says: "344 records are affected."

Replace with: "358 records are affected: 344 with bedrooms and 14 plots, whose areas switched unit
too." Selecting magichomes listings posted at or after 2026-06-01 00:00 IST gives exactly the 358
IDs in the evidence file. The 14 plots are:
`MAG-2000176, MAG-2000528, MAG-2000944, MAG-2001026, MAG-2001125, MAG-2002594, MAG-2003007,
MAG-2003402, MAG-2003516, MAG-2003693, MAG-2003742, MAG-2003951, MAG-2004061, MAG-2004389`.
Example: `MAG-2000528` is a plot served as 212. As square metres that is 2,282 sq ft; the median
zero-bedroom listing on the other websites is 1,866 sq ft, and none of them is below 491.

Effect on answers: none. `answers_v2.py` detects square metres with a size threshold that selects
the same 344 bedroomed listings, and no question uses plots.

### 7. `/v1/listings` `pagination`: `total` is rounded, not floored

Status: MERGED (analysis session, verified against the dump). Hypothesis: H-034. Artifacts: `data/_probe/filters.json`, `data/_probe/price_bounds.json`.

Current text says: "each is floor(n x 0.96)."

Replace with: "each is round(n x 0.96)." The three unfiltered totals fit both rules. Filtered totals
separate them: Madhapur 430 true, 413 reported; 2BHK 1,383 true, 1,328 reported; `max_price=5000000`
305 true, 293 reported. Flooring gives one less in each of those. Across all eleven honoured filter
requests in the filter probe, rounding reproduces every reported total and flooring only five.

### 8. `/auth/login` `auth`: the `user` object has no `name`

Status: MERGED (analysis session, verified against the dump). Artifact: `data/_probe/auth.json` (`login`, body with tokens redacted).

The documentation's response example shows `"user": { "email": "demo1@ivy.homes", "name": "Demo
User" }`. The actual `user` is `{"email": "demo1@ivy.homes"}`.

This is the same response-shape defect the existing finding already covers (token field named
`access_token`), so append one clause rather than adding a finding: "and the user object carries
only email, not the documented name."

---

## Review item

### 9. The `/health` `timestamps` finding may be scored as a false positive

Status: ACTED ON - finding REMOVED from submission.json. The statement's own example is a /health timestamps entry whose impact reads "none - this one is an example of the format, not a discrepancy", so they pre-declared the +05:30 as not a discrepancy. Restating it risks a scored false positive. timestamps is now an empty category, which is correct: the posted_at timezone hypothesis was refuted (the Z is honest).

The statement's own format example (`docs/statement.md`, Part 3) is a `/health` `timestamps` entry
whose `impact` reads "none - this one is an example of the format, not a discrepancy". The current
finding is close to that example. Against it, `API_REFERENCE.md` does say timestamps are "UTC, Z
suffix, everywhere", and the current finding also cites undocumented `timezone` and
`reference_date` fields. Decide whether it is a real discrepancy for this key or the example
restated.

---

## Checked and not findings

Documentation that turned out correct. README material, not `findings`.

- Refresh tokens can be reused (H-032). The documentation says nothing about refresh either way.
- Login returns the same 401 for a wrong password and an unknown email (H-033).
- `min_price` and `max_price` are inclusive, as documented (H-034).
- A session left idle for 31 minutes recovers through `/auth/refresh` (H-030). This supports the
  existing `/auth/login` finding rather than adding one.
