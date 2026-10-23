// Real WebKit/WebView2 tour smoke test. Only accepts an isolated build receipt.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

if (!process.argv[2])
  throw new Error('Usage: node scripts/native-guided-tour-acceptance.mjs <acceptance-run.json>');
const receipt = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(receipt.identifier?.startsWith('app.tasklens.acceptance.'));
assert.equal(
  readFileSync(path.join(receipt.profile, '.tasklens-test-profile'), 'utf8'),
  receipt.identifier,
);
assert.equal(
  createHash('sha256').update(readFileSync(receipt.executable)).digest('hex'),
  receipt.sha256,
);
const root = path.resolve(import.meta.dirname, '..');
const port = 4466;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let driver, session, browser, page, application;
const logs = [],
  checks = [];
async function call(route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Native driver: ${value.value?.message ?? response.status}`);
  return value.value;
}
async function evaluate(script, args = []) {
  if (page) return page.evaluate(new Function('args', script), args);
  return call(`/session/${session}/execute/sync`, {
    script: `const args=arguments[0];${script}`,
    args: [args],
  });
}
async function until(script, seconds = 20) {
  const started = Date.now();
  while (Date.now() - started < seconds * 1000) {
    if (await evaluate(script)) return;
    await wait(100);
  }
  throw new Error(`Native condition timed out: ${script}`);
}
async function click(name) {
  await evaluate(
    'const button=Array.from(document.querySelectorAll("button")).find(el=>el.textContent.trim()===args[0]&&!el.disabled&&el.getClientRects().length&&!el.closest("[hidden]"));if(!button)throw new Error("Missing button: "+args[0]);button.click();',
    [name],
  );
}
async function screenshot(name) {
  const file = path.join(receipt.profile, `${process.platform}-tour-${name}.png`);
  if (page) await page.screenshot({ path: file });
  else writeFileSync(file, Buffer.from(await call(`/session/${session}/screenshot`), 'base64'));
}
async function launch() {
  if (process.platform === 'win32') {
    const { chromium } = await import('@playwright/test');
    application = spawn(receipt.executable, [], {
      stdio: 'ignore',
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9345',
      },
    });
    for (let i = 0; i < 100 && !page; i++) {
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9345');
        page = browser.contexts()[0]?.pages()[0];
      } catch {
        await wait(300);
      }
    }
    assert.ok(page, 'WebView2 debugging endpoint did not open');
  } else {
    const value = await call('/session', {
      capabilities: { alwaysMatch: { 'tauri:options': { application: receipt.executable } } },
    });
    session = value.sessionId;
    await call(`/session/${session}/window/rect`, { width: 1100, height: 800 });
  }
  await until('return !!window.__TAURI_INTERNALS__ && !!document.querySelector("main")', 60);
  // A concurrently rebuilt checkout must never make this test use the real profile.
  const identity = page
    ? await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('local_diagnostics_session'))
    : await call(`/session/${session}/execute/async`, {
        script:
          'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke("local_diagnostics_session").then(done,error=>done({error:String(error)}));',
        args: [],
      });
  assert.equal(
    identity.build?.identifier,
    receipt.identifier,
    'Native app identity differs from the isolated build receipt',
  );
}
async function close() {
  if (browser) {
    await browser.close().catch(() => {});
    application?.kill();
    browser = page = undefined;
  }
  if (session) {
    await call(`/session/${session}`, undefined, 'DELETE').catch(() => {});
    session = undefined;
  }
}
async function check(name, run) {
  await run();
  checks.push(name);
  console.info(`PASS ${name}`);
}
try {
  if (process.platform !== 'win32') {
    const fallback = path.join(root, '.local-ai/tools/bin/tauri-driver');
    driver = spawn(
      process.env.TASKLENS_TAURI_DRIVER || (existsSync(fallback) ? fallback : 'tauri-driver'),
      ['--port', String(port), '--native-port', String(port + 1)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, TAURI_WEBVIEW_AUTOMATION: 'true' },
      },
    );
    driver.stdout.on('data', (bytes) => logs.push(bytes.toString()));
    driver.stderr.on('data', (bytes) => logs.push(bytes.toString()));
    for (let i = 0; i < 100; i++) {
      try {
        await call('/status');
        break;
      } catch {
        await wait(200);
      }
    }
  }
  await launch();
  await check('first-run completion waits for brand handoff', async () => {
    await until('return !!document.querySelector(".onboarding")');
    await evaluate(
      'window.tourCalls=[];const api=window.__TAURI_INTERNALS__;const original=api.invoke;api.invoke=function(command,...args){if(/(?:generate|transcribe|extract|groq_connect|record_start)/.test(command))window.tourCalls.push(command);return original.call(this,command,...args);};',
    );
    for (const name of ['Get Started', 'Continue', 'Continue', 'Start using TaskLens']) {
      await click(name);
      await wait(150);
    }
    await until('return !!document.querySelector(".brand-handoff")');
    assert.equal(await evaluate('return !!document.querySelector("[data-guided-tour]")'), false);
    await until(
      'return !!document.querySelector("[data-guided-tour][open]") && !document.querySelector(".brand-handoff")',
    );
  });
  const snapshot = await evaluate('return localStorage.getItem("tasklens:data:v1")');
  await check('every native target and navigation step', async () => {
    for (let index = 0; index < 12; index++) {
      await until(
        'return !!document.querySelector(".tour-card[data-ready=true]") && !!document.querySelector("[data-tour-target]")',
      );
      await until(
        'const card=document.querySelector(".tour-card").getBoundingClientRect();const target=document.querySelector("[data-tour-target]").getBoundingClientRect();return !(card.left<target.right&&card.right>target.left&&card.top<target.bottom&&card.bottom>target.top);',
      );
      const state = await evaluate(
        'const card=document.querySelector(".tour-card").getBoundingClientRect();const target=document.querySelector("[data-tour-target]").getBoundingClientRect();return {counter:document.querySelector(".tour-card-header").textContent,inside:card.left>=11&&card.top>=11&&card.right<=innerWidth-11&&card.bottom<=innerHeight-11,overlap:card.left<target.right&&card.right>target.left&&card.top<target.bottom&&card.bottom>target.top};',
      );
      assert.ok(state.counter.includes(`${index + 1} of 12`));
      assert.ok(state.inside, `Step ${index + 1} escaped viewport`);
      assert.equal(state.overlap, false, `Step ${index + 1} overlaps target`);
      if ([0, 1, 8, 11].includes(index)) await screenshot(String(index + 1));
      await click(index === 11 ? 'Finish tour' : 'Next');
    }
    await until(
      'return !document.querySelector("[data-guided-tour]") && document.activeElement?.id==="main-content"',
    );
    assert.equal(await evaluate('return localStorage.getItem("tasklens:data:v1")'), snapshot);
    assert.deepEqual(await evaluate('return window.tourCalls'), []);
    assert.equal(
      await evaluate('return JSON.parse(localStorage.getItem("tasklens:guided-tour:v1")).status'),
      'completed',
    );
  });
  await check('replay Escape and Skip restore Settings and collapsed preference', async () => {
    await evaluate('document.querySelector(".sidebar-toggle").click()');
    await click('Settings');
    await wait(200);
    await click('Replay guided tour');
    await until('return !!document.querySelector("[data-guided-tour][open]")');
    assert.equal(await evaluate('return !!document.querySelector(".brand-handoff")'), false);
    await click('Next');
    await click('Back');
    if (page) await page.keyboard.press('Escape');
    else
      await call(`/session/${session}/actions`, {
        actions: [
          {
            type: 'key',
            id: 'tour-keyboard',
            actions: [
              { type: 'keyDown', value: '\uE00C' },
              { type: 'keyUp', value: '\uE00C' },
            ],
          },
        ],
      });
    await until(
      'return !document.querySelector("[data-guided-tour]") && document.activeElement?.hasAttribute("data-replay-guided-tour")',
    );
    await click('Replay guided tour');
    await until('return !!document.querySelector("[data-guided-tour][open]")');
    await click('Skip tour');
    await until(
      'return !document.querySelector("[data-guided-tour]") && document.activeElement?.hasAttribute("data-replay-guided-tour")',
    );
    assert.equal(
      await evaluate('return document.querySelector(".sidebar").dataset.collapsed'),
      'true',
    );
  });
  await close();
  await launch();
  await check('native restart does not repeat onboarding or tour', async () => {
    await until('return !!document.querySelector(".inbox-view:not([hidden])")');
    assert.equal(
      await evaluate(
        'return !!document.querySelector(".onboarding,[data-guided-tour],.brand-handoff")',
      ),
      false,
    );
    assert.equal(
      await evaluate('return document.querySelector(".sidebar").dataset.collapsed'),
      'true',
    );
  });
} catch (error) {
  await screenshot('failure').catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await close();
  driver?.kill();
  writeFileSync(
    path.join(receipt.profile, 'guided-tour-results.json'),
    JSON.stringify(
      {
        platform: process.platform,
        executableSha256: receipt.sha256,
        checks,
        passed: !process.exitCode,
        logs,
      },
      null,
      2,
    ),
  );
  console.info(`Results: ${path.join(receipt.profile, 'guided-tour-results.json')}`);
}
