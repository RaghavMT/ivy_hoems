import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { ApiError, UNREACHABLE_MESSAGE } from '../lib/client';
import { listingParams, matchesListing, type ListingFilter } from '../lib/filters';
import { normaliseListing, type Listing, type RawListing } from '../lib/normalise';
import { appendUnique, collectMatches, PAGE_SIZE, type Envelope } from '../lib/paging';

export type ListingsState = {
  items: Listing[];
  status: 'loading' | 'loading-more' | 'ready' | 'error';
  error: string | null;
  /** Where the next page starts, or null when everything matching has been loaded. */
  nextOffset: number | null;
  /** Records examined, including any the browser filtered out. */
  scanned: number;
};

const INITIAL: ListingsState = { items: [], status: 'loading', error: null, nextOffset: 0, scanned: 0 };

/** Pages fetched per click at most, so a filter the server ignores can't page forever. */
const MAX_PAGES_PER_LOAD = 3;

const idOf = (listing: Listing) => listing.listing_id;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.status === 0 ? UNREACHABLE_MESSAGE : error.message;
  return 'Something went wrong while loading homes.';
}

export function useListings(filter: ListingFilter) {
  // The serialised filter is the dependency, so a new object with the same values
  // doesn't trigger a reload.
  const filterKey = JSON.stringify(filter);
  const [state, setState] = useState<ListingsState>(INITIAL);
  const requestId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(
    async (startOffset: number, reset: boolean) => {
      const id = ++requestId.current;
      const current: ListingFilter = JSON.parse(filterKey);
      setState((s) => (reset ? INITIAL : { ...s, status: 'loading-more', error: null }));

      try {
        const result = await collectMatches<RawListing>({
          fetchPage: (offset) =>
            api().get<Envelope<RawListing>>('/v1/listings', {
              ...listingParams(current),
              limit: PAGE_SIZE,
              offset,
            }),
          startOffset,
          matches: (raw) => matchesListing(current, raw),
          target: PAGE_SIZE,
          maxPages: MAX_PAGES_PER_LOAD,
        });
        // A newer request (a filter change, a retry) has superseded this one.
        if (id !== requestId.current) return;

        const incoming = result.items.map(normaliseListing);
        setState((s) => ({
          items: appendUnique(reset ? [] : s.items, incoming, idOf),
          status: 'ready',
          error: null,
          nextOffset: result.nextOffset,
          scanned: (reset ? 0 : s.scanned) + result.scanned,
        }));
      } catch (error) {
        if (id !== requestId.current) return;
        setState((s) => ({ ...s, status: 'error', error: messageFor(error) }));
      }
    },
    [filterKey],
  );

  useEffect(() => {
    void load(0, true);
  }, [load]);

  const loadMore = useCallback(() => {
    const { nextOffset, status } = stateRef.current;
    if (nextOffset === null || status === 'loading' || status === 'loading-more') return;
    void load(nextOffset, false);
  }, [load]);

  const retry = useCallback(() => {
    const { items, nextOffset } = stateRef.current;
    if (items.length === 0) void load(0, true);
    else if (nextOffset !== null) void load(nextOffset, false);
  }, [load]);

  return { ...state, loadMore, retry };
}
