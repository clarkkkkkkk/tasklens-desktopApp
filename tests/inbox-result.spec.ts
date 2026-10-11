import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleMotion } from './motion-helpers';

test('Inbox result is centered, modal, responsive and protects edits on dismissal', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
  const sample = page.getByRole('button', { name: 'Try a sample screenshot', exact: true });
  await sample.click();
  const dialog = page.getByRole('dialog', { name: 'Screenshot result', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Pictorial', exact: true })).toBeVisible();
  expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true);
  expect(
    await dialog.evaluate((node) => getComputedStyle(node, '::backdrop').backdropFilter),
  ).toContain('blur(12px)');
  for (const [width, height] of [
    [1440, 920],
    [900, 640],
    [600, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await settleMotion(page);
    const box = (await dialog.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThan(2);
    expect(box.width).toBeLessThan(width);
    expect(box.height).toBeLessThan(height);
    await expect(dialog.getByRole('button', { name: 'Confirm & save event' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`result-${width}.png`) });
  }
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Location', { exact: true }).fill('My edited campus');
  await page.mouse.click(2, 2);
  await expect(dialog.getByText('Discard your unsaved edits?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Location', { exact: true })).toHaveValue('My edited campus');
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Discard edits', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open result', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Open result', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions),
  ).toEqual([]);
});
