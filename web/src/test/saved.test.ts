import { describe, expect, it } from 'vitest';
import { addSaved, readSaved, removeSaved, savedKey, snapshotOf, writeSaved, type SavedItem } from '../lib/saved';
import { saveSession, sessionFromTokens, type KeyValueStore } from '../lib/session';
import type { Listing } from '../lib/normalise';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { keys(): string[] } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    keys: () => [...data.keys()],
  };
}

const listing = {
  listing_id: 'MAG-2000002',
  bedroom: 2,
  property_type: 'villa',
  apartment_name: 'Godrej Vista',
  locality: 'nallagandla',
  price: 4_620_000,
  carpetAreaSqft: 732,
  areaWasSqm: true,
  is_live: true,
} as Listing;

const item = (id: string, savedAt = '2026-09-13T18:00:00.000Z'): SavedItem => ({
  id,
  savedAt,
  snapshot: { title: `Home ${id}`, locality: 'kondapur', priceInr: 1, carpetAreaSqft: 1, areaWasSqm: false, isLive: true },
});

describe('snapshotOf', () => {
  it('keeps what the saved page shows, already normalised', () => {
    expect(snapshotOf(listing)).toEqual({
      title: '2 BHK villa, Godrej Vista',
      locality: 'nallagandla',
      priceInr: 4_620_000,
      carpetAreaSqft: 732,
      areaWasSqm: true,
      isLive: true,
    });
  });
});

describe('addSaved and removeSaved', () => {
  it('puts the newest save first', () => {
    expect(addSaved([item('A')], item('B')).map((i) => i.id)).toEqual(['B', 'A']);
  });

  it('does not save the same listing twice', () => {
    const once = addSaved([], item('A', '2026-09-13T10:00:00.000Z'));
    const twice = addSaved(once, item('A', '2026-09-13T11:00:00.000Z'));
    expect(twice).toHaveLength(1);
    expect(twice[0]?.savedAt).toBe('2026-09-13T10:00:00.000Z');
  });

  it('removes by id', () => {
    expect(removeSaved([item('A'), item('B')], 'A').map((i) => i.id)).toEqual(['B']);
  });
});

describe('storage per user', () => {
  it('reads back what was written', () => {
    const store = memoryStore();
    writeSaved(store, 'demo1@ivy.homes', [item('A'), item('B')]);
    expect(readSaved(store, 'demo1@ivy.homes').map((i) => i.id)).toEqual(['A', 'B']);
  });

  it('keeps each user separate', () => {
    const store = memoryStore();
    writeSaved(store, 'demo1@ivy.homes', [item('A')]);
    writeSaved(store, 'demo2@ivy.homes', [item('B')]);
    expect(readSaved(store, 'demo1@ivy.homes').map((i) => i.id)).toEqual(['A']);
    expect(readSaved(store, 'demo2@ivy.homes').map((i) => i.id)).toEqual(['B']);
  });

  it('treats the email case-insensitively', () => {
    expect(savedKey('Demo1@Ivy.Homes')).toBe(savedKey('demo1@ivy.homes'));
  });

  it('survives logging out', () => {
    const store = memoryStore();
    writeSaved(store, 'demo1@ivy.homes', [item('A')]);
    saveSession(store, sessionFromTokens({ access_token: 'a', refresh_token: 'r', expires_in: 900 }, 'demo1@ivy.homes', 0));
    saveSession(store, null);
    expect(readSaved(store, 'demo1@ivy.homes').map((i) => i.id)).toEqual(['A']);
  });

  it('returns an empty list for corrupt storage', () => {
    const store = memoryStore({ [savedKey('demo1@ivy.homes')]: '{not json' });
    expect(readSaved(store, 'demo1@ivy.homes')).toEqual([]);
  });

  it('drops malformed entries and keeps good ones', () => {
    const store = memoryStore({
      [savedKey('demo1@ivy.homes')]: JSON.stringify([item('A'), { id: 'B' }, 'junk', null]),
    });
    expect(readSaved(store, 'demo1@ivy.homes').map((i) => i.id)).toEqual(['A']);
  });

  it('does not throw when storage is unavailable', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSaved(broken, 'demo1@ivy.homes')).toEqual([]);
    expect(() => writeSaved(broken, 'demo1@ivy.homes', [item('A')])).not.toThrow();
  });
});
