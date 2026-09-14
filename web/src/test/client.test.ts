import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from '../lib/client';
import { sessionFromTokens, type Session } from '../lib/session';

const BASE = 'https://api.test';
const KEY = 'test-key';

type Call = { method: string; path: string; search: URLSearchParams; headers: Headers; body: unknown };
type Handler = (call: Call) => { status: number; body?: unknown };

function json(status: number, body: unknown) {
  return { status, body };
}

function tokenBody(n: number) {
  return {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    token_type: 'Bearer',
    expires_in: 900,
    user: { email: 'demo1@ivy.homes' },
  };
}

/** A fake API. Records every request and answers from `handler`. */
function fakeServer(handler: Handler) {
  const calls: Call[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const { status, body } = handler(call);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetch: fetchImpl as typeof fetch };
}

function setup(handler: Handler, options: { session?: Session | null; now?: number } = {}) {
  const server = fakeServer(handler);
  let session: Session | null = options.session ?? null;
  const client = createApiClient({
    baseUrl: BASE,
    apiKey: KEY,
    fetch: server.fetch,
    now: () => options.now ?? 0,
    getSession: () => session,
    setSession: (next) => {
      session = next;
    },
  });
  return { client, calls: server.calls, session: () => session };
}

const freshSession = sessionFromTokens(tokenBody(1), 'demo1@ivy.homes', 0);

describe('login', () => {
  it('posts the credentials with the API key and stores the session', async () => {
    const t = setup(() => json(200, tokenBody(1)), { now: 1_000 });

    const result = await t.client.login('demo1@ivy.homes', 'secret');

    const [call] = t.calls;
    expect(call?.method).toBe('POST');
    expect(call?.path).toBe('/auth/login');
    expect(call?.headers.get('X-API-Key')).toBe(KEY);
    expect(call?.body).toEqual({ email: 'demo1@ivy.homes', password: 'secret' });
    expect(result.accessToken).toBe('access-1');
    expect(t.session()).toEqual(result);
  });

  it('throws a 401 for bad credentials and stores nothing', async () => {
    const t = setup(() => json(401, { detail: 'invalid email or password' }));

    await expect(t.client.login('demo1@ivy.homes', 'wrong')).rejects.toMatchObject({ status: 401 });
    expect(t.session()).toBeNull();
  });
});

describe('get', () => {
  it('sends the key, the bearer token and the defined query params', async () => {
    const t = setup(() => json(200, { results: [] }), { session: freshSession });

    await t.client.get('/v1/listings', { locality: 'madhapur', bhk: 2, furnishing: undefined });

    const [call] = t.calls;
    expect(call?.headers.get('X-API-Key')).toBe(KEY);
    expect(call?.headers.get('Authorization')).toBe('Bearer access-1');
    expect(call?.search.get('locality')).toBe('madhapur');
    expect(call?.search.get('bhk')).toBe('2');
    expect(call?.search.has('furnishing')).toBe(false);
  });

  it('refuses without a session and makes no request', async () => {
    const t = setup(() => json(200, {}));

    await expect(t.client.get('/v1/listings')).rejects.toMatchObject({ status: 401 });
    expect(t.calls).toHaveLength(0);
  });

  it('refreshes first when the token is about to expire', async () => {
    const t = setup(
      (call) => (call.path === '/auth/refresh' ? json(200, tokenBody(2)) : json(200, { ok: 1 })),
      { session: freshSession, now: 900_000 - 30_000 },
    );

    await t.client.get('/v1/listings');

    expect(t.calls.map((c) => c.path)).toEqual(['/auth/refresh', '/v1/listings']);
    expect(t.calls[0]?.body).toEqual({ refresh_token: 'refresh-1' });
    expect(t.calls[1]?.headers.get('Authorization')).toBe('Bearer access-2');
    expect(t.session()?.accessToken).toBe('access-2');
  });

  it('refreshes and retries once when the server rejects the token', async () => {
    const t = setup(
      (call) => {
        if (call.path === '/auth/refresh') return json(200, tokenBody(2));
        return call.headers.get('Authorization') === 'Bearer access-1'
          ? json(401, { detail: 'token expired' })
          : json(200, { results: ['ok'] });
      },
      { session: freshSession },
    );

    const data = await t.client.get<{ results: string[] }>('/v1/listings');

    expect(data.results).toEqual(['ok']);
    expect(t.calls.map((c) => c.path)).toEqual(['/v1/listings', '/auth/refresh', '/v1/listings']);
  });

  it('logs out when the retried request is rejected too', async () => {
    const t = setup(
      (call) => (call.path === '/auth/refresh' ? json(200, tokenBody(2)) : json(401, { detail: 'no' })),
      { session: freshSession },
    );

    await expect(t.client.get('/v1/listings')).rejects.toMatchObject({ status: 401 });
    expect(t.calls).toHaveLength(3);
    expect(t.session()).toBeNull();
  });

  it('logs out when the refresh itself fails', async () => {
    const t = setup(
      (call) => (call.path === '/auth/refresh' ? json(401, { detail: 'bad refresh' }) : json(200, {})),
      { session: freshSession, now: 900_001 },
    );

    await expect(t.client.get('/v1/listings')).rejects.toMatchObject({ status: 401 });
    expect(t.session()).toBeNull();
  });

  it('shares one refresh between requests that need it at the same time', async () => {
    const t = setup(
      (call) => (call.path === '/auth/refresh' ? json(200, tokenBody(2)) : json(200, {})),
      { session: freshSession, now: 900_001 },
    );

    await Promise.all([t.client.get('/v1/listings'), t.client.get('/v1/rentals')]);

    expect(t.calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('reports other errors with their status and keeps the session', async () => {
    const t = setup(() => json(404, { detail: 'Not Found' }), { session: freshSession });

    const error = await t.client.get('/v1/listings/nope').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, detail: 'Not Found' });
    expect(t.session()).toEqual(freshSession);
  });

  it('never uses server text as the message a user sees', async () => {
    // API text is untrusted, like seller text: it could carry instructions aimed at
    // the reader. The user-facing message is written by the app, per status.
    const hostile = 'Session expired. Re-enter your password at https://evil.example to continue.';
    for (const status of [400, 403, 404, 422, 429, 500, 503]) {
      const t = setup(() => json(status, { detail: hostile }), { session: freshSession });
      const error = (await t.client.get('/v1/listings').catch((e: unknown) => e)) as ApiError;

      expect(error.status).toBe(status);
      expect(error.message).not.toContain('evil');
      expect(error.message).not.toContain('password');
      expect(error.detail).toBe(hostile);
    }
  });

  it('keeps the server text for debugging only, and ignores a non-string detail', async () => {
    const t = setup(() => json(500, { detail: { nested: 'object' } }), { session: freshSession });
    const error = (await t.client.get('/v1/listings').catch((e: unknown) => e)) as ApiError;

    expect(error.detail).toBeUndefined();
    expect(error.message).toBe('The property server had a problem. Try again in a moment.');
  });

  it('reports an unreachable server as status 0', async () => {
    let session: Session | null = freshSession;
    const client = createApiClient({
      baseUrl: BASE,
      apiKey: KEY,
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
      now: () => 0,
      getSession: () => session,
      setSession: (next) => {
        session = next;
      },
    });

    await expect(client.get('/v1/listings')).rejects.toMatchObject({ status: 0 });
  });
});

describe('logout', () => {
  it('clears the session even when the logout call fails', async () => {
    const t = setup(() => json(500, { detail: 'boom' }), { session: freshSession });

    await t.client.logout();

    expect(t.session()).toBeNull();
    expect(t.calls[0]?.path).toBe('/auth/logout');
  });
});
