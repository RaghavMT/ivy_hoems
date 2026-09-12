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

### H-000 — example, delete this

**Why I suspected it:** the format example in the assignment statement.

**How I tested it:** called `/health` before writing any other code.

**Result:** REFUTED — it behaves exactly as documented.

**What I found:** returns service status and a server clock with an explicit +05:30 offset, as
described.

**Consequence:** none. Not a finding. Establishes that the documentation is not wrong everywhere,
which matters for calibrating how much to distrust it.

### H-006 — Server silently caps `limit` below the documented maximum of 200

**Why I suspected it:** `API_REFERENCE.md` says `limit` defaults to 20 with a maximum of 200. The
assignment statement stresses that every page truthfully reports which limit the server used —
an invitation to compare what was requested with what was echoed. A cap that the docs don't
mention would also mean any record count computed from an assumed page size is wrong.

**How I tested it:** `dump.py` requests `limit=200` on every page of every collection and records
the echoed limit per page in `data/_probe/pages_<collection>.json`; `data/_probe/integrity.json`
reports `limit_capped` and every distinct echoed limit seen.

**Result:** OPEN — entry written before the dump was run.

**What I found:** _pending_

**Consequence:** if confirmed, a `pagination` finding on each affected collection endpoint.

### H-007 — The reported `total` disagrees with the count reached by paging to exhaustion

**Why I suspected it:** the docs say `total` is "the exact number of records matching your
filters" and tell you to divide it by your limit to know how many pages to fetch. If `total` is
wrong, anyone who trusts it stops early or over-fetches. Q1, Q3 and Q8 all depend on having the
whole retrievable set, so this has to be settled before any count is trusted.

**How I tested it:** page every collection until a short page, ignoring `total` entirely, then
compare the echoed `total` against the number of records actually paged
(`integrity.json` → `total_matches_paged`).

**Result:** OPEN — entry written before the dump was run.

**What I found:** _pending_

**Consequence:** if confirmed, a `pagination` or `completeness` finding. Either way Q1 uses the
paged count, never `total`.

### H-008 — The documented `page` parameter is ignored or off-by-one, duplicating or skipping records at page boundaries

**Why I suspected it:** the docs specify `page` (1-indexed) plus `limit`. Catalogue prior H-008.
Also a practical one: the first version of `dump.py` never tested the documented pair at all, so
whether it works has genuinely not been observed yet.

**How I tested it:** `detect_pagination` tries the documented `limit`+`page` pair first, then
`limit`+`offset` and other common names. A pair passes only if `limit=3` actually caps the page
AND the second-page value returns a different first record. After the dump, `integrity.json`
lists any `listing_id`/`project_id` that appears on more than one page.

**Result:** OPEN — entry written before the dump was run.

**What I found:** _pending_

**Consequence:** if the documented pair fails, a `pagination` finding. IDs repeated across page
boundaries are a paging defect and are kept separate from same-property duplicates (H-009).

### H-015 — `/v1/analytics/summary` does not exist at the documented path

**Why I suspected it:** the statement says some documented endpoints do not exist and some exist
at a different path, and phrases the insights requirement as "whatever the documentation
*promised* from `/v1/analytics/summary`" — which reads as a hint that the promise is not kept.

**How I tested it:** `probe_endpoints` calls the documented path once, authenticated, and records
the status and body in `data/_probe/endpoints.json`; `unauth.json` records the same call with no
key. No alternative paths are guessed — the assignment forbids scanning.

**Result:** OPEN — entry written before the dump was run.

**What I found:** _pending_

**Consequence:** if 404, a `missing_endpoint` finding, and the insights screen computes its
aggregates from the dump instead.

### H-018 — The documented auth mechanism (`?api_key=` query param) is not what the server accepts, and/or the token lifetime is not 24 hours

**Why I suspected it:** the docs say the key goes in a query parameter and that login tokens last
24 hours with no refresh flow. The assignment separately requires the app to "still be working
thirty minutes after you logged in", which is a strange thing to require if tokens really last
a day — it reads as a hint that the real TTL is short.

**How I tested it:** key half — `detect_auth` tries the documented query param first, then four
header variants, and records the status of every attempt in `data/_probe/auth.json`, plus each
endpoint with no credentials at all in `unauth.json`. Token half — log in as a demo user after
the dump and decode the JWT `exp` claim rather than waiting to see it expire.

**Result:** OPEN — entry written before the dump was run.

**What I found:** _pending_

**Consequence:** an `auth` finding for whichever half fails. The frontend's session strategy
(refresh vs long-lived token) depends on the real TTL.
