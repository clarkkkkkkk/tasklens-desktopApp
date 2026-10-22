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
    assert.equal(enabled.ok, true);
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
    'localStorage.setItem("tasklens:data:v1", JSON.stringify({version:1,actions:[],settings:{onboardingCompletedVersion:1,remindersEnabled:true,defaultReminders:[],theme:"light"}})); location.reload(); return true;',
  );
  await until(() => execute('return !!document.querySelector(".app-shell")'));
  await check('Settings shows actual native connection controls', async () => {
    await execute(
      'document.querySelector(".onboarding-backdrop")?.remove();document.querySelector(".onboarding-overlay")?.remove();Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Settings")?.click();return true;',
    );
    await until(() => execute('return !!document.querySelector("#groq-heading")'));
    assert.ok(
      await execute(
        'return Array.from(document.querySelectorAll("input")).some(i=>i.getAttribute("aria-label")==="Groq API key" && i.type==="password");',
      ),
    );
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
