// Paging through the collection endpoints. What the server really does
// (pagination finding): `page` is ignored, `offset` works, `limit` is capped at 50,
// and `total` under-reports the true count by 4%, so it is never shown as a count.
// `has_more` is honest, so it decides when to stop.

export const PAGE_SIZE = 50;

export type Envelope<T> = {
  limit: number;
  offset: number;
  count: number;
  total: number;
  has_more: boolean;
  results: T[];
};

/** Offset of the next page, or null when there is nothing more to fetch. */
export function nextOffset(page: Envelope<unknown>): number | null {
  if (!page.has_more || page.count === 0) return null;
  return page.offset + page.count;
}

export type CollectOptions<T> = {
  fetchPage: (offset: number) => Promise<Envelope<T>>;
  startOffset: number;
  matches: (item: T) => boolean;
  /** Stop once at least this many matching records have been found. */
  target: number;
  /** Safety cap on requests per call, so a filter that matches nothing can't page forever. */
  maxPages: number;
};

export type CollectResult<T> = {
  items: T[];
  nextOffset: number | null;
  scanned: number;
};

/**
 * Fetches pages until enough records pass the browser-side filter. When the server
 * honours the filter, the first page already qualifies and this is one request. If it
 * ever ignores one, this keeps reading so the filter still works.
 */
export async function collectMatches<T>(options: CollectOptions<T>): Promise<CollectResult<T>> {
  const items: T[] = [];
  let offset: number | null = options.startOffset;
  let scanned = 0;

  for (let pages = 0; offset !== null && pages < options.maxPages; pages++) {
    const page: Envelope<T> = await options.fetchPage(offset);
    scanned += page.results.length;
    for (const item of page.results) {
      if (options.matches(item)) items.push(item);
    }
    offset = nextOffset(page);
    if (items.length >= options.target) break;
  }

  return { items, nextOffset: offset, scanned };
}

export function appendUnique<T>(existing: T[], incoming: T[], idOf: (item: T) => string): T[] {
  const seen = new Set(existing.map(idOf));
  const merged = [...existing];
  for (const item of incoming) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}
