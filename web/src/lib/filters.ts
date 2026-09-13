// Filters for the three browse pages. Each is sent to the server as query params
// AND applied in the browser to whatever comes back. All documented filter params
// were honoured when probed (H-016), but the requirement is that filters work
// whether or not the server helps, so the browser predicate is what guarantees it.
// A test checks the predicate reproduces every total the server reported.

import type { QueryParams } from './client';
import type { RawListing, RawProject, RawRental } from './normalise';

export type ListingFilter = {
  locality?: string;
  bedrooms?: number;
  /** Rupees, inclusive (H-034). */
  minPrice?: number;
  /** Rupees, inclusive (H-034). */
  maxPrice?: number;
  furnishing?: string;
};

export type RentalFilter = {
  locality?: string;
  bedrooms?: number;
  furnishing?: string;
};

export type ProjectFilter = {
  locality?: string;
  status?: string;
};

const unset = (value: unknown) => value === undefined;

export function matchesListing(
  filter: ListingFilter,
  listing: Pick<RawListing, 'locality' | 'bedroom' | 'price' | 'furnishing'>,
): boolean {
  return (
    (unset(filter.locality) || listing.locality === filter.locality) &&
    (unset(filter.bedrooms) || listing.bedroom === filter.bedrooms) &&
    (unset(filter.minPrice) || listing.price >= filter.minPrice!) &&
    (unset(filter.maxPrice) || listing.price <= filter.maxPrice!) &&
    (unset(filter.furnishing) || listing.furnishing === filter.furnishing)
  );
}

export function matchesRental(
  filter: RentalFilter,
  rental: Pick<RawRental, 'locality' | 'bedroom' | 'furnishing'>,
): boolean {
  return (
    (unset(filter.locality) || rental.locality === filter.locality) &&
    (unset(filter.bedrooms) || rental.bedroom === filter.bedrooms) &&
    (unset(filter.furnishing) || rental.furnishing === filter.furnishing)
  );
}

export function matchesProject(
  filter: ProjectFilter,
  project: Pick<RawProject, 'locality' | 'project_status'>,
): boolean {
  return (
    (unset(filter.locality) || project.locality === filter.locality) &&
    (unset(filter.status) || project.project_status === filter.status)
  );
}

export function listingParams(filter: ListingFilter): QueryParams {
  return {
    locality: filter.locality,
    bhk: filter.bedrooms,
    min_price: filter.minPrice,
    max_price: filter.maxPrice,
    furnishing: filter.furnishing,
  };
}

export function rentalParams(filter: RentalFilter): QueryParams {
  return { locality: filter.locality, bhk: filter.bedrooms, furnishing: filter.furnishing };
}

export function projectParams(filter: ProjectFilter): QueryParams {
  return { locality: filter.locality, project_status: filter.status };
}
