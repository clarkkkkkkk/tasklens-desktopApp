import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { phrases } from './fixtures/voice';
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const waitForContent = async (page: Page) => {
  await page.locator('.capture-card-content').evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => {})),
    );
  });
};
for (const viewport of [
  { width: 1440, height: 920 },
  { width: 900, height: 640 },
]) {
  test(`voice capture stages and light layout at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/tests/voice-harness.html?staged');
    const card = page.locator('.capture-card');
    await expect(button(page, 'Voice')).toHaveCount(0);
    expect(
      await page
        .locator('.dropzone')
        .evaluate((drop) =>
          Boolean(
            drop.compareDocumentPosition(document.querySelector('.voice-capture')!) &
            Node.DOCUMENT_POSITION_PRECEDING,
          ),
        ),
    ).toBe(true);
    await expect(button(page, 'Record a voice note')).toBeVisible();
    await expect(page.getByLabel('Upload screenshot')).toBeAttached();
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.screenshot({ path: info.outputPath('01-idle.png') });
    await card.screenshot({ path: info.outputPath('01-idle-card.png') });
    const initial = await card.boundingBox();
    const feedback = await button(page, 'Record a voice note').evaluate(async (node) => {
      const started = performance.now();
      (node as HTMLButtonElement).click();
      await new Promise(requestAnimationFrame);
      return {
        nextFrameMs: performance.now() - started,
        stage: document.querySelector('.capture-primary h2')?.textContent,
      };
    });
    await info.attach('capture-feedback', {
      body: JSON.stringify(feedback),
      contentType: 'application/json',
    });
    await expect(page.getByRole('heading', { name: 'Recording', exact: true })).toBeVisible();
    await expect(button(page, 'Done recording')).toBeFocused();
    await waitForContent(page);
    const recorded = await card.boundingBox();
    expect(initial!.height).toBeLessThan(240);
    expect(recorded!.height).toBeLessThan(320);
    await expect(page.locator('.voice-waveform > span')).toHaveCount(48);
    const waveformBounds = await page.locator('.voice-waveform').boundingBox();
    const cardBounds = await card.boundingBox();
    expect(
      Math.abs(
        waveformBounds!.x + waveformBounds!.width / 2 - (cardBounds!.x + cardBounds!.width / 2),
      ),
    ).toBeLessThan(1);
    await expect
      .poll(() =>
        page
          .locator('.voice-waveform > span')
          .evaluateAll(
            (bars) => new Set(bars.map((bar) => (bar as HTMLElement).style.transform)).size,
          ),
      )
      .toBeGreaterThan(1);
    await page.screenshot({ path: info.outputPath('02-recording.png') });
    await card.screenshot({ path: info.outputPath('02-recording-card.png') });
    await info.attach('capture-layout', {
      body: JSON.stringify({ idleHeight: initial!.height, recordingHeight: recorded!.height }),
      contentType: 'application/json',
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page.getByLabel('Upload screenshot')).toBeDisabled();
    await button(page, 'Done recording').click();
    await expect(
      page.getByRole('heading', { name: 'Preparing audio…', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('03-preparing.png') });
    await expect(
      page.getByRole('heading', { name: 'Transcribing locally…', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('04-transcribing.png') });
    await expect(
      page.getByRole('region', { name: 'Original transcript', exact: true }),
    ).toContainText(phrases[0]);
    await expect(
      page.getByRole('heading', { name: 'Understanding details…', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('05-transcript.png') });
    await expect(page.getByRole('dialog', { name: 'Captured actions' })).toBeVisible();
    await button(page, 'Close review').click();
    await expect(button(page, 'Review actions')).toBeVisible();
    await page.screenshot({ path: info.outputPath('06-ready.png') });
    await button(page, 'Import audio').click();
    await expect(button(page, 'Choose audio file')).toBeVisible();
    await waitForContent(page);
    await page.screenshot({ path: info.outputPath('07-import.png') });
    await button(page, 'Capture text').click();
    await page.getByLabel('Information to capture').fill('A draft to keep');
    await waitForContent(page);
    await page.screenshot({ path: info.outputPath('08-text.png') });
    await button(page, 'Capture text').click();
    await button(page, 'Today').click();
    await button(page, 'Inbox').click();
    await button(page, 'Capture text').click();
    await expect(page.getByLabel('Information to capture')).toHaveValue('A draft to keep');
    await expect(
      page.getByRole('region', { name: 'Original transcript', exact: true }),
    ).toContainText(phrases[0]);
    await button(page, 'Review actions').click();
    await expect(page.getByRole('dialog', { name: 'Captured actions' })).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('mode switches guard recording, cleanup finishes, and double starts are ignored', async ({
  page,
}) => {
  await page.goto('/tests/voice-harness.html?slow');
  await button(page, 'Record a voice note').evaluate((node) => {
    (node as HTMLButtonElement).click();
    (node as HTMLButtonElement).click();
  });
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'voiceTest').starts)).toBe(1);
  await button(page, 'Capture text').click();
  await button(page, 'Keep capturing').click();
  await expect(page.getByRole('heading', { name: 'Recording', exact: true })).toBeVisible();
  await button(page, 'Import audio').click();
  await button(page, 'Cancel and switch').click();
  await expect(button(page, 'Choose audio file')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, 'voiceTest').cancelled))
    .toBeGreaterThan(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await button(page, 'Record a voice note').click();
  await button(page, 'Done recording').click();
  await button(page, 'Capture text').click();
  await button(page, 'Cancel and switch').click();
  await expect(page.getByLabel('Information to capture')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('live reduced motion freezes bars and cancels only capture effects', async ({ page }) => {
  await page.goto('/tests/voice-harness.html');
  await button(page, 'Record a voice note').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.voice-waveform > span').first()).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 0.12, 0, 0)',
  );
  const bars = await page.locator('.voice-waveform').evaluate((element) => element.innerHTML);
  await page.waitForTimeout(300);
  expect(await page.locator('.voice-waveform').evaluate((element) => element.innerHTML)).toBe(bars);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await button(page, 'Cancel capture').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await button(page, 'Calendar').click();
  expect(
    await page.locator('.main-content').evaluate((element) => element.getAnimations().length),
  ).toBe(0);
});

test('transcript survives cancelled extraction and can be retried without recording again', async ({
  page,
}) => {
  await page.goto('/tests/voice-harness.html?hang');
  await button(page, 'Record a voice note').click();
  await button(page, 'Done recording').click();
  await expect(
    page.getByRole('region', { name: 'Original transcript', exact: true }),
  ).toBeVisible();
  await button(page, 'Cancel capture').click();
  await expect(page.getByRole('heading', { name: 'Capture cancelled' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Original transcript', exact: true }),
  ).toContainText(phrases[0]);
  await button(page, 'Retry extraction').click();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'voiceTest').attempts)).toBe(2);
  await button(page, 'Cancel capture').click();
});

test('cleanup failure prevents switching or starting another capture', async ({ page }) => {
  await page.goto('/tests/voice-harness.html?cleanup-fails');
  await button(page, 'Record a voice note').click();
  await button(page, 'Capture text').click();
  await button(page, 'Cancel and switch').click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not finish cleanup' }),
  ).toBeVisible();
  await expect(button(page, 'Capture text')).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, 'voiceTest').starts)).toBe(1);
});

test('audio import summary, original file retry and explicit discard', async ({ page }, info) => {
  await page.goto('/tests/voice-harness.html?staged&import-fails-once');
  await page.getByLabel('Import audio file').setInputFiles({
    name: 'my-note.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('injected audio fixture'),
  });
  await expect(page.getByRole('alert')).toContainText('Audio import interrupted');
  await page.screenshot({ path: info.outputPath('audio-error.png') });
  await button(page, 'Retry audio import').click();
  await expect(page.locator('.capture-input-summary')).toContainText('my-note.wav');
  await page.screenshot({ path: info.outputPath('audio-selected.png') });
  await expect(page.getByRole('dialog', { name: 'Captured actions' })).toBeVisible();
  await button(page, 'Close review').click();
  await button(page, 'Discard capture').click();
  await expect(page.getByRole('region', { name: 'Original transcript', exact: true })).toHaveCount(
    0,
  );
  await expect(button(page, 'Review actions')).toHaveCount(0);
});

test('screenshot cannot start during microphone capture even through a dropped file', async ({
  page,
}) => {
  await page.goto('/tests/voice-harness.html');
  await button(page, 'Record a voice note').click();
  await page.locator('.dropzone').evaluate((zone) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['not examined while recording'], 'capture.png', { type: 'image/png' }),
    );
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.getByRole('heading', { name: 'Recording', exact: true })).toBeVisible();
  await expect(page.locator('.upload-card')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await button(page, 'Cancel capture').click();
});

test('silent amplitude stays quiet rather than showing generated activity', async ({ page }) => {
  await page.goto('/tests/voice-harness.html?quiet');
  await button(page, 'Record a voice note').click();
  await page.waitForTimeout(300);
  expect(
    await page
      .locator('.voice-waveform > span')
      .evaluateAll((bars) => new Set(bars.map((bar) => (bar as HTMLElement).style.transform)).size),
  ).toBe(1);
  await button(page, 'Cancel capture').click();
});

test('slow text extraction keeps the submitted draft visible and offers real elapsed-time recovery', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/tests/voice-harness.html?hang');
  await button(page, 'Capture text').click();
  await page.getByLabel('Information to capture').fill('Consultation Monday at two');
  await button(page, 'Extract actions').click();
  await expect(page.getByRole('region', { name: 'Submitted text', exact: true })).toContainText(
    'Consultation Monday at two',
  );
  await page.clock.runFor(61_000);
  await expect(page.getByText(/Still working on this device/)).toBeVisible();
  await button(page, 'Keep waiting').click();
  await expect(button(page, 'Keep waiting')).toHaveCount(0);
  await button(page, 'Cancel capture').click();
  await expect(page.getByLabel('Information to capture')).toHaveValue('Consultation Monday at two');
  await expect(page.getByRole('region', { name: 'Submitted text', exact: true })).toContainText(
    'Consultation Monday at two',
  );
  await button(page, 'Capture text').click();
  await button(page, 'Capture text').click();
  await expect(page.getByLabel('Information to capture')).toHaveValue('Consultation Monday at two');
});
