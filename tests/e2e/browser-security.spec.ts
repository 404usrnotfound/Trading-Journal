import { expect, test } from '@playwright/test';

test('private documents hydrate under nonce CSP while untrusted scripts and framing remain blocked', async ({
  page,
  request,
}) => {
  const first = await page.goto('/sign-in');
  expect(first).not.toBeNull();
  const firstHeaders = await first!.allHeaders();
  const nonce = firstHeaders['content-security-policy']?.match(/'nonce-([^']+)'/u)?.[1];
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/u);
  expect(firstHeaders['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(firstHeaders['content-security-policy']).not.toContain("'unsafe-eval'");
  expect(firstHeaders['x-frame-options']).toBe('DENY');
  expect(firstHeaders['x-content-type-options']).toBe('nosniff');
  expect(firstHeaders['referrer-policy']).toBe('no-referrer');
  expect(firstHeaders['cache-control']).toContain('no-store');
  // Test runtime is loopback HTTP. The production HTTPS deployment enables HSTS separately.
  expect(firstHeaders['strict-transport-security']).toBeUndefined();
  const nonces = await page
    .locator('script')
    .evaluateAll((scripts) => scripts.map((script) => script.nonce));
  expect(nonces.length).toBeGreaterThan(0);
  expect(nonces.every((value) => value === nonce)).toBe(true);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // strict-dynamic deliberately trusts scripts inserted by authorized JavaScript.
  // CDP page.evaluate is privileged execution, so inserting a script there does not
  // simulate hostile HTML. Inject parser markup into real server HTML while keeping
  // its actual CSP and nonce; the broken data image needs no network request.
  await page.addInitScript(() => {
    const target = window as typeof window & { securityFixtureViolations: string[] };
    target.securityFixtureViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      target.securityFixtureViolations.push(event.effectiveDirective);
    });
  });
  await page.route('**/sign-in?security-injection-fixture=1', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const headers = response.headers();
    // route.fetch has decompressed the body; preserve the policy, not transport encoding.
    delete headers['content-length'];
    delete headers['content-encoding'];
    delete headers['transfer-encoding'];
    await route.fulfill({
      status: response.status(),
      headers,
      body: html
        .replace('</head>', '<script>window.injectedScriptExecuted = true</script></head>')
        .replace(
          '<body>',
          '<body><img src="data:image/png;base64,invalid" onerror="window.injectedAttributeExecuted = true">',
        ),
    });
  });
  await page.goto('/sign-in?security-injection-fixture=1');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { securityFixtureViolations: string[] })
            .securityFixtureViolations,
      ),
    )
    .toEqual(expect.arrayContaining(['script-src-elem', 'script-src-attr']));
  const result = await page.evaluate(() => {
    const target = window as typeof window & {
      injectedScriptExecuted?: boolean;
      injectedAttributeExecuted?: boolean;
    };
    return {
      scriptExecuted: target.injectedScriptExecuted === true,
      attributeExecuted: target.injectedAttributeExecuted === true,
    };
  });
  expect(result.scriptExecuted).toBe(false);
  expect(result.attributeExecuted).toBe(false);

  const second = await request.get('/sign-in', {
    headers: {
      'Content-Security-Policy': "script-src 'unsafe-inline'",
      'x-nonce': 'forged',
      'next-router-prefetch': '1',
      purpose: 'prefetch',
    },
  });
  const secondHeaders = second.headers();
  expect(secondHeaders['content-security-policy']).not.toContain(nonce!);
  expect(secondHeaders['content-security-policy']).not.toContain('forged');
  expect(secondHeaders['x-frame-options']).toBe('DENY');
  const api = await request.get('/api/v1/session');
  expect(api.headers()['content-security-policy']).toContain("default-src 'none'; sandbox");
  expect(api.headers()['cache-control']).toContain('no-store');
  expect(api.headers()['x-content-type-options']).toBe('nosniff');

  // The optimizer exists even though application components use ordinary image tags.
  // A valid size/quality must reach the remote-URL policy and fail before any upstream fetch.
  const remoteImage = await request.get('/_next/image', {
    params: { url: 'https://example.invalid/untrusted.png', w: '640', q: '75' },
  });
  expect(remoteImage.status()).toBe(400);
  expect(await remoteImage.text()).toContain('"url" parameter is not allowed');
});
