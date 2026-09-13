// Feature 5, rentals half: browsable, with correct prices and correct areas.
// Filters change results; three records are spot-checked against the dump,
// including a deposit served as months (H-036) and a title that names the wrong
// locality (H-022). Budget 8.

import { APP_URL, SLOW, horizontalOverflow, logIn, readRecords, shot, startSpec } from './lib.mjs';

const spec = await startSpec('rentals', 8);
const { newPage, check, finish } = spec;

const rentals = readRecords('v1_rentals.json');
const byId = (id) => rentals.find((r) => r.listing_id === id);
const inr = (n) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;
const titleCase = (s) => s.replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

async function cards(page) {
  await page.locator('.results-summary, .state-panel-empty, .state-panel-error').first().waitFor(SLOW);
  return page.$$eval('.listing-card', (nodes) =>
    nodes.map((n) => ({
      title: n.querySelector('.listing-title')?.textContent?.trim() ?? '',
      locality: n.querySelector('[data-field="locality"]')?.textContent?.trim() ?? '',
      furnishing: n.querySelector('[data-field="furnishing"]')?.textContent?.trim() ?? '',
      rent: n.querySelector('[data-field="rent"]')?.textContent?.trim() ?? '',
    })),
  );
}

async function settleList(page, action) {
  const response = page.waitForResponse((r) => r.url().includes('/v1/rentals') && r.request().method() === 'GET', SLOW);
  await action();
  await response;
  await page.locator('.state-panel-loading').waitFor({ state: 'detached', ...SLOW });
  return cards(page);
}

const text = (page, selector) => page.textContent(selector).then((t) => t?.replace(/\s+/g, ' ').trim() ?? '');

async function openDetail(page, id) {
  await page.goto(`${APP_URL}/rentals/${id}`);
  await page.locator('.detail-title').waitFor(SLOW);
}

try {
  const page = await newPage();
  await logIn(page, 'demo1@ivy.homes');

  let shown = await settleList(page, () => page.goto(`${APP_URL}/rentals`));
  check('rentals load', shown.length === 50, `${shown.length} cards`);
  check('every rent is labelled per month', shown.every((c) => c.rent.endsWith('a month')));
  check('summary says more are available', (await text(page, '.results-summary')) === 'Showing 50 rentals so far');
  await page.screenshot({ path: shot('rentals-desktop.png') });

  shown = await settleList(page, () => page.selectOption('#rental-filter-locality', 'madhapur'));
  check('locality filter: every card is in Madhapur', shown.length > 0 && shown.every((c) => c.locality === 'Madhapur'), `${shown.length} cards`);
  check('locality filter is written to the address bar', page.url().includes('locality=madhapur'));

  shown = await settleList(page, () => page.goto(`${APP_URL}/rentals?bedrooms=3`));
  check('bedrooms filter: every card is 3 BHK', shown.length > 0 && shown.every((c) => c.title.startsWith('3 BHK')), `${shown.length} cards`);

  shown = await settleList(page, () => page.goto(`${APP_URL}/rentals?furnishing=semi-furnished`));
  check('furnishing filter: every card is semi-furnished', shown.length > 0 && shown.every((c) => c.furnishing === 'Semi-furnished'), `${shown.length} cards`);

  await page.setViewportSize({ width: 390, height: 844 });
  check('rentals list has no horizontal scroll at 390 px', (await horizontalOverflow(page)) <= 0);
  await page.screenshot({ path: shot('rentals-phone.png') });
  await page.setViewportSize({ width: 1366, height: 860 });

  // Spot check 1: the seller's title names a different locality from the structured field.
  const r1 = byId('R2000001');
  await openDetail(page, r1.listing_id);
  check('R2000001 rent matches the dump', (await text(page, '[data-field="rent"]')) === `${inr(r1.price)} a month`, await text(page, '[data-field="rent"]'));
  check('R2000001 deposit matches the dump', (await text(page, '[data-field="deposit"]')) === inr(r1.deposit));
  check('R2000001 carpet area in sq ft', (await text(page, '[data-field="carpet"]')) === `${new Intl.NumberFormat('en-IN').format(r1.carpet_area)} sq ft`);
  check('R2000001 uses the locality field, not the seller title', (await text(page, '.detail-sub [data-field="locality"]')) === titleCase(r1.locality));
  check('R2000001 heading is not the seller title', !(await text(page, '.detail-title')).includes('Madhapur'));
  check('R2000001 shows the seller title as seller text', (await text(page, '[data-field="seller-title"]')) === r1.title);
  check('R2000001 explains the locality disagreement', (await text(page, '.detail-note')).includes('names a different locality'));
  await page.screenshot({ path: shot('rental-detail-desktop.png'), fullPage: true });

  // Spot check 2: a deposit served as a number of months.
  const r2 = byId('R2000514');
  await openDetail(page, r2.listing_id);
  check('R2000514 deposit converted from 6 months to rupees', (await text(page, '[data-field="deposit"]')) === inr(r2.deposit * r2.price), await text(page, '[data-field="deposit"]'));
  check('R2000514 says how many months', (await text(page, '.detail-fact-note')) === `${r2.deposit} months of rent`);
  check('R2000514 carries the converted label', await page.locator('.badge:has-text("Deposit converted from months")').isVisible());

  // Spot check 3: the highest rent in the city.
  const r3 = rentals.reduce((a, b) => (b.price > a.price ? b : a));
  await openDetail(page, r3.listing_id);
  check('highest rent matches the dump', (await text(page, '[data-field="rent"]')) === `${inr(r3.price)} a month`, `${r3.listing_id} ${await text(page, '[data-field="rent"]')}`);
  check('highest-rent deposit matches the dump', (await text(page, '[data-field="deposit"]')) === inr(r3.deposit));
  await page.setViewportSize({ width: 390, height: 844 });
  check('rental detail has no horizontal scroll at 390 px', (await horizontalOverflow(page)) <= 0);
  await page.screenshot({ path: shot('rental-detail-phone.png'), fullPage: true });

  await finish();
} catch (error) {
  await finish(error);
}
