// Shared helpers for the browser tests. They drive the installed Chrome against a
// running build of the app and the real API, so every spec counts its API requests
// and fails if it goes over its budget.
//
// Env: E2E_BASE_URL (default http://localhost:4173), CHROME_PATH (optional).
// API calls go to the app's own /api proxy, which adds the key server-side.
// Reads DEMO_PASSWORD from the repository's root .env; never prints it.

import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
export const APP_URL = (process.env.E2E_BASE_URL ?? 'http://localhost:4173').replace(/\/+$/, '');
export const SLOW = { timeout: 90_000 };
export const SHOTS_DIR = process.env.E2E_SHOTS ?? path.join(os.tmpdir(), 'ivy-e2e-shots');

function readRootEnv() {
  const text = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  );
}

const env = readRootEnv();
export const API_URL = `${APP_URL}/api`;
export const PASSWORD = env.DEMO_PASSWORD;

export function readRecords(file) {
  const data = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data', file), 'utf8'));
  return Array.isArray(data) ? data : data.results;
}

export function shot(name) {
  mkdirSync(SHOTS_DIR, { recursive: true });
  return path.join(SHOTS_DIR, name);
}

/**
 * Starts a spec: launches Chrome, counts API requests across every page in the
 * context, and collects console errors. `expectedErrors` filters known, deliberate
 * ones (like the 401 from a wrong-password test).
 */
export async function startSpec(name, budget, { expectedErrors = () => false } = {}) {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
  );
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const results = [];
  const consoleErrors = [];
  let apiRequests = 0;

  context.on('request', (request) => {
    // Same-origin now, so no preflights; the check stays harmless.
    if (request.url().startsWith(API_URL) && request.method() !== 'OPTIONS') apiRequests++;
  });

  function watchConsole(page) {
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push({ text: m.text(), url: m.location().url }));
    page.on('pageerror', (e) => consoleErrors.push({ text: String(e), url: 'pageerror' }));
  }

  async function newPage(viewport) {
    const page = await context.newPage();
    if (viewport) await page.setViewportSize(viewport);
    watchConsole(page);
    return page;
  }

  function check(label, ok, extra = '') {
    results.push({ label, ok: Boolean(ok) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  }

  async function finish(error) {
    if (error) check('spec ran to completion', false, String(error).split('\n')[0]);
    const unexpected = consoleErrors.filter((e) => !expectedErrors(e));
    check('no unexpected console errors', unexpected.length === 0, JSON.stringify(unexpected.slice(0, 3)));
    check(`API requests within budget`, apiRequests <= budget, `${apiRequests} of ${budget}`);
    await browser.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${name}: ${results.length - failed}/${results.length} checks passed. API requests: ${apiRequests} (budget ${budget})`);
    process.exitCode = failed ? 1 : 0;
  }

  console.log(`\n=== ${name} against ${APP_URL} ===`);
  return { context, newPage, check, finish, apiCount: () => apiRequests };
}

export async function logIn(page, email, next = '/insights') {
  await page.goto(`${APP_URL}/login?next=${encodeURIComponent(next)}`);
  await page.fill('#login-email', email);
  await page.fill('#login-password', PASSWORD);
  await page.click('button[type=submit]');
  // The email is hidden on narrow screens; the Log out button is always shown.
  await page.locator('button:has-text("Log out")').waitFor(SLOW);
}

export async function logOut(page) {
  await page.click('button:has-text("Log out")');
  await page.locator('a.btn:has-text("Log in"), #login-email').first().waitFor(SLOW);
}

/** No element makes the page wider than the viewport. */
export async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
