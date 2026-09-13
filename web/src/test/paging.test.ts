import { describe, expect, it } from 'vitest';
import { appendUnique, collectMatches, nextOffset, type Envelope } from '../lib/paging';

function envelope(fields: Partial<Envelope<unknown>>): Envelope<unknown> {
  return { limit: 50, offset: 0, count: 50, total: 4224, has_more: true, results: [], ...fields };
}

describe('nextOffset', () => {
  it('advances by the number of records actually returned', () => {
    expect(nextOffset(envelope({ offset: 100, count: 50 }))).toBe(150);
  });

  it('uses the returned count, not the requested limit', () => {
    // The server silently caps limit at 50 (pagination finding).
    expect(nextOffset(envelope({ limit: 200, offset: 0, count: 50 }))).toBe(50);
  });

  it('stops when the server says there is nothing more', () => {
    expect(nextOffset(envelope({ offset: 4350, count: 50, has_more: false }))).toBeNull();
  });

  it('stops on an empty page even if has_more is set, so a bad envelope cannot loop forever', () => {
    expect(nextOffset(envelope({ offset: 4400, count: 0, has_more: true }))).toBeNull();
  });
});

describe('collectMatches', () => {
  // A fake collection of `size` records with ids 0..size-1, served 50 at a time.
  function collection(size: number) {
    const offsets: number[] = [];
    const fetchPage = async (offset: number): Promise<Envelope<number>> => {
      offsets.push(offset);
      const results = Array.from({ length: Math.max(0, Math.min(50, size - offset)) }, (_, i) => offset + i);
      return { limit: 50, offset, count: results.length, total: size, has_more: offset + results.length < size, results };
    };
    return { fetchPage, offsets };
  }

  it('stops after one page when that page already has enough matches', async () => {
    const c = collection(4400);
    const result = await collectMatches({ fetchPage: c.fetchPage, startOffset: 0, matches: () => true, target: 20, maxPages: 10 });
    expect(c.offsets).toEqual([0]);
    expect(result.items).toHaveLength(50);
    expect(result.nextOffset).toBe(50);
  });

  it('keeps fetching when the server ignored the filter and pages have few matches', async () => {
    const c = collection(4400);
    const result = await collectMatches({
      fetchPage: c.fetchPage,
      startOffset: 0,
      matches: (n) => n % 25 === 0,
      target: 5,
      maxPages: 10,
    });
    expect(c.offsets).toEqual([0, 50, 100]);
    expect(result.items).toEqual([0, 25, 50, 75, 100, 125]);
    expect(result.scanned).toBe(150);
    expect(result.nextOffset).toBe(150);
  });

  it('stops at the end of the data', async () => {
    const c = collection(120);
    const result = await collectMatches({ fetchPage: c.fetchPage, startOffset: 0, matches: () => false, target: 5, maxPages: 10 });
    expect(c.offsets).toEqual([0, 50, 100]);
    expect(result.items).toEqual([]);
    expect(result.nextOffset).toBeNull();
  });

  it('stops at the page cap and says where to continue', async () => {
    const c = collection(4400);
    const result = await collectMatches({ fetchPage: c.fetchPage, startOffset: 200, matches: () => false, target: 5, maxPages: 3 });
    expect(c.offsets).toEqual([200, 250, 300]);
    expect(result.nextOffset).toBe(350);
    expect(result.scanned).toBe(150);
  });
});

describe('appendUnique', () => {
  const id = (r: { id: string }) => r.id;

  it('appends in order', () => {
    expect(appendUnique([{ id: 'a' }], [{ id: 'b' }, { id: 'c' }], id).map(id)).toEqual(['a', 'b', 'c']);
  });

  it('drops records already shown, so a shifting page boundary cannot duplicate a card', () => {
    expect(appendUnique([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }], id).map(id)).toEqual(['a', 'b', 'c']);
  });

  it('drops repeats within the incoming page too', () => {
    expect(appendUnique([], [{ id: 'a' }, { id: 'a' }], id).map(id)).toEqual(['a']);
  });
});
