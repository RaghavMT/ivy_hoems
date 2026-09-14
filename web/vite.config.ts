import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Server-side only: loaded here for the dev and preview proxy, never exposed to the
  // browser (no VITE_ prefix, and no browser code reads import.meta.env).
  const env = loadEnv(mode, '.', '');
  const target = (env.API_BASE_URL ?? env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  const key = env.API_KEY ?? env.VITE_API_KEY ?? '';

  // Same job as web/api/proxy.ts on Vercel: /api/<path> goes to the API with the key added.
  const proxy = target
    ? {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
          headers: { 'X-API-Key': key },
        },
      }
    : undefined;

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
