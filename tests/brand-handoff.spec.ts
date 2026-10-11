import { expect, test, type Page } from '@playwright/test';
import { settleMotion } from './motion-helpers';

async function demoStep(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

for (const width of [1440, 900, 600]) {
  test(`brand reveals and docks into the sidebar at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 920 });
    await demoStep(page);
    await page.getByRole('button', { name: 'Start using TaskLens', exact: true }).click();
    const intro = page.getByRole('status', { name: 'Opening TaskLens', exact: true });
    await expect(intro).toBeVisible();
    await expect(intro).toHaveAttribute('data-phase', 'reveal');
    await intro.evaluate((element) => {
      element.getAnimations({ subtree: true }).forEach((animation) => animation.pause());
    });
    expect(await page.locator('.app-shell').evaluate((node) => (node as HTMLElement).inert)).toBe(
      true,
    );
    await expect(page.locator('.sidebar .brand')).toHaveCSS('visibility', 'hidden');
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`brand-reveal-${width}.png`) });
    await intro.evaluate((element) => {
      element.getAnimations({ subtree: true }).forEach((animation) => animation.play());
    });
    await expect(intro).toHaveAttribute('data-phase', 'dock');
    await expect(intro).toHaveCount(0);
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page.locator('.sidebar .brand')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('.sidebar .brand img')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    await expect(page.getByText('Drop your first screenshot here')).toBeVisible();
    await settleMotion(page);
    const logo = (await page.locator('.sidebar .brand img').boundingBox())!;
    expect(logo.x).toBeLessThan(40);
    expect(logo.y).toBeLessThan(40);
    await page.screenshot({ path: testInfo.outputPath(`brand-docked-${width}.png`) });
    const snapshot = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('tasklens:data:v1')!),
    );
    expect(snapshot.settings.onboardingCompletedVersion).toBe(1);
    expect(snapshot.actions).toEqual([]);
    await page.reload();
    await expect(intro).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  });
}

test('reduced motion skips the brand sequence and settles an in-flight handoff', async ({
  page,
}) => {
  await demoStep(page);
  await page.getByRole('button', { name: 'Start using TaskLens', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Opening TaskLens', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeFocused();
  await settleMotion(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Replay onboarding', exact: true }).click();
  await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Start using TaskLens', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  await expect(page.getByText('Drop your first screenshot here')).toHaveCount(0);
});

test('a failed completion save never starts the brand sequence', async ({ page }) => {
  await demoStep(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
  });
  await page.getByRole('button', { name: 'Start using TaskLens', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start using TaskLens', exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('tasklens:data:v1'))).toBeNull();
});
