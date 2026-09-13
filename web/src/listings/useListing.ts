import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { ApiError, UNREACHABLE_MESSAGE } from '../lib/client';
import { normaliseListing, type Listing, type RawListing } from '../lib/normalise';

export type ListingState =
  | { status: 'loading' }
  | { status: 'ready'; listing: Listing }
  | { status: 'not-found' }
  | { status: 'error'; error: string };

/** One listing by ID, from the plural path that actually exists (H-028). */
export function useListing(id: string) {
  const [state, setState] = useState<ListingState>({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setState({ status: 'loading' });
    try {
      const raw = await api().get<RawListing>(`/v1/listings/${encodeURIComponent(id)}`);
      if (current !== requestId.current) return;
      setState({ status: 'ready', listing: normaliseListing(raw) });
    } catch (error) {
      if (current !== requestId.current) return;
      if (error instanceof ApiError && error.status === 404) {
        setState({ status: 'not-found' });
      } else if (error instanceof ApiError) {
        setState({ status: 'error', error: error.status === 0 ? UNREACHABLE_MESSAGE : error.message });
      } else {
        setState({ status: 'error', error: 'Something went wrong while loading this home.' });
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, retry: load };
}
