import { expect, test, type Page } from '@playwright/test';
async function cloud(page: Page, query = '') {
  await page.goto(`/tests/groq-harness.html?${query}`);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Groq Cloud', exact: false }).click();
  await completeWizard(page);
  expect(await page.evaluate(() => localStorage.getItem('tasklens:data:v1'))).not.toContain(
    'synthetic-fixture-key',
  );
  await page.getByRole('button', { name: /^Inbox/ }).click();
}
async function completeWizard(page: Page) {
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'I have my key', exact: true }).click();
  await page.getByLabel('Groq API key', { exact: true }).fill('synthetic-fixture-key');
  await page.getByRole('button', { name: 'Connect & verify', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Privacy permission', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
  await page.getByRole('checkbox', { name: 'I agree to send source text to Groq' }).check();
  await page.getByRole('button', { name: 'Agree & continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start using TaskLens', exact: true }).click();
}
test('consent precedes extraction, cloud text works without Qwen, and review stays explicit', async ({
  page,
}) => {
  await cloud(page);
  await page.getByRole('button', { name: 'Capture text', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Information to capture', exact: true })
    .fill('Pictorial at campus.');
  await page.getByRole('button', { name: 'Extract actions', exact: true }).click();
  await expect(
    page.getByText('Drafted by Groq Cloud using GPT-OSS 20B.', { exact: false }),
  ).toBeVisible();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!));
  expect(data.actions).toEqual([]);
});
test('cloud screenshot failure retains OCR and preview, retry reuses OCR', async ({ page }) => {
  await cloud(page, 'fail-once');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  const card = page.getByLabel('Screenshot capture');
  await expect(card).toHaveAttribute('data-state', 'failed');
  await expect(card.locator('.preview-image img')).toBeVisible();
  await expect(card.locator('.processing-title svg')).not.toHaveClass(/check/);
  await page.getByText('Recognized text', { exact: true }).click();
  await expect(card).toContainText('pictorial');
  await page.getByRole('button', { name: 'Retry understanding details', exact: true }).click();
  await expect(card).toHaveAttribute('data-state', 'review-ready');
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.ocr)).toBe(1);
});
test('cancels online capture and allows a manual task without saving a late result', async ({
  page,
}) => {
  await cloud(page, 'slow');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await expect(page.getByText('Sending securely…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await expect(page.getByLabel('Screenshot capture')).toHaveAttribute('data-state', 'cancelled');
  await page.getByRole('button', { name: 'Create task manually', exact: true }).click();
  await expect(page.locator('.action-editor')).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions),
  ).toEqual([]);
});
test('invalid keys, session status and disconnect are clear', async ({ page }) => {
  await page.goto('/tests/groq-harness.html');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Connect API key', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'I have my key', exact: true }).click();
  await page.getByLabel('Groq API key', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Connect & verify', exact: true }).click();
  await expect(page.getByText('Groq rejected this API key.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Groq API key', { exact: true })).toHaveValue('');
  await page.getByLabel('Groq API key', { exact: true }).fill('synthetic-fixture-key');
  await page.getByRole('button', { name: 'Retry connection', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel & use Offline AI', exact: true }).click();
  await expect(
    page.getByText('Session only — reconnect after restarting.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Disconnect API key', exact: true }).click();
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').connection.consent)).toBe(false);
});

test('voice transcription remains local and cloud extraction works without Qwen', async ({
  page,
}) => {
  await cloud(page);
  await page.getByRole('button', { name: 'Record a voice note', exact: true }).click();
  await page.getByRole('button', { name: 'Done recording', exact: true }).click();
  await expect(
    page.getByText('Drafted by Groq Cloud using GPT-OSS 20B.', { exact: false }),
  ).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.transcribed)).toBe(1);
});

test('switching back to Local never silently submits a cloud extraction', async ({ page }) => {
  await cloud(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('radio', { name: 'Local AI Works offline', exact: false }).click();
  await expect(page.getByText('Local AI selected.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Inbox/ }).click();
  await page.getByRole('button', { name: 'Capture text', exact: true }).click();
  await page.getByLabel('Information to capture').fill('Pictorial at campus.');
  await expect(page.getByRole('button', { name: 'Extract actions', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
});
