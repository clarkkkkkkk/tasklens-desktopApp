// Windows native acceptance for on-device extraction: drives the real TaskLens window over
// CDP with real Tesseract OCR and the real Phi-4-mini model through the managed llama-server.
// Usage: npm run test:native:ai [-- <path to tasklens.exe>]
// Needs: a release build (npm run tauri build -- --no-bundle), the model and OCR languages
// installed (see LOCAL_AI.md), and no existing TaskLens WebView data (it creates and removes
// only that). The model in the app data folder is never touched.
import { chromium, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exe = resolve(process.argv[2] ?? join(project, 'src-tauri/target/release/tasklens.exe'));
const outDir = join(project, 'test-results', 'native-local-ai');
const webviewData = join(process.env.LOCALAPPDATA ?? '', 'app.tasklens.desktop');
const fixtures = join(project, 'tests/fixtures/screenshots');
if (process.platform !== 'win32') throw new Error('Windows only: uses WebView2.');
if (!existsSync(exe)) throw new Error(`Missing ${exe}; run npm run tauri build -- --no-bundle.`);
if (existsSync(webviewData))
  throw new Error(`${webviewData} exists. Back up or remove existing TaskLens WebView data first.`);
mkdirSync(outDir, { recursive: true });
const PORT = 9335;
const results = [];
const check = async (name, fn) => {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push([
      'PASS',
      name,
      `${detail ?? ''} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    ]);
  } catch (e) {
    results.push(['FAIL', name, String(e.message).split('\n')[0]]);
  }
};
const ps = (script) =>
  spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout.trim();
const llamaPids = () =>
  ps(`(Get-Process llama-server -ErrorAction SilentlyContinue).Id -join ','`)
    .split(',')
    .filter(Boolean);
/** Remote endpoints of every TCP connection owned by TaskLens or its runtime. */
const remotes = (pids) =>
  pids.length
    ? ps(
        `Get-NetTCPConnection -OwningProcess ${pids.join(',')} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.RemoteAddress)" } | Sort-Object -Unique`,
      )
        .split(/\r?\n/)
        .filter(Boolean)
    : [];

const proc = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  stdio: 'ignore',
});
let browser, page;
for (let i = 0; i < 60 && !page; i++) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const candidate = browser.contexts()[0]?.pages()[0];
    if (candidate?.url().startsWith('http://tauri.localhost')) page = candidate;
    else await browser.close();
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!page) {
  proc.kill();
  throw new Error('WebView2 CDP endpoint never became available');
}
const btn = (name) => page.getByRole('button', { name, exact: true });
const upload = (file) => page.getByLabel('Upload screenshot').setInputFiles(join(fixtures, file));
const remotesSeen = new Set();
const sample = setInterval(() => {
  for (const r of remotes([String(proc.pid), ...llamaPids()])) remotesSeen.add(r);
}, 1500);

await check(
  'skip onboarding; Settings shows verified model, runtime and OCR languages',
  async () => {
    await btn('Skip tour').click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const section = page.locator('section', {
      has: page.getByRole('heading', { name: /Local AI/ }),
    });
    await expect(section.getByText('Phi-4-mini-instruct', { exact: false }).first()).toBeVisible();
    await expect(section).toContainText(
      'English installed · Cebuano installed · Tagalog installed',
      {
        timeout: 15000,
      },
    );
    await expect(section).not.toContainText('runtime is missing');
    await page.screenshot({ path: join(outDir, 'ai-1-settings.png'), fullPage: true });
    await page.getByRole('button', { name: 'Inbox', exact: true }).click();
  },
);

await check(
  'pictorial: real OCR + local model; arrival ≠ start; date question; Source Trace',
  async () => {
    await upload('pictorial.png');
    await expect(
      page.getByText('Processing locally. Your screenshot stays on this device.'),
    ).toBeVisible();
    const dialog = page.getByRole('dialog', { name: 'Screenshot result' });
    await expect(dialog).toBeVisible({ timeout: 360000 });
    await expect(dialog.getByRole('heading', { level: 2 })).toContainText(/pictorial/i);
    const arrival = dialog.locator('.detail-fields > div', { hasText: 'Arrival time' });
    await expect(arrival).toContainText('1:30 PM');
    await expect(arrival).toContainText('Confirmed');
    await expect(dialog.locator('.detail-fields > div', { hasText: 'Start time' })).toContainText(
      'Not confirmed',
    );
    await expect(dialog.getByRole('heading', { name: /Needs your answer/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Show source for arrival time' }).click();
    await expect(dialog.locator('.trace-box').first()).toBeVisible();
    await expect(
      dialog.getByRole('status').filter({ hasText: 'Source for arrival time' }),
    ).toContainText('1:30PM');
    await page.screenshot({ path: join(outDir, 'ai-2-pictorial-trace.png') });
    const answer = dialog.getByRole('button', { name: /^Use / }).first();
    if (await answer.count()) await answer.click();
    await dialog.getByRole('button', { name: /Confirm & save/ }).click();
    await expect(dialog.getByRole('button', { name: 'Mark completed' })).toBeVisible();
    await page.keyboard.press('Escape');
    return (await dialog.count()) ? 'saved' : 'saved and closed';
  },
);

await check('cancellation: Cancel processing stops work and no late result appears', async () => {
  await btn('Remove screenshot').click();
  await upload('bundle-english.png');
  await expect(btn('Cancel processing')).toBeVisible();
  await page.waitForTimeout(4000);
  await btn('Cancel processing').click();
  await expect(page.getByRole('alert')).toContainText('Processing was cancelled.');
  await page.waitForTimeout(15000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

await check('action bundle: one screenshot yields multiple reviewable items', async () => {
  await btn('Try again').click();
  const bundle = page.getByRole('dialog', { name: 'Captured actions' });
  const single = page.getByRole('dialog', { name: 'Screenshot result' });
  await expect(bundle.or(single)).toBeVisible({ timeout: 360000 });
  await page.screenshot({ path: join(outDir, 'ai-3-bundle.png') });
  const count = (await bundle.count())
    ? await bundle.getByLabel('Review action').locator('option').count()
    : 1;
  if (count < 2) throw new Error(`expected at least 2 items, got ${count}`);
  await page.keyboard.press('Escape');
  return `${count} items`;
});

await check('privacy: TaskLens and llama-server held only loopback connections', async () => {
  const outside = [...remotesSeen].filter(
    (r) => !['127.0.0.1', '::1', '0.0.0.0', '::'].includes(r),
  );
  if (outside.length) throw new Error(`non-loopback remotes: ${outside.join(', ')}`);
  return `remotes seen: ${[...remotesSeen].join(', ') || 'none'}`;
});

clearInterval(sample);
await check('runtime stops when TaskLens exits', async () => {
  await browser.close().catch(() => {});
  const hwnd = ps(`(Get-Process -Id ${proc.pid}).MainWindowHandle`);
  ps(
    `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'; [W.U]::PostMessage([IntPtr]${hwnd}, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)`,
  );
  await new Promise((r) => proc.once('exit', r));
  await new Promise((r) => setTimeout(r, 2000));
  if (llamaPids().length) throw new Error(`llama-server still running: ${llamaPids().join(',')}`);
});

rmSync(webviewData, { recursive: true, force: true });
const report = results.map(([s, n, d]) => `${s}  ${n}${d ? ` — ${d}` : ''}`).join('\n');
writeFileSync(join(outDir, 'report.txt'), report + '\n');
console.info(report);
if (results.some(([s]) => s === 'FAIL')) process.exitCode = 1;
