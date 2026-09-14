// Vercel function that keeps the API key out of the browser. The app calls
// /api/<path> on its own origin; vercel.json rewrites that to /api/proxy?path=<path>,
// and this adds the X-API-Key header on the server and forwards to the property API.
// The user's bearer token still comes from the browser, so every call is per user.
//
// Only the paths the app uses are forwarded, so this is not an open relay.

declare const process: { env: Record<string, string | undefined> };

export type ProxyEnv = {
  API_BASE_URL?: string;
  API_KEY?: string;
  // Older names from when the browser called the API directly. Read only here, on
  // the server, and never referenced by browser code, so Vite does not bundle them.
  VITE_API_BASE_URL?: string;
  VITE_API_KEY?: string;
};

const ALLOWED_PATH = /^(auth\/(login|refresh|logout)|v1\/(listings|rentals|projects)(\/[A-Za-z0-9_-]+)?)$/;
const FORWARDED_REQUEST_HEADERS = ['authorization', 'content-type', 'accept'];

function jsonResponse(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function forward(request: Request, env: ProxyEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const base = (env.API_BASE_URL ?? env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  const key = env.API_KEY ?? env.VITE_API_KEY;
  if (!base || !key) return jsonResponse(500, 'API proxy is not configured');

  if (request.method !== 'GET' && request.method !== 'POST') return jsonResponse(405, 'method not allowed');

  const incoming = new URL(request.url);
  const path = (incoming.searchParams.get('path') ?? '').replace(/^\/+|\/+$/g, '');
  incoming.searchParams.delete('path');
  if (!ALLOWED_PATH.test(path)) return jsonResponse(404, 'not found');

  const headers = new Headers({ 'X-API-Key': key });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetchImpl(`${base}/${path}${incoming.search}`, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? await request.text() : undefined,
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function GET(request: Request): Promise<Response> {
  return forward(request, process.env);
}

export function POST(request: Request): Promise<Response> {
  return forward(request, process.env);
}
