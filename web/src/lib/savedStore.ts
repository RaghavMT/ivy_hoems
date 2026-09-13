// Shared, live view of each user's saved listings for React. Reads once per user,
// writes through to localStorage, and follows changes made in other tabs.

import type { Listing } from './normalise';
import { addSaved, readSaved, removeSaved, savedKey, snapshotOf, writeSaved, type SavedItem } from './saved';
import { pickStorage } from './storage';

const storage = pickStorage();
const listeners = new Set<() => void>();
// Cached per user so React sees the same array until something actually changes.
const cache = new Map<string, SavedItem[]>();

export const NO_SAVED: SavedItem[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function update(email: string, next: SavedItem[]) {
  cache.set(email, next);
  writeSaved(storage, email, next);
  emit();
}

export const savedStore = {
  get(email: string): SavedItem[] {
    let items = cache.get(email);
    if (!items) {
      items = readSaved(storage, email);
      cache.set(email, items);
    }
    return items;
  },

  save(email: string, listing: Listing): void {
    const item: SavedItem = { id: listing.listing_id, savedAt: new Date().toISOString(), snapshot: snapshotOf(listing) };
    update(email, addSaved(this.get(email), item));
  },

  remove(email: string, id: string): void {
    update(email, removeSaved(this.get(email), id));
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null) {
      cache.clear();
      emit();
      return;
    }
    for (const email of cache.keys()) {
      if (savedKey(email) === event.key) {
        cache.delete(email);
        emit();
      }
    }
  });
}
