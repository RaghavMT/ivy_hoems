import { createApiClient, type ApiClient } from './client';
import { sessionStore } from './sessionStore';

/**
 * Where the browser sends API calls: the app's own origin. A server-side proxy
 * (web/api/proxy.ts on Vercel, the Vite proxy locally) adds the API key, so the key
 * never reaches the browser.
 */
export const API_PREFIX = '/api';

let client: ApiClient | null = null;

export function api(): ApiClient {
  client ??= createApiClient({
    baseUrl: `${window.location.origin}${API_PREFIX}`,
    fetch: window.fetch.bind(window),
    now: Date.now,
    getSession: sessionStore.get,
    setSession: sessionStore.set,
  });
  return client;
}
