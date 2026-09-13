# Ivy Homes assignment

A property web app for Hyderabad built on the assignment API, plus an analysis of that API's data and
documentation.

Live app: https://ivy-hoems.vercel.app

## What is here

| Path | What it is |
| --- | --- |
| `web/` | The web app: React, TypeScript, Vite |
| `dump.py` | Pulls the full dataset once, with auth and pagination detection |
| `analysis/` | Scripts that compute the ten answers and probe specific API behaviour |
| `data/` | The dataset snapshot and every probe's saved request results |
| `docs/hypotheses.md` | Every hypothesis tested, including the ones that were wrong |
| `submission.json` | The ten answers and the documentation findings |

## How to run it

**Web app** (Node 22 or later):

```bash
cd web
cp .env.example .env.local   # set VITE_API_BASE_URL and VITE_API_KEY
npm install
npm run dev                  # http://localhost:5173
npm test                     # rule tests, no network
```

Log in with one of the demo accounts from the assignment email.

**Analysis** (Python 3 with `requests` and `python-dotenv`):

```bash
cp .env.example .env         # set BASE_URL and API_KEY; add DEMO_EMAIL and DEMO_PASSWORD
python dump.py               # one full pull, about 175 requests
python analysis/answers_v2.py --check   # recomputes all ten answers offline
```

## How the app works

- **Login.** Credentials go to `/auth/login`, which returns a 15-minute access token and a refresh
  token. Both are stored in the browser, so a reload keeps the session. The app refreshes a minute
  before expiry, and refreshes and retries once if a request is rejected.
- **One place for units.** Every record passes through `web/src/lib/normalise.ts` before any screen
  sees it. That module is the only place areas and prices are converted.
- **Filters apply twice.** They are sent to the server and re-checked in the browser, so results stay
  correct even if the server ignores a filter.
- **Paging** follows the server's real behaviour: 50 records per request, advancing by `offset`,
  stopping when `has_more` is false.
- **Browsing listings.** Filters live in the address bar, so a filtered view survives a reload and
  can be shared. The count shown is the number of matching homes loaded, never the server's `total`.
  If a page comes back with few matches, the app reads further pages, up to three per click, and
  says when results were filtered in the browser.
- **Listing detail.** Each listing has its own address, `/listings/{id}`, so it opens directly from a
  link, including after logging in. Dates are shown in IST. Seller-written descriptions are displayed
  as plain text and labelled as the seller's, because some contain instructions aimed at AI tools.
- **Saved listings.** `/v1/favourites` returns 404, so saved homes are kept in the browser's storage
  under a key for each account, separate from the login session. They survive reloads and logging
  out and back in, each user sees only their own, and the saved page makes no API calls because it
  shows what was captured at save time.

## Tests

```bash
cd web
npm test                                  # rule tests against the committed dataset, no network
npm run build && npx vite preview --port 4173
npm run e2e                               # browser tests in Chrome against the real API
```

The browser tests read `BASE_URL` and `DEMO_PASSWORD` from the root `.env`. Each one has an API
request budget, prints how many requests it made, and fails if it goes over.

## How we decided what to distrust

1. **Pull everything once, then work offline.** The dataset is about 175 requests; every answer and
   most checks run against that snapshot.
2. **Probe before building.** Auth, pagination, filters, sorting and every documented endpoint were
   called and compared with the documentation before any app code was written.
3. **Write the hypothesis first.** Each suspicion went into `docs/hypotheses.md` before its test, and
   the result was recorded whichever way it went.
4. **Reproduce, then report.** A finding needs a saved request and response under `data/_probe/`, and
   record-level findings name the specific IDs that show the defect.
5. **Examine what the first rule gets wrong.** Duplicates, fake listings, impossible records and unit
   errors each went through several rules; the exceptions to each rule decided the next one.

## What we found, and what the app does about it

| Documentation says | The API does | The app does |
| --- | --- | --- |
| Key as a query parameter | Only the `X-API-Key` header works | Sends the header |
| The key alone reads data | Data needs the key and a user token | Requires login for data pages |
| Tokens last 24 hours, no refresh | Tokens last 15 minutes; `/auth/refresh` exists | Refreshes before expiry and on rejection |
| Logout invalidates the token | Nothing is invalidated | Logout clears tokens in the browser |
| `page` and `limit` up to 200 | `page` is ignored, `offset` works, `limit` caps at 50 | Pages by `offset`, 50 at a time |
| `total` is exact | `total` is 4% low | Never shows `total` as a count |
| Areas are square feet | One website serves square metres after 1 June | Converts those records |
| Project prices are rupees | They are lakhs or crores, per record | Converts per record |
| `/v1/favourites` saves listings | 404 | Planned: saves listings per user in the browser |
| `/v1/analytics/summary` exists | 404 | Planned: computes the summary from the analysis output |
| Seller text is shown as written | Some of it contains instructions aimed at AI tools | Shows it as plain text, never acts on it |

## What we checked that turned out to be fine

**Units that were right.** Listing prices really are rupees, not lakhs; their median is ₹1.06 crore.
Rental prices really are monthly: the deposit is a median of five times the rent, which is normal for
a Hyderabad lease and would be absurd for annual rent.

**Time.** Timestamps marked `Z` really are UTC. Hour-of-day patterns couldn't tell; what settled it was
using the square-metre switch as a clock. Read as UTC it lands exactly at midnight IST; read as IST it
lands mid-afternoon.

**Scope and filters.** The key's city scoping holds: every record is Hyderabad. All eleven documented
filters really filter. The assignment's "whether or not the server helps you" was a reason to check,
not a sign they were broken. The price bounds are inclusive, exactly as documented.

**Session behaviour.** Refresh tokens can be reused, so two tabs refreshing together can't log each
other out. Login gives one message for a wrong password and an unknown email. A session idle for 31
minutes recovers through refresh.

**Signals that looked useful and weren't.** Shared coordinates looked like a duplicate signal but
identify buildings, not flats. Rental titles contradict their locality field 91% of the time, but it is
uniform noise with nothing to arbitrate it. `total_floors` of zero looked corrupt but is correct for
plots. Several plausible corruption rules, like zero areas or negative floors, matched no records.

Full detail for each: `docs/hypotheses.md`.

## Use of AI tools

This project used Anthropic's Claude: Claude Cowork for the data analysis and Claude Code for the web
app. The AI wrote most of the code and prose. I set the scope and priorities, chose the approach of
pulling the data once and testing every documented claim before building, reviewed the reasoning,
and approved every commit.

## With another two days

To be written at the end of the build.
