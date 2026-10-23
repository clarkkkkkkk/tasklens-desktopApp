import { dismissGuidedTour, settleMotion } from './motion-helpers';
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
  await expect(page.getByLabel('Sample location')).toHaveValue('Campus', { timeout: 15000 });
  await page.getByLabel('Sample location').fill('North campus');
  await button(page, 'Back').click();
  await button(page, 'Continue').click();
  await expect(page.getByLabel('Sample location')).toHaveValue('North campus');
  await page.locator('.onboarding-step').evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await button(page, 'Start using TaskLens').click();
  await dismissGuidedTour(page);
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
  await settleMotion(page);
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
  await expect(page.getByLabel('Sample location')).toHaveValue('Campus', { timeout: 15000 });
  await button(page, 'Skip tour').click();
  await button(page, 'Settings').click();
  await button(page, 'Replay onboarding').click();
  await preferences(page);
  await button(page, 'Continue').click();
  await button(page, 'Exit tour').click();
  await expect(button(page, 'Replay onboarding')).toBeFocused();
  expect((await data(page)).actions).toEqual([]);
});

test('skip remains usable when a background compositor pauses animations', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      animation.pause();
      return animation;
    };
  });
  await button(page, 'Skip tour').click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('.motion-exit-snapshot')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  expect((await data(page)).settings.onboardingCompletedVersion).toBe(1);
  await button(page, 'New item').click();
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
});

test('preview entrances keep left copy static and reduced motion cancels active effects', async ({
  page,
}) => {
  // Hold entrances so cancellation and initial-load motion can be inspected deterministically.
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = original.call(this, keyframes, options);
      if (this.closest('.onboarding')) animation.pause();
      return animation;
    };
  });
  await page.goto('/');
  const motionTargets = () =>
    page.locator('.onboarding-step').evaluate((element) => {
      const targets = element
        .getAnimations({ subtree: true })
        .filter((animation) => !(animation instanceof CSSTransition))
        .map((animation) => (animation.effect as KeyframeEffect).target as Element);
      return {
        count: targets.length,
        leftCount: targets.filter((target) => target.closest('.onboarding-copy')).length,
        overlaps: targets.some((target, i) =>
          targets.some((other, j) => i !== j && target.contains(other)),
        ),
      };
    });
  await expect.poll(async () => (await motionTargets()).count).toBeGreaterThan(0);
  expect((await motionTargets()).overlaps).toBe(false);
  expect((await motionTargets()).leftCount).toBe(0);
  for (const selector of ['.onboarding-header', '.onboarding-progress', '.onboarding-actions']) {
    await expect(page.locator(selector)).toHaveCSS('transform', 'none');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await motionTargets()).count).toBe(0);
  await expect(page.locator('.onboarding-copy h1')).toHaveCSS('opacity', '1');
  await button(page, 'Get Started').click();
  await page.getByRole('button', { name: /^Review/ }).click();
  expect((await motionTargets()).count).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: /^Remember/ }).click();
  await expect.poll(async () => (await motionTargets()).count).toBe(1);
  expect((await motionTargets()).overlaps).toBe(false);
  expect((await motionTargets()).leftCount).toBe(0);

  // Several step changes during suspended effects must land on the newest step without exits.
  const leftAnimated = await page.evaluate(async () => {
    let animated = false;
    for (const name of ['Continue', 'Back', 'Continue', 'Continue', 'Back', 'Continue']) {
      const next = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.onboarding-actions button'),
      ).find((element) => element.textContent?.trim() === name);
      next?.click();
      await new Promise(requestAnimationFrame);
      animated ||= document
        .querySelector('.onboarding-copy')!
        .getAnimations({ subtree: true })
        .some((animation) => !(animation instanceof CSSTransition));
    }
    return animated;
  });
  expect(leftAnimated).toBe(false);
  await expect(page.getByRole('heading', { name: 'See TaskLens in action.' })).toBeFocused();
  await expect(page.getByLabel('Sample location')).toHaveValue('Campus');
  expect((await motionTargets()).overlaps).toBe(false);
  await expect(page.locator('.motion-exit-snapshot')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await motionTargets()).count).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByLabel('Sample location').fill('A quieter campus');
  expect((await motionTargets()).count).toBe(0);
  await button(page, 'Skip tour').click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  expect((await data(page)).actions).toEqual([]);
});

test('all four steps remain accessible and static with reduced motion in a small window', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 600, height: 640 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  for (const next of ['Get Started', 'Continue', 'Continue', 'Start using TaskLens']) {
    if (next === 'Start using TaskLens') {
      await expect(page.getByLabel('Sample location')).toHaveValue('Campus');
      await page.getByLabel('Sample location').fill('Accessible campus');
      await expect(page.getByLabel('Sample location')).toBeFocused();
    }
    expect(
      await page
        .locator('.onboarding')
        .evaluate((element) => element.getAnimations({ subtree: true }).length),
    ).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await button(page, next).click();
  }
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  await dismissGuidedTour(page);
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  expect((await data(page)).actions).toEqual([]);
});
