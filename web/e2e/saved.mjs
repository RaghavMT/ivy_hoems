// Feature 4: saved listings. Add, remove and list; per user; still there after a
// reload and after logging out and back in. The saved page makes no API calls.
// Budget 12.

import { APP_URL, SLOW, horizontalOverflow, logIn, shot, startSpec } from './lib.mjs';

const spec = await startSpec('saved', 12);
const { newPage, check, finish, apiCount } = spec;

// A narrow filter with a handful of results, so saving needs one page load.
const SMALL = `${APP_URL}/listings?bedrooms=2&min_price=4600000&max_price=4700000`;

async function savedIds(page) {
  await page.locator('.saved-list, .state-panel-empty').first().waitFor(SLOW);
  return page.$$eval('.saved-item', (nodes) => nodes.map((n) => n.getAttribute('data-listing-id')));
}

async function openList(page) {
  await page.goto(SMALL);
  await page.locator('.listing-card').first().waitFor(SLOW);
  return page.$$eval('.listing-card', (nodes) => nodes.map((n) => n.getAttribute('data-listing-id')));
}

async function logOutAndIn(page, email) {
  await page.click('button:has-text("Log out")');
  await page.locator('#login-email').waitFor(SLOW);
  await logIn(page, email, '/saved');
  await page.waitForURL(/\/saved$/, SLOW);
}

try {
  const page = await newPage();
  await logIn(page, 'demo1@ivy.homes', '/saved');

  // Start clean for demo1 on this fresh browser profile.
  check('a new user starts with no saved homes', (await savedIds(page)).length === 0);
  check('the empty state invites browsing', await page.locator('.state-panel-empty:has-text("No saved homes yet")').isVisible());

  // demo1 saves two homes from the list.
  const ids = await openList(page);
  const [first, second, third] = ids;
  await page.click(`[data-listing-id="${first}"] .save-button`);
  await page.click(`[data-listing-id="${second}"] .save-button`);
  check(
    'Save turns into Saved on the card',
    (await page.getAttribute(`[data-listing-id="${first}"] .save-button`, 'aria-pressed')) === 'true',
  );

  const before = apiCount();
  await page.goto(`${APP_URL}/saved`);
  const afterSave = await savedIds(page);
  check('the saved page lists both homes, newest first', afterSave.join() === [second, first].join(), afterSave.join());
  await page.reload();
  check('saved homes survive a reload', (await savedIds(page)).join() === [second, first].join());
  check('the saved page makes no API calls', apiCount() === before, `${apiCount() - before} requests`);
  await page.screenshot({ path: shot('saved-desktop.png') });

  // A different user sees their own list, not demo1's.
  await logOutAndIn(page, 'demo2@ivy.homes');
  check('a second user does not see the first user\'s saved homes', (await savedIds(page)).length === 0);
  await openList(page);
  await page.click(`[data-listing-id="${third}"] .save-button`);
  await page.goto(`${APP_URL}/saved`);
  check('the second user saves their own home', (await savedIds(page)).join() === third);

  // Back to demo1: exactly their two.
  await logOutAndIn(page, 'demo1@ivy.homes');
  check('saved homes survive logging out and back in', (await savedIds(page)).join() === [second, first].join());

  // Remove persists.
  await page.click(`[data-listing-id="${second}"] .saved-remove`);
  check('Remove takes the home off the list', (await savedIds(page)).join() === first);
  await page.reload();
  check('removal survives a reload', (await savedIds(page)).join() === first);

  const stored = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('ivy.saved.'))
      .sort(),
  );
  check('each user has a separate saved list', stored.join() === 'ivy.saved.demo1@ivy.homes,ivy.saved.demo2@ivy.homes', stored.join());

  // The detail page button reflects and changes the same list.
  await page.goto(`${APP_URL}/listings/${first}`);
  await page.locator('.detail-save .save-button').waitFor(SLOW);
  check('the detail page shows the home as saved', (await page.getAttribute('.detail-save .save-button', 'aria-pressed')) === 'true');
  await page.click('.detail-save .save-button');
  check('unsaving on the detail page updates the button', (await page.getAttribute('.detail-save .save-button', 'aria-pressed')) === 'false');
  await page.goto(`${APP_URL}/saved`);
  check('unsaving on the detail page empties the saved list', (await savedIds(page)).length === 0);

  // Phone width, with one saved home to show a row.
  await page.goto(SMALL);
  await page.locator('.listing-card').first().waitFor(SLOW);
  await page.click(`[data-listing-id="${first}"] .save-button`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_URL}/saved`);
  await savedIds(page);
  const overflow = await horizontalOverflow(page);
  check('saved page has no horizontal scroll at 390 px', overflow <= 0, `overflow ${overflow}px`);
  await page.screenshot({ path: shot('saved-phone.png') });

  await finish();
} catch (error) {
  await finish(error);
}
