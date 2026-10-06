import { test, expect } from '@playwright/test';

const routes = ['/guide/', '/guide/configuration/', '/guide/usage/'];
for (const colorScheme of ['light', 'dark']) for (const width of [375, 1280]) {
  test(`${colorScheme} ${width}px: routes, links, contents, overflow and copy`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { window.copied = text; } } });
    });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.release')).toContainText('v0.3.0');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/guide-top-${colorScheme}-${width}-${route.split('/').filter(Boolean).at(-1)}.png` });
      for (const anchor of await page.locator('.guide-contents a').all()) {
        await anchor.click();
        const hash = await anchor.getAttribute('href');
        await expect(page.locator(hash)).toBeInViewport();
        expect(await page.locator(hash).evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
      }
      const block = page.locator('[data-copy]').first();
      await block.locator('button').click();
      await expect(block.locator('[role="status"]')).toHaveText('Example copied.');
      expect(await page.evaluate(() => window.copied)).toBe((await block.locator('code').textContent()).trimEnd());
      await page.screenshot({ path: `test-results/guide-${colorScheme}-${width}-${route.split('/').filter(Boolean).at(-1)}.png` });
      // Resolve every local link and fragment over HTTP, following directory redirects.
      const links = await page.locator('a[href], link[href], script[src]').evaluateAll((els) => els.map((el) => el.href || el.src));
      for (const href of new Set(links)) {
        const url = new URL(href); if (url.origin !== new URL(page.url()).origin) continue;
        const response = await page.request.get(url.pathname);
        expect(response.ok(), href).toBe(true);
        if (url.hash) expect(await response.text(), href).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
      }
    }
    await page.goto('/?instant');
    await expect(page.locator('#transcript .msg')).toHaveCount(3);
    await page.getByRole('link', { name: 'Guide', exact: true }).click();
    await expect(page).toHaveURL(/\/guide\/$/);
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.locator('#configure')).toBeAttached();
    await page.locator('[data-copy] button').first().click();
    await expect(page.locator('[data-copy] button').first()).toHaveClass(/done/);
    expect(await page.evaluate(() => window.copied)).toContain('npm install -g @chittr/cli');
  });
}

test('keyboard focus, denied clipboard, direct section URLs and no JavaScript', async ({ page, browser }) => {
  await page.goto('/guide/usage/');
  await expect(page.locator('#cli table thead').first()).toContainText('Command');
  await expect(page.locator('#controls table thead')).toContainText('Command');
  await expect(page.locator('#keyboard table thead')).toContainText('Key');
  await expect(page.locator('#controls')).toContainText('Stop does not roll back');
  await page.goto('/guide/configuration/#trusted-commands');
  await expect(page.locator('#trusted-commands')).toBeInViewport();
  await page.goto('/guide/');
  await page.keyboard.press('Tab');
  await expect(page.getByText('Skip to content', { exact: true })).toBeFocused();
  expect(await page.locator(':focus').evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await page.locator('[data-copy] button').first().focus();
  expect(await page.locator(':focus').evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.keyboard.press('Enter');
  await expect(page.locator('[role="status"]').first()).toContainText('Select the example text');
  expect(await page.locator('[data-copy] code').first().evaluate((el) => getComputedStyle(el).userSelect)).not.toBe('none');
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  const plain = await context.newPage();
  for (const route of routes) {
    await plain.goto(`http://127.0.0.1:8765${route}`);
    await expect(plain.locator('h1')).toBeVisible();
    await expect(plain.locator('[data-copy] button').first()).toBeHidden();
    await plain.locator('.guide-contents a').last().click();
    expect(await plain.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await context.close();
});

test('analytics loads only on the production hosts', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  for (const route of ['/', '/guide/']) {
    await page.goto(route);
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
  }
  expect(requests.filter((url) => url.includes('googletagmanager'))).toEqual([]);
  // Serve the built site as chittr.dev, with the tag stubbed, so nothing leaves this machine.
  await page.route('**/*', (route) => route.abort());
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('https://chittr.dev/**', (route) => {
    const { pathname } = new URL(route.request().url());
    return route.fulfill({ path: `dist${pathname.endsWith('/') ? `${pathname}index.html` : pathname}` });
  });
  await page.goto('https://chittr.dev/guide/');
  await expect.poll(() => requests.includes('https://www.googletagmanager.com/gtag/js?id=G-0TB5SDN8SH')).toBe(true);
  expect(await page.evaluate(() => window.dataLayer.map((entry) => [...entry]))).toContainEqual(['config', 'G-0TB5SDN8SH']);
});
