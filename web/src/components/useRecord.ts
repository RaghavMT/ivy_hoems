import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { ApiError, UNREACHABLE_MESSAGE } from '../lib/client';

export type RecordState<Item> =
  | { status: 'loading' }
  | { status: 'ready'; item: Item }
  | { status: 'not-found' }
  | { status: 'error'; error: string };

/**
 * One record by ID from a detail endpoint, normalised. A 404 is "not found", not an
 * error, so a mistyped or stale link gets a helpful page.
 */
export function useRecord<Raw, Item>(path: string, normalise: (raw: Raw) => Item, noun: string) {
  const [state, setState] = useState<RecordState<Item>>({ status: 'loading' });
  const requestId = useRef(0);
  const normaliseRef = useRef(normalise);
  normaliseRef.current = normalise;

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setState({ status: 'loading' });
    try {
      const raw = await api().get<Raw>(path);
      if (current !== requestId.current) return;
      setState({ status: 'ready', item: normaliseRef.current(raw) });
    } catch (error) {
      if (current !== requestId.current) return;
      if (error instanceof ApiError && error.status === 404) {
        setState({ status: 'not-found' });
      } else if (error instanceof ApiError) {
        setState({ status: 'error', error: error.status === 0 ? UNREACHABLE_MESSAGE : error.message });
      } else {
        setState({ status: 'error', error: `Something went wrong while loading this ${noun}.` });
      }
    }
  }, [path, noun]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, retry: load };
}
