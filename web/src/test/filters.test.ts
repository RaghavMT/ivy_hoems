import { describe, expect, it } from 'vitest';
import {
  listingParams,
  matchesListing,
  matchesProject,
  matchesRental,
  projectParams,
  rentalParams,
  type ListingFilter,
  type ProjectFilter,
  type RentalFilter,
} from '../lib/filters';
import type { RawListing, RawProject, RawRental } from '../lib/normalise';
import { readRecords, readRepoJson } from './repoData';

const flat = {
  locality: 'madhapur',
  bedroom: 2,
  price: 5_000_000,
  furnishing: 'semi-furnished',
};

describe('matchesListing', () => {
  it('matches everything when no filter is set', () => {
    expect(matchesListing({}, flat)).toBe(true);
  });

  it('filters by locality', () => {
    expect(matchesListing({ locality: 'madhapur' }, flat)).toBe(true);
    expect(matchesListing({ locality: 'kondapur' }, flat)).toBe(false);
  });

  it('filters by bedrooms, including studios with zero', () => {
    expect(matchesListing({ bedrooms: 2 }, flat)).toBe(true);
    expect(matchesListing({ bedrooms: 3 }, flat)).toBe(false);
    expect(matchesListing({ bedrooms: 0 }, flat)).toBe(false);
    expect(matchesListing({ bedrooms: 0 }, { ...flat, bedroom: 0 })).toBe(true);
  });

  it('treats both price bounds as inclusive, as the server does (H-034)', () => {
    expect(matchesListing({ minPrice: 5_000_000 }, flat)).toBe(true);
    expect(matchesListing({ maxPrice: 5_000_000 }, flat)).toBe(true);
    expect(matchesListing({ minPrice: 5_000_001 }, flat)).toBe(false);
    expect(matchesListing({ maxPrice: 4_999_999 }, flat)).toBe(false);
  });

  it('filters by furnishing', () => {
    expect(matchesListing({ furnishing: 'semi-furnished' }, flat)).toBe(true);
    expect(matchesListing({ furnishing: 'unfurnished' }, flat)).toBe(false);
  });

  it('requires every set filter to match', () => {
    const filter: ListingFilter = { locality: 'madhapur', bedrooms: 2, maxPrice: 6_000_000, furnishing: 'semi-furnished' };
    expect(matchesListing(filter, flat)).toBe(true);
    expect(matchesListing({ ...filter, furnishing: 'unfurnished' }, flat)).toBe(false);
  });
});

describe('query params sent to the server', () => {
  it('uses the documented names and leaves out unset filters', () => {
    expect(listingParams({ locality: 'madhapur', bedrooms: 0, maxPrice: 9_000_000 })).toEqual({
      locality: 'madhapur',
      bhk: 0,
      min_price: undefined,
      max_price: 9_000_000,
      furnishing: undefined,
    });
    expect(rentalParams({ bedrooms: 3, furnishing: 'fully-furnished' })).toEqual({
      locality: undefined,
      bhk: 3,
      furnishing: 'fully-furnished',
    });
    expect(projectParams({ status: 'ready to move' })).toEqual({
      locality: undefined,
      project_status: 'ready to move',
    });
  });
});

describe('the browser filter agrees with the server filter', () => {
  // The server reports total = round(0.96 x true count) (pagination finding, H-034),
  // so the predicate's count over the full dump must reproduce every probed total.
  const reported = (count: number) => Math.round(count * 0.96);

  type Probe = { endpoint: string; value: Record<string, string | number>; verdict: string; reported_total: number };
  const probes = readRepoJson<{ filters: Probe[] }>('data/_probe/filters.json').filters.filter(
    (p) => p.verdict === 'HONOURED' && !('property_type' in p.value),
  );

  const listings = readRecords<RawListing>('data/v1_listings.json');
  const rentals = readRecords<RawRental>('data/v1_rentals.json');
  const projects = readRecords<RawProject>('data/v1_projects.json');

  function listingFilterFrom(v: Probe['value']): ListingFilter {
    return {
      locality: v.locality as string | undefined,
      bedrooms: v.bhk as number | undefined,
      minPrice: v.min_price as number | undefined,
      maxPrice: v.max_price as number | undefined,
      furnishing: v.furnishing as string | undefined,
    };
  }

  it.each(probes.map((p) => [p.endpoint, JSON.stringify(p.value), p] as const))(
    '%s %s',
    (endpoint, _label, probe) => {
      let count: number;
      if (endpoint === '/v1/listings') {
        count = listings.filter((l) => matchesListing(listingFilterFrom(probe.value), l)).length;
      } else if (endpoint === '/v1/rentals') {
        const filter: RentalFilter = {
          locality: probe.value.locality as string | undefined,
          bedrooms: probe.value.bhk as number | undefined,
          furnishing: probe.value.furnishing as string | undefined,
        };
        count = rentals.filter((r) => matchesRental(filter, r)).length;
      } else {
        const filter: ProjectFilter = {
          locality: probe.value.locality as string | undefined,
          status: probe.value.project_status as string | undefined,
        };
        count = projects.filter((p) => matchesProject(filter, p)).length;
      }
      expect(reported(count)).toBe(probe.reported_total);
    },
  );

  it('matches the min_price bound probe, where listings sit exactly on the bound', () => {
    const probe = readRepoJson<{ request: { params: { min_price: number } }; reported_total: number }>(
      'data/_probe/price_bounds.json',
    );
    const count = listings.filter((l) => matchesListing({ minPrice: probe.request.params.min_price }, l)).length;
    expect(reported(count)).toBe(probe.reported_total);
  });
});
