// Fedora native acceptance. Synthetic data only; never use the normal application profile.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const executable = process.argv[2];
if (!executable || !path.isAbsolute(executable))
  throw new Error('Supply an absolute debug TaskLens executable path.');
const profile = mkdtempSync(path.join(tmpdir(), 'tasklens-reliability-'));
const output = path.resolve('test-results-native/reliability');
mkdirSync(output, { recursive: true });
const environment = {
  ...process.env,
  TAURI_WEBVIEW_AUTOMATION: 'true',
  XDG_DATA_HOME: path.join(profile, 'data'),
  XDG_CONFIG_HOME: path.join(profile, 'config'),
  XDG_CACHE_HOME: path.join(profile, 'cache'),
};
const driver = spawn(process.env.TASKLENS_TAURI_DRIVER || 'tauri-driver', ['--port', '4455'], {
  env: environment,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
driver.stdout.on('data', (v) => {
  log += v;
});
driver.stderr.on('data', (v) => {
  log += v;
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const startedAt = new Date().toISOString();
let complete = false;
const noService = process.env.TASKLENS_RELIABILITY_NO_SERVICE === '1';
const uiOnly = noService || process.env.TASKLENS_RELIABILITY_UI_ONLY === '1';
function progress() {
  writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        startedAt,
        profile,
        complete,
        results,
        visibleBanner: 'OS submission tested; visible banner needs observation',
        platform: 'Fedora native debug',
      },
      null,
      2,
    ),
  );
}
let session;
async function call(route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`http://127.0.0.1:4455${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json));
  return json.value;
}
const sync = (script, args = []) => call(`/session/${session}/execute/sync`, { script, args });
async function invoke(command, args = {}) {
  const value = await call(`/session/${session}/execute/async`, {
    script:
      'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),e=>done({ok:false,error:String(e)}));',
    args: [command, args],
  });
  if (!value.ok) throw new Error(value.error);
  return value.value;
}
async function until(fn, seconds = 15) {
  const stop = Date.now() + seconds * 1000;
  while (Date.now() < stop) {
    const value = await fn();
    if (value) return value;
    await delay(250);
  }
  throw new Error('Timed out waiting for native acceptance condition');
}
async function check(name, fn) {
  const start = performance.now();
  try {
    await fn();
  } catch (error) {
    results.push({ name, status: 'failed', error: String(error) });
    progress();
    throw error;
  }
  results.push({ name, status: 'passed', ms: Math.round(performance.now() - start) });
  console.info(`PASS ${name}`);
  progress();
}
async function launch() {
  const value = await call('/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: executable } } },
  });
  session = value.sessionId;
  writeFileSync(path.join(output, 'session.id'), session);
  await call(`/session/${session}/timeouts`, { script: 15000, pageLoad: 60000 });
  await until(
    () => sync('return !!window.__TAURI_INTERNALS__ && !!document.querySelector(".app-shell")'),
    30,
  );
}
const projection = (snapshot) =>
  snapshot.actions.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    date: a.date || null,
    time: a.time || null,
    arrivalTime: a.arrivalTime || null,
    dateConfirmed: true,
    anchorConfirmed: true,
    reminders: a.reminders.map((r) => ({ id: r.id, datetime: r.datetime, enabled: r.enabled })),
  }));
async function write(snapshot) {
  const token = await invoke('reminder_pause');
  await sync('localStorage.setItem("tasklens:data:v1",arguments[0])', [JSON.stringify(snapshot)]);
  await invoke('reminder_reconcile', {
    token,
    items: projection(snapshot),
    enabled: snapshot.settings.remindersEnabled,
  });
}
async function screenshot(name) {
  writeFileSync(
    path.join(output, name),
    Buffer.from(await call(`/session/${session}/screenshot`), 'base64'),
  );
}
try {
  await until(async () => {
    try {
      await call('/status');
      return true;
    } catch {
      return false;
    }
  });
  await launch();
  if (uiOnly) {
    await write({
      version: 1,
      actions: [],
      settings: {
        onboardingCompletedVersion: 1,
        remindersEnabled: true,
        defaultReminders: ['night'],
        theme: 'light',
      },
    });
    await sync('location.reload()');
    await until(() => sync('return document.body.innerText.includes("Inbox")'));
  }
  if (noService) {
    await check(
      'missing real session notification service is reported without claiming permission',
      async () => {
        const status = await invoke('reminder_status');
        assert.match(status.availability, /unavailable/);
        const preview = await invoke('reminder_preview');
        await invoke('reminder_activate', { token: preview.token, revision: preview.revision });
        await assert.rejects(() => invoke('reminder_test'), /OS notification submission error/);
        assert.match((await invoke('reminder_status')).availability, /unavailable/);
        await invoke('reminder_disable');
      },
    );
  }
  if (!uiOnly) {
    await check('new profile requires explicit activation', async () => {
      assert.equal((await invoke('reminder_status')).activated, false);
    });
    const at = new Date(Math.ceil((Date.now() + 10000) / 60000) * 60000);
    const anchor = new Date(at.getTime() + 15 * 60000);
    const localParts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(anchor)
        .map((p) => [p.type, p.value]),
    );
    const action = {
      id: 'synthetic-reminder',
      type: 'task',
      title: 'Synthetic acceptance task',
      date: `${localParts.year}-${localParts.month}-${localParts.day}`,
      time: `${localParts.hour}:${localParts.minute}`,
      requirements: [],
      notes: [],
      confidence: { overall: 'confirmed', date: 'confirmed', time: 'confirmed' },
      reminders: [
        {
          id: 'quarter',
          label: '15 minutes before',
          datetime: at.toISOString(),
          enabled: true,
          offsetMinutes: 15,
        },
      ],
      source: { type: 'text' },
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const snapshot = {
      version: 1,
      actions: [action, { ...action, id: 'cancelled-task' }],
      settings: {
        onboardingCompletedVersion: 1,
        localAI: { developerMode: false, contextSize: 8192, threads: null },
        remindersEnabled: true,
        defaultReminders: ['night', 'hour', 'quarter'],
        theme: 'light',
      },
    };
    await write(snapshot);
    await check(
      'activation preview registers only explicitly approved future schedules',
      async () => {
        const p = await invoke('reminder_preview');
        assert.equal(p.eligible, 2);
        await invoke('reminder_activate', { token: p.token, revision: p.revision });
        assert.equal((await invoke('reminder_status')).upcoming.length, 2);
      },
    );
    await check('completion cancels a pending schedule', async () => {
      snapshot.actions[1].status = 'completed';
      await write(snapshot);
      assert.equal((await invoke('reminder_status')).upcoming.length, 1);
    });
    await check('real OS test submission returns an acknowledgment', async () => {
      assert.match(await invoke('reminder_test'), /Submitted to the OS/);
    });
    await sync('location.reload()');
    await until(() => sync('return document.body.innerText.includes("Inbox")'));
    await sync(
      'Array.from(document.querySelectorAll(".sidebar button")).find(e=>e.textContent.trim()==="Settings")?.click()',
    );
    await delay(1000);
    await sync(
      'Array.from(document.querySelectorAll("h3")).find(e=>e.textContent==="Native notification delivery")?.scrollIntoView({block:"start"})',
    );
    await screenshot('native-settings.png');
    await check('deadline fires while native coordinator owns scheduling', async () => {
      await until(async () => {
        const s = await invoke('reminder_status');
        return s.history.some(
          (o) => o.actionId === 'synthetic-reminder' && o.state === 'submitted',
        );
      }, 85);
    });
    await check('background is opt-in and can be enabled explicitly', async () => {
      assert.equal((await invoke('reminder_status')).background, false);
      await invoke('reminder_preferences', { includeTitle: false, background: true });
      await invoke('plugin:window|close', { label: 'main' });
      await until(async () => !(await invoke('plugin:window|is_visible', { label: 'main' })));
      const s = await invoke('reminder_status');
      assert.equal(s.background, true);
    });
    // Single-instance launch must reopen the hidden acceptance window, without starting another profile.
    const duplicate = spawn(executable, [], { env: environment, stdio: 'ignore' });
    await new Promise((resolve) => duplicate.once('exit', resolve));
    await check('manual duplicate launch reopens the same hidden process', async () => {
      assert.equal((await invoke('reminder_status')).activated, true);
      assert.equal(await invoke('plugin:window|is_visible', { label: 'main' }), true);
    });
    await screenshot('native-reopened.png');
    await check('global disabling cancels delivery', async () => {
      await invoke('reminder_disable');
      assert.equal((await invoke('reminder_status')).activated, false);
    });
    await invoke('reminder_preferences', { includeTitle: false, background: false });
    await call(`/session/${session}`, undefined, 'DELETE');
    session = undefined;
    await launch();
    await check('restart preserves task data and delivery history without replay', async () => {
      const stored = await sync('return JSON.parse(localStorage.getItem("tasklens:data:v1"))');
      assert.equal(stored.actions.length, 2);
      const status = await invoke('reminder_status');
      assert(status.history.some((o) => o.state === 'submitted'));
      assert.equal(status.activated, false);
    });
    await check(
      'one real private recovery summary after an offline deadline, no restart replay',
      async () => {
        const missedAt = new Date(Math.ceil((Date.now() + 10000) / 60000) * 60000);
        const missedAnchor = new Date(missedAt.getTime() + 15 * 60000);
        const parts = Object.fromEntries(
          new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          })
            .formatToParts(missedAnchor)
            .map((p) => [p.type, p.value]),
        );
        snapshot.actions.push({
          ...action,
          id: 'missed-task',
          date: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}`,
          reminders: [{ ...action.reminders[0], datetime: missedAt.toISOString() }],
        });
        await write(snapshot);
        const p = await invoke('reminder_preview');
        await invoke('reminder_activate', { token: p.token, revision: p.revision });
        await call(`/session/${session}`, undefined, 'DELETE');
        session = undefined;
        await delay(Math.max(0, missedAt.getTime() - Date.now() + 2000));
        await launch();
        const database = path.join(
          profile,
          'data',
          'app.tasklens.desktop',
          'storage',
          'tasklens.sqlite3',
        );
        const summaries = () =>
          JSON.parse(
            execFileSync(
              'python3',
              [
                '-c',
                'import sqlite3,sys,json; c=sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute("SELECT state FROM summaries").fetchall()))',
                database,
              ],
              { encoding: 'utf8' },
            ),
          );
        await until(async () => summaries().some((row) => row[0] === 'submitted'));
        assert.equal(summaries().length, 1);
        assert(
          (await invoke('reminder_status')).history.some(
            (o) => o.actionId === 'missed-task' && o.state === 'missed',
          ),
        );
        await call(`/session/${session}`, undefined, 'DELETE');
        session = undefined;
        await launch();
        await delay(1500);
        assert.equal(summaries().length, 1);
        await invoke('reminder_disable');
      },
    );
  }
  await check('native Quit preserves unsaved editor changes until explicit discard', async () => {
    await sync(
      'Array.from(document.querySelectorAll(".sidebar button")).find(e=>e.textContent.trim()==="Settings")?.click()',
    );
    await sync(
      'Array.from(document.querySelectorAll("button")).find(e=>e.textContent.trim()==="New item")?.click()',
    );
    await until(() => sync('return !!document.querySelector(".action-editor input[required]")'));
    const element = await call(`/session/${session}/element`, {
      using: 'css selector',
      value: '.action-editor input[required]',
    });
    const id = element['element-6066-11e4-a52e-4f735466cecf'];
    await call(`/session/${session}/element/${id}/value`, {
      text: 'Synthetic unsaved close guard',
    });
    await sync(
      'Array.from(document.querySelectorAll("button")).find(e=>e.textContent.trim()==="Quit TaskLens")?.click()',
    );
    await until(() =>
      sync(
        'return document.body.innerText.includes("Save or close your current edits before closing TaskLens.")',
      ),
    );
    assert.equal(await invoke('plugin:window|is_visible', { label: 'main' }), true);
    assert.equal(
      await sync('return document.querySelector(".action-editor input[required]").value'),
      'Synthetic unsaved close guard',
    );
    await screenshot('native-unsaved-close-guard.png');
    await sync(
      "Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')==='Close details')?.click()",
    );
    await until(() =>
      sync('return document.body.innerText.includes("Discard your unsaved edits?")'),
    );
    await sync(
      'Array.from(document.querySelectorAll("button")).find(e=>e.textContent.trim()==="Discard edits")?.click()',
    );
    await until(() => sync('return !document.querySelector(".action-editor")'));
    await sync(
      'Array.from(document.querySelectorAll("h3")).find(e=>e.textContent==="Native notification delivery")?.scrollIntoView({block:"start"})',
    );
    await screenshot('native-settings-final.png');
    await sync(
      "setTimeout(()=>Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Quit TaskLens')?.click(),50)",
    );
    await until(async () => {
      try {
        await sync('return document.readyState');
        return false;
      } catch (error) {
        assert.match(
          String(error),
          /no such window|invalid session|disconnected|closed|no window/i,
        );
        return true;
      }
    });
  });
  complete = true;
  progress();
  writeFileSync(
    path.join(output, path.basename(profile) + '-results.json'),
    JSON.stringify(
      { startedAt, complete, scope: uiOnly ? 'UI guards' : 'full native', results },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(
      {
        startedAt,
        scope: noService
          ? 'unavailable OS service and lifecycle'
          : uiOnly
            ? 'native UI guard and explicit Quit'
            : 'full native reliability',
        complete,
        profile,
        results,
        visibleBanner: 'not established by WebDriver; OS submission only',
        platform: 'Fedora native debug',
      },
      null,
      2,
    ),
  );
} finally {
  if (session) await call(`/session/${session}`, undefined, 'DELETE').catch(() => {});
  driver.kill('SIGTERM');
  writeFileSync(path.join(output, 'driver.log'), log);
  console.info(`Isolated profile retained at ${profile}`);
}
