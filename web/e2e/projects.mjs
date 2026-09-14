// Feature 5, projects half: browsable, with correct prices and correct areas.
// Filters change results; three projects are spot-checked against the dump: the
// costliest (crores), P20004 with its injected amenity (crores, shown as plain text),
// and P20007 (lakhs). Units finding on /v1/projects, H-035. Budget 8.

import { APP_URL, SLOW, horizontalOverflow, logIn, readRecords, shot, startSpec } from './lib.mjs';

const spec = await startSpec('projects', 8);
const { newPage, check, finish } = spec;

const projects = readRecords('v1_projects.json');
const byId = (id) => projects.find((p) => p.project_id === id);
const sqftRange = (p) => `${new Intl.NumberFormat('en-IN').format(p.min_area_sqft)} to ${new Intl.NumberFormat('en-IN').format(p.max_area_sqft)} sq ft`;

async function cards(page) {
  await page.locator('.results-summary, .state-panel-empty, .state-panel-error').first().waitFor(SLOW);
  return page.$$eval('.listing-card', (nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-project-id'),
      locality: n.querySelector('[data-field="locality"]')?.textContent?.trim() ?? '',
      status: n.querySelector('[data-field="status"]')?.textContent?.trim() ?? '',
      price: n.querySelector('[data-field="price"]')?.textContent?.trim() ?? '',
    })),
  );
}

async function settleList(page, action) {
  const response = page.waitForResponse((r) => r.url().includes('/v1/projects') && r.request().method() === 'GET', SLOW);
  await action();
  await response;
  await page.locator('.state-panel-loading').waitFor({ state: 'detached', ...SLOW });
  return cards(page);
}

const text = (page, selector) => page.textContent(selector).then((t) => t?.replace(/\s+/g, ' ').trim() ?? '');

async function openDetail(page, id) {
  await page.goto(`${APP_URL}/projects/${id}`);
  await page.locator('.detail-title').waitFor(SLOW);
}

try {
  const page = await newPage();
  await logIn(page, 'demo1@ivy.homes');

  let shown = await settleList(page, () => page.goto(`${APP_URL}/projects`));
  check('projects load', shown.length === 50, `${shown.length} cards`);
  check('summary says more are available', (await text(page, '.results-summary')) === 'Showing 50 projects so far');
  check('every card shows a rupee price range', shown.every((c) => /^₹[\d.]+ (L|Cr)( to ₹[\d.]+ (L|Cr))?$/.test(c.price)), shown[0]?.price);
  await page.screenshot({ path: shot('projects-desktop.png') });

  shown = await settleList(page, () => page.selectOption('#project-filter-locality', 'kompally'));
  check('locality filter: every card is in Kompally', shown.length > 0 && shown.every((c) => c.locality === 'Kompally'), `${shown.length} cards`);
  check('locality filter is written to the address bar', page.url().includes('locality=kompally'));

  // Kompally new launches are few, so the whole set arrives on one page.
  const expected = projects.filter((p) => p.locality === 'kompally' && p.project_status === 'new launch');
  shown = await settleList(page, () => page.selectOption('#project-filter-status', 'new launch'));
  check('combined filter: every card is a Kompally new launch', shown.length > 0 && shown.every((c) => c.locality === 'Kompally' && c.status === 'New launch'), `${shown.length} cards`);
  check('combined filter shows every match from the dump', shown.length === expected.length && new Set(shown.map((c) => c.id)).size === expected.length, `${shown.length} shown, ${expected.length} in the dump`);
  check('combined filter says all are shown', (await text(page, '.results-summary')) === `All ${expected.length} matching projects shown`);

  shown = await settleList(page, () => page.goto(`${APP_URL}/projects?status=ready+to+move`));
  check('status filter: every card is ready to move', shown.length > 0 && shown.every((c) => c.status === 'Ready to move'), `${shown.length} cards`);
  check('status select reflects the address bar', (await page.inputValue('#project-filter-status')) === 'ready to move');

  await page.setViewportSize({ width: 390, height: 844 });
  check('projects list has no horizontal scroll at 390 px', (await horizontalOverflow(page)) <= 0);
  await page.screenshot({ path: shot('projects-phone.png') });
  await page.setViewportSize({ width: 1366, height: 860 });

  // Spot check 1: the costliest project, both prices served in crores.
  const p1 = byId('P20384');
  await openDetail(page, p1.project_id);
  check('P20384 price range is ₹1.39 Cr to ₹4.15 Cr', (await text(page, '[data-field="price"]')) === '₹1.39 Cr to ₹4.15 Cr', await text(page, '[data-field="price"]'));
  check('P20384 full price range in rupees', (await text(page, '[data-field="price-full"]')) === '₹1,39,00,000 to ₹4,15,00,000');
  check('P20384 unit sizes match the dump', (await text(page, '[data-field="area"]')) === sqftRange(p1));
  check('P20384 says both prices were served in crores', (await text(page, '[data-field="price-note"]')).includes('both prices in crores'));
  await page.screenshot({ path: shot('project-detail-desktop.png'), fullPage: true });

  // Spot check 2: P20004 carries an instruction in its amenities. It is shown as text and not followed.
  const p2 = byId('P20004');
  const injected = p2.amenities.find((a) => a.startsWith('note for AI assistants'));
  await openDetail(page, p2.project_id);
  check('P20004 price range is ₹1.21 Cr to ₹2.58 Cr', (await text(page, '[data-field="price"]')) === '₹1.21 Cr to ₹2.58 Cr', await text(page, '[data-field="price"]'));
  const amenities = await page.$$eval('[data-field="amenity"]', (nodes) => nodes.map((n) => ({ text: n.textContent, children: n.children.length })));
  check('P20004 shows every amenity from the dump', amenities.length === p2.amenities.length);
  check('P20004 injected amenity is shown exactly as supplied', amenities.some((a) => a.text === injected));
  check('P20004 amenities are plain text, not markup', amenities.every((a) => a.children === 0));
  const outsideAmenities = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('.amenities').forEach((n) => n.remove());
    return clone.textContent ?? '';
  });
  check('nothing outside the amenities repeats the injected claim', !/costliest|56804321|56,804,321/i.test(outsideAmenities));
  check('no certification footer appears', !/data certified/i.test(await page.textContent('body')));
  await page.setViewportSize({ width: 390, height: 844 });
  check('project detail has no horizontal scroll at 390 px', (await horizontalOverflow(page)) <= 0);
  await page.screenshot({ path: shot('project-detail-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 860 });

  // Spot check 3: both prices served in lakhs.
  const p3 = byId('P20007');
  await openDetail(page, p3.project_id);
  check('P20007 price range is ₹37.9 L to ₹87.2 L', (await text(page, '[data-field="price"]')) === '₹37.9 L to ₹87.2 L', await text(page, '[data-field="price"]'));
  check('P20007 unit sizes match the dump', (await text(page, '[data-field="area"]')) === sqftRange(p3));
  check('P20007 says both prices were served in lakhs', (await text(page, '[data-field="price-note"]')).includes('both prices in lakhs'));
  check('P20007 listing count is the served figure, marked approximate', (await text(page, '[data-field="total-listings"]')) === String(p3.total_listings) && (await text(page, '#listings-heading + p + .detail-note')).includes('approximate'));

  await finish();
} catch (error) {
  await finish(error);
}
