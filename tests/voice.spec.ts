import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleMotion } from './motion-helpers';
test('voice review preserves transcripts, multiple drafts and saves only on confirmation', async ({
  page,
}) => {
  await page.goto('/tests/voice-harness.html');
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done recording' }).click();
  const dialog = page.getByRole('dialog', { name: 'Captured actions' });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions),
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Source for time' }).click();
  await expect(dialog.locator('.transcript-highlight')).toContainText('exam starts at nine');
  await dialog.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Location', { exact: true }).fill('Draft campus');
  await dialog.getByLabel('Review action').selectOption('1');
  await expect(dialog.getByRole('heading', { name: 'Consultation', exact: true })).toBeVisible();
  await dialog.getByLabel('Review action').selectOption('0');
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Draft campus');
  await page.keyboard.press('Escape');
  await expect(dialog.getByText('Discard your unsaved edits?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await dialog.getByRole('button', { name: 'Confirm & save', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Mark completed' })).toBeVisible();
  const actions = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions,
  );
  expect(actions).toHaveLength(1);
  expect(actions[0].source.transcript.segments[0].id).toBe('s1');
  expect(actions[0].location).toBe('Draft campus');
  await page.setViewportSize({ width: 600, height: 640 });
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('cancellation and navigation discard prevent late results', async ({ page }) => {
  await page.goto('/tests/voice-harness.html?slow');
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Keep capturing' }).click();
  await expect(page.getByRole('heading', { name: 'Recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done recording' }).click();
  await page.getByRole('button', { name: 'Cancel capture' }).click();
  await expect(page.getByRole('heading', { name: 'Capture cancelled' })).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('permission failure, silence and retry are actionable', async ({ page }) => {
  await page.goto('/tests/voice-harness.html?denied');
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('microphone access');
  await page.goto('/tests/voice-harness.html?silence');
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await page.getByRole('button', { name: 'Done recording' }).click();
  await expect(page.getByRole('alert')).toContainText('No clear speech');
  await page.goto('/tests/voice-harness.html?retry');
  await page.getByRole('button', { name: 'Voice', exact: true }).click();
  await page.getByRole('button', { name: 'Done recording' }).click();
  await expect(page.getByRole('alert')).toContainText('Local extraction failed');
  await page.getByRole('button', { name: 'Retry extraction' }).click();
  await expect(page.getByRole('dialog', { name: 'Captured actions' })).toBeVisible();
});
test('import and text feed the same review flow', async ({ page }) => {
  await page.goto('/tests/voice-harness.html');
  await page
    .getByLabel('Import audio file')
    .setInputFiles({
      name: 'note.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('test fixture handled by injected service'),
    });
  await expect(page.getByRole('dialog', { name: 'Captured actions' })).toBeVisible();
  await page.getByRole('button', { name: 'Close review' }).click();
  await page.getByRole('button', { name: 'Capture text', exact: true }).click();
  await page.getByLabel('Information to capture').fill('Consultation Monday at two');
  await page.getByRole('button', { name: 'Extract actions', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Captured actions' })).toBeVisible();
});
