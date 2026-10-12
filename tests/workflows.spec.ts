import { settleMotion } from './motion-helpers';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { snapshotSchema } from '../src/types/action';
async function start(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-08T09:00:00+08:00'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
}
async function demo(page: Page) {
  await page.getByRole('button', { name: 'Try a sample screenshot' }).click();
  await expect(page.getByRole('heading', { name: 'Pictorial', exact: true })).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).first().click();
}
test('sample → edit → confirm → today/upcoming/calendar → complete → restore → reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  await demo(page);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Class pictorial');
  await page.getByLabel('Location', { exact: true }).fill('North campus');
  await page.getByRole('button', { name: 'Confirm & save', exact: true }).click();
  await expect(page.getByText('Saved on this device.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: /Today/ }).first().click();
  await expect(page.getByRole('button', { name: /Class pictorial Thu/ })).toBeVisible();
  await nav(page, 'Upcoming');
  await expect(page.getByText('Class pictorial', { exact: true })).toBeVisible();
  await nav(page, 'Calendar');
  await page.getByRole('button', { name: 'October 8, 2026, 1 items' }).click();
  await expect(page.getByRole('button', { name: /Class pictorial Thu/ })).toBeVisible();
  await page.getByRole('button', { name: 'Complete Class pictorial', exact: true }).click();
  await nav(page, 'Completed');
  await expect(page.getByText('Class pictorial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore Class pictorial' }).click();
  await page.reload();
  await page.getByRole('button', { name: /All Tasks/ }).click();
  await expect(page.getByText('Class pictorial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Class pictorial Thu/ }).click();
  await page.getByText('View source screenshot').click();
  await expect(page.getByAltText('Source: sample-announcement.png')).toBeVisible();
  expect(errors).toEqual([]);
});
test('overdue confirmed items stay in Today until completed', async ({ page }) => {
  await start(page);
  await demo(page);
  await page.getByRole('button', { name: 'Confirm & save event', exact: true }).click();
  await expect(page.getByText('Saved on this device.', { exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-10-10T09:00:00+08:00'));
  await page.reload();
  const todayNav = page.getByRole('navigation').getByRole('button', { name: /^Today/ });
  await expect(todayNav).toHaveAccessibleName('Today 1');
  await todayNav.click();
  await expect(page.getByRole('heading', { name: 'Overdue', exact: true })).toBeVisible();
  await expect(page.getByText('Overdue', { exact: true }).last()).toBeVisible();
  await nav(page, 'Upcoming');
  await expect(page.getByText('Nothing on the horizon. Yet.', { exact: true })).toBeVisible();
  await todayNav.click();
  await page.getByRole('button', { name: 'Complete Pictorial', exact: true }).click();
  await expect(page.getByText('Your day has room to breathe.', { exact: true })).toBeVisible();
  await expect(todayNav).toHaveAccessibleName('Today');
});
test('drafts, search across content, deletion and preferences persist', async ({ page }) => {
  await start(page);
  await demo(page);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: /Needs Review/ }).click();
  await expect(page.getByText('Pictorial', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search your workspace', exact: true }).click();
  await page.getByLabel('Search all items').fill('No jeans');
  await expect(page.getByRole('option').filter({ hasText: 'Pictorial' })).toBeVisible();
  await page.getByLabel('Search all items').fill('no such thing');
  await expect(page.getByText('No matches just yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await nav(page, 'Settings');
  await page.getByLabel('Enable reminders', { exact: true }).uncheck();
  await page.reload();
  await nav(page, 'Settings');
  await expect(page.getByLabel('Enable reminders', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: /Needs Review/ }).click();
  await page.getByRole('button', { name: /Pictorial Thu/ }).click();
  await page.getByRole('button', { name: 'Delete item', exact: true }).click();
  await page.getByRole('button', { name: 'Delete item', exact: true }).first().click();
  await expect(page.getByText('Everything is clear.', { exact: true })).toBeVisible();
});
test('manual tasks, invalid upload, file picker and removal cancel extraction', async ({
  page,
}) => {
  await start(page);
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toContainText('Choose a PNG');
  await page.getByLabel('Upload screenshot').setInputFiles('TaskLens.png');
  await expect(page.getByAltText('Preview of TaskLens.png')).toBeVisible();
  await page.getByRole('button', { name: 'Remove screenshot' }).click();
  await page.waitForTimeout(2200);
  await expect(page.getByRole('heading', { name: 'Pictorial', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'New item' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Read chapter five');
  await page.getByLabel('Requirements', { exact: true }).fill('Notebook');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: /All Tasks/ }).click();
  await expect(page.getByText('Read chapter five', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.getByText('Read chapter five', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Read chapter five', { exact: true })).toBeVisible();
});
test('HTML drag/drop and paste accept actual image files', async ({ page }) => {
  await start(page);
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 40;
    canvas.getContext('2d')!.fillRect(0, 0, 80, 40);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('.dropzone').evaluate((element, base64) => {
    const data = new DataTransfer();
    data.items.add(
      new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], 'dropped.png', {
        type: 'image/png',
      }),
    );
    element.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true }));
  }, image);
  await expect(page.getByAltText('Preview of dropped.png')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pictorial', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: 'Remove screenshot' }).click();
  await page.evaluate((bytes) => {
    const data = new DataTransfer();
    data.items.add(
      new File([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))], 'pasted.png', {
        type: 'image/png',
      }),
    );
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
  }, image);
  await expect(page.getByAltText('Preview of pasted.png')).toBeVisible();
});
test('corrupt data recovery and failed saves never silently discard data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tasklens:data:v1', '{"version":99}'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('kept intact');
  expect(await page.evaluate(() => localStorage.getItem('tasklens:data:v1'))).toBe(
    '{"version":99}',
  );
});
test('quota failure preserves editor values, and retry succeeds', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'New item' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Must not disappear');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, 'restoreStorage', {
      value: () => (Storage.prototype.setItem = original),
    });
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('edits are still here');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Must not disappear');
  await page.evaluate(() => {
    (window as unknown as { restoreStorage: () => void }).restoreStorage();
  });
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Must not disappear', exact: true }),
  ).toBeVisible();
});
test('keyboard access, accessibility, offline operation and narrow desktop layout', async ({
  page,
  context,
}) => {
  await start(page);
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('Search all items')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'New item' }).hover();
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await context.setOffline(true);
  await demo(page);
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(page.getByRole('button', { name: 'Confirm & save event' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Item details' })).not.toBeVisible();
  await context.setOffline(false);
});

test('unsaved edits are protected, reminder changes persist, search ignores list filters', async ({
  page,
}) => {
  await start(page);
  await demo(page);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keep these edits');
  await page.getByLabel('Date', { exact: true }).fill('2026-10-09');
  await page.getByLabel('Arrival time', { exact: true }).fill('15:00');
  await page.getByLabel('1 hour before').uncheck();
  await expect(page.locator('button[aria-label="Remove screenshot"]')).toBeDisabled();
  await page.mouse.click(2, 2);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep these edits');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Discard your unsaved edits?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await page.getByRole('button', { name: 'Confirm & save', exact: true }).click();
  await page.getByRole('button', { name: 'Close details' }).click();
  await page.getByRole('button', { name: /All Tasks/ }).click();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Search your workspace', exact: true }).click();
  await page.getByLabel('Search all items').fill('Keep these edits');
  await expect(page.getByText('Keep these edits', { exact: true })).toBeVisible();
  const snapshot = snapshotSchema.parse(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!)),
  );
  expect(snapshot.actions[0].reminders.find((r) => r.id === 'hour')?.enabled).toBe(false);
  expect(snapshot.actions[0].reminders.find((r) => r.id === 'quarter')?.datetime).toBe(
    '2026-10-09T06:45:00.000Z',
  );
});
