// The single source of truth for "who is logged in", shared by the API client and
// React. Persisted to localStorage so a hard refresh keeps the session, and kept in
// step across tabs through the storage event.

import {
  loadSession,
  saveSession,
  SESSION_STORAGE_KEY,
  type KeyValueStore,
  type Session,
} from './session';

function pickStorage(): KeyValueStore {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Accessing localStorage can throw when site data is blocked.
  }
  const memory = new Map<string, string>();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  };
}

const storage = pickStorage();
const listeners = new Set<() => void>();
let current: Session | null = loadSession(storage);

function emit() {
  for (const listener of listeners) listener();
}

export const sessionStore = {
  get(): Session | null {
    return current;
  },

  set(next: Session | null): void {
    current = next;
    saveSession(storage, next);
    emit();
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
    // key is null when another tab cleared all storage.
    if (event.key !== null && event.key !== SESSION_STORAGE_KEY) return;
    current = loadSession(storage);
    emit();
  });
}
