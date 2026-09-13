import { useCollection } from '../components/useCollection';
import { listingParams, matchesListing, type ListingFilter } from '../lib/filters';
import { normaliseListing, type Listing, type RawListing } from '../lib/normalise';

export function useListings(filter: ListingFilter) {
  return useCollection<RawListing, Listing, ListingFilter>({
    path: '/v1/listings',
    filter,
    params: listingParams,
    matches: matchesListing,
    normalise: normaliseListing,
    idOf: (listing) => listing.listing_id,
    noun: 'homes',
  });
}
