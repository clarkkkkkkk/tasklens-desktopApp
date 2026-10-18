import { expect, test } from '@playwright/test';

test('slow on-device extraction offers Keep waiting / Cancel after 60 s and saves nothing', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/tests/voice-harness.html?hang');
  await page.getByLabel('Upload screenshot').setInputFiles('TaskLens.png');
  await expect(page.getByText('Processing locally.', { exact: false })).toBeVisible();
  const keep = page.getByRole('button', { name: 'Keep waiting', exact: true });
  await expect(keep).toHaveCount(0);

  await page.clock.runFor(59_000);
  await expect(keep).toHaveCount(0);
  await page.clock.runFor(2_000);
  await expect(page.getByText(/Still working on this device \(6\ds\)/)).toBeVisible();
  await expect(keep).toBeVisible();

  // Keep waiting hides the notice for another 60 s of real processing.
  await keep.click();
  await expect(keep).toHaveCount(0);
  await expect(page.getByText('Processing locally.', { exact: false })).toBeVisible();
  await page.clock.runFor(61_000);
  await expect(keep).toBeVisible();

  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'voiceTest').extractionAborted))
    .toBe(1);
  await expect(page.getByRole('button', { name: 'Cancel processing', exact: true })).toHaveCount(0);
  await page.clock.runFor(5_000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions),
  ).toEqual([]);
});
