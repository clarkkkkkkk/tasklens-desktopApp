import { settleMotion } from './motion-helpers';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { actionSchema, defaultSettings } from '../src/types/action';
const timestamp = '2026-10-10T06:00:00.000Z';
const fixture = (
  id: string,
  title: string,
  location: string,
  notes: string[],
  requirements: string[],
) =>
  actionSchema.parse({
    id,
    title,
    type: 'task',
    date: '2026-10-12',
    requirements,
    notes,
    location,
    confidence: { overall: 'confirmed' },
    reminders: [],
    source: { type: 'text' },
    status: 'confirmed',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
const actions = [
  fixture('design-1', 'Design review', 'Studio', ['Bring the draft'], ['Notebook']),
  fixture('design-2', 'Design handoff', 'Campus', ['Review final screens'], ['Printed checklist']),
  fixture('reading', 'Read chapter five', 'Library', ['Remember the diagrams'], ['Blue folder']),
];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (snapshot) => localStorage.setItem('tasklens:data:v1', JSON.stringify(snapshot)),
    { version: 1, actions, settings: { ...defaultSettings, onboardingCompletedVersion: 1 } },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
});
test('floating search supports keyboard selection, local fields, focus containment and restoration', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Search your workspace', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Search your workspace' });
  const input = page.getByRole('combobox', { name: 'Search all items' });
  await expect(input).toBeFocused();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const [query, title] of [
    ['studio', 'Design review'],
    ['diagrams', 'Read chapter five'],
    ['Blue folder', 'Read chapter five'],
  ]) {
    await input.fill(query);
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('option')).toContainText(title);
  }
  await input.fill('design');
  await expect(dialog.getByRole('option', { selected: true })).toContainText('Design review');
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('option', { selected: true })).toContainText('Design handoff');
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Design handoff', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Item details', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Design handoff', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
test('empty results, outside dismissal and reduced motion stay accessible on narrow windows', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 600, height: 640 });
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await page.getByLabel('Search all items').fill('nothing matches this');
  await expect(dialog.getByText('No matches just yet.')).toBeVisible();
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(600);
  await page.mouse.click(8, 8);
  await expect(dialog).not.toBeVisible();
  await page.keyboard.press('Meta+k');
  await expect(page.getByLabel('Search all items')).toBeFocused();
});
test('Escape and item selection preserve an underlying unsaved editor', async ({ page }) => {
  await page.getByRole('button', { name: 'New item' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keep my draft');
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep my draft');
  await expect(page.getByText('Discard your unsaved edits?')).not.toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByLabel('Search all items').fill('Library');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep my draft');
  await expect(
    page.getByText('Save or close your current edits before opening another item.'),
  ).toBeVisible();
});

test('search opens a centered result from any workspace page and protects edits', async ({
  page,
}) => {
  for (const view of ['Inbox', 'All Tasks', 'Calendar']) {
    if (view !== 'Inbox')
      await page.getByRole('button', { name: new RegExp('^' + view + '(?: \\d+)?$') }).click();
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search all items').fill('Studio');
    await page.keyboard.press('Enter');
    const result = page.getByRole('dialog', { name: 'Item details', exact: true });
    await expect(result).toBeVisible();
    expect(await result.evaluate((node) => node.matches(':modal'))).toBe(true);
    await expect(page.locator('.workspace')).not.toHaveClass(/with-details/);
    for (const width of [1440, 900, 600]) {
      await page.setViewportSize({ width, height: 640 });
      await settleMotion(page);
      const box = (await result.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
      expect(box.height).toBeLessThan(640);
    }
    expect(
      await result.evaluate((node) => getComputedStyle(node, '::backdrop').backdropFilter),
    ).toContain('blur(12px)');
    await result.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel('Location', { exact: true }).fill('Unsaved location');
    await page.keyboard.press('Escape');
    await expect(result.getByText('Discard your unsaved edits?')).toBeVisible();
    await result.getByRole('button', { name: 'Discard edits', exact: true }).click();
    await expect(result).not.toBeVisible();
    await page.setViewportSize({ width: 1440, height: 920 });
  }
});
