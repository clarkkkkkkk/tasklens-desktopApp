import { expect, test, type Page } from '@playwright/test';

const calls = (page: Page) =>
  page.evaluate(() => ({ ...Reflect.get(window, 'routingTest').calls }));

async function upload(page: Page, query: string) {
  await page.goto(`/tests/routing-harness.html?${query}`);
  await page.getByLabel('Upload screenshot').setInputFiles('TaskLens.png');
}

test('Ask Before Cloud: shows what would be sent and uses the local model when asked', async ({
  page,
}) => {
  await upload(page, 'mode=ask-before-cloud');
  const consent = page.getByRole('dialog', { name: 'Send this to Test Cloud?' });
  await expect(consent).toBeVisible();
  await expect(consent.getByText('The screenshot image', { exact: true })).toBeVisible();
  await expect(consent.getByText('Text recognition (Tesseract)', { exact: true })).toBeVisible();
  await consent.getByRole('button', { name: 'Use Local Test 4B on this device' }).click();
  await expect(
    page.getByText('Drafted on this device by Local Test 4B.', { exact: false }),
  ).toBeVisible();
  expect(await calls(page)).toEqual({ 'local-test': 1 });
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions),
  ).toEqual([]);
});

test('Ask Before Cloud: approving sends to the cloud and the result says so', async ({ page }) => {
  await upload(page, 'mode=ask-before-cloud');
  await page.getByRole('button', { name: 'Send to Test Cloud Vision' }).click();
  await expect(
    page.getByText('Drafted by Test Cloud Vision (cloud, Test Cloud).', { exact: false }),
  ).toBeVisible();
  expect(await calls(page)).toEqual({ 'cloud-test': 1 });
});

test('Ask Before Cloud: cancelling sends nothing', async ({ page }) => {
  await upload(page, 'mode=ask-before-cloud');
  await page
    .getByRole('dialog', { name: 'Send this to Test Cloud?' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await expect(page.getByText('Nothing was sent. Processing was cancelled.')).toBeVisible();
  expect(await calls(page)).toEqual({});
});

test('Local Only never asks and never contacts the cloud', async ({ page }) => {
  await upload(page, 'mode=local-only');
  await expect(
    page.getByText('Drafted on this device by Local Test 4B.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Send this to/ })).toHaveCount(0);
  expect(await calls(page)).toEqual({ 'local-test': 1 });
});

test('a failed cloud provider offers a local fallback instead of switching silently', async ({
  page,
}) => {
  await upload(page, 'mode=automatic&cloud-fails');
  const fallback = page.getByRole('dialog', { name: 'Test Cloud Vision was unavailable' });
  await expect(fallback).toBeVisible();
  await expect(
    fallback.getByText('a local model capable of completing this task', { exact: false }),
  ).toBeVisible();
  expect(await calls(page)).toEqual({ 'cloud-test': 1 });
  await fallback.getByRole('button', { name: 'Use Local AI' }).click();
  await expect(
    page.getByText('Drafted on this device by Local Test 4B.', { exact: false }),
  ).toBeVisible();
  expect(await calls(page)).toEqual({ 'cloud-test': 1, 'local-test': 1 });
});

test('the processing card explains which AI ran and why', async ({ page }) => {
  await upload(page, 'mode=local-only');
  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator('.processing-title .badge')).toHaveText('On-device · Local Test 4B');
  await page.getByText('Why this AI?').click();
  await expect(
    page.locator('.route-why').getByText('No source material leaves this device'),
  ).toBeVisible();
});
