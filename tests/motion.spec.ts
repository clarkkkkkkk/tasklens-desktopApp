import { expect, test } from '@playwright/test';
import { settleMotion } from './motion-helpers';

test('handoff and rapid navigation settle on latest page with accessible headings', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await settleMotion(page);
  for (const name of ['Today', 'Upcoming', 'Calendar', 'All Tasks', 'Settings', 'Inbox']) {
    await page.getByRole('button', { name, exact: true }).click();
    // Headings stay as one visible text run during page navigation.
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toHaveText(name);
    await expect(page.locator('.main-content')).toHaveCSS('opacity', '1');
  }
  await settleMotion(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox', exact: true })).toHaveCount(1);
  await expect(page.locator('.motion-exit-snapshot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try a sample screenshot' }).click();
  await expect(page.getByRole('heading', { name: 'Pictorial', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Keep this draft');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Discard your unsaved edits?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft');
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this draft');
});

test('reduced motion settles active animations and panel exits cannot capture focus', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settleMotion(page);
  await page.getByRole('button', { name: 'New item', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Motion test');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  await expect(page.locator('.motion-exit-snapshot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New item', exact: true })).toBeFocused();
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === 'running').length,
    ),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: /^All Tasks/ }).click();
  await page.getByRole('button', { name: /^Motion test/ }).click();
  await page.getByRole('button', { name: 'Close details', exact: true }).click();
  const snapshots = page.locator('.motion-exit-snapshot');
  // Read transient exits atomically; they may disappear between separate assertions.
  expect(
    await snapshots.evaluateAll((elements) =>
      elements.every(
        (node) => node.getAttribute('aria-hidden') === 'true' && (node as HTMLElement).inert,
      ),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'New item', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
  await settleMotion(page);
  await expect(snapshots).toHaveCount(0);
});

test('storage updates during onboarding retain startup recovery and completion routing', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Turn information into action. Privately.' }),
  ).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('tasklens:data:v1', '{bad');
    window.dispatchEvent(new StorageEvent('storage', { key: 'tasklens:data:v1' }));
  });
  await expect(page.getByText('Your data needs a little attention.')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem(
      'tasklens:data:v1',
      JSON.stringify({
        version: 1,
        actions: [],
        settings: {
          theme: 'light',
          remindersEnabled: true,
          defaultReminders: ['night', 'hour', 'quarter'],
          onboardingCompletedVersion: 1,
        },
      }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'tasklens:data:v1' }));
  });
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip tour', exact: true })).toHaveCount(0);
});
