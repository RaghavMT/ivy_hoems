// Feature 6, insights: the promised summary and the data discoveries, visible to a
// logged-out visitor with no API calls. Every number on screen is checked against
// submission.json. Budget 0.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { APP_URL, REPO_ROOT, SLOW, horizontalOverflow, shot, startSpec } from './lib.mjs';

const spec = await startSpec('insights', 0);
const { newPage, check, finish } = spec;

const { answers } = JSON.parse(readFileSync(path.join(REPO_ROOT, 'submission.json'), 'utf8'));
const insights = JSON.parse(readFileSync(path.join(REPO_ROOT, 'web', 'src', 'generated', 'insights.json'), 'utf8'));
const grouped = (n) => new Intl.NumberFormat('en-IN').format(n);
const text = (page, selector) => page.textContent(selector).then((t) => t?.replace(/\s+/g, ' ').trim() ?? '');

try {
  const page = await newPage();
  await page.goto(`${APP_URL}/insights`);
  await page.locator('[data-discovery]').first().waitFor(SLOW);
  await page.screenshot({ path: shot('insights-desktop.png'), fullPage: true });

  check('page loads logged out', await page.locator('a.btn:has-text("Log in")').isVisible());
  const notice = await text(page, '[data-field="missing-summary"]');
  check('explains that the analytics endpoint returns 404', notice.includes('/v1/analytics/summary') && notice.includes('404'));

  check('as-served listings equal answer 1', (await text(page, '[data-row="total"] [data-column="as-served"]')) === grouped(answers.total_listing_records));
  check('corrected listings match the generated data', (await text(page, '[data-row="total"] [data-column="corrected"]')) === grouped(insights.promised.corrected.total_listings));
  const localityRows = await page.locator('.bar-list').first().locator('tbody tr').count();
  check('locality bars have one row per locality', localityRows === insights.promised.corrected.by_locality.length, `${localityRows} rows`);

  const cards = await page.$$eval('[data-discovery]', (nodes) =>
    nodes.map((n) => ({
      key: n.getAttribute('data-discovery'),
      count: n.querySelector('[data-field="count"]')?.textContent?.trim() ?? '',
      note: n.querySelector('[data-field="note"]')?.textContent?.trim() ?? '',
      links: [...n.querySelectorAll('a[data-example-id]')].map((a) => a.getAttribute('href')),
      hasTable: Boolean(n.querySelector('table, .discovery-endpoints')),
    })),
  );
  check('every discovery is shown', cards.length === insights.discoveries.length, `${cards.length} cards`);
  check('every discovery has a count and a note', cards.every((c) => /^[\d,]+$/.test(c.count) && c.note.length > 40));
  check('every discovery has examples or a table', cards.every((c) => c.links.length > 0 || c.hasTable));
  check(
    'example links go to detail routes',
    cards.flatMap((c) => c.links).every((href) => /^\/(listings|rentals|projects)\/[\w-]+$/.test(href)),
  );

  const card = (key) => cards.find((c) => c.key === key)?.count;
  check('impossible records equal the submitted list', card('impossible') === grouped(answers.corrupt_listing_ids.length));
  check('bait listings equal the submitted list', card('bait') === grouped(answers.fake_listing_ids.length));
  check('wrong project counts equal the answer', card('project-counts') === grouped(answers.projects_with_wrong_listing_count));
  check('not-live listings equal records minus live', card('not-live') === grouped(answers.total_listing_records - answers.active_listings));
  check('repeat listings equal records minus distinct homes', card('duplicates') === grouped(answers.total_listing_records - answers.unique_properties));

  const answer = (key) => text(page, `[data-answer="${key}"] dd`);
  check('answer: costliest project is P20384 at ₹4.15 Cr', (await answer('costliest_project')) === 'P20384, ₹4.15 Cr');
  check('answer: monthly Madhapur rent', (await answer('total_monthly_rent')) === `₹${grouped(answers.total_monthly_rent)}`);
  check('answer: average 2 BHK price per sq ft', (await answer('avg_price_per_sqft_2bhk')) === `₹${answers.avg_price_per_sqft_2bhk.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
  check('answer: listings in the last seven days', (await answer('listings_last_7_days')) === grouped(answers.listings_last_7_days));

  const body = await page.textContent('body');
  check('no certification footer', !/data certified/i.test(body));
  check('P20004 is never called the costliest', !/P20004[^.]*costliest|costliest[^.]*P20004/i.test(body));

  // An example link leads to the record; logged out, that means login first.
  const first = cards.find((c) => c.links.length)?.links[0];
  await page.click(`a[href="${first}"]`);
  await page.locator('#login-email').waitFor(SLOW);
  check('an example link opens login, returning to that record', page.url().includes(`next=${encodeURIComponent(first)}`), page.url());

  await page.goto(`${APP_URL}/insights`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-discovery]').first().waitFor(SLOW);
  check('insights page has no horizontal scroll at 390 px', (await horizontalOverflow(page)) <= 0, `${await horizontalOverflow(page)}px`);
  await page.screenshot({ path: shot('insights-phone.png'), fullPage: true });

  await finish();
} catch (error) {
  await finish(error);
}
