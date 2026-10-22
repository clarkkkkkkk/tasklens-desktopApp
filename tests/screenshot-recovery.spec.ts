import { expect, test } from '@playwright/test';
test('screenshot failure retains OCR, retries inference, and never shows success markers', async ({
  page,
}) => {
  await page.goto('/tests/voice-harness.html?screenshot-recovery');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/midterm.png');
  const card = page.getByLabel('Screenshot capture');
  await expect(card).toHaveAttribute('data-state', 'failed');
  await expect(
    card.getByText('Screenshot processing needs attention', { exact: true }),
  ).toBeVisible();
  await page.getByText('Recognized text', { exact: true }).click();
  await expect(card).toContainText('MIDTERM');
  await expect(
    page.getByRole('button', { name: 'Retry understanding details', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry understanding details', exact: true }).click();
  await expect(card).toHaveAttribute('data-state', 'review-ready');
  await expect(page.locator('.inbox-result-dialog[open]')).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'voiceTest').ocrReads)).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('manual recovery opens an empty editor with the retained source and saves only explicitly', async ({
  page,
}) => {
  await page.goto('/tests/voice-harness.html?screenshot-recovery');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/midterm.png');
  await page.getByRole('button', { name: 'Create task manually', exact: true }).click();
  await expect(page.locator('.action-editor')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions),
  ).toEqual([]);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
});
