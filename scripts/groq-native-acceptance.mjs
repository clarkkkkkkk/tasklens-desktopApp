// Real native IPC/UI smoke; no Groq network request and no real credentials.
// Use a disposable executable from build-native-acceptance.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const receiptPath = process.argv[2];
if (!receiptPath) throw new Error('Supply the disposable acceptance-run.json receipt.');
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
assert.ok(receipt.identifier.startsWith('app.tasklens.acceptance.'));
const output = path.resolve('test-results-native/groq');
mkdirSync(output, { recursive: true });
const driver = spawn(process.env.TASKLENS_TAURI_DRIVER || 'tauri-driver', ['--port', '4466'], {
  env: { ...process.env, TAURI_WEBVIEW_AUTOMATION: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
driver.stdout.on('data', (data) => {
  log += data;
});
driver.stderr.on('data', (data) => {
  log += data;
});
let session;
const results = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function call(route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`http://127.0.0.1:4466${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok || (result.value?.error && !('ok' in result.value)))
    throw new Error(JSON.stringify(result));
  return result.value;
}
async function until(fn) {
  const end = Date.now() + 45_000;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {
      /* process startup */
    }
    await delay(250);
  }
  throw new Error('Native Groq acceptance timed out');
}
const execute = (script, args = []) => call(`/session/${session}/execute/sync`, { script, args });
const invoke = (command, args = {}) =>
  call(`/session/${session}/execute/async`, {
    script:
      'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({ok:false,error}));',
    args: [command, args],
  });
async function check(name, run) {
  await run();
  results.push({ name, status: 'passed' });
  console.info(`PASS ${name}`);
}
try {
  await until(() => call('/status'));
  const launched = await call('/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: receipt.executable } } },
  });
  session = launched.sessionId;
  await call(`/session/${session}/timeouts`, { script: 15000, pageLoad: 60000 });
  await until(() => execute('return !!document.querySelector(".app-shell")'));
  await check('native Groq commands allowed only through main capability', async () => {
    const status = await invoke('groq_status');
    assert.equal(status.ok, true);
    assert.equal(status.value.connected, false);
    assert.equal(status.value.consent, false);
  });
  await check('Local mode prevents cloud session admission', async () => {
    const result = await invoke('groq_begin', {
      id: crypto.randomUUID(),
      fingerprint: 'synthetic announcement',
    });
    assert.equal(result.error.code, 'GROQ_DISABLED');
  });
  await check('Cloud mode requires explicit device consent', async () => {
    const enabled = await invoke('groq_configure', { enabled: true, consent: false });
    if (!enabled.ok) {
      assert.equal(enabled.error.code, 'GROQ_NETWORK');
      return;
    }
    const result = await invoke('groq_begin', {
      id: crypto.randomUUID(),
      fingerprint: 'synthetic announcement',
    });
    assert.equal(result.error.code, 'GROQ_CONSENT');
    assert.equal((await invoke('groq_configure', { enabled: false, consent: false })).ok, true);
  });
  await check('No key can be returned or verified without connection', async () => {
    const result = await invoke('groq_verify');
    assert.equal(result.error.code, 'GROQ_INVALID_KEY');
    const status = await invoke('groq_status');
    assert.ok(!('key' in status.value));
    assert.ok(!('apiKey' in status.value));
  });
  await execute(
    'window.__acceptanceReload=true;localStorage.setItem("tasklens:data:v1", JSON.stringify({version:1,actions:[],settings:{onboardingCompletedVersion:1,remindersEnabled:true,defaultReminders:[],theme:"light"}})); location.reload(); return true;',
  );
  await until(() =>
    execute('return !window.__acceptanceReload && !!document.querySelector(".app-shell")'),
  );
  await check('Settings shows actual native connection controls', async () => {
    await execute(
      'document.querySelector(".onboarding-backdrop")?.remove();document.querySelector(".onboarding-overlay")?.remove();Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Settings")?.click();return true;',
    );
    await until(() => execute('return !!document.querySelector("#groq-heading")'));
    await until(() =>
      execute(
        `return document.querySelector('[aria-labelledby="groq-heading"]')?.textContent.includes('Not connected');`,
      ),
    );
    assert.ok(
      await execute(
        `return document.querySelector('[aria-labelledby="groq-heading"]')?.textContent.includes('Local AI');`,
      ),
    );
  });
  await check(
    'native Settings keeps the document and sidebar stationary at both scroll boundaries',
    async () => {
      const measure = () =>
        execute(
          'return { y:scrollY, sidebar:document.querySelector(".sidebar").getBoundingClientRect().y, overflow:document.documentElement.scrollHeight-innerHeight };',
        );
      for (const expanded of [false, true]) {
        if (expanded)
          await execute(
            'document.querySelector(".settings-advanced > summary").click();return true;',
          );
        await execute(
          'const m=document.querySelector(".main-content");m.scrollTop=m.scrollHeight;window.scrollTo(0,100000);return true;',
        );
        const position = await measure();
        assert.equal(position.y, 0);
        assert.equal(position.sidebar, 0);
        assert.equal(position.overflow, 0);
        await execute(
          'document.querySelector(".main-content").scrollTop=0;window.scrollTo(0,-100000);return true;',
        );
        assert.equal((await measure()).y, 0);
      }
    },
  );
  await check(
    'native guided key setup is masked, modal, cancellable, and locks the workspace',
    async () => {
      await execute(
        'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Connect API key").click();return true;',
      );
      await until(() => execute('return !!document.querySelector(".ai-setup-dialog[open]")'));
      for (const label of ['Continue', 'I have my key']) {
        await execute(
          `Array.from(document.querySelectorAll('.ai-setup-dialog button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).click();return true;`,
        );
      }
      assert.ok(
        await execute(
          'return document.querySelector(".ai-setup-dialog input")?.type === "password";',
        ),
      );
      assert.equal(
        await execute(
          'return getComputedStyle(document.querySelector(".main-content")).overflowY;',
        ),
        'hidden',
      );
      await execute(
        'Array.from(document.querySelectorAll(".ai-setup-dialog button")).find(b=>b.textContent.includes("Cancel & use Offline AI")).click();return true;',
      );
      await until(() => execute('return !document.querySelector(".ai-setup-dialog[open]")'));
      assert.equal(
        await execute(
          'return getComputedStyle(document.querySelector(".main-content")).overflowY;',
        ),
        'auto',
      );
      assert.equal((await invoke('groq_status')).value.consent, false);
    },
  );
  await check(
    'native connection reports passive OS state without exposing credentials',
    async () => {
      const status = (await invoke('groq_status')).value;
      assert.ok(['online', 'offline', 'unknown'].includes(status.connectivity));
      assert.equal(typeof status.resumeRequired, 'boolean');
      assert.equal(typeof status.verified, 'boolean');
      assert.ok(!('key' in status));
    },
  );
  await check('native browser opener rejects caller supplied URLs', async () => {
    const result = await invoke('groq_open_link', { destination: 'https://example.invalid' });
    assert.equal(result.error.code, 'GROQ_FORBIDDEN');
  });
  await check('native sample confirmation persists before dismissing the review', async () => {
    await execute(
      'Array.from(document.querySelectorAll("button")).find(b=>/^Inbox/.test(b.textContent.trim())).click();return true;',
    );
    await execute(
      'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Try a sample screenshot")).click();return true;',
    );
    await until(() => execute('return !!document.querySelector(".inbox-result-dialog[open]")'));
    assert.equal(
      await execute('return JSON.parse(localStorage.getItem("tasklens:data:v1")).actions.length;'),
      0,
    );
    await execute(
      'Array.from(document.querySelectorAll(".inbox-result-dialog button")).find(b=>b.textContent.trim().startsWith("Confirm & save")).click();return true;',
    );
    await until(() => execute('return !document.querySelector(".inbox-result-dialog[open]")'));
    const action = await execute(
      'return JSON.parse(localStorage.getItem("tasklens:data:v1")).actions[0];',
    );
    assert.equal(action.status, 'confirmed');
    assert.equal(action.source.extractionMode, 'mock');
    await until(() => execute('return !!document.activeElement?.hasAttribute("data-open-result")'));
  });
  writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      { platform: process.platform, receipt, results, liveGroq: 'not run', complete: true },
      null,
      2,
    ) + '\n',
  );
} finally {
  if (session) await call(`/session/${session}`, undefined, 'DELETE').catch(() => {});
  driver.kill();
  writeFileSync(path.join(output, 'driver.log'), log);
}
