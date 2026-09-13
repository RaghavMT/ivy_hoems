import { describe, expect, it } from 'vitest';
import {
  FURNISHINGS,
  LOCALITIES,
  PROJECT_STATUSES,
  listingFilterToQuery,
  parseListingFilter,
  parseProjectFilter,
  parseRentalFilter,
} from '../lib/filterQuery';
import type { RawListing, RawProject, RawRental } from '../lib/normalise';
import { readRecords } from './repoData';

describe('parseListingFilter', () => {
  it('reads every filter from the address bar', () => {
    const params = new URLSearchParams(
      'locality=madhapur&bedrooms=0&min_price=5000000&max_price=10000000&furnishing=unfurnished',
    );
    expect(parseListingFilter(params)).toEqual({
      locality: 'madhapur',
      bedrooms: 0,
      minPrice: 5_000_000,
      maxPrice: 10_000_000,
      furnishing: 'unfurnished',
    });
  });

  it('treats missing params as unset', () => {
    expect(parseListingFilter(new URLSearchParams())).toEqual({});
  });

  it('ignores values that are not real options, so a mangled link still loads', () => {
    const params = new URLSearchParams(
      'locality=atlantis&bedrooms=many&min_price=-5&max_price=abc&furnishing=gold-plated',
    );
    expect(parseListingFilter(params)).toEqual({});
  });
});

describe('listingFilterToQuery', () => {
  it('round-trips through the address bar', () => {
    const filter = { locality: 'kondapur', bedrooms: 3, maxPrice: 15_000_000 };
    expect(parseListingFilter(listingFilterToQuery(filter))).toEqual(filter);
  });

  it('writes nothing for unset filters', () => {
    expect(listingFilterToQuery({}).toString()).toBe('');
  });
});

describe('parseRentalFilter and parseProjectFilter', () => {
  it('read their own filters', () => {
    expect(parseRentalFilter(new URLSearchParams('locality=gachibowli&bedrooms=2&furnishing=semi-furnished'))).toEqual({
      locality: 'gachibowli',
      bedrooms: 2,
      furnishing: 'semi-furnished',
    });
    expect(parseProjectFilter(new URLSearchParams('locality=miyapur&status=new+launch'))).toEqual({
      locality: 'miyapur',
      status: 'new launch',
    });
    expect(parseProjectFilter(new URLSearchParams('status=demolished'))).toEqual({});
  });
});

describe('option lists match the data', () => {
  const listings = readRecords<RawListing>('data/v1_listings.json');
  const rentals = readRecords<RawRental>('data/v1_rentals.json');
  const projects = readRecords<RawProject>('data/v1_projects.json');
  const distinct = (values: string[]) => [...new Set(values)].sort();

  it('lists every locality in listings, rentals and projects, and no others', () => {
    expect([...LOCALITIES]).toEqual(distinct(listings.map((l) => l.locality)));
    expect(distinct(rentals.map((r) => r.locality))).toEqual([...LOCALITIES]);
    expect(distinct(projects.map((p) => p.locality))).toEqual([...LOCALITIES]);
  });

  it('lists every furnishing value', () => {
    expect([...FURNISHINGS].sort()).toEqual(distinct([...listings, ...rentals].map((r) => r.furnishing)));
  });

  it('lists every project status', () => {
    expect([...PROJECT_STATUSES].sort()).toEqual(distinct(projects.map((p) => p.project_status)));
  });
});
