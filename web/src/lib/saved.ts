// Saved listings, per user, in the browser. The documented /v1/favourites endpoint
// returns 404 (missing_endpoint finding), so there is no server to keep them.
// Keyed by the logged-in email, separate from the session, so they survive logout
// and re-login on the same browser. Pure functions; the React wiring is savedStore.

import { listingTitle } from './labels';
import type { Listing } from './normalise';
import type { KeyValueStore } from './session';

/** What the saved page shows, captured at save time so it needs no API calls. */
export type SavedSnapshot = {
  title: string;
  locality: string;
  priceInr: number;
  carpetAreaSqft: number;
  areaWasSqm: boolean;
  isLive: boolean;
};

export type SavedItem = {
  id: string;
  savedAt: string;
  snapshot: SavedSnapshot;
};

export function savedKey(email: string): string {
  return `ivy.saved.${email.trim().toLowerCase()}`;
}

export function snapshotOf(listing: Listing): SavedSnapshot {
  return {
    title: listingTitle(listing),
    locality: listing.locality,
    priceInr: listing.price,
    carpetAreaSqft: listing.carpetAreaSqft,
    areaWasSqm: listing.areaWasSqm,
    isLive: listing.is_live,
  };
}

export function addSaved(items: SavedItem[], item: SavedItem): SavedItem[] {
  if (items.some((existing) => existing.id === item.id)) return items;
  return [item, ...items];
}

export function removeSaved(items: SavedItem[], id: string): SavedItem[] {
  return items.filter((item) => item.id !== id);
}

function isSavedItem(value: unknown): value is SavedItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const s = v.snapshot as Record<string, unknown> | undefined;
  return (
    typeof v.id === 'string' &&
    typeof v.savedAt === 'string' &&
    typeof s === 'object' &&
    s !== null &&
    typeof s.title === 'string' &&
    typeof s.locality === 'string' &&
    typeof s.priceInr === 'number' &&
    typeof s.carpetAreaSqft === 'number' &&
    typeof s.areaWasSqm === 'boolean' &&
    typeof s.isLive === 'boolean'
  );
}

export function readSaved(store: KeyValueStore, email: string): SavedItem[] {
  try {
    const raw = store.getItem(savedKey(email));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedItem) : [];
  } catch {
    return [];
  }
}

export function writeSaved(store: KeyValueStore, email: string, items: SavedItem[]): void {
  try {
    store.setItem(savedKey(email), JSON.stringify(items));
  } catch {
    // Storage blocked or full: the list lasts for this tab only.
  }
}
