/// <reference types="node" />
// Builds src/generated/insights.json, the only data the insights screen reads.
//
//   npm run prepare-data        (after `python analysis/export_insights.py`)
//
// Inputs, all committed: the API dump (data/v1_*.json, data/_manifest.json),
// submission.json, and analysis/out/insights_evidence.json. No network. Units are
// converted with the app's own normalise module, so the screen and the browse pages
// cannot disagree. Every count is checked against submission.json or the finding
// text it illustrates; any mismatch stops the build.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  normaliseListing,
  normaliseProject,
  normaliseRental,
  type RawListing,
  type RawProject,
  type RawRental,
} from '../src/lib/normalise.ts';
import { summarise, type SummaryRow } from '../src/lib/summary.ts';

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('../src/generated/insights.json', import.meta.url);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, ROOT), 'utf8')) as T;
}
function records<T>(path: string): T[] {
  const data = readJson<T[] | { results: T[] }>(path);
  return Array.isArray(data) ? data : data.results;
}

type Finding = { endpoint: string; category: string; documented: string; actual: string; evidence: string[] };
type Submission = {
  answers: Record<string, number | string[] | { project_id: string; price_max_inr: number }>;
  findings: Finding[];
};
type Evidence = {
  impossible_classes: Record<string, string[]>;
  fake: { ids: string[]; phones: number; clones: { bait: string; genuine: string; bait_price: number; genuine_price: number }[] };
  duplicates: { records: number; distinct_properties: number; repeat_records: number; cross_site_groups: number; groups: string[][] };
  projects_wrong_count: { project_id: string; served: number; live: number }[];
  not_live_ids: string[];
  rental_title_mismatch: { count: number; of: number; examples: string[] };
};
type RawListingRow = RawListing & { price: number; bedroom: number; carpet_area: number; posted_by_contact: string };
type RawRentalRow = RawRental & { locality: string; title: string };

const listings = records<RawListingRow>('data/v1_listings.json');
const rentals = records<RawRentalRow>('data/v1_rentals.json');
const projects = records<RawProject>('data/v1_projects.json');
const manifest = readJson<{ dumped_at: string; city: string; total_requests: number }>('data/_manifest.json');
const submission = readJson<Submission>('submission.json');
const evidence = readJson<Evidence>('analysis/out/insights_evidence.json');
const answers = submission.answers;

const problems: string[] = [];
function expect(label: string, actual: unknown, wanted: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) problems.push(`${label}: built ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`);
}
function finding(endpoint: string, category: string, mentions: string[] = []): Finding {
  const matches = submission.findings.filter((f) => f.endpoint === endpoint && f.category === category);
  const found = matches.find((f) => mentions.every((m) => f.actual.includes(m)));
  if (!found) {
    problems.push(`no ${endpoint} ${category} finding mentions ${mentions.join(', ')}`);
    return { endpoint, category, documented: '', actual: '', evidence: [] };
  }
  return found;
}
const cite = (f: Finding) => ({ endpoint: f.endpoint, category: f.category });
const listingIds = (a: unknown) => (Array.isArray(a) ? (a as string[]) : []);

// --- The promised block, computed two ways ----------------------------------------

const impossible = new Set(Object.values(evidence.impossible_classes).flat());
const fake = new Set(evidence.fake.ids);
const groupOf = new Map<string, number>();
evidence.duplicates.groups.forEach((ids, index) => ids.forEach((id) => groupOf.set(id, index)));

// As served: every record, raw values, the way a client trusting the documentation would count.
const asServed = summarise(
  listings.map((l) => ({ locality: l.locality, bedroom: l.bedroom, price: l.price, areaSqft: l.carpet_area })),
);

// Corrected: live, not impossible, not bait, one record per property, areas in square feet.
const seenGroups = new Set<number>();
const excluded = { not_live: 0, impossible: 0, fake: 0, repeat: 0 };
const correctedRows: SummaryRow[] = [];
for (const raw of [...listings].sort((a, b) => a.listing_id.localeCompare(b.listing_id))) {
  if (!raw.is_live) { excluded.not_live++; continue; }
  if (impossible.has(raw.listing_id)) { excluded.impossible++; continue; }
  if (fake.has(raw.listing_id)) { excluded.fake++; continue; }
  const group = groupOf.get(raw.listing_id);
  if (group !== undefined) {
    if (seenGroups.has(group)) { excluded.repeat++; continue; }
    seenGroups.add(group);
  }
  const l = normaliseListing(raw);
  correctedRows.push({ locality: l.locality, bedroom: raw.bedroom, price: raw.price, areaSqft: l.carpetAreaSqft });
}
const corrected = summarise(correctedRows);
expect('corrected rows plus exclusions', correctedRows.length + Object.values(excluded).reduce((a, b) => a + b, 0), listings.length);
expect('as-served total is answer 1', asServed.total_listings, answers.total_listing_records);

// --- Discoveries ---------------------------------------------------------------------

const route = (id: string) => (id.startsWith('P') ? `/projects/${id}` : /^R\d/.test(id) ? `/rentals/${id}` : `/listings/${id}`);
const example = (id: string, detail?: string) => ({ id, route: route(id), ...(detail ? { detail } : {}) });
const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;

// Duplicates (Q2).
const dupFinding = finding('/v1/listings', 'duplicates', [String(evidence.duplicates.repeat_records), '661', String(evidence.duplicates.cross_site_groups)]);
expect('distinct properties', evidence.duplicates.distinct_properties, answers.unique_properties);
const websites = new Map(listings.map((l) => [l.listing_id, l.website]));
const crossSiteExamples = evidence.duplicates.groups
  .filter((ids) => new Set(ids.map((id) => websites.get(id))).size > 1)
  .slice(0, 3);

// Bait listings (Q9).
const fraudFinding = finding('/v1/listings', 'fraud', [String(evidence.fake.ids.length), `${evidence.fake.phones} phone numbers`, `${evidence.fake.clones.length} of them`]);
expect('fake listings', evidence.fake.ids, answers.fake_listing_ids);

// Impossible records (Q4).
const qualityFinding = finding('/v1/listings', 'data_quality', ['60 records', 'six classes of exactly ten']);
expect('impossible records', [...impossible].sort(), answers.corrupt_listing_ids);
const CLASS_LABELS: Record<string, string> = {
  'price <= 0': 'Price of zero or less',
  'price < 1 lakh': 'Price under ₹1 lakh for a 2 or 3 BHK',
  'super < carpet': 'Super built-up area smaller than carpet area',
  'floor > total_floors': 'Floor above the building’s top floor',
  'posted_at >= REF': 'Posted in the future',
  'lat/long swapped': 'Latitude and longitude swapped',
};
expect('impossible class names', Object.keys(evidence.impossible_classes).sort(), Object.keys(CLASS_LABELS).sort());

// Not live (Q3).
const liveFinding = finding('/v1/listings', 'completeness', [`${evidence.not_live_ids.length} of ${listings.length}`]);
expect('live listings', listings.length - evidence.not_live_ids.length, answers.active_listings);

// Square-metre areas.
const sqm = listings.map(normaliseListing).filter((l) => l.areaWasSqm);
const areaFinding = finding('/v1/listings', 'units', [`${sqm.length} records`]);
const rawById = new Map(listings.map((l) => [l.listing_id, l]));

// Project prices.
const normalisedProjects = projects.map(normaliseProject);
const count = <T,>(items: T[], test: (item: T) => boolean) => items.filter(test).length;
const priceUnits = {
  max_crore: count(normalisedProjects, (p) => p.priceMaxServedIn === 'crore'),
  max_lakh: count(normalisedProjects, (p) => p.priceMaxServedIn === 'lakh'),
  min_crore: count(normalisedProjects, (p) => p.priceMinServedIn === 'crore'),
  min_lakh: count(normalisedProjects, (p) => p.priceMinServedIn === 'lakh'),
  inverted_as_served: count(projects, (p) => p.price_max < p.price_min),
  inverted_after_conversion: count(normalisedProjects, (p) => p.priceMaxInr < p.priceMinInr),
};
const projectFinding = finding('/v1/projects', 'units', [
  `${priceUnits.max_crore} projects in crores`, `${priceUnits.max_lakh} in lakhs`,
  `${priceUnits.min_crore} projects in crores`, `${priceUnits.min_lakh} in lakhs`, `${priceUnits.inverted_as_served} of 470`,
]);
expect('inverted after conversion', priceUnits.inverted_after_conversion, 0);
const costliest = normalisedProjects.reduce((a, b) => (b.priceMaxInr > a.priceMaxInr ? b : a));
expect('costliest project', { project_id: costliest.project_id, price_max_inr: costliest.priceMaxInr }, answers.costliest_project);
const invertedExample = projects.find((p) => p.price_max < p.price_min)!;
const costliestRaw = projects.find((p) => p.project_id === costliest.project_id)!;

// Project listing counts (Q10).
const countFinding = finding('/v1/projects', 'consistency', [`wrong for ${evidence.projects_wrong_count.length} projects`]);
expect('projects with a wrong count', evidence.projects_wrong_count.length, answers.projects_with_wrong_listing_count);

// Totals that under-report.
const reported = (n: number) => Math.round(n * 0.96);
const totals = [
  { collection: 'listings', paged: listings.length, reported: reported(listings.length) },
  { collection: 'rentals', paged: rentals.length, reported: reported(rentals.length) },
  { collection: 'projects', paged: projects.length, reported: reported(projects.length) },
];
const totalFinding = finding('/v1/listings', 'pagination', totals.map((t) => `${t.reported} vs ${t.paged}`));

// Rental deposits in months.
const monthDeposits = rentals.map(normaliseRental).filter((r) => r.depositWasMonths);
const depositFinding = finding('/v1/rentals', 'units', [`${monthDeposits.length} records`]);

// Seller text aimed at AI tools.
const injectionFinding = finding('*', 'data_quality', ['twelve records']);
expect('injected records', injectionFinding.evidence.length, 12);

// Missing endpoints.
const missing = submission.findings.filter((f) => f.category === 'missing_endpoint');

const discoveries = [
  {
    key: 'duplicates',
    count: evidence.duplicates.repeat_records,
    facts: { records: listings.length, distinct_properties: evidence.duplicates.distinct_properties, groups: evidence.duplicates.groups.length, cross_site_groups: evidence.duplicates.cross_site_groups },
    groups: crossSiteExamples.map((ids) => ids.map((id) => example(id, `${websites.get(id)}, ${inr(rawById.get(id)!.price)}`))),
    finding: cite(dupFinding),
  },
  {
    key: 'bait',
    count: evidence.fake.ids.length,
    facts: { phones: evidence.fake.phones, clones: evidence.fake.clones.length },
    pairs: evidence.fake.clones.slice(0, 3).map((c) => ({ bait: example(c.bait, inr(c.bait_price)), genuine: example(c.genuine, inr(c.genuine_price)) })),
    finding: cite(fraudFinding),
  },
  {
    key: 'impossible',
    count: impossible.size,
    classes: Object.entries(evidence.impossible_classes).map(([name, ids]) => ({ label: CLASS_LABELS[name]!, count: ids.length, example: example(ids[0]!) })),
    finding: cite(qualityFinding),
  },
  {
    key: 'not-live',
    count: evidence.not_live_ids.length,
    facts: { records: listings.length },
    examples: evidence.not_live_ids.slice(0, 3).map((id) => example(id)),
    finding: cite(liveFinding),
  },
  {
    key: 'sqm-areas',
    count: sqm.length,
    examples: sqm.slice(0, 3).map((l) => example(l.listing_id, `carpet area served as ${rawById.get(l.listing_id)!.carpet_area}, which is ${new Intl.NumberFormat('en-IN').format(l.carpetAreaSqft)} sq ft`)),
    finding: cite(areaFinding),
  },
  {
    key: 'project-prices',
    count: projects.length,
    facts: priceUnits,
    examples: [
      example(costliest.project_id, `price_min ${costliestRaw.price_min}, price_max ${costliestRaw.price_max}: the costliest project`),
      example(invertedExample.project_id, `price_min ${invertedExample.price_min}, price_max ${invertedExample.price_max}`),
    ],
    finding: cite(projectFinding),
  },
  {
    key: 'project-counts',
    count: evidence.projects_wrong_count.length,
    facts: { projects: projects.length },
    examples: evidence.projects_wrong_count.slice(0, 3).map((p) => example(p.project_id, `says ${p.served}, has ${p.live} live`)),
    finding: cite(countFinding),
  },
  {
    key: 'totals',
    count: totals.reduce((sum, t) => sum + t.paged - t.reported, 0),
    totals,
    finding: cite(totalFinding),
  },
  {
    key: 'deposits',
    count: monthDeposits.length,
    facts: { rentals: rentals.length },
    examples: monthDeposits.slice(0, 3).map((r) => example(r.listing_id, `deposit served as ${r.depositMonths}, which is ${inr(r.depositInr)}`)),
    finding: cite(depositFinding),
  },
  {
    key: 'rental-titles',
    count: evidence.rental_title_mismatch.count,
    facts: { rentals: evidence.rental_title_mismatch.of },
    examples: evidence.rental_title_mismatch.examples.slice(0, 3).map((id) => {
      const r = rentals.find((x) => x.listing_id === id)!;
      return example(id, `title “${r.title}”, locality ${r.locality}`);
    }),
    finding: null,
  },
  {
    key: 'injected-text',
    count: injectionFinding.evidence.length,
    examples: injectionFinding.evidence.map((id) => example(id)),
    finding: cite(injectionFinding),
  },
  {
    key: 'missing-endpoints',
    count: missing.length,
    endpoints: missing.map((f) => f.endpoint),
    finding: null,
  },
];

if (problems.length) {
  console.error('prepare-data: the build does not match the analysis output');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const summaryOf = (key: string) => (Array.isArray(answers[key]) ? { count: listingIds(answers[key]).length } : answers[key]);
const insights = {
  source: {
    city: manifest.city,
    dumped_at: manifest.dumped_at,
    records: { listings: listings.length, rentals: rentals.length, projects: projects.length },
  },
  promised: { as_served: asServed, corrected, excluded },
  answers: Object.fromEntries(Object.keys(answers).map((key) => [key, summaryOf(key)])),
  discoveries,
};

mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(insights, null, 1)}\n`);
console.log(`prepare-data: ${discoveries.length} discoveries, all counts match submission.json`);
console.log(`  as served: ${asServed.total_listings} records, median ${asServed.median_price}, ${asServed.median_price_per_sqft}/sq ft`);
console.log(`  corrected: ${corrected.total_listings} homes, median ${corrected.median_price}, ${corrected.median_price_per_sqft}/sq ft; excluded ${JSON.stringify(excluded)}`);
