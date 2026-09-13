import { useCallback, useSyncExternalStore } from 'react';
import { useSession } from '../auth/useSession';
import type { Listing } from '../lib/normalise';
import { NO_SAVED, savedStore } from '../lib/savedStore';

/** The logged-in user's saved listings, and actions on them. */
export function useSaved() {
  const email = useSession()?.email ?? null;

  const items = useSyncExternalStore(
    savedStore.subscribe,
    () => (email ? savedStore.get(email) : NO_SAVED),
    () => NO_SAVED,
  );

  const isSaved = useCallback((id: string) => items.some((item) => item.id === id), [items]);

  const toggle = useCallback(
    (listing: Listing) => {
      if (!email) return;
      if (savedStore.get(email).some((item) => item.id === listing.listing_id)) {
        savedStore.remove(email, listing.listing_id);
      } else {
        savedStore.save(email, listing);
      }
    },
    [email],
  );

  const remove = useCallback((id: string) => email && savedStore.remove(email, id), [email]);

  return { items, isSaved, toggle, remove };
}
