import { expect, test, type Page } from '@playwright/test';
import { settleMotion } from './motion-helpers';

test.use({ video: 'on' });
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function shellBounds(page: Page) {
  return page.evaluate(() =>
    ['.onboarding-header', '.onboarding-progress', '.onboarding-actions'].map((selector) => {
      const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
}

for (const viewport of [
  { width: 1440, height: 920 },
  { width: 900, height: 640 },
  { width: 600, height: 640 },
]) {
  test(`onboarding stays contained at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await settleMotion(page);
    const shell = await shellBounds(page);
    const section = await page.locator('.onboarding-step').elementHandle();
    for (const [next, title] of [
      ['Get Started', 'From chaos to clarity.'],
      ['Continue', 'Stay ahead without thinking about it.'],
      ['Continue', 'See TaskLens in action.'],
    ]) {
      await button(page, next).click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeFocused();
      await settleMotion(page);
      expect(await shellBounds(page)).toEqual(shell);
      expect(await section?.evaluate((element) => element.isConnected)).toBe(true);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const footer = await page.locator('.onboarding-actions').boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height);
      expect(await page.locator('.onboarding-stage').evaluate((element) => element.scrollTop)).toBe(
        0,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(
          `${next}-${await page.locator('.onboarding-step').getAttribute('class')}.png`,
        ),
      });
    }
    await page.getByLabel('Sample location').fill('Motion acceptance campus');
    await page.getByText('View sample screenshot', { exact: true }).click();
    await page.locator('.onboarding-stage').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await shellBounds(page)).toEqual(shell);
    await page.screenshot({ path: info.outputPath('demo-expanded.png') });
    await button(page, 'Start using TaskLens').click();
    await expect(page.locator('.brand-handoff')).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!));
    expect(stored.settings.onboardingCompletedVersion).toBe(1);
    expect(stored.actions).toEqual([]);
    await page.reload();
    await expect(page.locator('.onboarding')).toHaveCount(0);
    await expect(page.locator('.brand-handoff')).toHaveCount(0);
  });
}

test('workflow preview retains its card, selection focus and one motion owner', async ({
  page,
}) => {
  await page.goto('/');
  await button(page, 'Get Started').click();
  await expect(page.getByRole('heading', { name: 'From chaos to clarity.' })).toBeFocused();
  await settleMotion(page);
  const card = await page.locator('.onboarding-workflow-preview').elementHandle();
  const bounds = await page.locator('.onboarding-workflow-preview').boundingBox();
  for (const name of ['Review', 'Remember', 'Capture']) {
    const selected = page.getByRole('button', { name: new RegExp(`^${name}`) });
    await selected.click();
    await expect(selected).toBeFocused();
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(await card?.evaluate((element) => element.isConnected)).toBe(true);
    await settleMotion(page);
    expect(await page.locator('.onboarding-workflow-preview').boundingBox()).toEqual(bounds);
  }
});

test('all sidebar pages change immediately without moving the shell or animating content', async ({
  page,
}) => {
  await page.goto('/');
  await button(page, 'Skip tour').click();
  await settleMotion(page);
  const sidebar = await page.locator('.sidebar').elementHandle();
  const topbar = await page.locator('.topbar').elementHandle();
  const shell = await page
    .locator('.sidebar, .topbar')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
  for (const name of [
    'Today',
    'Upcoming',
    'Calendar',
    'All Tasks',
    'Completed',
    'Needs Review',
    'Settings',
    'Inbox',
  ]) {
    await button(page, name).click();
    await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
    await expect(button(page, name)).toHaveAttribute('aria-current', 'page');
    expect(
      await page
        .locator('.main-content')
        .evaluate((element) => element.getAnimations({ subtree: true }).length),
    ).toBe(0);
    await expect(page.locator('.main-content')).toHaveCSS('transform', 'none');
    await expect(page.locator('.main-content')).toHaveCSS('opacity', '1');
    expect(
      await page
        .locator('.sidebar, .topbar')
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON())),
    ).toEqual(shell);
    await settleMotion(page);
    await button(page, name).click();
    expect(
      await page.locator('.main-content').evaluate((element) => element.getAnimations().length),
    ).toBe(0);
  }
  expect(await sidebar?.evaluate((node) => node.isConnected)).toBe(true);
  expect(await topbar?.evaluate((node) => node.isConnected)).toBe(true);
  // Dispatch rapid user activations in one task, without queuing animation promises.
  await page.locator('.sidebar').evaluate(async (sidebar) => {
    for (const name of ['Today', 'Calendar', 'Completed', 'Needs Review', 'Upcoming', 'Inbox']) {
      Array.from(sidebar.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === name)!
        .click();
    }
  });
  await expect(button(page, 'Inbox')).toHaveAttribute('aria-current', 'page');
  await page.locator('.sidebar').evaluate(async (sidebar) => {
    for (const name of ['Today', 'Calendar', 'Needs Review', 'Inbox']) {
      Array.from(sidebar.querySelectorAll('button'))
        .find((node) => node.textContent?.trim() === name)!
        .click();
      await new Promise(requestAnimationFrame);
    }
  });
  await expect(button(page, 'Inbox')).toHaveAttribute('aria-current', 'page');
  await settleMotion(page);
  await expect(page.locator('.main-content h1:visible')).toHaveText('Inbox');
  await expect(page.locator('.motion-exit-snapshot')).toHaveCount(0);
  await button(page, 'Settings').click();
  await settleMotion(page);
  await page.getByLabel('Enable reminders', { exact: true }).uncheck();
  expect(
    await page.locator('.main-content').evaluate((element) => element.getAnimations().length),
  ).toBe(0);
});

test('changing reduced motion settles a step swap and workspace entrance', async ({ page }) => {
  await page.goto('/');
  await button(page, 'Get Started').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('heading', { name: 'From chaos to clarity.' })).toBeFocused();
  await settleMotion(page);
  expect(
    await page
      .locator('.onboarding-step')
      .evaluate((element) => getComputedStyle(element).transform),
  ).toBe('none');
  await button(page, 'Skip tour').click();
  await button(page, 'Calendar').click();
  expect(
    await page
      .locator('.main-content')
      .evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.sidebar').getByRole('button', { name: 'Today', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settleMotion(page);
  await expect(page.locator('.main-content')).toHaveCSS('transform', 'none');
});

test('brand is inert, docks at measured geometry and does not replay Inbox entrance', async ({
  page,
}, info) => {
  await page.goto('/');
  await button(page, 'Get Started').click();
  await button(page, 'Continue').click();
  await button(page, 'Continue').click();
  await button(page, 'Start using TaskLens').click();
  const brand = page.locator('.brand-handoff');
  await expect(brand).toHaveAttribute('aria-hidden', 'true');
  expect(await brand.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await expect(brand).toHaveAttribute('data-phase', 'dock');
  const geometry = await brand.evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      if (
        (animation.effect as KeyframeEffect)
          .getKeyframes()
          .some((frame) => frame.transform === 'none')
      ) {
        animation.pause();
        animation.currentTime = Number(animation.effect!.getTiming().duration) - 1;
      }
    }
    const rect = (selector: string) => {
      const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect();
      return { x, y, width, height };
    };
    return [
      [rect('.brand-handoff-logo'), rect('.sidebar .brand img')],
      [rect('.brand-handoff-name'), rect('.sidebar .brand-name')],
    ];
  });
  for (const [traveling, target] of geometry) {
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(Math.abs(traveling[key] - target[key])).toBeLessThan(1);
  }
  await page.screenshot({ path: info.outputPath('brand-at-destination.png') });
  await brand.evaluate((element) =>
    element.getAnimations({ subtree: true }).forEach((animation) => animation.play()),
  );
  await expect(brand).toHaveCount(0);
  expect(
    await page.locator('.main-content').evaluate((element) => element.getAnimations().length),
  ).toBe(0);
  await expect(page.locator('#main-content')).toBeFocused();
});

test('resize and suspended brand animations cannot leave the workspace blocked', async ({
  page,
}) => {
  await page.goto('/');
  await button(page, 'Get Started').click();
  await button(page, 'Continue').click();
  await button(page, 'Continue').click();
  await button(page, 'Start using TaskLens').click();
  await expect(page.locator('.brand-handoff')).toHaveCount(1);
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeFocused();
  await button(page, 'Settings').click();
  await button(page, 'Replay onboarding').click();
  await button(page, 'Get Started').click();
  await button(page, 'Continue').click();
  await button(page, 'Continue').click();
  await button(page, 'Start using TaskLens').click();
  await page
    .locator('.brand-handoff')
    .evaluate((element) =>
      element.getAnimations({ subtree: true }).forEach((animation) => animation.pause()),
    );
  await expect(page.locator('.brand-handoff')).toHaveCount(0, { timeout: 4500 });
  expect(await page.locator('.app-shell').evaluate((node) => (node as HTMLElement).inert)).toBe(
    false,
  );
  await expect(page.locator('#main-content')).toBeFocused();
});

test('onboarding, previews, non-capture controls and dialogs are static while the logo intro still animates', async ({
  page,
}) => {
  await page.goto('/');
  const noMotion = async () => {
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(
      await page.locator('button').evaluateAll((buttons) =>
        buttons
          .filter((button) => !button.closest('.capture-region'))
          .every((button) =>
            getComputedStyle(button)
              .transitionDuration.split(',')
              .every((duration) => parseFloat(duration) === 0),
          ),
      ),
    ).toBe(true);
  };
  await noMotion();
  await button(page, 'Get Started').click();
  await expect(page.getByRole('heading', { name: 'From chaos to clarity.' })).toBeFocused();
  await noMotion();
  await page.getByRole('button', { name: /^Review/ }).click();
  await noMotion();
  await button(page, 'Continue').click();
  await noMotion();
  await button(page, 'Continue').click();
  await expect(page.getByLabel('Sample location')).toHaveValue('Campus');
  await noMotion();
  await button(page, 'Start using TaskLens').click();
  const intro = page.locator('.brand-handoff');
  await expect(intro).toBeVisible();
  expect(
    await intro.evaluate((element) => element.getAnimations({ subtree: true }).length),
  ).toBeGreaterThan(0);
  await expect(intro).toHaveCount(0);
  await noMotion();
  await page.getByRole('button', { name: 'Search your workspace', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Search your workspace' })).toBeVisible();
  await noMotion();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await button(page, 'New item').click();
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
  await noMotion();
});
