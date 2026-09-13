// Filter state lives in the address bar, so a filtered page survives a refresh, the
// back button works, and a filtered view can be shared as a link. Values that are
// not real options are dropped rather than trusted.

import type { ListingFilter, ProjectFilter, RentalFilter } from './filters';

/** Identical across listings, rentals and projects (checked by test against the dump). */
export const LOCALITIES = [
  'banjara hills',
  'gachibowli',
  'jubilee hills',
  'kompally',
  'kondapur',
  'kukatpally',
  'madhapur',
  'manikonda',
  'miyapur',
  'nallagandla',
] as const;

export const FURNISHINGS = ['fully-furnished', 'semi-furnished', 'unfurnished'] as const;

export const PROJECT_STATUSES = ['new launch', 'ready to move', 'under construction'] as const;

export const LISTING_BEDROOMS = [0, 1, 2, 3, 4, 5] as const;
export const RENTAL_BEDROOMS = [1, 2, 3, 4] as const;

function oneOf<T extends string>(options: readonly T[], value: string | null): T | undefined {
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

function wholeNumber(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

/** Drops keys whose value is undefined, so parsed filters compare cleanly. */
function compact<T extends object>(filter: T): T {
  return Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined)) as T;
}

export function parseListingFilter(params: URLSearchParams): ListingFilter {
  return compact({
    locality: oneOf(LOCALITIES, params.get('locality')),
    bedrooms: wholeNumber(params.get('bedrooms')),
    minPrice: wholeNumber(params.get('min_price')),
    maxPrice: wholeNumber(params.get('max_price')),
    furnishing: oneOf(FURNISHINGS, params.get('furnishing')),
  });
}

export function parseRentalFilter(params: URLSearchParams): RentalFilter {
  return compact({
    locality: oneOf(LOCALITIES, params.get('locality')),
    bedrooms: wholeNumber(params.get('bedrooms')),
    furnishing: oneOf(FURNISHINGS, params.get('furnishing')),
  });
}

export function parseProjectFilter(params: URLSearchParams): ProjectFilter {
  return compact({
    locality: oneOf(LOCALITIES, params.get('locality')),
    status: oneOf(PROJECT_STATUSES, params.get('status')),
  });
}

function toQuery(entries: Record<string, string | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}

export function listingFilterToQuery(filter: ListingFilter): URLSearchParams {
  return toQuery({
    locality: filter.locality,
    bedrooms: filter.bedrooms,
    min_price: filter.minPrice,
    max_price: filter.maxPrice,
    furnishing: filter.furnishing,
  });
}

export function rentalFilterToQuery(filter: RentalFilter): URLSearchParams {
  return toQuery({ locality: filter.locality, bedrooms: filter.bedrooms, furnishing: filter.furnishing });
}

export function projectFilterToQuery(filter: ProjectFilter): URLSearchParams {
  return toQuery({ locality: filter.locality, status: filter.status });
}
