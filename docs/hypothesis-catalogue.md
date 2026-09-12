# Hypothesis catalogue — pre-data priors

Drafted 12 Sep 2026, **before** any API access. These are derived from close reading of the
assignment statement, not from the data. They are candidates for testing, not findings.

**Raghav approves which ones get tested.** Nothing here goes into `findings` without being
personally reproduced with evidence IDs. Every one that is tested — confirmed or refuted — gets an
entry in `docs/hypotheses.md`.

Note: the assignment says a key determines which parts of the documentation are wrong *for you*.
Expect a meaningful fraction of these to be refuted. That is a good outcome — refutations are
required README content.

---

## Tells read out of the assignment text

These are the inferences the catalogue is built on. Worth re-reading if a hypothesis seems arbitrary.

1. **`price_max_inr`** (Q7 answer key). Naming the unit in the answer key implies the source field
   is not in that unit. Strong prior toward lakhs/crores.
2. **Phone numbers are a listed `evidence` identifier type**, alongside listing_id and project_id.
   No question mentions phones. Something in the findings set must hinge on them — most plausibly
   fraud via shared contact numbers.
3. **Q6 excludes the answers to Q4 and Q9.** Therefore corrupt and fake records both survive
   `is_live = true AND bedroom = 2`. Fakes are live, plausibly-shaped, and unflagged by any field.
4. **Q2 counts properties "genuine or not."** Fakes describe properties too — admits the structure
   where fakes are clones of real listings.
5. **The `/health` format example** notes the server clock "carries an explicit +05:30 offset."
   Reads as an invitation to contrast with timestamps that do not.
6. **The 13 finding categories are a checklist of what exists.** Assume each category has at least
   one real instance unless testing rules it out.
7. **"The first rule that fits will usually fit most of the data. Look hard at what it gets wrong."**
   Applies hardest to Q2, Q4, Q9. Budget explicit time to characterise each rule's residual.
8. **"A seller can write anything."** Free-text fields are adversarial input, not description.

---

## Priority order

1. **Units** (H-001–005) — poisons Q5, Q6, Q7 and every displayed price. Test before any answer.
2. **Pagination** (H-006–008) — poisons Q1, Q3, Q8. Test during the dump, not after.
3. **Classification** (H-009–014) — the highest-weighted answers.
4. **Endpoint behaviour** (H-015–019) — cheap, reliable findings.
5. **Timestamps** (H-020–021) — moves Q8.
6. **Seller-written and cross-endpoint** (H-022–026) — the non-obvious ones.

---

## Units

| ID | Hypothesis | Test | Refuted if |
| --- | --- | --- | --- |
| H-001 | Sale price is in lakhs or crores, not INR | Distribution vs plausible band for the city (2BHK ≈ ₹0.8–2.5cr) | Values already land in the INR band |
| H-002 | Carpet area is in sq metres, not sq ft | Distribution vs bedroom count; 2BHK ≈ 1000–1200 sqft ≈ 95–110 sqm | Values land in the sqft band |
| H-003 | "Monthly" rent is annual | Rental yield: monthly rent ≈ price ÷ 400 in Indian metros | Ratio consistent with monthly |
| H-004 | Units differ **per resource** (listings vs rentals vs projects) | Run H-001/002 independently per endpoint | All resources agree |
| H-005 | Price and area are both wrong such that price/sqft looks plausible | Validate each field against its own band, never via the ratio | Each field independently plausible |

## Pagination

| ID | Hypothesis | Test |
| --- | --- | --- |
| H-006 | Server silently caps `limit` below documented max | Compare requested vs echoed limit on every page |
| H-007 | A reported total disagrees with the paged count | Page to exhaustion, compare |
| H-008 | Offset ignored or off-by-one past some depth | Check for duplicate/skipped IDs across page boundaries |

## Classification

- **H-009 — Duplicates (Q2).** Same property under multiple `listing_id`s. Naive rule: exact match
  on (locality, carpet_area, bedroom, floor, price). Residual to examine: near-duplicates with
  jittered price or area, transposed fields, relists with a later timestamp.
- **H-010 — Corrupt (Q4).** "Cannot exist" is stricter than "unusual". Safest class is internal
  contradiction: carpet area > super/built-up area, floor > total_floors, possession date before
  posting date, zero or negative price/area, bathrooms > rooms, posted_at after REFERENCE.
  Q4 says "a small number" — a rule yielding hundreds is the wrong rule.
- **H-011 — Fakes share a phone (Q9).** Same contact number across many listings.
- **H-012 — Counter-hypothesis to H-011.** A legitimate brokerage also shares one phone across many
  listings. **Separating broker from bait-farm is the core analysis.** Discriminators: a broker's
  listings cluster geographically, price at market rate, and carry varied descriptions; a bait-farm's
  scatter across localities, underprice, and share templated text. A naive phone rule over-counts
  and costs precision on a question scored found-vs-invented.
- **H-013 — A second fake cohort with distinct phones.** Detectable via templated description text
  or a low-side price-per-sqft outlier. This is what H-011 misses; characterising it is the
  "look at what the rule gets wrong" step.
- **H-014 — Fakes are cloned from real listings.** Follows from tell #4. Test for near-duplicate
  pairs differing mainly in contact number and price. If true, H-009 and H-011 are one problem.
- **H-027 — Project self-reported listing count is wrong (Q10).** Join and compare. The judgement
  call to document: do non-live, fake, and duplicate listings count toward the true number?
  Q10's answer depends on it.

## Endpoint behaviour

| ID | Hypothesis | Category |
| --- | --- | --- |
| H-015 | `/v1/analytics/summary` absent at documented path, present elsewhere | `missing_endpoint` + `undocumented_endpoint` |
| H-016 | One or more of locality/bedrooms/price/furnishing accepted and ignored | `filters` |
| H-017 | `sort` accepted and ignored | `sorting` |
| H-018 | Documented auth header name wrong, or token lifetime differs | `auth` |
| H-019 | City-scoped key returns records from other cities | `completeness` (evidence required) |

For H-016, distinguish **rejected** (4xx) from **silently ignored** (200, unchanged result set).
Different findings.

## Timestamps

- **H-020** — Listing timestamps carry no offset and are actually UTC. Moves Q8's window boundary
  by 5h30m. Follows from tell #5.
- **H-021** — Mixed formats across endpoints (ISO vs DD/MM/YYYY, epoch seconds vs ms).

## Seller-written fields

- **H-022** — Free text contradicts structured fields: description says 3BHK while `bedroom` is 2;
  title names a different locality than the `locality` field.
- **H-023** — Description contains a phone number different from the contact field. Doubles as a
  fraud signal and would explain why phone numbers are an evidence identifier type.

## Cross-endpoint

- **H-024** — A listing's `project_id` points at a project whose locality or price band contradicts it.
- **H-025** — The same property appears in both rentals and listings.
- **H-026** — `is_live` true on records whose possession or expiry date has passed.

---

## Method note for the residual step

For each of H-009, H-010, H-011: after the rule is written, produce a separate log entry recording
how many records it classifies, how many exceptions remain, what the exceptions have in common, and
whether that yields a refined rule. The assignment states outright that the answer is in what the
first rule gets wrong. This step is the highest-value thinking in the assignment and is only visible
to a reviewer if it is written down as it happens.
