import type { Page } from '@playwright/test';
export async function settleMotion(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

/** Onboarding/brand regression suites continue in Inbox after the new first-run tour. */
export async function dismissGuidedTour(page: Page) {
  const dialog = page.locator('dialog[data-guided-tour]');
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}
