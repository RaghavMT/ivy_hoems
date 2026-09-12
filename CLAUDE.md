# Project context — Homes SWE Internship assignment

## What this repo is

Submission for a 6-month SWE internship assignment. Deadline: **23:59 IST, Monday 14 September 2026**.
Full assignment text is in `docs/statement.md` — read it before making decisions about scope.

Short version: we're given a property API plus `API_REFERENCE.md` documentation that was
AI-generated from an old changelog and never reviewed. **The API is correct and truthful; the
documentation is partly wrong.** Three deliverables:

1. A deployed web app with six working features (this repo's main job)
2. Ten numeric answers about the data, in `submission.json`
3. A list of every place the documentation disagrees with the API, as `findings` in `submission.json`

Scoring: 60% the ten answers, 40% the findings list (F1), then human review of the app, the code
and the commit history for top scorers.

## Division of work

- **Data analysis, the ten answers, and the findings list** are being done in a separate Claude
  Cowork session (Python over a full local dump of the API). Results land in `submission.json`
  and `data/` in this repo.
- **This repo / Claude Code's job is the frontend.** Don't redo the analysis here; read the
  numbers from `submission.json` and `data/` when the insights screen needs them.

## Part 1 — the six things that must work

1. **Login** — real credentials against the real auth flow. Session survives a page refresh and
   still works 30 minutes after login (so: token refresh or a long-lived token, persisted).
2. **Browse listings** — paginated or infinite scroll. Filters for locality, bedrooms, price range
   and furnishing must *actually filter*, **whether or not the server helps you**. Some documented
   filter params are silently ignored by the API, so assume client-side filtering is needed as a
   fallback and verify each filter param before trusting it.
3. **Listing detail** — one page per listing, reachable directly by URL (real routing, not a modal).
4. **Saved listings** — add, remove, list. Per user. Must survive a reload *and* a re-login.
5. **Rentals and projects** — browsable, with **correct prices and correct areas**. Some fields are
   not in the units the documentation claims, so display values must be normalised, not passed
   through raw.
6. **Insights screen** — whatever the documentation promised from `/v1/analytics/summary`, plus the
   discoveries from the analysis (duplicates, fake listings, impossible records, unit problems).
   Note: that endpoint may not exist at the documented path — if so, compute the numbers from the
   data instead. This screen is where the data discoveries become visible to a human.

A small app where every number is correct beats a large one where they aren't. Correctness of the
six over any extra feature.

Web app only — not a mobile app. Deploy to Vercel / Netlify / Cloudflare Pages / GitHub Pages.

## Hard rules from the assignment

- **Commit incrementally.** "A repository with one commit at the deadline tells us nothing about how
  you work, and we do read the history." Commit at each working increment, with real messages.
- **LLM use must be disclosed** in the README. Lying about it costs the internship; disclosing costs
  nothing.
- **Do not attack the API.** Rate limit is 1200 req/min per key — far more than needed. No scanning,
  no brute force. Every request is logged against the key. Keep a small delay between calls.
- **The API key must not be committed as a secret in client code** beyond what the assignment
  requires — it goes in `submission.json` at the root (required), but keep it out of source files
  via env vars and document the env setup in the README.
- Never report a documentation discrepancy that hasn't been personally reproduced. Precision counts
  as much as recall; a padded findings list scores worse than a short correct one.

## README must cover

- How to run it
- How we worked out which parts of the documentation to distrust, and what we did about it
- **What we checked that turned out to be fine** — the hypotheses that didn't pan out. Explicitly
  called out as the part that matters most and that nobody can generate for you. Keep a running
  log of these as we go, don't reconstruct it at the end.
- What we'd do with another two days

## Working notes / decisions

_Append decisions here as they're made so future sessions don't relitigate them._

- Stack: _TBD_
- Deploy target: _TBD_
- Auth/session approach: _TBD_
- Which filter params the API actually honours: _TBD — see analysis output_
- Which fields need unit conversion for display: _TBD — see analysis output_
