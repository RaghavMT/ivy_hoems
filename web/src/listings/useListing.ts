import { useRecord } from '../components/useRecord';
import { normaliseListing, type Listing, type RawListing } from '../lib/normalise';

/** One listing by ID, from the plural path that actually exists (H-028). */
export function useListing(id: string) {
  const { state, retry } = useRecord<RawListing, Listing>(
    `/v1/listings/${encodeURIComponent(id)}`,
    normaliseListing,
    'home',
  );
  return {
    state: state.status === 'ready' ? ({ status: 'ready', listing: state.item } as const) : state,
    retry,
  };
}
