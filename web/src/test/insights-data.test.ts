import { describe, expect, it } from 'vitest';
import insights from '../generated/insights.json';
import { normaliseListing, normaliseProject, normaliseRental, type RawListing, type RawProject, type RawRental } from '../lib/normalise';
import { summarise } from '../lib/summary';
import { readRecords, readRepoJson } from './repoData';

// The insights screen shows only what src/generated/insights.json holds. These tests
// fail when that file is stale against submission.json or the dump, so a changed
// answer can't leave the screen showing the old number. Rebuild with
// `python analysis/export_insights.py && npm run prepare-data`.

type Answers = Record<string, number | string[] | { project_id: string; price_max_inr: number }>;
const answers = readRepoJson<{ answers: Answers }>('submission.json').answers;
const listings = readRecords<RawListing & { price: number; bedroom: number; carpet_area: number }>('data/v1_listings.json');
const discovery = (key: string) => {
  const found = insights.discoveries.find((d) => d.key === key);
  if (!found) throw new Error(`no discovery ${key}`);
  return found;
};

describe('insights.json agrees with submission.json', () => {
  it('carries every answer, with ID lists as counts', () => {
    for (const [key, value] of Object.entries(answers)) {
      const shown = (insights.answers as Record<string, unknown>)[key];
      expect(shown, key).toEqual(Array.isArray(value) ? { count: value.length } : value);
    }
  });

  it('counts discoveries that are answers the same way', () => {
    expect(discovery('impossible').count).toBe((answers.corrupt_listing_ids as string[]).length);
    expect(discovery('bait').count).toBe((answers.fake_listing_ids as string[]).length);
    expect(discovery('project-counts').count).toBe(answers.projects_with_wrong_listing_count);
    expect(discovery('not-live').count).toBe(listings.length - (answers.active_listings as number));
    expect(discovery('duplicates').count).toBe(listings.length - (answers.unique_properties as number));
  });
});

describe('insights.json agrees with the dump, through the app’s own converters', () => {
  it('counts square-metre areas, month deposits and project price units', () => {
    expect(discovery('sqm-areas').count).toBe(listings.map(normaliseListing).filter((l) => l.areaWasSqm).length);
    expect(discovery('deposits').count).toBe(
      readRecords<RawRental>('data/v1_rentals.json').map(normaliseRental).filter((r) => r.depositWasMonths).length,
    );
    const projects = readRecords<RawProject>('data/v1_projects.json').map(normaliseProject);
    expect(discovery('project-prices')).toMatchObject({
      facts: {
        max_crore: projects.filter((p) => p.priceMaxServedIn === 'crore').length,
        min_crore: projects.filter((p) => p.priceMinServedIn === 'crore').length,
        inverted_after_conversion: 0,
      },
    });
  });

  it('computes the as-served summary from every raw record', () => {
    expect(insights.promised.as_served).toEqual(
      summarise(listings.map((l) => ({ locality: l.locality, bedroom: l.bedroom, price: l.price, areaSqft: l.carpet_area }))),
    );
  });

  it('accounts for every record in the corrected summary', () => {
    const { corrected, excluded } = insights.promised;
    const total = corrected.total_listings + excluded.not_live + excluded.impossible + excluded.fake + excluded.repeat;
    expect(total).toBe(listings.length);
    expect(excluded.not_live).toBe(listings.length - (answers.active_listings as number));
    expect(corrected.by_locality.reduce((sum, row) => sum + row.count, 0)).toBe(corrected.total_listings);
    expect(corrected.by_bhk.reduce((sum, row) => sum + row.count, 0)).toBe(corrected.total_listings);
  });

  it('links every example to a detail route for its own record type', () => {
    const routes = JSON.stringify(insights.discoveries).match(/"route":"[^"]+"/g) ?? [];
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) expect(route).toMatch(/"route":"\/(listings\/(100|MAG|DWE|SQU|ZER)-\d+|rentals\/R\d+|projects\/P\d+)"/);
  });
});
