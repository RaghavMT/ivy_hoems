// Every request to the property API goes through here. It attaches both credentials
// the server checks (H-029: key in X-API-Key, plus the user's bearer token), keeps
// the 900-second token fresh, and turns failures into ApiError with a readable message.

import { needsRefresh, sessionFromTokens, type Session, type TokenResponse } from './session';

export class ApiError extends Error {
  readonly status: number;

  /** `status` is the HTTP status, or 0 when the server could not be reached. */
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type QueryParams = Record<string, string | number | undefined>;

export type ApiClientDeps = {
  baseUrl: string;
  apiKey: string;
  fetch: typeof fetch;
  now: () => number;
  getSession: () => Session | null;
  setSession: (session: Session | null) => void;
};

export type ApiClient = ReturnType<typeof createApiClient>;

export const SESSION_ENDED_MESSAGE = 'Your session has ended. Log in again to continue.';
export const UNREACHABLE_MESSAGE =
  "Can't reach the property server. Check your connection and try again.";

type SendOptions = { params?: QueryParams; body?: unknown; token?: string };

export function createApiClient(deps: ApiClientDeps) {
  const { baseUrl, apiKey, now, getSession, setSession } = deps;
  // Held in a local so the browser's fetch is never called with the wrong `this`.
  const fetchImpl = deps.fetch;
  let refreshing: Promise<Session> | null = null;

  async function send(method: string, path: string, options: SendOptions = {}): Promise<Response> {
    const url = new URL(baseUrl + path);
    for (const [name, value] of Object.entries(options.params ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
    }

    const headers: Record<string, string> = { 'X-API-Key': apiKey, Accept: 'application/json' };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    try {
      return await fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError(0, UNREACHABLE_MESSAGE);
    }
  }

  async function errorFrom(response: Response): Promise<ApiError> {
    let message = response.statusText || `Request failed with status ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && typeof (body as { detail?: unknown }).detail === 'string') {
        message = (body as { detail: string }).detail;
      }
    } catch {
      // Not JSON; keep the status text.
    }
    return new ApiError(response.status, message);
  }

  async function login(email: string, password: string): Promise<Session> {
    const response = await send('POST', '/auth/login', { body: { email, password } });
    if (!response.ok) throw await errorFrom(response);
    const session = sessionFromTokens((await response.json()) as TokenResponse, email, now());
    setSession(session);
    return session;
  }

  async function doRefresh(): Promise<Session> {
    const current = getSession();
    if (!current) throw new ApiError(401, SESSION_ENDED_MESSAGE);

    const response = await send('POST', '/auth/refresh', {
      body: { refresh_token: current.refreshToken },
    });

    if (!response.ok) {
      // Only a rejected refresh token ends the session. A 5xx from a busy server
      // keeps it, so the user can retry instead of being logged out.
      if (response.status >= 400 && response.status < 500) {
        setSession(null);
        throw new ApiError(401, SESSION_ENDED_MESSAGE);
      }
      throw await errorFrom(response);
    }

    const next = sessionFromTokens((await response.json()) as TokenResponse, current.email, now());
    setSession(next);
    return next;
  }

  /** One refresh at a time; concurrent callers share it. */
  function refresh(): Promise<Session> {
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function get<T>(path: string, params?: QueryParams): Promise<T> {
    let session = getSession();
    if (!session) throw new ApiError(401, SESSION_ENDED_MESSAGE);
    if (needsRefresh(session, now())) session = await refresh();

    let response = await send('GET', path, { params, token: session.accessToken });

    if (response.status === 401) {
      session = await refresh();
      response = await send('GET', path, { params, token: session.accessToken });
      if (response.status === 401) {
        setSession(null);
        throw new ApiError(401, SESSION_ENDED_MESSAGE);
      }
    }

    if (!response.ok) throw await errorFrom(response);
    return (await response.json()) as T;
  }

  async function logout(): Promise<void> {
    const session = getSession();
    // Cleared before the network call: the server keeps no session state, so the
    // browser forgetting the tokens is what actually logs the user out (H-031).
    setSession(null);
    if (!session) return;
    try {
      await send('POST', '/auth/logout', { token: session.accessToken });
    } catch {
      // Nothing to undo either way.
    }
  }

  return { login, logout, refresh, get };
}
