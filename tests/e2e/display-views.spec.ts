import { expect, test } from '@playwright/test';
import * as c from '@journal/contracts';
import { createBrowserOwner } from './owner-fixture.js';

test('a private journal view and chosen fields survive a browser reload', async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.goto('/sign-in');
  const origin = new URL(page.url()).origin;
  const { email, password } = await createBrowserOwner(origin);
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  const workspace = c.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0]!;
  await page.goto(`/journal?workspace=${workspace.id}`);
  await page.getByText('Saved views and visible columns', { exact: true }).click();
  const classification = page.getByRole('checkbox', { name: 'Classification', exact: true });
  await expect(classification).toBeEnabled();
  await classification.uncheck();
  const [columns] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/display-views/journal'),
    ),
    page.getByRole('button', { name: 'Save column preferences', exact: true }).click(),
  ]);
  expect(columns.status(), await columns.text()).toBe(200);
  await page.getByLabel('Find a trade', { exact: true }).fill('Independent review scope');
  await page.getByLabel('Saved view name', { exact: true }).fill('Next review');
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/display-views/journal'),
    ),
    page.getByRole('button', { name: 'Save current filters as view', exact: true }).click(),
  ]);
  expect(saved.status(), await saved.text()).toBe(200);
  const result = c.displayViewResponseSchema.parse(await saved.json());
  expect(result.settings.columns).not.toContain('classification');
  const view = result.settings.views.find((entry) => entry.name === 'Next review')!;
  expect(view.filters.search).toBe('Independent review scope');
  await page.reload();
  await page.getByText('Saved views and visible columns', { exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Classification', exact: true }),
  ).not.toBeChecked();
  await page.getByLabel('Your saved journal view', { exact: true }).selectOption(view.id);
  await page.getByLabel('Find a trade', { exact: true }).fill('Another scope');
  await page.getByRole('button', { name: 'Apply saved view', exact: true }).click();
  await expect(page.getByLabel('Find a trade', { exact: true })).toHaveValue(
    'Independent review scope',
  );
});
