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
const outDir = join(project, 'test-results-native', 'local-ai'); // Playwright wipes test-results/
const webviewData = join(process.env.LOCALAPPDATA ?? '', 'app.tasklens.desktop');
const fixtures = join(project, 'tests/fixtures/screenshots');
if (process.platform !== 'win32') throw new Error('Windows only: uses WebView2.');
if (!existsSync(exe)) throw new Error(`Missing ${exe}; run npm run tauri build -- --no-bundle.`);
if (existsSync(webviewData))
  throw new Error(`${webviewData} exists. Back up or remove existing TaskLens WebView data first.`);
mkdirSync(outDir, { recursive: true });
const PORT = 9335;
const TAURI_WEBVIEW_DEFAULTS = '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection';
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
    results.push([
      e.warn ? 'WARN' : 'FAIL',
      name,
      String(e.message).split('\n').slice(0, 8).join(' | '),
    ]);
    await page?.screenshot({ path: join(outDir, `fail-${results.length}.png`) }).catch(() => {});
    // Close any open dialog so later checks start from the Inbox.
    await page?.keyboard.press('Escape').catch(() => {});
  }
};
const ps = (script) =>
  spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout.trim();
const llamaPids = () =>
  ps(`(Get-Process llama-server -ErrorAction SilentlyContinue).Id -join ','`)
    .split(',')
    .filter(Boolean);
const proc = spawn(exe, [], {
  env: {
    ...process.env,
    // This variable replaces Tauri's own WebView2 arguments, so restate Tauri's defaults.
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} ${TAURI_WEBVIEW_DEFAULTS},CalculateNativeWinOcclusion`,
  },
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
// One long-lived, asynchronous sampler: blocking calls here would stall Playwright's
// frame-based actionability checks.
// One long-lived, asynchronous sampler (blocking calls would stall Playwright's frame-based
// actionability checks). It covers TaskLens' whole process tree (including WebView2) and
// llama-server, labels each connection by process name, and never includes PID 0, which
// reports other applications' TIME_WAIT sockets.
const sampler = spawn('powershell', [
  '-NoProfile',
  '-Command',
  `while ($true) {
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
    $tree = @(${proc.pid}); $added = $true
    while ($added) { $added = $false; foreach ($p in $all) { if ($tree -contains $p.ParentProcessId -and -not ($tree -contains $p.ProcessId)) { $tree += $p.ProcessId; $added = $true } } }
    $tree += @($all | Where-Object { $_.Name -eq 'llama-server.exe' } | ForEach-Object { $_.ProcessId })
    $ids = @($tree | Where-Object { $_ -and $_ -ne 0 } | Sort-Object -Unique)
    Get-NetTCPConnection -OwningProcess $ids -ErrorAction SilentlyContinue | ForEach-Object { $o = $_.OwningProcess; "{0}|{1}" -f (($all | Where-Object { $_.ProcessId -eq $o }).Name), $_.RemoteAddress }
    Start-Sleep -Milliseconds 1500
  }`,
]);
sampler.stdout.on('data', (chunk) =>
  chunk
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('|'))
    .forEach((line) => remotesSeen.add(line)),
);

await check(
  'skip onboarding; Settings shows verified model, runtime and OCR languages',
  async () => {
    await btn('Skip tour').click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const section = page.locator('section[aria-labelledby="local-ai-heading"]');
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
    // Safety properties above are hard requirements; the confidence level is the model's.
    const arrivalConfirmed = (await arrival.innerText()).includes('Confirmed');
    // Whatever the model calls the item, no time other than arrival may be 1:30 PM.
    const otherTimes = dialog
      .locator('.detail-fields > div')
      .filter({ hasText: /^(Start time|Due|Time|Ends)/ });
    for (const row of await otherTimes.all()) await expect(row).not.toContainText('1:30 PM');
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
    if (!arrivalConfirmed)
      throw Object.assign(
        new Error('saved; arrival 1:30 PM kept separate from start, but rated Needs review'),
        { warn: true },
      );
    return 'saved; arrival 1:30 PM Confirmed, start empty';
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
  if (count < 2)
    throw Object.assign(new Error(`model returned ${count} item for 2 actions`), { warn: true });
  await page.keyboard.press('Escape');
  return `${count} items`;
});

await check('privacy: TaskLens and llama-server held only loopback connections', async () => {
  const loopback = ['127.0.0.1', '::1', '0.0.0.0', '::'];
  const seen = [...remotesSeen].map((entry) => entry.split('|'));
  const app = seen.filter(([name]) => /^(tasklens|llama-server)\.exe$/i.test(name));
  const outside = app.filter(([, address]) => !loopback.includes(address));
  if (outside.length)
    throw new Error(`non-loopback: ${outside.map((e) => e.join(' → ')).join(', ')}`);
  const webview = seen.filter(([name]) => /webview/i.test(name) && !loopback.includes(name));
  const webviewRemote = webview.filter(([, address]) => !loopback.includes(address));
  return (
    `TaskLens/llama-server remotes: ${[...new Set(app.map(([, a]) => a))].join(', ') || 'none'}` +
    `; WebView2 runtime non-loopback: ${[...new Set(webviewRemote.map(([, a]) => a))].join(', ') || 'none'}`
  );
});

sampler.kill();
await check('runtime stops when TaskLens exits', async () => {
  await browser.close().catch(() => {});
  const hwnd = ps(`(Get-Process -Id ${proc.pid}).MainWindowHandle`);
  ps(
    `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);'; [W.U]::PostMessage([IntPtr]${hwnd}, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)`,
  );
  const exited = await Promise.race([
    new Promise((r) => proc.once('exit', () => r(true))),
    new Promise((r) => setTimeout(() => r(false), 15000)),
  ]);
  if (!exited) {
    proc.kill();
    throw new Error('window did not close on WM_CLOSE');
  }
  await new Promise((r) => setTimeout(r, 2000));
  if (llamaPids().length) throw new Error(`llama-server still running: ${llamaPids().join(',')}`);
});

await check('crash safety: killing TaskLens also ends llama-server', async () => {
  const crashed = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT + 1} ${TAURI_WEBVIEW_DEFAULTS}`,
    },
    stdio: 'ignore',
  });
  let view;
  for (let i = 0; i < 60 && !view; i++) {
    try {
      const b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT + 1}`);
      const candidate = b.contexts()[0]?.pages()[0];
      if (candidate?.url().startsWith('http://tauri.localhost')) view = { b, page: candidate };
      else await b.close();
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!view) throw new Error('relaunch failed');
  await view.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await view.page.getByRole('button', { name: 'Reload model', exact: true }).click();
  for (let i = 0; i < 60 && !llamaPids().length; i++) await new Promise((r) => setTimeout(r, 500));
  const before = llamaPids();
  if (!before.length) throw new Error('model runtime did not start');
  await view.b.close().catch(() => {});
  crashed.kill(); // TerminateProcess: no graceful shutdown runs
  await new Promise((r) => setTimeout(r, 3000));
  if (llamaPids().length) throw new Error(`orphaned llama-server: ${llamaPids().join(',')}`);
  return `llama-server ${before.join(',')} ended with TaskLens`;
});

rmSync(webviewData, { recursive: true, force: true });
const report = results.map(([s, n, d]) => `${s}  ${n}${d ? ` — ${d}` : ''}`).join('\n');
writeFileSync(join(outDir, 'report.txt'), report + '\n');
console.info(report);
if (results.some(([s]) => s === 'FAIL')) process.exitCode = 1;
