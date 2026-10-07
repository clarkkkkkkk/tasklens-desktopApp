import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('saved data survives closing and reopening the browser process', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'tasklens-restart-'));
  const options = {
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = await context.newPage();
    await page.goto('http://127.0.0.1:1420');
    await page.getByRole('button', { name: 'New item' }).click();
    await page.getByLabel('Title', { exact: true }).fill('Survives restart');
    await page.getByRole('button', { name: 'Save item', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Survives restart' })).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    page = await context.newPage();
    await page.goto('http://127.0.0.1:1420');
    await page.getByRole('button', { name: /All Tasks/ }).click();
    await expect(page.getByText('Survives restart', { exact: true })).toBeVisible();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
