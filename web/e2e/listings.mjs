// Feature 2: browse listings. Every filter changes the results, filters combine,
// the count shown is the count after filtering, paging reaches the end without
// repeats, and filters survive a reload.
// Budget 15. Each navigation or filter change is one request.

import { API_URL, APP_URL, SLOW, horizontalOverflow, logIn, readRecords, shot, startSpec } from './lib.mjs';

const spec = await startSpec('listings', 15);
const { newPage, check, finish } = spec;

// Expected counts come from the committed dump, filtered exactly as the server does.
const listings = readRecords('v1_listings.json');
const countWhere = (predicate) => listings.filter(predicate).length;

function rupees(text) {
  const t = text.replace(/[₹,\s]/g, '');
  if (t.endsWith('Cr')) return Math.round(parseFloat(t) * 1e7);
  if (t.endsWith('L')) return Math.round(parseFloat(t) * 1e5);
  return Number(t);
}

/** Runs an action that triggers a listings request, then waits for the page to settle. */
async function settle(page, action) {
  const response = page.waitForResponse(
    (r) => r.url().startsWith(`${API_URL}/v1/listings`) && r.request().method() === 'GET',
    SLOW,
  );
  await action();
  await response;
  await page.locator('.state-panel-loading').waitFor({ state: 'detached', ...SLOW });
  await page.locator('.results-summary, .state-panel-empty, .state-panel-error').first().waitFor(SLOW);
}

async function cards(page) {
  return page.$$eval('.listing-card', (nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-listing-id'),
      title: n.querySelector('.listing-title')?.textContent?.trim() ?? '',
      locality: n.querySelector('[data-field="locality"]')?.textContent?.trim() ?? '',
      furnishing: n.querySelector('[data-field="furnishing"]')?.textContent?.trim() ?? '',
      price: n.querySelector('[data-field="price"]')?.textContent?.trim() ?? '',
      area: n.querySelector('[data-field="area"]')?.textContent?.trim() ?? '',
      badges: [...n.querySelectorAll('.badge')].map((b) => b.textContent?.trim()),
    })),
  );
}

const summary = (page) => page.textContent('.results-summary').then((t) => t?.trim());

try {
  const page = await newPage();
  // Lands on /insights, which makes no API calls.
  await logIn(page, 'demo1@ivy.homes');

  // 1. The unfiltered list.
  await settle(page, () => page.goto(`${APP_URL}/listings`));
  let shown = await cards(page);
  check('listings load', shown.length === 50, `${shown.length} cards`);
  check('summary says more are available', (await summary(page)) === 'Showing 50 homes so far', await summary(page));
  check('Load more is offered', await page.locator('button:has-text("Load more homes")').isVisible());
  await page.screenshot({ path: shot('listings-desktop.png') });

  // 2. Locality through the select.
  await settle(page, () => page.selectOption('#filter-locality', 'kompally'));
  shown = await cards(page);
  check('locality filter: every card is in Kompally', shown.length > 0 && shown.every((c) => c.locality === 'Kompally'), `${shown.length} cards`);
  check('locality filter is written to the address bar', page.url().includes('locality=kompally'));

  // 3. Bedrooms from the address bar.
  await settle(page, () => page.goto(`${APP_URL}/listings?bedrooms=5`));
  shown = await cards(page);
  check('bedrooms filter: every card is 5 BHK', shown.length > 0 && shown.every((c) => c.title.startsWith('5 BHK')), `${shown.length} cards`);
  check('bedrooms select reflects the address bar', (await page.inputValue('#filter-bedrooms')) === '5');

  // 4. Price range through the inputs and Apply.
  await settle(page, () => page.goto(`${APP_URL}/listings`));
  await page.fill('#filter-min-price', '6000000');
  await page.fill('#filter-max-price', '7000000');
  await settle(page, () => page.click('button:has-text("Apply")'));
  shown = await cards(page);
  check(
    'price filter: every card is between ₹60 L and ₹70 L',
    shown.length > 0 && shown.every((c) => rupees(c.price) >= 6_000_000 && rupees(c.price) <= 7_000_000),
    shown.slice(0, 3).map((c) => c.price).join(', '),
  );
  check('price filter is written to the address bar', /min_price=6000000/.test(page.url()) && /max_price=7000000/.test(page.url()));

  // 5. Furnishing from the address bar.
  await settle(page, () => page.goto(`${APP_URL}/listings?furnishing=unfurnished`));
  shown = await cards(page);
  check('furnishing filter: every card is unfurnished', shown.length > 0 && shown.every((c) => c.furnishing === 'Unfurnished'), `${shown.length} cards`);

  // 6. Filters combine.
  const combined = `${APP_URL}/listings?locality=madhapur&bedrooms=2&max_price=10000000`;
  const combinedExpected = countWhere((l) => l.locality === 'madhapur' && l.bedroom === 2 && l.price <= 10_000_000);
  await settle(page, () => page.goto(combined));
  shown = await cards(page);
  check(
    'combined filter: every card matches all three',
    shown.length > 0 && shown.every((c) => c.locality === 'Madhapur' && c.title.startsWith('2 BHK') && rupees(c.price) <= 10_000_000),
    `${shown.length} cards, ${combinedExpected} in the dump`,
  );
  check('combined filter summary', (await summary(page)) === (combinedExpected > 50 ? 'Showing 50 homes so far' : `All ${combinedExpected} matching homes shown`), await summary(page));

  // 7. Filters survive a reload.
  await settle(page, () => page.reload());
  shown = await cards(page);
  check(
    'reload keeps the filters in the controls',
    (await page.inputValue('#filter-locality')) === 'madhapur' &&
      (await page.inputValue('#filter-bedrooms')) === '2' &&
      (await page.inputValue('#filter-max-price')) === '10000000',
  );
  check('reload keeps the filtered results', shown.length > 0 && shown.every((c) => c.locality === 'Madhapur' && c.title.startsWith('2 BHK')));

  // 8. Paging reaches the end with no repeats, and the count equals the dump.
  const smallExpected = countWhere((l) => l.locality === 'kompally' && l.bedroom === 4);
  await settle(page, () => page.goto(`${APP_URL}/listings?locality=kompally&bedrooms=4`));
  await settle(page, () => page.click('button:has-text("Load more homes")'));
  await page.locator('button:has-text("Loading")').waitFor({ state: 'detached', ...SLOW });
  shown = await cards(page);
  const ids = shown.map((c) => c.id);
  check('load more reaches the end', (await summary(page)) === `All ${smallExpected} matching homes shown`, await summary(page));
  check('every matching listing is shown exactly once', ids.length === smallExpected && new Set(ids).size === ids.length, `${ids.length} shown, ${new Set(ids).size} unique, ${smallExpected} in the dump`);
  check('no Load more button at the end', !(await page.locator('button:has-text("Load more homes")').count()));

  // 9. Empty results, then Clear filters.
  await settle(page, () => page.goto(`${APP_URL}/listings?bedrooms=5&max_price=3000000`));
  check('impossible filter shows the empty state', await page.locator('.state-panel-empty:has-text("No homes match these filters")').isVisible());
  await settle(page, () => page.click('a:has-text("Clear filters")'));
  check('Clear filters returns to all listings', new URL(page.url()).search === '' && (await cards(page)).length > 0);

  // 10. Converted areas are labelled.
  const bandExpected = countWhere((l) => l.bedroom === 2 && l.price >= 4_600_000 && l.price <= 4_700_000);
  await settle(page, () => page.goto(`${APP_URL}/listings?bedrooms=2&min_price=4600000&max_price=4700000`));
  shown = await cards(page);
  const mag = shown.find((c) => c.id === 'MAG-2000002');
  check('narrow filter shows every match', (await summary(page)) === `All ${bandExpected} matching homes shown`, await summary(page));
  check('MAG-2000002 area is converted to 732 sq ft', mag?.area === '732 sq ft carpet', mag?.area);
  check('MAG-2000002 carries the converted label', Boolean(mag?.badges.includes('Converted from m²')), mag?.badges.join(', '));

  // 11. Phone width.
  const phone = await newPage({ width: 390, height: 844 });
  await settle(phone, () => phone.goto(`${APP_URL}/listings`));
  const overflow = await horizontalOverflow(phone);
  check('listings page has no horizontal scroll at 390 px', overflow <= 0, `overflow ${overflow}px`);
  await phone.screenshot({ path: shot('listings-phone.png') });

  await finish();
} catch (error) {
  await finish(error);
}
