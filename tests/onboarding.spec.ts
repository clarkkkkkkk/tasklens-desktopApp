import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const data = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!));
async function preferences(page: Page) {
  await button(page, 'Get Started').click();
  await button(page, 'Continue').click();
}
test('first launch, back, preferences, demo and completion preserve data', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Turn information into action. Privately.' }),
  ).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).not.toBeVisible();
  await preferences(page);
  await page.getByLabel('1 hour before', { exact: true }).uncheck();
  await expect
    .poll(async () => (await data(page)).settings.defaultReminders)
    .toEqual(['night', 'quarter']);
  await button(page, 'Back').click();
  await page.getByRole('button', { name: /^Remember/ }).click();
  await button(page, 'Continue').click();
  await expect(page.getByLabel('1 hour before', { exact: true })).not.toBeChecked();
  await button(page, 'Continue').click();
  await expect(page.getByLabel('Sample location')).toHaveValue('Campus');
  await page.getByLabel('Sample location').fill('North campus');
  await button(page, 'Back').click();
  await button(page, 'Continue').click();
  await expect(page.getByLabel('Sample location')).toHaveValue('North campus');
  await page.locator('.onboarding-step').evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await button(page, 'Start using TaskLens').click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByText('Drop your first screenshot here')).toBeVisible();
  expect((await data(page)).actions).toEqual([]);
  expect((await data(page)).settings.onboardingCompletedVersion).toBe(1);
  await page.reload();
  await expect(button(page, 'Get Started')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
});
test('skip, replay, keyboard exit and immediate preferences', async ({ page }) => {
  await page.goto('/');
  await button(page, 'Skip tour').click();
  await button(page, 'Settings').click();
  await button(page, 'Replay onboarding').click();
  expect((await data(page)).settings.onboardingCompletedVersion).toBe(1);
  await preferences(page);
  const preset = page.getByRole('checkbox', { name: '15 minutes before', exact: true });
  await preset.focus();
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await data(page)).settings.defaultReminders)
    .toEqual(['night', 'hour']);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(button(page, 'Replay onboarding')).toBeFocused();
  await expect(preset).not.toBeChecked();
  await button(page, 'Replay onboarding').click();
  await button(page, 'Skip tour').click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.getByText('Drop your first screenshot here')).not.toBeVisible();
});
test('responsive layouts and reduced motion remain accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const width of [1440, 900, 600]) {
    await page.setViewportSize({ width, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    await page.locator('.onboarding-step').evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none');
  await page.locator('.onboarding-step').evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(button(page, 'Skip tour')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'Get Started')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(button(page, 'Skip tour')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
});
test('failed persistence retains tour and allows retry; corrupt data stays in recovery', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, {
      restoreStorage: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  });
  await button(page, 'Skip tour').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(button(page, 'Get Started')).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await button(page, 'Skip tour').click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('tasklens:data:v1', '{bad'));
  await page.reload();
  await expect(page.getByText('Your data needs a little attention.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('tasklens:data:v1'))).toBe('{bad');
});

test('demo failure can retry and pending demo can be left without creating tasks', async ({
  page,
}) => {
  await page.goto('/');
  await preferences(page);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.assign(window, {
      restoreCanvas: () => {
        HTMLCanvasElement.prototype.getContext = original;
      },
    });
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original;
  });
  await button(page, 'Continue').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreCanvas: () => void }).restoreCanvas());
  await button(page, 'Retry sample').click();
  await expect(page.getByLabel('Sample location')).toHaveValue('Campus');
  await button(page, 'Skip tour').click();
  await button(page, 'Settings').click();
  await button(page, 'Replay onboarding').click();
  await preferences(page);
  await button(page, 'Continue').click();
  await button(page, 'Exit tour').click();
  await expect(button(page, 'Replay onboarding')).toBeFocused();
  expect((await data(page)).actions).toEqual([]);
});
