import { createApiClient, type ApiClient } from './client';
import { config } from './config';
import { sessionStore } from './sessionStore';

let client: ApiClient | null = null;

/**
 * The app's API client. Created on first use rather than at import, so a missing
 * environment variable surfaces as an error on the screen that needed the API.
 */
export function api(): ApiClient {
  client ??= createApiClient({
    baseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    fetch: window.fetch.bind(window),
    now: Date.now,
    getSession: sessionStore.get,
    setSession: sessionStore.set,
  });
  return client;
}
