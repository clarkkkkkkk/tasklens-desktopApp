import { expect, test, type Page } from '@playwright/test';

const calls = (page: Page) =>
  page.evaluate(() => ({ ...Reflect.get(window, 'routingTest').calls }));

async function upload(page: Page, query = '') {
  await page.goto(`/tests/routing-harness.html?${query}`);
  await page.getByLabel('Upload screenshot').setInputFiles('TaskLens.png');
}

test('Automatic runs the best local model without asking', async ({ page }) => {
  await upload(page);
  await expect(
    page.getByText('Drafted on this device by Local Test 4B.', { exact: false }),
  ).toBeVisible();
  expect(await calls(page)).toEqual({ 'local-test': 1 });
});

test('a failed local model falls back to the next one and says so', async ({ page }) => {
  await upload(page, 'local-fails');
  await expect(
    page.getByText('Drafted on this device by Backup Test 4B.', { exact: false }),
  ).toBeVisible();
  expect(await calls(page)).toEqual({ 'local-test': 1, 'backup-test': 1 });
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByText('Why this AI?').click();
  await expect(
    page
      .locator('.route-why')
      .getByText('Local Test 4B was unavailable, so TaskLens used Backup Test 4B instead.'),
  ).toBeVisible();
});

test('the processing card explains which AI ran and why', async ({ page }) => {
  await upload(page);
  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator('.processing-title .badge')).toHaveText('On-device · Local Test 4B');
  await page.getByText('Why this AI?').click();
  await expect(
    page.locator('.route-why').getByText('No source material leaves this device'),
  ).toBeVisible();
});
