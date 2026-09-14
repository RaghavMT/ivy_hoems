import { describe, expect, it } from 'vitest';
import {
  normaliseListing,
  normaliseProject,
  normaliseRental,
  projectPriceToInr,
  type RawListing,
  type RawProject,
  type RawRental,
} from '../lib/normalise';
import { readRecords, readRepoJson } from './repoData';

// Raw records copied from data/v1_*.json, trimmed to the fields that matter here.
function listing(fields: Partial<RawListing>): RawListing {
  return { listing_id: 'X', website: 'dwelling', posted_at: '2026-03-01T00:00:00Z', carpet_area: 1000, super_built_up_area: 1350, ...fields } as RawListing;
}

describe('normaliseListing: magichomes square-metre areas (units finding, H-002)', () => {
  it('converts both areas for a magichomes listing posted after the cutover', () => {
    const result = normaliseListing(
      listing({ listing_id: 'MAG-2000002', website: 'magichomes', posted_at: '2026-07-08T18:37:00Z', carpet_area: 68, super_built_up_area: 88 }),
    );
    expect(result.carpetAreaSqft).toBe(732);
    expect(result.superBuiltUpAreaSqft).toBe(947);
    expect(result.areaWasSqm).toBe(true);
  });

  it('leaves the last square-foot magichomes listing alone (14:17 IST on 31 May)', () => {
    const result = normaliseListing(
      listing({ listing_id: 'MAG-2000150', website: 'magichomes', posted_at: '2026-05-31T08:47:00Z', carpet_area: 1501, super_built_up_area: 2128 }),
    );
    expect(result.carpetAreaSqft).toBe(1501);
    expect(result.superBuiltUpAreaSqft).toBe(2128);
    expect(result.areaWasSqm).toBe(false);
  });

  it('converts the first square-metre listing (02:21 IST on 1 June)', () => {
    const result = normaliseListing(
      listing({ listing_id: 'MAG-2003439', website: 'magichomes', posted_at: '2026-05-31T20:51:00Z', carpet_area: 114, super_built_up_area: 159 }),
    );
    expect(result.carpetAreaSqft).toBe(1227);
    expect(result.areaWasSqm).toBe(true);
  });

  it('treats midnight IST exactly as square metres', () => {
    expect(normaliseListing(listing({ website: 'magichomes', posted_at: '2026-05-31T18:30:00Z' })).areaWasSqm).toBe(true);
    expect(normaliseListing(listing({ website: 'magichomes', posted_at: '2026-05-31T18:29:59Z' })).areaWasSqm).toBe(false);
  });

  it('does not convert a small flat from another website', () => {
    const result = normaliseListing(
      listing({ listing_id: 'ZER-2003132', website: 'zerobroker', posted_at: '2026-02-15T12:20:00Z', carpet_area: 283, super_built_up_area: 404 }),
    );
    expect(result.carpetAreaSqft).toBe(283);
    expect(result.areaWasSqm).toBe(false);
  });

  it('converts plots too', () => {
    const result = normaliseListing(
      listing({ listing_id: 'MAG-2000528', website: 'magichomes', posted_at: '2026-07-15T11:24:00Z', carpet_area: 212, super_built_up_area: 212 }),
    );
    expect(result.carpetAreaSqft).toBe(2282);
  });

  it('does not expose the raw area fields, so no screen can show them by mistake', () => {
    const result = normaliseListing(listing({}));
    expect(result).not.toHaveProperty('carpet_area');
    expect(result).not.toHaveProperty('super_built_up_area');
  });

  it('converts exactly the 358 listings the analysis identified, across the whole dump', () => {
    const converted = readRecords<RawListing>('data/v1_listings.json')
      .map(normaliseListing)
      .filter((l) => l.areaWasSqm)
      .map((l) => l.listing_id)
      .sort();
    const evidence = readRepoJson<{ sqm_listing_ids: string[] }>('analysis/out/evidence.json');
    expect(converted).toEqual([...evidence.sqm_listing_ids].sort());
  });
});

describe('projectPriceToInr: lakhs and crores (units finding, H-035)', () => {
  it('reads values below 10 as crores', () => {
    expect(projectPriceToInr(4.15)).toBe(41_500_000);
    expect(projectPriceToInr(1.39)).toBe(13_900_000);
  });

  it('reads values of 10 and above as lakhs', () => {
    expect(projectPriceToInr(87.2)).toBe(8_720_000);
    expect(projectPriceToInr(37.9)).toBe(3_790_000);
  });
});

describe('normaliseProject', () => {
  it('converts P20384, the costliest project', () => {
    const result = normaliseProject({ project_id: 'P20384', price_min: 1.39, price_max: 4.15 } as RawProject);
    expect(result.priceMinInr).toBe(13_900_000);
    expect(result.priceMaxInr).toBe(41_500_000);
  });

  it('reads a low price_min as crores, not lakhs (P20004)', () => {
    const result = normaliseProject({ project_id: 'P20004', price_min: 1.21, price_max: 2.58 } as RawProject);
    expect(result.priceMinInr).toBe(12_100_000);
    expect(result.priceMaxInr).toBe(25_800_000);
  });

  it('reads both prices as lakhs when both are high (P20007)', () => {
    const result = normaliseProject({ project_id: 'P20007', price_min: 37.9, price_max: 87.2 } as RawProject);
    expect(result.priceMinInr).toBe(3_790_000);
    expect(result.priceMaxInr).toBe(8_720_000);
  });

  it('records which unit each price was served in, so a page can say so', () => {
    expect(normaliseProject({ price_min: 1.21, price_max: 2.58 } as RawProject)).toMatchObject({
      priceMinServedIn: 'crore',
      priceMaxServedIn: 'crore',
    });
    expect(normaliseProject({ price_min: 37.9, price_max: 1.04 } as RawProject)).toMatchObject({
      priceMinServedIn: 'lakh',
      priceMaxServedIn: 'crore',
    });
  });

  it('does not expose the raw price fields', () => {
    const result = normaliseProject({ project_id: 'P1', price_min: 50, price_max: 2 } as RawProject);
    expect(result).not.toHaveProperty('price_min');
    expect(result).not.toHaveProperty('price_max');
  });

  const projects = readRecords<RawProject>('data/v1_projects.json').map(normaliseProject);

  it('never shows a minimum above the maximum, across all 470 projects', () => {
    expect(projects).toHaveLength(470);
    expect(projects.filter((p) => p.priceMinInr > p.priceMaxInr)).toEqual([]);
  });

  it('splits units as the units finding counts them: price_min 90 crores, price_max 438 crores', () => {
    expect(projects.filter((p) => p.priceMinServedIn === 'crore')).toHaveLength(90);
    expect(projects.filter((p) => p.priceMaxServedIn === 'crore')).toHaveLength(438);
  });

  it('agrees with the submitted answer for the costliest project', () => {
    const costliest = projects.reduce((a, b) => (b.priceMaxInr > a.priceMaxInr ? b : a));
    const answer = readRepoJson<{ answers: { costliest_project: { project_id: string; price_max_inr: number } } }>(
      'submission.json',
    ).answers.costliest_project;
    expect({ project_id: costliest.project_id, price_max_inr: costliest.priceMaxInr }).toEqual(answer);
  });
});

describe('normaliseRental: zerobroker deposits in months (H-036)', () => {
  it('converts a zerobroker deposit from months to rupees', () => {
    const result = normaliseRental({
      listing_id: 'R2000514',
      website: 'zerobroker',
      price: 7_800,
      deposit: 6,
      maintenance: 2_500,
      carpet_area: 350,
      super_builtup_area: 501,
    } as RawRental);
    expect(result.depositInr).toBe(46_800);
    expect(result.depositMonths).toBe(6);
    expect(result.depositWasMonths).toBe(true);
  });

  it('leaves rupee deposits from other websites alone', () => {
    const result = normaliseRental({
      listing_id: 'R2000001',
      website: 'dwelling',
      price: 45_500,
      deposit: 136_500,
      maintenance: 2_500,
      carpet_area: 1115,
      super_builtup_area: 1610,
    } as RawRental);
    expect(result.depositInr).toBe(136_500);
    expect(result.depositMonths).toBe(3);
    expect(result.depositWasMonths).toBe(false);
  });

  const rentals = readRecords<RawRental>('data/v1_rentals.json');

  it('converts exactly the rentals served with a month count, across the whole dump', () => {
    const converted = rentals.map(normaliseRental).filter((r) => r.depositWasMonths).map((r) => r.listing_id).sort();
    const smallDeposits = rentals.filter((r) => r.deposit < 1000).map((r) => r.listing_id).sort();
    expect(converted).toHaveLength(344);
    expect(converted).toEqual(smallDeposits);
  });

  it('puts every deposit at a whole number of months between 2 and 10', () => {
    const odd = rentals
      .map(normaliseRental)
      .filter((r) => !Number.isInteger(r.depositMonths) || r.depositMonths < 2 || r.depositMonths > 10);
    expect(odd.map((r) => r.listing_id)).toEqual([]);
  });
});

describe('normaliseRental', () => {
  it('passes monthly rupees and square feet through, under consistent names', () => {
    const result = normaliseRental({
      listing_id: 'R2000001',
      price: 45_500,
      deposit: 136_500,
      maintenance: 2_500,
      carpet_area: 1115,
      super_builtup_area: 1610,
    } as RawRental);
    expect(result.rentInrPerMonth).toBe(45_500);
    expect(result.depositInr).toBe(136_500);
    expect(result.maintenanceInrPerMonth).toBe(2_500);
    expect(result.carpetAreaSqft).toBe(1115);
    expect(result.superBuiltUpAreaSqft).toBe(1610);
    expect(result).not.toHaveProperty('price');
  });
});
