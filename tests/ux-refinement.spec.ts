import { expect, test, type Page } from '@playwright/test';
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function textIntent(page: Page) {
  await button(page, 'Capture text').click();
  await page.getByLabel('Information to capture').fill('Pictorial at campus.');
  await button(page, 'Extract actions').click();
}
async function wizard(page: Page) {
  await button(page, 'Continue').click();
  await button(page, 'I have my key').click();
  await page.getByLabel('Groq API key', { exact: true }).fill('synthetic-fixture-key');
  await button(page, 'Connect & verify').click();
  await expect(
    page.getByRole('heading', { name: 'Privacy permission', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
  await page.getByRole('checkbox', { name: 'I agree to send source text to Groq' }).check();
  await button(page, 'Agree & continue').click();
  await button(page, 'Start using TaskLens').click();
}
async function configure(page: Page, query = '') {
  await page.goto(`/tests/groq-harness.html?${query}`);
  await button(page, 'Settings').click();
  await page.getByRole('radio', { name: /Groq Cloud/ }).click();
  await wizard(page);
  await page.getByRole('button', { name: /^Inbox/ }).click();
}
for (const width of [1440, 900])
  test(`Settings boundaries keep the sidebar fixed at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 900 ? 640 : 920 });
    await page.goto('/tests/groq-harness.html');
    await button(page, 'Settings').click();
    for (const expanded of [false, true]) {
      if (expanded) await page.locator('.settings-advanced > summary').click();
      const scroller = page.locator('.main-content');
      await scroller.evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
      await page.mouse.move(width - 70, 500);
      await page.mouse.wheel(0, 2000);
      await page.keyboard.press('PageDown');
      await expect
        .poll(() =>
          page.evaluate(() => ({
            y: scrollY,
            sidebar: document.querySelector('.sidebar')!.getBoundingClientRect().y,
            extra: document.documentElement.scrollHeight - innerHeight,
            horizontal: document.documentElement.scrollWidth - innerWidth,
          })),
        )
        .toEqual({ y: 0, sidebar: 0, extra: 0, horizontal: 0 });
      await page.mouse.wheel(0, -10000);
      await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBe(0);
      if (expanded) {
        await page.getByLabel('Developer mode', { exact: true }).focus();
        const before = await scroller.evaluate((e) => e.scrollTop);
        await page.keyboard.press('PageUp');
        await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBeLessThan(before);
        const upper = await scroller.evaluate((e) => e.scrollTop);
        await page.keyboard.press('PageDown');
        await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(upper);
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => scrollY)).toBe(0);
      }
    }
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Search your workspace' })).toBeVisible();
    await page.mouse.wheel(0, 1200);
    await expect(page.locator('.main-content')).toHaveCSS('overflow-y', 'hidden');
    await page.keyboard.press('Escape');
    await expect(page.locator('.main-content')).toHaveCSS('overflow-y', 'auto');
  });
test('fresh online capture prompts once, securely connects, and resumes retained text', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html?fresh');
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  await textIntent(page);
  await expect(
    page.getByRole('heading', { name: 'How would you like TaskLens to process your information?' }),
  ).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.getByRole('button', { name: /^Online AI/ }).click();
  await wizard(page);
  await expect(page.locator('.bundle-review[open]')).toBeVisible();
  expect(await page.getByLabel('Information to capture').inputValue()).toBe('Pictorial at campus.');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).settings.ai.modeChoiceCompleted,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('tasklens:data:v1'))).not.toContain(
    'synthetic-fixture-key',
  );
});
for (const network of ['offline', 'unknown'])
  test(`fresh ${network} capture skips online setup and never uploads`, async ({ page }) => {
    await page.goto(`/tests/groq-harness.html?fresh&${network}`);
    await textIntent(page);
    await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
    await expect(page.getByLabel('Information to capture')).toHaveValue('Pictorial at campus.');
    expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).settings.ai.modeChoiceCompleted,
      ),
    ).toBe(false);
  });
test('wizard cancellation retains a screenshot, chooses Local, and makes no source request', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html?fresh');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await page.getByRole('button', { name: /^Online AI/ }).click();
  await button(page, 'Continue').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  await expect(page.getByLabel('Screenshot capture').locator('img')).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).settings.ai),
  ).toMatchObject({ executionMode: 'local', modeChoiceCompleted: true });
});
test('network loss cancels extraction and restoration never resumes uploads', async ({ page }) => {
  await configure(page, 'slow');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await expect(page.getByText('Sending securely…', { exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.get(window, 'groqTest').network(false));
  await expect(page.getByLabel('Screenshot capture')).toHaveAttribute('data-state', 'cancelled');
  await expect(button(page, 'Retry locally')).toBeVisible();
  await expect(page.getByLabel('Screenshot capture').locator('img')).toBeVisible();
  await page.evaluate(() => Reflect.get(window, 'groqTest').network(true));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(1);
  await button(page, 'Settings').click();
  await page.getByLabel('Enable reminders', { exact: true }).uncheck();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').connection.enabled)).toBe(false);
});
test('successful confirmation awaits storage, suppresses duplicate clicks, closes and restores focus', async ({
  page,
}) => {
  await configure(page, 'save-slow');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  const dialog = page.locator('.inbox-result-dialog[open]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Confirm & save/ }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Task saved.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-open-result]')).toBeFocused();
  expect(await page.evaluate(() => Reflect.get(window, 'reviewWrites')())).toBe(1);
});
test('failed save retains edits and dialog; successful retry closes it', async ({ page }) => {
  await configure(page, 'save-fail-once');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await button(page, 'Edit details').click();
  await page.getByLabel('Title', { exact: true }).fill('Reviewed pictorial');
  await button(page, 'Confirm & save').click();
  await expect(page.getByText('Fixture storage failure. Edits retained.')).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Reviewed pictorial');
  await button(page, 'Confirm & save').click();
  await expect(page.locator('.inbox-result-dialog[open]')).toHaveCount(0);
});
test('reminder warning survives successful review dismissal and is not a success check', async ({
  page,
}) => {
  await configure(page, 'reminder-warning');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await page.getByRole('button', { name: /^Confirm & save/ }).click();
  await expect(page.locator('.inbox-result-dialog[open]')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveAttribute('data-tone', 'warning');
  await expect(page.locator('.toast')).toContainText('Reminder delivery is paused');
});
test('capture motion is scoped and reduced motion remains static', async ({ page }) => {
  await configure(page, 'slow');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await expect(page.locator('.capture-spinner').first()).toHaveCSS('animation-duration', '1.2s');
  await expect(page.locator('.sidebar')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.capture-spinner').first()).toHaveCSS('animation-name', 'none');
  await button(page, 'Cancel processing').click();
  await expect(page.locator('.processing-title .capture-spinner')).toHaveCount(0);
});

async function voiceBundle(page: Page, query = '') {
  await page.goto(`/tests/voice-harness.html?${query}`);
  await button(page, 'Record a voice note').click();
  await button(page, 'Done recording').click();
  await expect(page.getByRole('dialog', { name: 'Captured actions' })).toBeVisible();
}
test('multi-action confirmation advances without losing sibling edits and closes after the last save', async ({
  page,
}) => {
  await voiceBundle(page);
  await page.getByLabel('Review action').selectOption('1');
  await button(page, 'Edit details').click();
  await page.getByLabel('Title', { exact: true }).fill('Consultation reviewed');
  await page
    .locator('.bundle-panel:not([hidden])')
    .getByRole('textbox', { name: 'Requirements', exact: true })
    .fill('Edited requirement\nAnother requirement');
  await page.getByLabel('Review action').selectOption('0');
  await page.getByRole('button', { name: /^Confirm & save/ }).click();
  await expect(page.getByLabel('Review action')).toHaveValue('1');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Consultation reviewed');
  await expect(
    page
      .locator('.bundle-panel:not([hidden])')
      .getByRole('textbox', { name: 'Requirements', exact: true }),
  ).toHaveValue('Edited requirement\nAnother requirement');
  await button(page, 'Confirm & save').click();
  await expect(page.locator('.bundle-review[open]')).toHaveCount(0);
  const actions = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions,
  );
  expect(actions).toHaveLength(2);
  expect(actions.every((a: { status: string }) => a.status === 'confirmed')).toBe(true);
  expect(
    actions.find((a: { title: string }) => a.title === 'Consultation reviewed').requirements,
  ).toEqual(['Edited requirement', 'Another requirement']);
});
test('Save drafts & finish validates every mounted editor and resumes a partial failure without duplicate writes', async ({
  page,
}) => {
  await voiceBundle(page, 'save-second-fail');
  await button(page, 'Edit details').click();
  await page.getByLabel('Notes', { exact: true }).fill('First draft note');
  await page.getByLabel('Review action').selectOption('1');
  await button(page, 'Edit details').click();
  await page
    .locator('.bundle-panel:not([hidden])')
    .getByLabel('Location', { exact: true })
    .fill('Retained room');
  await button(page, 'Save drafts & finish').click();
  await expect(page.getByText('Second draft could not be saved.')).toBeVisible();
  await expect(
    page.locator('.bundle-panel:not([hidden])').getByLabel('Location', { exact: true }),
  ).toHaveValue('Retained room');
  expect(await page.evaluate(() => Reflect.get(window, 'reviewWrites')())).toBe(2);
  await button(page, 'Save drafts & finish').click();
  await expect(page.locator('.bundle-review[open]')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'reviewWrites')())).toBe(3);
  const actions = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions,
  );
  expect(actions).toHaveLength(2);
  expect(actions.every((a: { status: string }) => a.status === 'needs_review')).toBe(true);
  expect(actions.some((a: { notes: string[] }) => a.notes.includes('First draft note'))).toBe(true);
});

test('Escape from the first-use chooser retains the draft without starting extraction', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html?fresh');
  await textIntent(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  await expect(page.getByLabel('Information to capture')).toHaveValue('Pictorial at campus.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('tasklens:data:v1')!).settings.ai),
  ).toMatchObject({ executionMode: 'local', modeChoiceCompleted: true });
});
test('temporary connection failures keep the key step and never become invalid-key errors', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html?fresh&connect-network');
  await textIntent(page);
  await page.getByRole('button', { name: /^Online AI/ }).click();
  await button(page, 'Continue').click();
  await button(page, 'I have my key').click();
  await page.getByLabel('Groq API key', { exact: true }).fill('synthetic-fixture-key');
  await button(page, 'Connect & verify').click();
  await expect(page.getByRole('alert')).toContainText('Could not reach Groq');
  await expect(page.getByRole('heading', { name: 'Connect your key', exact: true })).toBeVisible();
  await expect(page.getByLabel('Groq API key', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
});

test('explicit verification can establish Groq availability when OS connectivity is unknown', async ({
  page,
}) => {
  await configure(page, 'unknown');
  await expect(
    page.getByText('Connectivity unavailable — using Local AI.', { exact: true }),
  ).toHaveCount(0);
  await textIntent(page);
  await expect(page.locator('.bundle-review[open]')).toBeVisible();
});

test('loss during local transcription retains the transcript without silently choosing another provider', async ({
  page,
}) => {
  await configure(page, 'slow-transcription');
  await button(page, 'Record a voice note').click();
  await button(page, 'Done recording').click();
  await expect(
    page.getByRole('heading', { name: 'Transcribing locally…', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => Reflect.get(window, 'groqTest').network(false));
  await expect(page.getByRole('heading', { name: 'Capture cancelled', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Captured input' })).toContainText(
    'Pictorial at campus.',
  );
  await expect(button(page, 'Retry locally')).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
});

test('preference storage failure cannot trap a user inside setup or repeat the chooser this session', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html?fresh&settings-fail');
  await textIntent(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  await expect(page.getByLabel('Information to capture')).toHaveValue('Pictorial at campus.');
  await expect(
    page.getByText('Using Local AI for this session. The preference could not be saved.', {
      exact: true,
    }),
  ).toBeVisible();
  await button(page, 'Extract actions').click();
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
  await button(page, 'New item').click();
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
});

test('editor fields stay locked until a confirmed write finishes', async ({ page }) => {
  await configure(page, 'save-slow');
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles('tests/fixtures/screenshots/pictorial.png');
  await button(page, 'Edit details').click();
  const title = page.getByLabel('Title', { exact: true });
  await title.fill('Reviewed before saving');
  await button(page, 'Confirm & save').click();
  await expect(title).toBeDisabled();
  await expect(page.locator('.inbox-result-dialog[open]')).toHaveCount(0);
  const actions = await page.evaluate(
    () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).actions,
  );
  expect(actions[0].title).toBe('Reviewed before saving');
  expect(await page.evaluate(() => Reflect.get(window, 'reviewWrites')())).toBe(1);
});

test('connectivity loss dismisses the initial chooser without completing the choice or uploading', async ({
  page,
}) => {
  await page.goto('/tests/groq-harness.html?fresh');
  await textIntent(page);
  await page.evaluate(() => Reflect.get(window, 'groqTest').network(false));
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  await expect(page.getByLabel('Information to capture')).toHaveValue('Pictorial at campus.');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('tasklens:data:v1')!).settings.ai.modeChoiceCompleted,
    ),
  ).toBe(false);
  expect(await page.evaluate(() => Reflect.get(window, 'groqTest').counts.generated)).toBe(0);
  await page.evaluate(() => Reflect.get(window, 'groqTest').network(true));
  await expect(page.locator('.ai-setup-dialog')).toHaveCount(0);
  await button(page, 'Extract actions').click();
  await expect(page.locator('.ai-setup-dialog[open]')).toBeVisible();
});
