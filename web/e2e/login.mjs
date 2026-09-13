// Feature 1: login. Real credentials against the real auth flow; the session
// survives a reload, refreshes before expiry, and logout clears it.
// Budget 12. /saved and /insights make no API calls, so reloads there are free.

import { APP_URL, PASSWORD, SLOW, horizontalOverflow, shot, startSpec } from './lib.mjs';

const spec = await startSpec('login', 12, {
  // The deliberate wrong-password attempt: Chrome logs every non-2xx fetch.
  expectedErrors: (e) => e.text.includes('status of 401') && e.url.endsWith('/auth/login'),
});
const { newPage, check, finish } = spec;

try {
  const page = await newPage();
  const session = () => page.evaluate(() => JSON.parse(localStorage.getItem('ivy.session') ?? 'null'));

  // Logged-out deep link goes to login and remembers where to return.
  await page.goto(`${APP_URL}/saved`);
  await page.waitForURL(/\/login\?next=%2Fsaved$/, SLOW);
  check('logged-out visit to a protected page redirects to login with next', true);
  await page.screenshot({ path: shot('login-desktop.png') });

  // Wrong password: a clear message, no session.
  await page.fill('#login-email', 'demo1@ivy.homes');
  await page.fill('#login-password', 'definitely-wrong');
  await page.click('button[type=submit]');
  const error = page.locator('.form-error');
  await error.waitFor(SLOW);
  const errorText = (await error.textContent())?.trim();
  check('wrong password shows an error message', errorText === 'The email or password is incorrect.', errorText);
  check('no session stored after a failed login', (await session()) === null);

  // Real credentials: logged in, back where the user was going.
  await page.fill('#login-password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/saved$/, SLOW);
  await page.locator('.account-email').waitFor(SLOW);
  check('login succeeds and returns to the requested page', true);
  check('header shows the logged-in email', (await page.textContent('.account-email')) === 'demo1@ivy.homes');
  const first = await session();
  const ttl = first ? Math.round((first.expiresAt - Date.now()) / 1000) : null;
  check('session persisted with a ~900 s expiry', ttl !== null && ttl > 800 && ttl <= 900, `${ttl} s left`);

  // A hard refresh keeps the session.
  await page.reload();
  await page.locator('.account-email').waitFor(SLOW);
  check('hard refresh keeps the user logged in', page.url().endsWith('/saved'));

  // Background refresh: pretend the token expires in 61 s, so the keep-alive fires
  // in about a second and must get a new token from the real server.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ivy.session'));
    s.expiresAt = Date.now() + 61_000;
    localStorage.setItem('ivy.session', JSON.stringify(s));
  });
  await page.reload();
  const refreshed = await page
    .waitForFunction(
      (before) => {
        const s = JSON.parse(localStorage.getItem('ivy.session') ?? 'null');
        return s && s.expiresAt - Date.now() > 800_000 && s.accessToken !== before;
      },
      first.accessToken,
      { ...SLOW, polling: 500 },
    )
    .then(() => true, () => false);
  check('keep-alive refreshes the token before it expires', refreshed);

  // Logout from a protected page lands on login and forgets the tokens.
  await page.click('button:has-text("Log out")');
  await page.locator('#login-email').waitFor(SLOW);
  check('logout from a protected page shows the login form', /\/login/.test(page.url()), page.url());
  check('logout clears the stored session', (await session()) === null);

  // Deep link to listings while logged out, as a second user.
  await page.goto(`${APP_URL}/listings`);
  await page.waitForURL(/\/login\?next=%2Flistings$/, SLOW);
  await page.fill('#login-email', 'demo2@ivy.homes');
  await page.fill('#login-password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/listings$/, SLOW);
  check('login from a deep link returns to that page', true);
  check('second demo user is logged in as themselves', (await page.textContent('.account-email')) === 'demo2@ivy.homes');

  // A crafted next= can't send the user to another site.
  await page.click('button:has-text("Log out")');
  await page.locator('#login-email').waitFor(SLOW);
  await page.goto(`${APP_URL}/login?next=${encodeURIComponent('//evil.example')}`);
  await page.fill('#login-email', 'demo1@ivy.homes');
  await page.fill('#login-password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/listings$/, SLOW);
  check('crafted next= stays on the site', new URL(page.url()).host === new URL(APP_URL).host, page.url());

  // Logging out on a public page keeps the user there.
  await page.goto(`${APP_URL}/insights`);
  await page.click('button:has-text("Log out")');
  await page.locator('a.btn:has-text("Log in")').waitFor(SLOW);
  check('logout on a public page stays there and offers Log in', page.url().endsWith('/insights'));

  const phone = await newPage({ width: 390, height: 844 });
  await phone.goto(`${APP_URL}/login`);
  await phone.locator('#login-email').waitFor(SLOW);
  const overflow = await horizontalOverflow(phone);
  check('login page has no horizontal scroll at 390 px', overflow <= 0, `overflow ${overflow}px`);
  await phone.screenshot({ path: shot('login-phone.png'), fullPage: true });

  await finish();
} catch (error) {
  await finish(error);
}
