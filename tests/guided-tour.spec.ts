import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleMotion } from './motion-helpers';
import { newAction } from '../src/lib/actions';
import { defaultSettings } from '../src/types/action';

test.setTimeout(60_000);

const tour = (page: Page) => page.locator('dialog[data-guided-tour]');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const snapshot = (page: Page) => page.evaluate(() => localStorage.getItem('tasklens:data:v1'));
const status = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:guided-tour:v1') || 'null'));
async function completeOnboarding(page: Page) {
  await page.goto('/');
  for (const name of ['Get Started', 'Continue', 'Continue', 'Start using TaskLens'])
    await button(page, name).click();
}
async function replay(page: Page) {
  await button(page, 'Settings').click();
  await button(page, 'Replay guided tour').click();
  await expect(tour(page)).toBeVisible();
}
async function verifyGeometry(page: Page) {
  await settleMotion(page);
  await expect(page.locator('.tour-card')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-tour-target]')).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const card = document.querySelector('.tour-card')!.getBoundingClientRect();
        const target = document.querySelector('[data-tour-target]')!.getBoundingClientRect();
        return (
          card.left >= 11 &&
          card.top >= 11 &&
          card.right <= innerWidth - 11 &&
          card.bottom <= innerHeight - 11 &&
          !(
            card.left < target.right &&
            card.right > target.left &&
            card.top < target.bottom &&
            card.bottom > target.top
          )
        );
      }),
    )
    .toBe(true);
}

test('first-run tour starts after the complete handoff and never repeats on restart', async ({
  page,
}) => {
  await completeOnboarding(page);
  await expect(page.locator('.brand-handoff')).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  await expect(tour(page)).toBeVisible();
  await expect(tour(page).getByRole('heading')).toBeFocused();
  await expect(page.getByText('Drop your first screenshot here')).toHaveCount(0);
  expect(await status(page)).toEqual({ status: 'started' });
  await button(page, 'Skip tour').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page.getByText('Drop your first screenshot here')).toBeVisible();
  expect(await status(page)).toEqual({ status: 'skipped' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
});

for (const width of [1440, 900, 600]) {
  test(`all 12 steps highlight real elements, remain accessible and preserve data at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 1440 ? 920 : 640 });
    await page.goto('/tests/groq-harness.html?offline');
    const before = await snapshot(page);
    const counts = await page.evaluate(() => ({ ...Reflect.get(window, 'groqTest').counts }));
    await replay(page);
    for (let index = 0; index < 12; index++) {
      await expect(page.locator('.tour-card-header')).toContainText(`${index + 1} of 12`);
      await verifyGeometry(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if ([0, 1, 3, 6, 8, 9, 10, 11].includes(index))
        await page.screenshot({ path: info.outputPath(`tour-${width}-${index + 1}.png`) });
      await button(page, index === 11 ? 'Finish tour' : 'Next').click();
    }
    await expect(tour(page)).toHaveCount(0);
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    expect(await status(page)).toEqual({ status: 'completed' });
    expect(await snapshot(page)).toBe(before);
    expect(await page.evaluate(() => ({ ...Reflect.get(window, 'groqTest').counts }))).toEqual(
      counts,
    );
    await page.reload();
    await expect(tour(page)).toHaveCount(0);
  });
}

test('onboarding skip and existing upgrades do not auto-start; replay Escape restores Settings and drafts', async ({
  page,
}) => {
  await page.goto('/');
  await button(page, 'Skip tour').click();
  await expect(tour(page)).toHaveCount(0);
  expect(await status(page)).toBeNull();
  await button(page, 'Capture text').click();
  await page.getByLabel('Information to capture').fill('Keep this unsaved capture');
  await button(page, 'Settings').click();
  await page.locator('.settings-advanced > summary').click();
  const before = await snapshot(page);
  await page.locator('.main-content').evaluate((el) => {
    el.scrollTop = 80;
  });
  const scroll = await page.locator('.main-content').evaluate((el) => el.scrollTop);
  await button(page, 'Replay guided tour').click();
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  await expect(tour(page)).toHaveAttribute('data-step', 'welcome');
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Control+Shift+Space');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(button(page, 'Replay guided tour')).toBeFocused();
  await expect
    .poll(() => page.locator('.main-content').evaluate((el) => el.scrollTop))
    .toBe(scroll);
  await expect(page.locator('.settings-advanced')).toHaveAttribute('open', '');
  expect(await snapshot(page)).toBe(before);
  await button(page, 'Inbox').click();
  await expect(page.getByLabel('Information to capture')).toHaveValue('Keep this unsaved capture');
  await page.reload();
  await expect(tour(page)).toHaveCount(0);
});

test('collapsed sidebar, missing targets and reduced motion recover without changing preferences', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html');
  await page.getByRole('button', { name: 'Toggle sidebar (Ctrl + Shift + Space)' }).click();
  await replay(page);
  await expect(page.locator('.sidebar')).toHaveAttribute('data-collapsed', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      page.locator('.guided-tour').evaluate((el) => el.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await verifyGeometry(page);
  await page
    .locator('[data-tour="screenshot"], [data-tour="inbox-heading"]')
    .evaluateAll((elements) => elements.forEach((el) => el.removeAttribute('data-tour')));
  await button(page, 'Next').click();
  await expect(
    page.getByText(
      'This feature’s usual location isn’t visible right now. You can continue exploring.',
    ),
  ).toBeVisible();
  await button(page, 'Next').click();
  await expect(page.locator('[data-tour-target]')).toHaveCount(1);
  await page.keyboard.press('Tab');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-guided-tour]'))).toBe(
      true,
    );
  }
  await button(page, 'Skip tour').click();
  await expect(page.locator('.sidebar')).toHaveAttribute('data-collapsed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('tasklens:sidebar-collapsed:v1'))).toBe(
    'true',
  );
});

test('tour storage failure stays dismissible and an unexpected modal is never stacked', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'tasklens:guided-tour:v1') throw new Error('quota');
      original.call(this, key, value);
    };
  });
  await replay(page);
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'conflict';
    dialog.textContent = 'Another dialog';
    document.body.append(dialog);
    dialog.showModal();
  });
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator('#conflict')).toBeVisible();
  await page.evaluate(() => document.querySelector<HTMLDialogElement>('#conflict')!.close());
  await expect(button(page, 'Replay guided tour')).toBeVisible();
  await button(page, 'Replay guided tour').click();
  await page.keyboard.press('Escape');
  await expect(button(page, 'Replay guided tour')).toBeFocused();
});

test('reduced-motion first run bypasses handoff, and interrupted tours remain opt-in', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await completeOnboarding(page);
  await expect(page.locator('.brand-handoff')).toHaveCount(0);
  await expect(tour(page)).toBeVisible();
  expect(await tour(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
});

test('every Back transition preserves populated collections and Finish returns to Inbox', async ({
  page,
}) => {
  const item = {
    ...newAction(),
    title: 'Keep my existing task',
    notes: ['Private note'],
    date: '2099-12-01',
  };
  await page.addInitScript(
    ({ item, settings }) => {
      if (!localStorage.getItem('tasklens:data:v1'))
        localStorage.setItem(
          'tasklens:data:v1',
          JSON.stringify({
            version: 1,
            actions: [item],
            settings: { ...settings, onboardingCompletedVersion: 1 },
          }),
        );
    },
    { item, settings: defaultSettings },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  const before = await snapshot(page);
  await replay(page);
  for (let index = 1; index < 12; index++) {
    await button(page, 'Next').click();
    await expect(page.locator('.tour-card-header')).toContainText(`${index + 1} of 12`);
  }
  for (let index = 10; index >= 0; index--) {
    await page.getByRole('button', { name: 'Back to previous tour step' }).click();
    await expect(page.locator('.tour-card-header')).toContainText(`${index + 1} of 12`);
    await expect(page.locator('[data-tour-target]')).toHaveCount(1);
  }
  await expect(tour(page).getByRole('heading')).toBeFocused();
  for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowRight');
  await button(page, 'Finish tour').click();
  await expect(page.locator('#main-content')).toBeFocused();
  expect(await snapshot(page)).toBe(before);
});

test('capture ownership, AI mode setup, and unsaved task editors block replay', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html?fresh');
  await button(page, 'Capture text').click();
  await page.getByLabel('Information to capture').fill('A note for tomorrow');
  await button(page, 'Extract actions').click();
  await expect(page.locator('.ai-setup-dialog')).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  await button(page, 'Settings').click();
  await button(page, 'Replay guided tour').click();
  await button(page, 'Skip tour').click();
  await button(page, 'Inbox').click();
  await expect(page.getByLabel('Information to capture')).toHaveValue('A note for tomorrow');
  await button(page, 'New item').click();
  await page.getByLabel('Title', { exact: true }).fill('Keep this editor draft');
  await button(page, 'Settings').click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Keep this editor draft');
  await expect(tour(page)).toHaveCount(0);
});

test('a missing feature uses its section fallback and tracks real resize/scroll geometry', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html');
  await replay(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-tour="screenshot"]').evaluate((el) => el.removeAttribute('data-tour'));
  await button(page, 'Next').click();
  await expect(page.locator('.tour-target-notice')).toBeVisible();
  await expect(page.locator('[data-tour-target]')).toHaveCount(1);
  await page.setViewportSize({ width: 900, height: 640 });
  await verifyGeometry(page);
  await page.locator('.main-content').evaluate((el) => {
    el.scrollTop = 40;
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const element = document
          .querySelector('[data-tour="inbox-heading"]')!
          .getBoundingClientRect();
        const outline = document.querySelector('[data-tour-target]')!.getBoundingClientRect();
        return Math.abs(outline.left - element.left + 8) < 1;
      }),
    )
    .toBe(true);
  await button(page, 'Skip tour').click();
});

test('screenshot preparation blocks replay and its retained source survives the tour', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html');
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      await decode.call(this);
      await new Promise<void>((resolve) => Reflect.set(window, 'releaseImage', resolve));
    };
  });
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await expect(page.getByText('Preparing image…', { exact: true })).toBeVisible();
  await button(page, 'Settings').click();
  await expect(button(page, 'Replay guided tour')).toBeDisabled();
  await expect(tour(page)).toHaveCount(0);
  await page.evaluate(() => Reflect.get(window, 'releaseImage')());
  await expect(button(page, 'Replay guided tour')).toBeEnabled();
  await button(page, 'Replay guided tour').click();
  await button(page, 'Next').click();
  await expect(tour(page)).toHaveAttribute('data-step', 'screenshot');
  await expect(page.locator('[data-tour="screenshot"]')).toContainText('pictorial.png');
  await expect(page.locator('[data-tour-target]')).toHaveCount(1);
  await button(page, 'Skip tour').click();
  await button(page, 'Inbox').click();
  await expect(page.locator('.upload-header')).toContainText('pictorial.png');
});

test('legacy profiles remain opt-in even when they complete the existing onboarding', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'tasklens:data:v1',
      JSON.stringify({
        version: 1,
        actions: [],
        settings: {
          theme: 'light',
          remindersEnabled: true,
          defaultReminders: ['night', 'hour', 'quarter'],
        },
      }),
    ),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await completeOnboarding(page);
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  expect(await status(page)).toBeNull();
});

test('external workspace reload cannot overlap the tour with onboarding or recovery', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html');
  await replay(page);
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('tasklens:data:v1')!);
    stored.settings.onboardingCompletedVersion = 0;
    localStorage.setItem('tasklens:data:v1', JSON.stringify(stored));
    window.dispatchEvent(new StorageEvent('storage', { key: 'tasklens:data:v1' }));
  });
  await expect(
    page.getByRole('heading', { name: 'Turn information into action. Privately.' }),
  ).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  expect(await status(page)).toEqual({ status: 'skipped' });
});
