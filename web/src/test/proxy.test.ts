import { describe, expect, it } from 'vitest';
import { forward, type ProxyEnv } from '../../api/proxy';

const ENV: ProxyEnv = { API_BASE_URL: 'https://api.test/', API_KEY: 'server-key' };

type Seen = { url: string; method: string; headers: Headers; body: string | undefined };

function upstream(status = 200, body: unknown = { ok: true }) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body === undefined ? undefined : String(init.body),
    });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchImpl };
}

describe('API proxy', () => {
  it('adds the key on the server and forwards path, query and bearer token', async () => {
    const u = upstream();
    const request = new Request('https://app.test/api/proxy?path=v1/listings&locality=madhapur&limit=50', {
      headers: { Authorization: 'Bearer abc', 'X-API-Key': 'from-browser' },
    });

    const response = await forward(request, ENV, u.fetchImpl);

    expect(response.status).toBe(200);
    expect(u.seen[0]?.url).toBe('https://api.test/v1/listings?locality=madhapur&limit=50');
    expect(u.seen[0]?.headers.get('X-API-Key')).toBe('server-key');
    expect(u.seen[0]?.headers.get('Authorization')).toBe('Bearer abc');
  });

  it('forwards a login body and passes the upstream status through', async () => {
    const u = upstream(401, { detail: 'invalid' });
    const request = new Request('https://app.test/api/proxy?path=auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a', password: 'b' }),
    });

    const response = await forward(request, ENV, u.fetchImpl);

    expect(response.status).toBe(401);
    expect(u.seen[0]?.method).toBe('POST');
    expect(u.seen[0]?.body).toBe('{"email":"a","password":"b"}');
  });

  it('forwards detail paths', async () => {
    const u = upstream();
    await forward(new Request('https://app.test/api/proxy?path=v1/listings/MAG-2000002'), ENV, u.fetchImpl);
    expect(u.seen[0]?.url).toBe('https://api.test/v1/listings/MAG-2000002');
  });

  it.each(['health', 'v1/analytics/summary', 'v1/listings/a/b', '../secret', 'v1/listings/x%2Fy', ''])(
    'refuses a path the app does not use: %s',
    async (path) => {
      const u = upstream();
      const response = await forward(new Request(`https://app.test/api/proxy?path=${path}`), ENV, u.fetchImpl);
      expect(response.status).toBe(404);
      expect(u.seen).toHaveLength(0);
    },
  );

  it('refuses other methods', async () => {
    const u = upstream();
    const response = await forward(new Request('https://app.test/api/proxy?path=v1/listings', { method: 'DELETE' }), ENV, u.fetchImpl);
    expect(response.status).toBe(405);
    expect(u.seen).toHaveLength(0);
  });

  it('fails closed when the key is not configured', async () => {
    const u = upstream();
    const response = await forward(new Request('https://app.test/api/proxy?path=v1/listings'), { API_BASE_URL: 'https://api.test' }, u.fetchImpl);
    expect(response.status).toBe(500);
    expect(u.seen).toHaveLength(0);
  });

  it('never echoes the key back to the browser', async () => {
    const u = upstream();
    const response = await forward(new Request('https://app.test/api/proxy?path=v1/listings'), ENV, u.fetchImpl);
    expect(response.headers.get('X-API-Key')).toBeNull();
    expect(await response.text()).not.toContain('server-key');
  });
});
