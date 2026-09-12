# Execution plan — target: done Sunday evening

Written 12 Sep 2026, ~11:15 IST. Target completion **Sun 13 Sep, ~21:00 IST**.
Hard deadline is Mon 14 Sep 23:59 IST — under this plan **Monday is buffer only**, not working time.

That buffer is the point. Deploys fail, a rule turns out wrong at 22:00, a laptop dies. Finishing
Sunday means those cost you nothing.

---

## Scope facts worth pinning down

Settled, so nobody relitigates them mid-run:

- **Only Q5 is locality-scoped.** Every other question is the whole retrievable set for the key.
  "Retrievable" = every record the key returns with no filters, paged to exhaustion. The key is
  already city-scoped, so that *is* the whole city.
- **The three demo users are for the app's login feature**, and for proving saved-listings is
  per-user. They are not three data slices. Whatever `API_REFERENCE.md` claims about a 24-hour
  token lifetime is untested — see the auth block in Saturday's schedule.
- **Q6 excludes Q4 and Q9 records.** So Q4 and Q9 must be settled before Q6 can be final.
- **Q2, Q6, Q7 allow ±1%. Everything else is exact.** Q4 and Q9 are scored found-vs-invented, so
  precision on those two matters as much as recall.

---

## Saturday

### 11:30–13:00 — Dump and probe

Run `dump.py`. Read `data/_probe/` before anything else: auth scheme, which endpoints exist, which
pagination params were actually honoured. Several Part 3 findings fall out of that directory alone
(H-006, H-015, H-018).

Commit the dump and the probe output. **First commit of the day happens here, not later.**

### 13:00–15:00 — Exploration, no hypotheses

Load everything into pandas. Do not go looking for anything yet.

- `df.describe()` on every numeric column of every resource
- null rate per column
- value counts on bedroom, furnishing, locality, is_live, status
- sort by price ascending and descending, look at 20 rows from each tail
- same for carpet area
- how many listings, rentals, projects; how they join

Write down what you saw in `docs/observations.md`. Plain sentences. This is calibration — you are
learning what normal looks like in this dataset so abnormal is visible later.

### 15:00–17:00 — Units, pagination, timestamps

These poison other answers, so they go first (H-001–008, H-020–021).

Units: check each field against a plausible band for the city independently. Never validate price
via price ÷ area — two wrong numbers can produce a right-looking ratio (H-005).

Pagination: compare requested limit vs echoed limit; compare any reported total vs the count you
actually paged; check for duplicate or skipped IDs at page boundaries.

Timestamps: does every timestamp carry an offset? Do listings and projects use the same format?
Q8's seven-day window moves by 5h30m if listing timestamps are really UTC.

**Auth, same block:** log in as a demo user. If the token is a JWT, decode the `exp` claim — that
settles token lifetime instantly, no waiting around. Compare to what the documentation claims. The
requirement that the app "still works thirty minutes after login" is a strong hint the real TTL is
short.

### 17:00–19:00 — Rough answers to all ten

Every one, even the ones you know are wrong. Simplest defensible rule for Q4 and Q9.

Write `submission.json` with these and **commit it**. From this moment you always have something
submittable. Everything after is improvement, not risk.

### 19:00–22:00 — Frontend skeleton (Claude Code)

Login with real auth and token refresh. Listing list with pagination. Detail page on its own route.
Ugly is fine. Build against the dump's actual field shapes, not the documented ones.

Commit per working feature, not once at the end.

---

## Sunday

### 09:00–13:00 — Classification: the expensive block

Duplicates (Q2), corrupt (Q4), fakes (Q9) — H-009 through H-014 and H-027. Highest-weighted
answers, hardest thinking, so they get the freshest hours.

For each: write the obvious rule, run it, then **spend real time on what it gets wrong**. Log for
each rule: how many records it catches, how many exceptions remain, what the exceptions have in
common, whether that suggests a refinement. The assignment states outright that the answer lives in
the residual.

Two specific traps:

- A shared phone number is a broker as often as a bait-farm (H-012). Separating them is the core
  analysis. A naive phone rule over-counts and Q9 is scored on invention as much as discovery.
- Q4 says "a small number." A corruption rule returning hundreds is the wrong rule. "Cannot exist"
  means internally contradictory — carpet area exceeding built-up area, floor above total floors,
  negative price — not merely unusual.

### 13:00–15:00 — Endpoint findings

H-015–019. Filters, sorting, completeness. Cheap and reliable. For each documented filter,
distinguish **rejected** (4xx) from **silently ignored** (200, same result set) — different
findings, and only the second is a `filters` lie.

Each finding needs up to 20 concrete evidence IDs. A findings entry with no evidence, or whose
evidence doesn't demonstrate it, counts as a claim you didn't reproduce.

### 15:00–18:00 — Frontend completion

Saved listings (per user, surviving reload and re-login). Rentals and projects with **corrected**
prices and areas — the unit conversions from Saturday. Insights screen carrying the actual
discoveries: duplicate rate, fake count, corrupt records, whatever `/v1/analytics/summary` was
supposed to give.

The insights screen is where the analysis becomes visible to a human reviewer. It is the screen
that distinguishes this app from every other candidate's.

### 18:00–20:00 — README, precision pass, deploy

README covers: how to run it; how you decided what to distrust; **what you checked that turned out
fine**; what you'd do with two more days. Disclose LLM use plainly.

The what-turned-out-fine section comes straight from `docs/hypotheses.md` if you've kept it as you
went. Do not reconstruct it Sunday night — it reads as reconstructed.

Precision pass on findings: delete every entry you cannot point to specific IDs for. A short
correct list beats a padded one; F1 punishes invention symmetrically.

Deploy. Open the deployed URL in a fresh private window and click every one of the six features.

### 20:00–21:00 — Submit

Verify `submission.json` parses and matches the exact required shape. Repo public. Demo URL loads
for a logged-out stranger. Submit the form.

---

## If you fall behind

Cut in this order. The scoring says what matters: answers 60, findings 40, then the app at 40% of
the final weighting, writeup 10%.

1. Frontend polish — styling, responsiveness, transitions. Zero points.
2. Extra frontend features beyond the required six. Explicitly worth less than the six being right.
3. Marginal findings you're unsure of. Deleting them *raises* your F1.
4. Depth on Q1, Q3, Q8 — the counting questions, explicitly worth less than the reasoning ones.

Never cut: the residual analysis on Q4/Q9, the insights screen, the what-turned-out-fine section.
Those are the three things nobody else will have.

---

## Standing rules

- Commit after every working increment. They read the history and a single deadline commit tells
  them nothing.
- Every hypothesis goes in `docs/hypotheses.md` **before** it is tested, with the result after.
  Refutations are required README content and cannot be reconstructed convincingly.
- Never report a discrepancy not personally reproduced with evidence IDs.
- The API key stays in `.env`, gitignored. It appears in `submission.json` because the format
  requires it — nowhere else.
- Don't re-hit the API. One dump, then work offline. Re-dump only if you have reason to think the
  data changed.
