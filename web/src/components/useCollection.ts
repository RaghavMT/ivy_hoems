import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { ApiError, UNREACHABLE_MESSAGE, type QueryParams } from '../lib/client';
import { appendUnique, collectMatches, PAGE_SIZE, type Envelope } from '../lib/paging';

export type CollectionState<Item> = {
  items: Item[];
  status: 'loading' | 'loading-more' | 'ready' | 'error';
  error: string | null;
  /** Where the next page starts, or null when everything matching has been loaded. */
  nextOffset: number | null;
  /** Records examined, including any the browser filtered out. */
  scanned: number;
};

export type CollectionOptions<Raw, Item, Filter> = {
  path: string;
  filter: Filter;
  params: (filter: Filter) => QueryParams;
  matches: (filter: Filter, raw: Raw) => boolean;
  normalise: (raw: Raw) => Item;
  idOf: (item: Item) => string;
  /** Plural noun for the fallback error message, e.g. "homes". */
  noun: string;
};

/** Pages fetched per click at most, so a filter the server ignores can't page forever. */
const MAX_PAGES_PER_LOAD = 3;

function initial<Item>(): CollectionState<Item> {
  return { items: [], status: 'loading', error: null, nextOffset: 0, scanned: 0 };
}

/**
 * A filtered, paged collection endpoint. Sends the filter to the server, re-checks
 * every record in the browser, normalises units, and drops responses that a newer
 * request (a filter change, a retry) has superseded.
 */
export function useCollection<Raw, Item, Filter>(options: CollectionOptions<Raw, Item, Filter>) {
  const { path, filter, noun } = options;
  // The serialised filter is the dependency, so a new object with the same values
  // doesn't trigger a reload.
  const filterKey = JSON.stringify(filter);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<CollectionState<Item>>(initial);
  const requestId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(
    async (startOffset: number, reset: boolean) => {
      const id = ++requestId.current;
      const current = JSON.parse(filterKey) as Filter;
      const { params, matches, normalise, idOf } = optionsRef.current;
      setState((s) => (reset ? initial<Item>() : { ...s, status: 'loading-more', error: null }));

      try {
        const result = await collectMatches<Raw>({
          fetchPage: (offset) => api().get<Envelope<Raw>>(path, { ...params(current), limit: PAGE_SIZE, offset }),
          startOffset,
          matches: (raw) => matches(current, raw),
          target: PAGE_SIZE,
          maxPages: MAX_PAGES_PER_LOAD,
        });
        if (id !== requestId.current) return;

        const incoming = result.items.map(normalise);
        setState((s) => ({
          items: appendUnique(reset ? [] : s.items, incoming, idOf),
          status: 'ready',
          error: null,
          nextOffset: result.nextOffset,
          scanned: (reset ? 0 : s.scanned) + result.scanned,
        }));
      } catch (error) {
        if (id !== requestId.current) return;
        const message =
          error instanceof ApiError
            ? error.status === 0
              ? UNREACHABLE_MESSAGE
              : error.message
            : `Something went wrong while loading ${noun}.`;
        setState((s) => ({ ...s, status: 'error', error: message }));
      }
    },
    [filterKey, path, noun],
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
