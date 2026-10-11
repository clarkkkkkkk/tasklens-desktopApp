// Windows native acceptance for TaskLens: drives the real WebView2 window over CDP.
// Usage: npm run test:native:win [-- <path to tasklens.exe>]
// Defaults to the unbundled release build; pass the installed exe to test an installer.
// Needs a clean first launch, so it refuses to run when TaskLens app data already exists
// and removes only the data directory it created.
import { chromium, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exe = resolve(process.argv[2] ?? join(project, 'src-tauri/target/release/tasklens.exe'));
const outDir = join(project, 'test-results', 'native-windows');
const dataDir = join(process.env.LOCALAPPDATA ?? '', 'app.tasklens.desktop');
if (process.platform !== 'win32') throw new Error('Windows only: uses WebView2 and user32.');
if (!existsSync(exe)) throw new Error(`Missing ${exe}; run npm run tauri build first.`);
if (existsSync(dataDir))
  throw new Error(`${dataDir} exists. Back up or remove existing TaskLens data first.`);
mkdirSync(outDir, { recursive: true });
const PORT = 9334;
const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(['PASS', name, detail ?? '']);
  } catch (e) {
    results.push(['FAIL', name, String(e.message).split('\n')[0]]);
  }
};
const ps = (script) =>
  spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout.trim();
const win32 = `Add-Type -Namespace W -Name U -MemberDefinition '
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);';`;
const hwnd = (pid) => ps(`(Get-Process -Id ${pid}).MainWindowHandle`);

async function launch() {
  const proc = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
      const page = browser.contexts()[0]?.pages()[0];
      if (page && page.url().startsWith('http://tauri.localhost')) {
        await page.waitForLoadState('domcontentloaded');
        return { proc, browser, page };
      }
      await browser.close();
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error('WebView2 CDP endpoint never became available');
}

// Graceful close via WM_CLOSE, like a user clicking the window's close button.
async function close({ proc, browser }) {
  await browser.close().catch(() => {});
  const exited = new Promise((r) => proc.once('exit', () => r(true)));
  ps(
    `${win32} [W.U]::PostMessage([IntPtr]${hwnd(proc.pid)}, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)`,
  );
  const ok = await Promise.race([exited, new Promise((r) => setTimeout(() => r(false), 10000))]);
  if (!ok) {
    proc.kill();
    throw new Error('window did not close on WM_CLOSE');
  }
  await new Promise((r) => setTimeout(r, 1500));
}

const btn = (page, name) => page.getByRole('button', { name, exact: true });
let s = await launch();
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(s.page);
let page = s.page;

await check('window title and first-launch onboarding', async () => {
  const title = ps(`(Get-Process -Id ${s.proc.pid}).MainWindowTitle`);
  if (title !== 'TaskLens') throw new Error(`window title "${title}"`);
  await expect(
    page.getByRole('heading', { name: 'Turn information into action. Privately.' }),
  ).toBeFocused({ timeout: 15000 });
  await page.screenshot({ path: join(outDir, 'acc-1-onboarding.png') });
  await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
  return `title="${title}"`;
});

await check('capture: file picker rejects non-images, previews PNG, removal cancels', async () => {
  await page
    .getByLabel('Upload screenshot')
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
  await expect(page.getByRole('alert')).toContainText('Choose a PNG');
  await page.getByLabel('Upload screenshot').setInputFiles(join(project, 'TaskLens.png'));
  await expect(page.getByAltText('Preview of TaskLens.png')).toBeVisible();
  await btn(page, 'Remove screenshot').click();
  await page.waitForTimeout(2200);
  await expect(page.getByRole('heading', { name: 'Pictorial', exact: true })).not.toBeVisible();
});

await check('capture: HTML drag/drop and paste (native drag interception disabled)', async () => {
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 80;
    c.height = 40;
    c.getContext('2d').fillRect(0, 0, 80, 40);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('.dropzone').evaluate((el, b64) => {
    const d = new DataTransfer();
    d.items.add(
      new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], 'dropped.png', {
        type: 'image/png',
      }),
    );
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: d, bubbles: true }));
  }, image);
  await expect(page.getByAltText('Preview of dropped.png')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pictorial', exact: true })).toBeVisible();
  await btn(page, 'Remove screenshot').click();
  await page.evaluate((b64) => {
    const d = new DataTransfer();
    d.items.add(
      new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], 'pasted.png', {
        type: 'image/png',
      }),
    );
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d }));
  }, image);
  await expect(page.getByAltText('Preview of pasted.png')).toBeVisible();
  await btn(page, 'Remove screenshot').click();
  await page.waitForTimeout(2200);
});

await check('review → edit → confirm & save sample', async () => {
  await page.getByRole('button', { name: 'Try a sample screenshot' }).click();
  await expect(page.getByRole('heading', { name: 'Pictorial', exact: true })).toBeVisible();
  await btn(page, 'Edit details').click();
  await page.getByLabel('Title', { exact: true }).fill('Native acceptance pictorial');
  await page.getByLabel('Location', { exact: true }).fill('North campus');
  await btn(page, 'Confirm & save').click();
  await expect(page.getByText('Saved on this device.', { exact: true })).toBeVisible();
  await page.screenshot({ path: join(outDir, 'acc-2-saved.png') });
  await page.getByRole('button', { name: 'Close details' }).click();
});

await check('focus: Ctrl+K search focus, Escape closes and restores focus', async () => {
  await page
    .getByRole('button', { name: /All Tasks/ })
    .first()
    .focus();
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('Search all items')).toBeFocused();
  await page.keyboard.type('acceptance');
  await expect(page.getByRole('option', { name: /Native acceptance pictorial/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const active = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  if (!/All Tasks/.test(active)) throw new Error(`focus returned to "${active}"`);
  await page.keyboard.press('Tab');
  const tabbed = await page.evaluate(() => document.activeElement?.tagName);
  return `Tab moves focus to <${tabbed}>`;
});

await check('resize: user min-track size matches 900x640 and layout fits at minimum', async () => {
  const h = hwnd(s.proc.pid);
  // WM_GETMINMAXINFO: what Windows enforces when the user drag-resizes the window.
  const [minW, minH] = ps(
    `${win32} $m=[Runtime.InteropServices.Marshal]::AllocHGlobal(40); 0..9 | % { [Runtime.InteropServices.Marshal]::WriteInt32($m, $_*4, 0) }; ` +
      `[void][W.U]::SendMessage([IntPtr]${h}, 0x24, [IntPtr]::Zero, $m); ` +
      `"$([Runtime.InteropServices.Marshal]::ReadInt32($m,24)) $([Runtime.InteropServices.Marshal]::ReadInt32($m,28))"`,
  )
    .split(' ')
    .map(Number);
  ps(`${win32} [W.U]::SetWindowPos([IntPtr]${h}, [IntPtr]::Zero, 40, 40, ${minW}, ${minH}, 0x14)`);
  await page.waitForTimeout(800);
  const min = await page.evaluate(() => ({
    w: innerWidth,
    h: innerHeight,
    dpr: devicePixelRatio,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  if (min.w < 900 || min.h < 640)
    throw new Error(`min track ${minW}x${minH} gives ${min.w}x${min.h}`);
  if (min.overflow) throw new Error('horizontal scroll at minimum size');
  await page.screenshot({ path: join(outDir, 'acc-3-min-size.png') });
  ps(`${win32} [W.U]::SetWindowPos([IntPtr]${h}, [IntPtr]::Zero, 40, 40, 1600, 1000, 0x14)`);
  await page.waitForTimeout(800);
  const big = await page.evaluate(() => innerWidth);
  if (big <= min.w) throw new Error('window did not grow');
  return `min track ${minW}x${minH}px → viewport ${min.w}x${min.h} (dpr ${min.dpr}); grows to ${big}px`;
});

await check('graceful close and relaunch keeps data, settings and preview', async () => {
  await close(s);
  s = await launch();
  page = s.page;
  watch(page);
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole('button', { name: /All Tasks/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Native acceptance pictorial/ }).click();
  await expect(page.getByText('North campus').first()).toBeVisible();
  await page.getByText('View source screenshot').click();
  await expect(page.getByAltText('Source: sample-announcement.png')).toBeVisible();
  await page.screenshot({ path: join(outDir, 'acc-4-after-restart.png') });
});

await check('no runtime console or page errors', async () => {
  if (errors.length) throw new Error(errors.join(' | '));
});
await close(s).catch(() => s.proc.kill());
rmSync(dataDir, { recursive: true, force: true });

for (const [status, name, detail] of results)
  console.log(`${status}  ${name}${detail ? `  (${detail})` : ''}`);
process.exitCode = results.some(([st]) => st === 'FAIL') ? 1 : 0;
