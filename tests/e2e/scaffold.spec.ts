import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ownerEmail = process.env.TEST_OWNER_EMAIL;
const ownerPassword = process.env.TEST_OWNER_PASSWORD;

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

test('real sign-in persists access to the empty foundation and sign-out clears it', async ({
  page,
}, testInfo) => {
  if (!ownerEmail || !ownerPassword) {
    throw new Error(
      'The provisioned TEST_OWNER_EMAIL and TEST_OWNER_PASSWORD fixture is required.',
    );
  }

  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(ownerEmail);
  await page.getByLabel('Password', { exact: true }).fill(ownerPassword);
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
  expect(sessionBody).toMatchObject({ user: { email: ownerEmail } });
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
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`overview-${viewport.width}.png`),
      fullPage: true,
    });
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
