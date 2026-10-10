import { test, expect } from '@playwright/test';

function listResponse(page, expected) {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    if (url.pathname !== '/api/trpc/catalogue.list') return false;
    try {
      const input = JSON.parse(url.searchParams.get('input'));
      return Object.entries(expected).every(([key, value]) => input[key] === value);
    } catch { return false; }
  });
}

async function records(responsePromise, kind) {
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  const data = body.result.data;
  expect(data.release_id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/);
  expect(data.items.length).toBeGreaterThan(0);
  expect(data.items.every(record => record.kind === kind)).toBe(true);
  return data.items;
}

async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('deployed public database core journeys', async ({ page, baseURL }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(`Uncaught JavaScript: ${error.message}`));
  page.on('console', message => {
    const location = message.location().url;
    if (message.type() === 'error' && location && new URL(location).origin === baseURL) {
      failures.push(`Console error: ${message.text()}`);
    }
  });
  page.on('response', response => {
    if (new URL(response.url()).origin === baseURL && response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    const error = request.failure()?.errorText || '';
    if (new URL(request.url()).origin === baseURL && !/abort|cancel/i.test(error)) {
      failures.push(`Request failed: ${request.url()} (${error})`);
    }
  });

  await test.step('homepage, live model search and context-preserving detail return', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.topbar').getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await page.getByRole('group', { name: 'Record type' }).getByRole('button', { name: /^Models/ }).click();
    const search = listResponse(page, { kind: 'model', q: 'AlphaGenome' });
    await page.getByRole('searchbox', { name: 'Search the database' }).fill('AlphaGenome');
    const models = await records(search, 'model');
    expect(models.some(record => /alphagenome/i.test(record.name))).toBe(true);
    const link = page.locator('article h3 a').filter({ hasText: /AlphaGenome/i }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/database\/model\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/AlphaGenome/i);
    await page.getByRole('link', { name: '← Back to results', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search the database' })).toHaveValue('AlphaGenome');
    await expect(page.getByRole('group', { name: 'Record type' }).getByRole('button', { name: /^Models/ })).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('benchmark filter returns benchmark records and opens a real detail', async () => {
    const filtered = listResponse(page, { kind: 'benchmark', q: undefined });
    await page.getByRole('group', { name: 'Record type' }).getByRole('button', { name: /^Benchmarks/ }).click();
    await page.getByRole('searchbox', { name: 'Search the database' }).fill('');
    const benchmarks = await records(filtered, 'benchmark');
    const href = `/database/benchmark/${benchmarks[0].id}/`;
    const link = page.locator(`article h3 a[href^=${JSON.stringify(href)}]`).first();
    await expect(link).toBeVisible();
    expect((await link.getAttribute('href')).split('?')[0]).toBe(href);
    await link.click();
    await expect(page).toHaveURL(/\/database\/benchmark\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  await test.step('BRCA evidence, section navigation and source disclosure', async () => {
    await page.goto('/use-cases/brca1-brca2-germline-interpretation/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/BRCA1.*BRCA2/i);
    const section = page.getByRole('navigation', { name: 'On this page' });
    await section.locator('a[href="#evidence"]').click();
    await expect(page).toHaveURL(/#evidence$/);
    await expect(section.locator('a[href="#evidence"]')).toHaveAttribute('aria-current', 'location');
    // Single reported results render as a metric list, so check the first comparison that is a table.
    const comparison = page.locator('#evidence article').filter({ has: page.getByRole('table') }).first();
    await expect(comparison.getByRole('table')).toBeVisible();
    await expect(comparison.getByRole('columnheader', { name: 'Tool', exact: true })).toBeVisible();
    const caveats = comparison.locator('details').filter({ has: page.locator('summary', { hasText: /^Caveats and method$/ }) }).first();
    await caveats.locator(':scope > summary').click();
    await expect(caveats).toHaveAttribute('open', '');
    await expect(caveats.locator('a').first()).toBeVisible();
  });

  await test.step('mobile table containment, section selector and menu navigation', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
    const table = page.locator('#evidence [role="region"]').first();
    await expect(table).toBeVisible();
    expect(await table.evaluate(node => {
      const box = node.getBoundingClientRect();
      return box.left >= -1 && box.right <= innerWidth + 1 && node.scrollWidth >= node.clientWidth;
    })).toBe(true);
    await page.getByRole('combobox', { name: 'On this page' }).selectOption('details');
    await expect(page).toHaveURL(/#details$/);
    await expect(page.getByRole('combobox', { name: 'On this page' })).toHaveValue('details');
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#mobile-primary-navigation').getByRole('link', { name: 'Models', exact: true }).click();
    await expect(page).toHaveURL(/\/models\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await noOverflow(page);
  });
  expect(failures, 'Unexpected same-origin request or JavaScript failures').toEqual([]);
});
