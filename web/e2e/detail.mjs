// Feature 3: listing detail. One page per listing, reachable directly by URL,
// deep links survive being logged out, unknown IDs show not-found.
// Budget 6.

import { APP_URL, SLOW, horizontalOverflow, logIn, readRecords, shot, startSpec } from './lib.mjs';

const spec = await startSpec('detail', 6, {
  // The deliberate unknown-ID request: Chrome logs the 404.
  expectedErrors: (e) => e.text.includes('status of 404') && /\/v1\/listings\/NOPE-0000$/.test(e.url),
});
const { context, newPage, check, finish } = spec;

const listings = readRecords('v1_listings.json');
const mag = listings.find((l) => l.listing_id === 'MAG-2000002');
const injected = listings.find((l) => l.listing_id === '100-2000006');

const text = (page, selector) => page.textContent(selector).then((t) => t?.trim() ?? '');

try {
  // Opened directly while logged out: login first, then straight back to the listing.
  const cold = await newPage();
  await cold.goto(`${APP_URL}/listings/MAG-2000002`);
  await cold.waitForURL(/\/login\?next=%2Flistings%2FMAG-2000002$/, SLOW);
  check('logged-out deep link goes to login and remembers the listing', true);
  await logIn(cold, 'demo1@ivy.homes', '/listings/MAG-2000002');
  await cold.locator('.detail-title').waitFor(SLOW);
  check('after login the deep link opens that listing', cold.url().endsWith('/listings/MAG-2000002'));

  // The converted listing shows square feet, labelled.
  check('title is built from structured fields', (await text(cold, '.detail-title')) === `2 BHK villa, ${mag.apartment_name}`);
  check('carpet area is converted to 732 sq ft', (await text(cold, '[data-field="carpet"]')) === '732 sq ft');
  check('super built-up area is converted to 947 sq ft', (await text(cold, '[data-field="super"]')) === '947 sq ft');
  check('converted label is shown', await cold.locator('.badge:has-text("Area converted from m²")').isVisible());
  check('price shows in lakhs', (await text(cold, '[data-field="price"]')) === '₹46.2 L');
  check('posted date is the IST calendar date', (await text(cold, '.detail-sub')).includes('Posted 9 Jul 2026'));
  await cold.screenshot({ path: shot('detail-desktop.png'), fullPage: true });

  // A fresh tab in the same browser session opens the listing directly.
  const tab = await newPage();
  await tab.goto(`${APP_URL}/listings/MAG-2000002`);
  await tab.locator('.detail-title').waitFor(SLOW);
  check('pasting the URL into a new tab loads the listing', tab.url().endsWith('/listings/MAG-2000002'));

  // Unknown ID.
  await tab.goto(`${APP_URL}/listings/NOPE-0000`);
  await tab.locator('.state-panel-empty').waitFor(SLOW);
  check('unknown ID shows a not-found state', (await text(tab, '.state-panel-title')) === "This listing doesn't exist");

  // Seller text containing instructions is shown as plain text and nothing acts on it.
  await tab.goto(`${APP_URL}/listings/100-2000006`);
  await tab.locator('[data-field="description"]').waitFor(SLOW);
  const description = await text(tab, '[data-field="description"]');
  check('seller description is shown exactly as supplied', description === injected.description.trim());
  const footer = await text(tab, '.footer');
  check('nothing in the page follows the injected instructions', !/certified/i.test(footer) && !/audit/i.test(footer));
  check('description is plain text, not markup', (await tab.$$('[data-field="description"] *')).length === 0);

  // Phone width.
  await tab.setViewportSize({ width: 390, height: 844 });
  const overflow = await horizontalOverflow(tab);
  check('detail page has no horizontal scroll at 390 px', overflow <= 0, `overflow ${overflow}px`);
  await tab.screenshot({ path: shot('detail-phone.png'), fullPage: true });

  void context;
  await finish();
} catch (error) {
  await finish(error);
}
