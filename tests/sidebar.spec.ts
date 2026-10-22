import { expect, test } from '@playwright/test';
import { settleMotion } from './motion-helpers';
const toggleName = 'Toggle sidebar (Ctrl + Shift + Space)';
for (const width of [1440, 900, 600]) {
  test(`sidebar layout, logo hover, navigation and persistence at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 900 ? 640 : 760 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
    const rail = page.getByRole('complementary', { name: 'Workspace navigation' });
    const toggle = page.getByRole('button', { name: toggleName });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(rail.locator('.brand-name')).toHaveText('TaskLens');
    await toggle.click();
    await settleMotion(page);
    await expect(rail).toHaveCSS('width', '72px');
    await expect(rail).toHaveCSS('transition-duration', '0.2s');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('title', toggleName);
    const logo = rail.locator('.brand img');
    const icon = toggle.locator('svg');
    const before = await toggle.boundingBox();
    await page.mouse.move(width - 10, 500);
    await toggle.evaluate((e: HTMLElement) => e.blur());
    await expect(logo).toHaveCSS('visibility', 'visible');
    await expect(icon).toHaveCSS('visibility', 'hidden');
    await toggle.hover();
    await expect(logo).toHaveCSS('visibility', 'hidden');
    await expect(icon).toHaveCSS('visibility', 'visible');
    expect(await toggle.boundingBox()).toEqual(before);
    expect(await logo.getAttribute('src')).toBe('/TaskLens.png');
    await page.mouse.move(width - 10, 500);
    await toggle.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(icon).toHaveCSS('visibility', 'visible');
    for (const name of [
      'Today',
      'Calendar',
      'All Tasks',
      'Completed',
      'Needs Review',
      'Settings',
      'Inbox',
    ]) {
      const nav = rail.getByRole('button', { name, exact: true });
      await nav.click();
      await expect(nav).toHaveAttribute('aria-current', 'page');
      await expect(nav).toHaveAttribute('title', name);
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const settings = await rail
      .getByRole('button', { name: 'Settings', exact: true })
      .boundingBox();
    expect(settings!.y + settings!.height).toBeLessThanOrEqual(
      await page.evaluate(() => innerHeight),
    );
    await page.screenshot({ path: info.outputPath(`sidebar-collapsed-${width}.png`) });
    await page.reload();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(rail).toHaveCSS('width', '72px');
    await toggle.click();
    await settleMotion(page);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(rail.getByRole('button', { name: 'Inbox', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`sidebar-expanded-${width}.png`) });
  });
}
test('shortcut toggles immediately, preserves drafts and respects dialogs and composition', async ({
  page,
}) => {
  await page.goto('/tests/voice-harness.html');
  const toggle = page.getByRole('button', { name: toggleName });
  await page.getByRole('button', { name: 'Capture text', exact: true }).click();
  const input = page.getByLabel('Information to capture');
  await input.fill('Keep this unsaved draft');
  await page.keyboard.press('Control+Shift+Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue('Keep this unsaved draft');
  await page.keyboard.press('Control+Shift+Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        ctrlKey: true,
        shiftKey: true,
        repeat: true,
      }),
    ),
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        ctrlKey: true,
        shiftKey: true,
        isComposing: true,
      }),
    ),
  );
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Search your workspace' })).toBeVisible();
  await page.keyboard.press('Control+Shift+Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('Keep this unsaved draft');
});
test('sidebar shortcut preserves active voice capture and reduced motion has no transition', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tests/voice-harness.html');
  await page.getByRole('button', { name: 'Record a voice note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Done recording', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.locator('.sidebar')).toHaveCSS('width', '72px');
  await expect(page.locator('.sidebar')).toHaveCSS('transition-duration', '0s');
  await expect(page.getByRole('button', { name: 'Done recording', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('button', { name: toggleName })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Done recording', exact: true })).toBeVisible();
});
test('onboarding does not intercept the sidebar shortcut', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+Space');
  expect(
    await page.evaluate(() => localStorage.getItem('tasklens:sidebar-collapsed:v1')),
  ).toBeNull();
});
