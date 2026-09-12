# Observations — exploration pass

Saturday's calibration notes. Written **before** hunting for anything specific.

The purpose is to learn what normal looks like in this dataset, so abnormal is visible later.
Two kinds of wrongness need two different lenses:

- **Sparse wrongness** (corrupt records, fakes, duplicates) — a small minority. Found by comparing
  records against the population they sit in. The bulk of the data defines normal.
- **Uniform wrongness** (units) — the entire column is shifted and internally consistent, so
  nothing in the data disagrees with anything else. Found only by comparing the distribution
  against real-world knowledge of what these numbers should be.

Never sanity-check price by dividing by area. Price in lakhs ÷ area in sq metres can produce a
plausible-looking ₹/sqft. Check each field against its own expected band, independently.

---

## Shape

| Resource | Records | Fields |
| --- | --- | --- |
| listings | | |
| rentals | | |
| projects | | |

How they join:

## Field inventory

For each resource: column name, dtype, null rate, cardinality.

### listings

### rentals

### projects

---

## Distributions

### Price

Median, quartiles, min, max. Twenty rows from each tail.

Real-world band for this city: a 2BHK should be roughly ₹___ to ₹___.

Observed median: ___ → unit is likely ___

### Carpet area

Median by bedroom count. A 2BHK is about 1,000 sqft ≈ 95 sqm — which band do the numbers land in?

### Monthly rent

Indian metro yields put monthly rent near price ÷ 400. Does the observed ratio agree?

### Timestamps

Format. Offset present or absent. Range — earliest and latest. Anything after REFERENCE
(2026-09-10T00:00:00+05:30)?

---

## Categorical value counts

bedroom · furnishing · locality · is_live · status · anything else low-cardinality

Anything unexpected in the value sets — a locality that shouldn't be in this city, a status value
the documentation never mentions, a bedroom count of 0 or 15.

---

## First impressions

Plain sentences. Things that looked odd, without chasing them yet. Each one becomes a hypothesis
in `hypotheses.md` before it gets tested.
