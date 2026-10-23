import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { dismissGuidedTour, settleMotion } from './motion-helpers';

test.use({ video: 'on' });
test.setTimeout(90000);
for (const viewport of [
  { width: 1440, height: 920 },
  { width: 900, height: 640 },
]) {
  test(`record motion acceptance at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto(process.env.TASKLENS_MOTION_BASELINE_URL || '/');
    const measurements: unknown[] = [];
    for (const [title, next] of [
      ['Turn information into action. Privately.', 'Get Started'],
      ['From chaos to clarity.', 'Continue'],
      ['Stay ahead without thinking about it.', 'Continue'],
      ['See TaskLens in action.', 'Start using TaskLens'],
    ]) {
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeFocused();
      await settleMotion(page);
      measurements.push(
        await page.evaluate(() => ({
          title: document.querySelector('.onboarding-step h1')!.textContent,
          scrollY,
          viewport: innerHeight,
          shell: ['.onboarding-header', '.onboarding-progress', '.onboarding-actions'].map(
            (selector) => ({
              selector,
              ...document.querySelector(selector)!.getBoundingClientRect().toJSON(),
            }),
          ),
        })),
      );
      await page.screenshot({ path: info.outputPath(`${measurements.length}-step.png`) });
      if (title === 'From chaos to clarity.') {
        for (const name of ['Review', 'Remember', 'Capture']) {
          await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
          await settleMotion(page);
        }
      }
      if (title === 'See TaskLens in action.')
        await page.getByLabel('Sample location').fill('Demo campus');
      await page.getByRole('button', { name: next, exact: true }).click();
    }
    await expect(page.locator('.brand-handoff')).toHaveAttribute('data-phase', 'reveal');
    await page.screenshot({ path: info.outputPath('5-brand-reveal.png') });
    await expect(page.locator('.brand-handoff')).toHaveAttribute('data-phase', 'dock');
    await page.screenshot({ path: info.outputPath('6-brand-travel.png') });
    await expect(page.locator('.brand-handoff')).toHaveCount(0);
    if (!process.env.TASKLENS_MOTION_BASELINE_URL) await dismissGuidedTour(page);
    await settleMotion(page);
    await page.screenshot({ path: info.outputPath('7-inbox-arrival.png') });
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
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
      await settleMotion(page);
      await page.screenshot({ path: info.outputPath(`page-${name}.png`) });
    }
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    await expect(page.locator('.brand-handoff')).toHaveCount(0);
    await writeFile(info.outputPath('layout.json'), JSON.stringify(measurements, null, 2));
  });
}
