// The logged-in session and the arithmetic around its expiry. No network and no
// direct browser access, so every rule here is unit-tested.
//
// What the API actually does (data/_probe/session.json, hypotheses H-018, H-031, H-032):
// - the access token lives 900 seconds, not the documented 24 hours
// - POST /auth/refresh with the refresh token returns a fresh pair
// - refresh tokens are reusable and logout does not invalidate anything server-side

export const SESSION_STORAGE_KEY = 'ivy.session';

/** Refresh this long before expiry, so a slow server can't let a token lapse mid-request. */
export const REFRESH_SKEW_MS = 60_000;

export type Session = {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token stops working. */
  expiresAt: number;
  email: string;
};

/** Body of POST /auth/login and POST /auth/refresh. */
export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in: number;
  refresh_url?: string;
  user?: { email?: string };
};

/** The subset of Web Storage the app uses, so tests can pass an in-memory store. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function sessionFromTokens(body: TokenResponse, loginEmail: string, now: number): Session {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now + body.expires_in * 1000,
    email: body.user?.email ?? loginEmail,
  };
}

export function needsRefresh(session: Session, now: number, skewMs = REFRESH_SKEW_MS): boolean {
  return now >= session.expiresAt - skewMs;
}

/** How long an open tab should wait before refreshing in the background. */
export function msUntilRefresh(session: Session, now: number, skewMs = REFRESH_SKEW_MS): number {
  return Math.max(0, session.expiresAt - skewMs - now);
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    typeof v.expiresAt === 'number' &&
    typeof v.email === 'string'
  );
}

export function loadSession(store: KeyValueStore): Session | null {
  try {
    const raw = store.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(store: KeyValueStore, session: Session | null): void {
  try {
    if (session) {
      store.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      store.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Storage can be disabled (private browsing, quota). The session then lasts
    // for this tab only, which is the best available behaviour.
  }
}
