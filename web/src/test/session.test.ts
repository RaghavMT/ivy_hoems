import { describe, expect, it } from 'vitest';
import {
  loadSession,
  msUntilRefresh,
  needsRefresh,
  saveSession,
  sessionFromTokens,
  SESSION_STORAGE_KEY,
  type KeyValueStore,
} from '../lib/session';

// Shape verified against the live API: data/_probe/session.json.
const tokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'Bearer',
  expires_in: 900,
  refresh_url: '/auth/refresh',
  user: { email: 'demo1@ivy.homes' },
};

function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
  removeItem: () => {
    throw new Error('storage disabled');
  },
};

describe('sessionFromTokens', () => {
  it('sets expiry from expires_in, counted from now', () => {
    const session = sessionFromTokens(tokens, 'demo1@ivy.homes', 1_000_000);
    expect(session.expiresAt).toBe(1_000_000 + 900_000);
  });

  it('keeps both tokens', () => {
    const session = sessionFromTokens(tokens, 'demo1@ivy.homes', 0);
    expect(session.accessToken).toBe('access-1');
    expect(session.refreshToken).toBe('refresh-1');
  });

  it('takes the email from the response', () => {
    const session = sessionFromTokens(tokens, 'typed@example.com', 0);
    expect(session.email).toBe('demo1@ivy.homes');
  });

  it('falls back to the email used to log in when the response has none', () => {
    const { user: _user, ...withoutUser } = tokens;
    const session = sessionFromTokens(withoutUser, 'demo2@ivy.homes', 0);
    expect(session.email).toBe('demo2@ivy.homes');
  });
});

describe('needsRefresh', () => {
  const session = sessionFromTokens(tokens, 'demo1@ivy.homes', 0);

  it('is false right after login', () => {
    expect(needsRefresh(session, 0)).toBe(false);
  });

  it('is false just before the last minute', () => {
    expect(needsRefresh(session, 900_000 - 60_001)).toBe(false);
  });

  it('is true inside the last minute before expiry', () => {
    expect(needsRefresh(session, 900_000 - 59_000)).toBe(true);
  });

  it('is true once expired', () => {
    expect(needsRefresh(session, 900_001)).toBe(true);
  });
});

describe('msUntilRefresh', () => {
  const session = sessionFromTokens(tokens, 'demo1@ivy.homes', 0);

  it('waits until one minute before expiry', () => {
    expect(msUntilRefresh(session, 0)).toBe(900_000 - 60_000);
  });

  it('counts down as time passes', () => {
    expect(msUntilRefresh(session, 100_000)).toBe(740_000);
  });

  it('is zero once a refresh is already due', () => {
    expect(msUntilRefresh(session, 899_000)).toBe(0);
  });
});

describe('session storage', () => {
  const session = sessionFromTokens(tokens, 'demo1@ivy.homes', 5_000);

  it('reads back a saved session', () => {
    const store = memoryStore();
    saveSession(store, session);
    expect(loadSession(store)).toEqual(session);
  });

  it('returns null when nothing is stored', () => {
    expect(loadSession(memoryStore())).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    expect(loadSession(memoryStore({ [SESSION_STORAGE_KEY]: '{not json' }))).toBeNull();
  });

  it('returns null when a stored session is missing its tokens', () => {
    const partial = JSON.stringify({ email: 'demo1@ivy.homes', expiresAt: 1 });
    expect(loadSession(memoryStore({ [SESSION_STORAGE_KEY]: partial }))).toBeNull();
  });

  it('forgets the session when saving null', () => {
    const store = memoryStore();
    saveSession(store, session);
    saveSession(store, null);
    expect(loadSession(store)).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    expect(loadSession(brokenStore)).toBeNull();
    expect(() => saveSession(brokenStore, session)).not.toThrow();
  });
});
