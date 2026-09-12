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
