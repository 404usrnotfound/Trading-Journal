import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ownerEmail = process.env.TEST_OWNER_EMAIL;
const ownerPassword = process.env.TEST_OWNER_PASSWORD;

function ownerCredentials() {
  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      'The provisioned TEST_OWNER_EMAIL and TEST_OWNER_PASSWORD fixture is required.',
    );
  }
  return { email: ownerEmail, password: ownerPassword };
}

test('unauthenticated routes expose only safe platform status', async ({ page, request }) => {
  const live = await request.get('/api/v1/health/live');
  expect(live.status()).toBe(200);
  expect(await live.json()).toEqual({ status: 'ok', service: 'web' });

  const session = await request.get('/api/v1/session');
  expect(session.status()).toBe(200);
  expect(await session.json()).toBeNull();
  expect((await request.get('/api/v1/health/ready')).status()).toBe(401);
  expect((await request.get('/api/v1/workspaces')).status()).toBe(401);

  const signup = await request.post('/api/auth/sign-up/email', {
    data: { email: 'unavailable@example.com', password: 'not-a-real-password' },
  });
  expect(signup.status()).toBe(404);
  expect((await request.get('/api/auth/get-session')).status()).toBe(404);

  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});

test('sign-in foundation is accessible at desktop and mobile sizes in both themes', async ({
  page,
}, testInfo) => {
  await page.goto('/sign-in');
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark'] as const) {
      const opposite = theme === 'light' ? 'dark' : 'light';
      const switchButton = page.getByRole('button', {
        name: `Switch to ${theme} theme`,
      });
      if (await switchButton.isVisible()) await switchButton.click();
      await expect(page.getByRole('button', { name: `Switch to ${opposite} theme` })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`sign-in-${viewport.width}-${theme}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  }
});

test('keyboard navigation validates sign-in and recovers from rejected credentials', async ({
  page,
}) => {
  const credentials = ownerCredentials();
  await page.goto('/sign-in');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email address')).toBeFocused();
  await page.keyboard.insertText('invalid-email');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.insertText(credentials.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content').getByRole('alert')).toHaveText(
    'Enter a valid email address.',
  );
  await expect(page.getByLabel('Email address')).toBeFocused();
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('Email address').fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill('deliberately-incorrect-password');
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.locator('#main-content').getByRole('alert')).toHaveText(
    'Unable to sign in. Check your email and password and try again.',
  );
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  expect(await (await page.request.get('/api/v1/session')).json()).toBeNull();

  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.goto('/?workspace=3bde3609-4c7a-4285-a976-0d29d9d628d0');
  await expect(page.getByRole('heading', { name: 'Workspace not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to your overview' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});

test('real sign-in persists access to the empty foundation and sign-out clears it', async ({
  page,
}, testInfo) => {
  const credentials = ownerCredentials();

  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your journal starts here.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record activity' })).toBeDisabled();
  await expect(
    page.getByText('Not available in the foundation release', { exact: true }),
  ).toBeVisible();

  const session = await page.request.get('/api/v1/session');
  const sessionBody: unknown = await session.json();
  expect(sessionBody).toMatchObject({ user: { email: credentials.email } });
  expect(Object.keys(sessionBody as Record<string, unknown>).sort()).toEqual(['expiresAt', 'user']);
  const ready = await page.request.get('/api/v1/health/ready');
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual({
    status: 'ready',
    database: 'connected',
    schema: 'current',
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark'] as const) {
      const switchButton = page.getByRole('button', { name: `Switch to ${theme} theme` });
      if (await switchButton.isVisible()) await switchButton.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`overview-${viewport.width}-${theme}.png`),
        fullPage: true,
      });
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await (await page.request.get('/api/v1/session')).json()).toBeNull();
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('workspace preferences persist and concurrent edits require a reload', async ({ page }) => {
  const credentials = ownerCredentials();
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();

  await page.getByLabel('Timezone', { exact: true }).fill('Invalid/Timezone');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.locator('#main-content').getByRole('alert')).toHaveText(
    'Enter a valid timezone.',
  );
  await page.getByLabel('Timezone', { exact: true }).fill('Europe/Madrid');
  await page.getByLabel('Reporting currency', { exact: true }).fill('eur');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Preferences saved.');
  await page.reload();
  await expect(page.getByLabel('Timezone', { exact: true })).toHaveValue('Europe/Madrid');
  await expect(page.getByLabel('Reporting currency', { exact: true })).toHaveValue('EUR');

  const otherTab = await page.context().newPage();
  await otherTab.goto('/');
  await otherTab.getByLabel('Timezone', { exact: true }).fill('America/New_York');
  await otherTab.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(otherTab.getByRole('status')).toHaveText('Preferences saved.');
  await page.getByLabel('Timezone', { exact: true }).fill('Asia/Tokyo');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.locator('#main-content').getByRole('alert')).toHaveText(
    'These preferences changed elsewhere. Reload them before saving again.',
  );
  await page.getByRole('button', { name: 'Reload preferences', exact: true }).click();
  await expect(page.getByLabel('Timezone', { exact: true })).toHaveValue('America/New_York');
  await otherTab.close();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel('Email address').fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByLabel('Timezone', { exact: true })).toHaveValue('America/New_York');
  await expect(page.getByLabel('Reporting currency', { exact: true })).toHaveValue('EUR');
});
