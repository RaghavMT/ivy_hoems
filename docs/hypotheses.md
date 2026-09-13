# Hypothesis log

**Write the entry BEFORE you run the test.** Then fill in the result.

This file is the source for the README's "what you checked that turned out to be fine" section,
which the assignment calls out as the part that tells them most about how you think. A log
reconstructed on Sunday night reads like one. Keep it as you go.

Refutations are as valuable as confirmations here. A catalogue of 27 hypotheses where 15 were
refuted is a stronger submission than one where all 27 conveniently held.

---

## Format

```
### H-0XX — one-line statement of the hypothesis

**Why I suspected it:** what made this worth testing — a tell in the statement, something odd in
the data, a real-world expectation the numbers violated.

**How I tested it:** the specific check. Query, comparison, band, threshold.

**Result:** CONFIRMED / REFUTED / PARTIAL

**What I found:** the numbers. If confirmed, the evidence IDs. If refuted, what the data actually
showed instead.

**Consequence:** which answer or finding this changes, if any.
```

---

## Entries

<!-- newest at the bottom, so the file reads as a chronology -->

### H-006 — Server silently caps `limit` below the documented maximum of 200

**Why I suspected it:** `API_REFERENCE.md` says `limit` defaults to 20 with a maximum of 200. The
assignment statement stresses that every page truthfully reports which limit the server used —
an invitation to compare what was requested with what was echoed. A cap that the docs don't
mention would also mean any record count computed from an assumed page size is wrong.

**How I tested it:** `dump.py` requests `limit=200` on every page of every collection and records
the echoed limit per page in `data/_probe/pages_<collection>.json`; `data/_probe/integrity.json`
reports `limit_capped` and every distinct echoed limit seen.

**Result:** CONFIRMED.

**What I found:** every page of every collection: requested `limit=200`, server echoed
`limit: 50` and returned 50. The default of 20 with no `limit` given is as documented; only the
maximum is wrong (50, not 200). Evidence: `data/_probe/pages_v1_listings.json`,
`pages_v1_rentals.json`, `pages_v1_projects.json` (`requested` vs `echoed_limit` on every page),
summarised in `data/_probe/integrity.json` → `limit_capped: true`, `echoed_limits_seen: [50]`.

**Consequence:** `pagination` finding on `/v1/listings`, `/v1/rentals`, `/v1/projects`. Any
client that computes pages from `total / 200` fetches a quarter of the data.

### H-007 — The reported `total` disagrees with the count reached by paging to exhaustion

**Why I suspected it:** the docs say `total` is "the exact number of records matching your
filters" and tell you to divide it by your limit to know how many pages to fetch. If `total` is
wrong, anyone who trusts it stops early or over-fetches. Q1, Q3 and Q8 all depend on having the
whole retrievable set, so this has to be settled before any count is trusted.

**How I tested it:** page every collection until a short page, ignoring `total` entirely, then
compare the echoed `total` against the number of records actually paged
(`integrity.json` → `total_matches_paged`).

**Result:** CONFIRMED.

**What I found:** `total` under-reports on all three collections:

| endpoint | echoed `total` | records paged | gap |
| --- | --- | --- | --- |
| `/v1/listings` | 4224 | 4400 | 176 |
| `/v1/rentals` | 1584 | 1650 | 66 |
| `/v1/projects` | 451 | 470 | 19 |

The paged count is the real one: `has_more` went `false` on the last full page and the next
offset returned an empty page, and every ID paged is distinct (`integrity.json` →
`ids_repeated_count: 0`). `total` is constant across all pages, so it isn't drifting — it means
something other than "records this endpoint will return". What it does count (live only?
distinct properties?) is a question for the analysis side, not settled here.

One honest note: my dump flagged `"page full but server says no more remain"` on the last page.
That was my heuristic being cautious, not the server lying — the following page was empty, so
`has_more: false` was truthful. Not a finding.

**Consequence:** `pagination` finding on all three collection endpoints (`total` is not "the
exact number of records matching your filters"). Q1 = 4400 from the paged set, never `total`.
Evidence: `data/_probe/integrity.json`, `data/_manifest.json`.

### H-008 — The documented `page` parameter is ignored or off-by-one, duplicating or skipping records at page boundaries

**Why I suspected it:** the docs specify `page` (1-indexed) plus `limit`. Catalogue prior H-008.
Also a practical one: the first version of `dump.py` never tested the documented pair at all, so
whether it works has genuinely not been observed yet.

**How I tested it:** `detect_pagination` tries the documented `limit`+`page` pair first, then
`limit`+`offset` and other common names. A pair passes only if `limit=3` actually caps the page
AND the second-page value returns a different first record. After the dump, `integrity.json`
lists any `listing_id`/`project_id` that appears on more than one page.

**Result:** CONFIRMED — the documented `page` parameter is silently ignored; `offset` is what
the server actually uses.

**What I found:** `?limit=3&page=2` returns 200 with the same first record as page 1 and the
envelope echoes `offset: 0` — the parameter is accepted and does nothing. `?limit=3&offset=3`
shifts the window and echoes `offset: 3`. Same on all three collections. The envelope itself is
also not the documented `{total, page, page_size, results}`; it is
`{limit, offset, count, total, has_more, results}`. Paging by `offset` is clean: 4400 / 1650 /
470 records, zero IDs repeated across pages, no gaps. Evidence: `data/_probe/pagination.json`
(`attempts`, with `server_echo_page1` / `server_echo_page2` for each param pair).

**Consequence:** `pagination` finding on the collection endpoints: `page` documented, ignored;
`offset` undocumented, required. A client following the docs gets page 1 forever.

### H-015 — `/v1/analytics/summary` does not exist at the documented path

**Why I suspected it:** the statement says some documented endpoints do not exist and some exist
at a different path, and phrases the insights requirement as "whatever the documentation
*promised* from `/v1/analytics/summary`" — which reads as a hint that the promise is not kept.

**How I tested it:** `probe_endpoints` calls the documented path once, authenticated, and records
the status and body in `data/_probe/endpoints.json`; `unauth.json` records the same call with no
key. No alternative paths are guessed — the assignment forbids scanning.

**Result:** CONFIRMED.

**What I found:** `GET /v1/analytics/summary` → 404 `{"detail": "Not Found"}`, with full
credentials (key + session). The same generic body comes back with no credentials at all,
whereas real paths return a specific 401 message — so this is a path that doesn't exist, not
an auth failure. Two more documented paths 404 the same way: `/v1/favourites` (with full
credentials) and `/v1/listings/{id}/similar`. Evidence: `data/_probe/endpoints.json`,
`data/_probe/unauth.json`, `data/_probe/by_id.json`.

**Consequence:** `missing_endpoint` findings on `/v1/analytics/summary`, `/v1/favourites` and
`/v1/listings/{id}/similar`. The insights screen computes its aggregates from the dump. Saved
listings cannot use a server endpoint — see the frontend notes for how that requirement is met.
No alternative paths were tried for any of these; the assignment forbids scanning.

### H-018 — The documented auth mechanism (`?api_key=` query param) is not what the server accepts, and/or the token lifetime is not 24 hours

**Why I suspected it:** the docs say the key goes in a query parameter and that login tokens last
24 hours with no refresh flow. The assignment separately requires the app to "still be working
thirty minutes after you logged in", which is a strange thing to require if tokens really last
a day — it reads as a hint that the real TTL is short.

**How I tested it:** key half — `detect_auth` tries the documented query param first, then four
header variants, and records the status of every attempt in `data/_probe/auth.json`, plus each
endpoint with no credentials at all in `unauth.json`. Token half — log in as a demo user after
the dump and decode the JWT `exp` claim rather than waiting to see it expire.

**Result:** CONFIRMED — both halves.

**What I found:** Key half: `GET /v1/listings?api_key=...` returns 401 with
`"send your key in the X-API-Key request header, not as a query parameter"`. The header works.
Token half: `POST /auth/login` (200, with the key in `X-API-Key`) returns `expires_in: 900` —
fifteen minutes, not 24 hours — and a `refresh_url: "/auth/refresh"` plus a `refresh_token`,
so a refresh flow exists. The token field is also named `access_token`, not the documented
`token`. The plan to decode a JWT `exp` claim didn't apply — the token is opaque, not a JWT — so
the lifetime rests on the server's own `expires_in`. Evidence: `data/_probe/auth.json`
(`key_only` and `login` sections; tokens redacted).

**Consequence:** two `auth` findings — `*` for key placement (every endpoint), `/auth/login`
for lifetime, refresh flow and response shape. The frontend must refresh via `/auth/refresh`
before the 15-minute expiry to satisfy the "still working after thirty minutes" requirement.
Explains why the assignment asks for that.

### H-029 — Data endpoints require a user session token in addition to the API key

**Why I suspected it:** not predicted — noticed during the H-018 probe. With the key correctly
in `X-API-Key` and no session, `/v1/listings` still returns 401
`"missing bearer token - log in at POST /auth/login first"`. The documentation's own example,
`GET /v1/listings?api_key=...`, shows the key alone fetching listings, and its auth section
frames the user session as something "your frontend must" do for the end user, not as a
prerequisite for reading data.

**How I tested it:** `detect_auth` phase 1 (key only, every placement) vs phase 3 (key plus
bearer token, every placement), recorded in `data/_probe/auth.json`. Also `token_only` — bearer
with no key — to see whether the key is still checked once a session exists.

**Result:** CONFIRMED.

**What I found:** key alone → 401 on every placement (`"missing bearer token - log in at POST
/auth/login first"` when the key is correctly placed). Bearer alone → 401 `"missing X-API-Key
header"`. Key in `X-API-Key` + `Authorization: Bearer` → 200. Both are checked on every data
request; neither substitutes for the other. `dump.py` had to grow a login step to page anything.

**Consequence:** an `auth` finding on `/v1/listings` (and siblings — evidence in `auth.json`
and `unauth.json`). Every frontend data call needs both headers.

### H-028 — The single-listing endpoint is not at the documented singular path `/v1/listing/{id}`

**Why I suspected it:** the documentation is inconsistent with itself. It gives the single-record
path as singular `/v1/listing/{listing_id}`, but the sibling resources use plural
`/v1/rentals/{listing_id}` and `/v1/projects/{project_id}`, and the "similar" endpoint is
`/v1/listings/{listing_id}/similar`. One of those shapes is probably a documentation error.

**How I tested it:** `probe_by_id` in `dump.py` calls both `/v1/listing/{id}` and
`/v1/listings/{id}` once, with the same real ID from the dump, and records status and body in
`data/_probe/by_id.json`. Two documented-shape variants, not a scan.

**Result:** CONFIRMED.

**What I found:** with the same real `listing_id`, `/v1/listing/{id}` → 404 `Not Found` and
`/v1/listings/{id}` → 200 with the full listing object. `/v1/rentals/{id}` and
`/v1/projects/{id}` both 200 as documented. Evidence: `data/_probe/by_id.json`.

**Consequence:** `missing_endpoint` on `/v1/listing/{id}`; the working plural path is
undocumented (`undocumented_endpoint`). The detail page routes on `/v1/listings/{id}`.

### H-001 — Listing `price` is in lakhs or crores rather than rupees

**Why I suspected it:** the answer key for Q7 is named `price_max_inr`. Naming the unit in the
expected answer implies the served field is not already in it. Indian property data is quoted in
lakhs and crores far more often than in rupees.

**How I tested it:** compared the listing price distribution against a plausible Hyderabad band
rather than against any other field. A 2BHK in this city sits roughly between ₹45 lakh and ₹2 crore.

**Result:** REFUTED for `/v1/listings`.

**What I found:** median ₹1.06 crore, p05 ₹45.5 lakh, p95 ₹1.95 crore. Already rupees, and the
magnitudes are right for the city. The sub-lakh and negative values that do exist are a separate
corruption class (H-010), not a unit problem — they are three orders of magnitude off rather than
uniformly shifted.

**Consequence:** no finding on listing price. It mattered to check: had this been wrong it would
have poisoned Q6 and Q7 as well as every price shown in the app. The refutation is also what made
the *project* price finding credible — the two resources genuinely differ, which is why H-004
(units differ per resource) turned out to be the right frame.

### H-002 — `carpet_area` is in square metres rather than square feet

**Why I suspected it:** the documented convention says square feet everywhere, but listings turned
up with `carpet_area: 105` on a 3BHK. 105 sqft is a bathroom; 105 sqm is about 1,130 sqft, which is
exactly right for a 3BHK.

**How I tested it:** three rules in succession, each one tested and discarded before the next.

1. *The whole column is metric.* Refuted immediately — most records are already in the 800–2000
   range, which is square feet.
2. *The whole `magichomes` website is metric.* Refuted — only 344 of its 835 bedroomed listings are
   small; the other 491 are in the square-foot band. A website-level rule gets 491 records wrong.
3. *`magichomes` is metric from some date onward.* Split its records by `posted_at` and looked for a
   boundary.

**Result:** CONFIRMED, with the third rule.

**What I found:** a clean cutover at midnight IST on 2026-06-01. Last square-foot record
`2026-05-31T14:17+05:30`; first square-metre record `2026-06-01T02:21+05:30`; zero overlap either
side. Monthly counts: January–May 491 sqft / 0 sqm, June onward 0 sqft / 344 sqm. Both area fields
switch together and the super-built-up to carpet ratio stays at ~1.35 across the boundary, which is
what distinguishes a unit change from corrupt data. Converting at 10.7639 puts the affected areas on
the other websites' medians per bedroom count (ratio to expected: min 0.80, median 1.00, max 1.26).

Residual examined: exactly one non-magichomes record falls under 300 sqft — `ZER-2003132`, a 1BHK at
283 with super 404, ratio 1.43. At 283 *sqm* it would be 3,046 sqft for a one-bedroom flat, which is
absurd. So it is a genuinely small flat and the rule stays magichomes-only rather than being widened
to "any small area".

**Consequence:** `units` finding on `/v1/listings`. Drives Q6 — computed without the correction the
2BHK mean is 18180.20 instead of 10217.82, a 78% error. The cutover landing on midnight *IST* rather
than midnight UTC is also the corroboration used in H-020.

### H-003 — Rental `price` is annual rent presented as monthly

**Why I suspected it:** Q5 asks for "monthly rent" specifically, which is the kind of emphasis that
usually marks a trap. Annual-vs-monthly is a twelve-fold error that looks plausible either way in
isolation.

**How I tested it:** the deposit-to-rent ratio. Indian residential leases run a deposit of two to
ten months' rent, clustering at five in Hyderabad. If `price` were annual, `deposit / price` would
land near 0.4 rather than near 5.

**Result:** REFUTED.

**What I found:** median `deposit / price` is exactly 5.0. Median rent ₹33,000, range ₹7,800–87,200
— monthly rupees, as documented.

**Consequence:** no finding. Q5 sums the served values directly.

### H-010 — A small number of listings describe something that cannot exist

**Why I suspected it:** Q4 states it outright. The useful part was the word "small" — it rules out
any rule that returns hundreds, and it tells you the target is internal contradiction rather than
statistical oddity.

**How I tested it:** only contradictions where no physical property could satisfy the record:
non-positive price; a sale price three orders of magnitude below any real flat; super-built-up area
smaller than carpet area (impossible by definition, carpet is a subset); floor above the building's
own total_floors; posted_at later than the reference moment. Areas were unit-corrected first, so
that the magichomes metric records were not mistaken for impossible ones.

**Result:** CONFIRMED.

**What I found:** exactly 50 records — five classes of exactly ten, no overlap between classes and
no overlap with the fraud set. The uniformity is itself the evidence that this is a deliberately
seeded set rather than organic noise; an accidental data problem does not produce five tens.

Checked and clean: `carpet_area <= 0` (zero records), negative floor (zero), `bathroom > bedroom + 2`
(zero). Those were candidate classes that turned out empty.

The judgement call worth stating: the sub-lakh class (₹4,910–15,660 for 2–3BHK flats) is
`data_quality` and not `fraud`. Bait pricing is 30–50% below market and plausible enough to generate
a call; these are 99.9% below and would fool nobody.

**Consequence:** `data_quality` finding, Q4's answer, and the exclusion set for Q6.

### H-011 / H-012 / H-013 — Fake listings share a phone number; and the counter-hypothesis that so do real brokerages

**Why I suspected it:** phone numbers are listed as a valid `evidence` identifier type in the
submission format, yet no question mentions them. Something in the findings had to hinge on them,
and enquiry farms are the obvious mechanism. H-012 was written at the same time as H-011,
*before* any data: a legitimate brokerage also runs many listings off one office line, so a naive
phone rule would over-count — and Q9 is scored on invention as much as on discovery.

**How I tested it:** three rules, each evaluated against the next.

1. *One phone, many listings.* 739 phones appear more than once; the busiest has 32. Useless alone.
2. *One phone used under more than one seller name.* 12 phones, 261 listings. Better, but H-012 says
   this still catches brokerages.
3. *Rule 2, intersected with a median price below 60% of the locality-and-bedroom market rate.*
   7 phones, 135 listings.

**Result:** CONFIRMED, and H-012 confirmed alongside it — the naive rule over-counted by exactly
the amount predicted.

**What I found:** the five phones that rule 2 catches and rule 3 rejects are real brokerages, and
the separation is clean on four independent axes:

| | bait farms (7 phones) | brokerages (5 phones) |
| --- | --- | --- |
| median price vs market | **0.45–0.57** | 0.84–1.08 |
| `is_verified` | **100%** | 50–71% |
| `is_live` | **100%** | 72–86% |
| `posted_by` | **always `agent`** | mixed |
| names on the number | invented **agency** names — Star Housing, Skyline Homes, Elite Properties, Prime Realty, Vertex Realty, Dream Space, Anchor Homes, Crown Estates, Orbit Estates | **person names only** — Divya Iyer, Kavya Patel, Manish Nair |

No single axis separates them; the price ratio alone would be a threshold argument. It is the
combination — below-market pricing *with* perfect verification and liveness flags — that is
structurally impossible for a real agency, since a real agency's listings go stale and fail
verification at some rate.

Two further phones showed low price ratios but tiny volume (n=3, n=2), and their medians turned out
to be dragged by records already in the corrupt set. Excluded: that is corruption showing through,
not fraud. This is the residual step — the rule's exceptions were examined rather than absorbed.

**Consequence:** `fraud` finding, Q9's answer, and part of the Q6 exclusion set.

### H-014 — Fake listings are clones of genuine ones

**Why I suspected it:** Q2 counts distinct properties "genuine or not", which only needs saying if
some fakes describe the same property as a real record. Written before any data.

**How I tested it:** after the duplicate rule from H-009 existed, checked how many duplicate clusters
contain exactly one bait listing and at least one genuine one.

**Result:** CONFIRMED.

**What I found:** 14 of the 146 duplicate pairs pair a bait listing with a genuine one. In every
case the two match on apartment, locality, floor, bedroom, bathroom, parking and facing direction,
with carpet area within 1%, and the bait side is priced at roughly half. Example:
`100-2004170` at ₹96.9 lakh and `ZER-2002244` at ₹52.5 lakh, carpet 924 and 923.

**Consequence:** independent corroboration of the fraud set — 14 of the 135 are provably clones,
which is much stronger than a statistical argument. Also settles a Q2 judgement call: a clone
describes the same property as its twin, so the cluster counts once, which is what the question's
"genuine or not" wording asks for.

### H-009 — Some listings are duplicate records of the same physical property

**Why I suspected it:** the documentation claims each listing is exactly one physical property,
which is the sort of claim Q2 exists to disprove. Cross-portal duplication is also how real
aggregated property data actually looks.

**How I tested it:** four candidate identity rules in order, each discarded on evidence.

1. *Exact tuple match* on (locality, apartment_name, bedroom, carpet_area, floor, price) — **zero**
   matches. Duplicates carry jittered numbers, so nothing exact will ever fire.
2. *Shared coordinates* — 251 groups covering 525 records. Tempting and **refuted**: all 251 groups
   share `apartment_name` and `locality`, none share a phone, and only 60 share a bedroom count.
   Checked directly: `(latitude, longitude, floor)` is unique across all 4,400 records. A coordinate
   identifies a *building*, not a flat, so it can never merge two records.
3. *Geographic clustering to validate `locality`* — also refuted, and worth recording: grouping by
   the locality field gives a mean intra-group coordinate spread of 0.182, grouping by the locality
   named in the rental title gives 0.182, and the whole-city baseline is also 0.183. The coordinates
   carry no locality signal at all, so geography cannot arbitrate between the two.
4. *Match on (apartment_name, locality, floor, bedroom) plus identical bathroom, covered_parking and
   facing_direction, with carpet area inside a tolerance.* This is the rule.

**Result:** CONFIRMED — 4,400 records describe 4,255 distinct properties.

**What I found:** 146 duplicate pairs, 145 redundant records. 117 of the 146 are cross-website, and
**none** share a contact number — these are two different sellers listing the same flat on two
portals, not one seller double-posting. Observed jitter: carpet area under 1%, price up to 6%.

The tolerance is not tuned. The count is 4,343 at 0.5%, 4,265 at 1%, and then **4,255 at every
tolerance from 2% through 10%**. A plateau that wide means the rule has found real structure rather
than a threshold artifact — there is simply nothing in the data between 2% and 10% apart.

Residual examined: 17 pairs sit in the 2–15% area gap and are rejected. Spot-checking them, they
differ on bathroom count or facing direction as well as area — genuinely different flats on the
same floor of the same building, which is common in a large complex.

**Consequence:** `duplicates` finding, and Q2's answer.

### H-020 — Listing timestamps carry a `Z` but are really IST

**Why I suspected it:** the assignment's own `/health` example points out that the server clock
"carries an explicit +05:30 offset", which reads as an invitation to contrast it with timestamps
that do not. If `posted_at` values were IST wearing a UTC suffix, Q8's seven-day window would shift
by 5h30m and records would cross the boundary.

**How I tested it:** two ways.

1. *Hour-of-day distribution.* If the values were really IST, the raw hours would cluster in Indian
   business hours. **Inconclusive** — the distribution is flat across all 24 hours under both
   interpretations, roughly 180 records per hour. Synthetic data, no diurnal signal to read.
2. *The magichomes unit cutover as a clock.* The H-002 boundary is a business event, so it should
   land on a round local time under whichever interpretation is correct. Parsing the `Z` as honest
   UTC and converting to IST puts the boundary between 2026-05-31T14:17+05:30 and
   2026-06-01T02:21+05:30 — cleanly across midnight IST. Treating the values as IST directly puts
   the same boundary between 08:47 and 20:51 on 31 May, mid-afternoon, straddling nothing.

**Result:** REFUTED — the `Z` is honest. The values are genuine UTC.

**What I found:** Q8 is 141 under the correct interpretation and 136 under the wrong one, so this
was worth settling. The business clock is IST, but the serialisation is truthful UTC; only `/health`
departs from the documented convention.

**Consequence:** no `timestamps` finding on `/v1/listings` — a documented claim that held. Q8 parses
as UTC, converts to IST, and applies the window in IST. The `/health` offset remains a finding in
its own right. Worth noting that two hypotheses corroborated each other here: the unit cutover
settled the timezone question, and the IST-midnight boundary is itself evidence the cutover was a
real business event rather than a coincidence.

### H-022 — Seller-written text contradicts the structured fields

**Why I suspected it:** the assignment says outright that "a seller can write anything" and that
everything returned should be treated as data. Q5 depends on the assigned locality, so if the
locality field and the title disagree, the answer depends on which one is authoritative.

**How I tested it:** compared each rental's `title` against its `locality` field, then checked
whether the disagreement was systematic or uniform, then tried to arbitrate geographically.

**Result:** CONFIRMED that they disagree — REFUTED as a usable signal.

**What I found:** 1,499 of 1,650 rentals (91%) have a title naming a locality other than their
`locality` field. 160 titles say Madhapur while the field says otherwise; 153 of the 165 records
whose field says Madhapur have a title naming somewhere else. The disagreement rate is uniform
across all ten localities (133–174 per locality against totals of 146–190), and the mismatched
field values are spread evenly over every other locality — so it is noise, not a systematic swap
affecting one website or one date range.

Two things ruled out arbitration. The bedroom count in the title matches the `bedroom` field in
**all 1,650** records, so the title generator did have access to the record — it is not random
garbage, the locality specifically is wrong. And the coordinate test in H-009 showed neither field
clusters geographically, so there is no third source to break the tie.

**Consequence:** no finding — there is no documented claim that the title must agree with the
locality field, and reporting one would be a guess. Q5 uses the structured `locality` field, which
is the field the API documents and filters on. Stated explicitly because the choice moves the answer
by roughly a factor of two.

### H-027 — Projects report a `total_listings` that disagrees with the listings

**Why I suspected it:** Q10 asks it directly, and the documentation makes an unusually specific
promise — that the count "is recomputed whenever a listing is added or withdrawn, so it always
agrees". Specific promises are the ones worth checking.

**How I tested it:** counted listings per `project_id` over the complete retrievable set and
compared with each project's self-reported figure.

**Result:** CONFIRMED — 363 of 470 disagree.

**What I found:** the disagreement is broad rather than concentrated in a few projects.

The judgement call, stated because it changes the answer: the count compares against *all*
retrievable listings carrying that `project_id`, including non-live, duplicate and bait records.
The alternative — counting only genuine live listings — is defensible but would mean the API's
figure is being judged against a number the API itself never claims to report. The documented claim
is that it agrees with what `GET /v1/listings?project_id=...` returns, so that is what it was
tested against.

**Consequence:** `consistency` finding on `/v1/projects`, and Q10's answer.

### H-019 — A city-scoped key returns records from other cities

**Why I suspected it:** the assignment says the key is scoped to one city and the documentation says
filtering happens automatically with no city parameter. Worth one check rather than an assumption,
since a `completeness` finding would follow if it leaked.

**How I tested it:** counted distinct `city_id` values across all three collections in the dump.

**Result:** REFUTED.

**What I found:** every record in all 6,520 carries `city_id: 2`. The scoping holds exactly as
documented.

**Consequence:** no finding. A documented claim that turned out to be true.

### H-016 — One or more documented listing filters (locality, bhk, property_type, price bounds, furnishing, project_status) are accepted with 200 and silently ignored

**Why I suspected it:** the frontend requirement says filters "must actually filter, whether or
not the server helps you". That phrasing only makes sense if some documented filter params do
nothing. Also H-027 assumed `?project_id=` works and was never checked directly.

**How I tested it:** `analysis/probe_filters.py` — one unfiltered page of 50 per collection as a
baseline, then one request per documented filter with a value known to exist in the dump. A filter
is HONOURED if every returned row satisfies it, IGNORED if the page is byte-identical to the
baseline, REJECTED on 4xx, PARTIAL otherwise. Twelve filter requests in total, 150 ms apart.

**Result:** REFUTED for every documented filter. CONFIRMED for the one undocumented-as-a-parameter
claim, `project_id`.

**What I found:** all eleven documented filters are honoured — `locality`, `bhk`, `property_type`,
`min_price`, `max_price`, `furnishing` on listings; `locality`, `bhk`, `furnishing` on rentals;
`locality`, `project_status` on projects. Every returned row satisfied the predicate (50/50, or
33/33 for projects+locality where the whole result fits on one page) and every page differed from
the unfiltered baseline. The assignment's "whether or not the server helps you" turned out to be a
prompt to *check*, not a hint that the check would fail.

`?project_id=P20165` on `/v1/listings` is the exception: 200, page identical to the unfiltered
baseline, 0 of 50 rows in that project, `total` 4224 (the unfiltered total). The documentation never
lists `project_id` in the parameter table, but the `total_listings` paragraph says it "always agrees
with what `GET /v1/listings?project_id=...` returns" — and that query returns everything.

**Consequence:** no `filters` finding on the documented parameters; README material. `project_id`
being ignored is a `filters` finding, and sharpens H-027: the documented cross-check is literally
impossible via the API, so comparing against per-project counts from the dump was the only route.
Frontend: server-side filtering is usable for all four required filters, but client-side filtering
stays as the fallback the assignment asks for. Evidence: `data/_probe/filters.json`.

### H-017 — `sort_by` / `order` are accepted and ignored

**Why I suspected it:** same reasoning as H-016; sorting is the other documented parameter family
the exhaustive dump never exercised, since the dump only ever paged in default order.

**How I tested it:** same script, six sort requests (price/carpet_area/posted_at/bedroom on
listings, price_max on projects). HONOURED if the returned values are monotone in the requested
direction, IGNORED if the page matches the unsorted baseline, NOT_SORTED otherwise. Four cases came
back NOT_SORTED and the probe keeps only eight values, so `analysis/probe_sort_detail.py` re-fetched
those four plus one control with the full 50-row page saved (`data/_probe/sorting_full.json`).

**Result:** PARTIAL — `sort_by` is honoured, `order` is ignored.

**What I found:** three separate things, none of which is "sorting is broken".

1. *`order=desc` is silently ignored.* Every page comes back ascending. `sort_by=price&order=desc`
   is row-for-row identical to `order=asc` (first value -19,260,000, last 2,720,000).
   `sort_by=bedroom&order=desc` returns fifty studios. `sort_by=price_max&order=desc` on projects
   ascends. The documented default `asc` is real; the documented alternative does nothing.
2. *`sort_by=carpet_area` sorts on a canonical square-foot value, not the served field.* The
   ascending page reads 283 … 400, 401, 402, **37, 37**, 403, 403, **38**, 404, 405, 406, **38**, 411.
   The five out-of-place rows are all `MAG-` listings posted after 2026-06-01 — precisely the
   magichomes square-metre cohort from H-002 (37 sqm ≈ 398 sqft, 38 sqm ≈ 409 sqft). The server's
   sort key is in square feet; only the serialised field changed unit. Independent server-side
   corroboration of H-002 that did not come from the dump.
3. *`sort_by=price_max` on projects sorts on canonical rupees.* Ascending page: 60.0 … 99.8, then
   1.0, 1.0, 1.0, 1.01 … 1.15. That is 32 lakh-denominated projects followed by the crore-denominated
   ones, with 99.8 lakh correctly placed below 1.0 crore. The server agrees with the 438-crore /
   32-lakh per-record split in the `units` finding on `/v1/projects`, which the analysis had derived
   from the price-per-sqft market band alone.
4. *`sort_by=posted_at` sorts by IST calendar day, not by timestamp.* Within the page the values
   are not monotone under any field in the dump, nor at UTC-day granularity (the page mixes
   2026-01-12 and -13 in UTC). Shift by +05:30 and take the date only, and the page is perfectly
   ascending: 21 rows on 13 Jan IST, 17 on 14 Jan, 12 on 15 Jan, arbitrary order within each day.
   Second corroboration of H-020 (the `Z` is honest UTC; the business clock is IST), again from the
   server rather than the dump.

**Consequence:** one `sorting` finding — `order` ignored — plus the `posted_at` day-granularity
behaviour, which is a second `sorting` finding if the Cowork session judges it reproduced (it is:
the saved page is in `sorting_full.json`). Frontend: sort client-side for any descending order and
for recency. Items 2–4 go in the README as the checks that corroborated earlier findings.
