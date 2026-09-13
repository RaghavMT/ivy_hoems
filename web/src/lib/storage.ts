import type { KeyValueStore } from './session';

/**
 * The browser's localStorage, or an in-memory stand-in when site data is blocked,
 * so the app keeps working for the length of the tab instead of crashing.
 */
export function pickStorage(): KeyValueStore {
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
