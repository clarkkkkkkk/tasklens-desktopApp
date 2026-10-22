// Isolated, real-window acceptance. Run only with build-native-acceptance.mjs's receipt.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
if (!process.argv[2])
  throw new Error(
    'Usage: node scripts/native-reliability-acceptance.mjs <acceptance-run.json> [--fixture graduation-cebuano]',
  );
const root = path.resolve(import.meta.dirname, '..');
const fixture = process.argv.includes('--fixture')
  ? process.argv[process.argv.indexOf('--fixture') + 1]
  : 'midterm';
assert.ok(
  ['midterm', 'graduation-english', 'graduation-cebuano', 'graduation-tagalog'].includes(fixture),
  'Unsupported synthetic fixture',
);
const graduation = fixture.startsWith('graduation-');
const receipt = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(receipt.identifier?.startsWith('app.tasklens.acceptance.'));
assert.equal(
  createHash('sha256').update(readFileSync(receipt.executable)).digest('hex'),
  receipt.sha256,
  'Executable differs from isolated build receipt',
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let driver, session, browser, page, application, launchProcessId;
const results = [];
const runId = Date.now();
const port = 4456;
const logs = [];
async function call(route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Native driver: ${value.value?.error ?? response.status}`);
  return value.value;
}
async function evaluate(script, args = []) {
  if (process.platform === 'win32') return page.evaluate(new Function('args', script), args);
  return call(`/session/${session}/execute/sync`, {
    script: `const args=arguments[0];${script}`,
    args: [args],
  });
}
async function invoke(command, args = {}) {
  if (process.platform === 'win32')
    return page.evaluate(
      async ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
      { command, args },
    );
  const result = await call(`/session/${session}/execute/async`, {
    script:
      'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error)}));',
    args: [command, args],
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function until(script, seconds = 20, args = []) {
  const started = Date.now();
  while (Date.now() - started < seconds * 1000) {
    if (await evaluate(script, args)) return;
    await wait(300);
  }
  throw new Error('Native acceptance condition timed out');
}
const click = (name) =>
  evaluate(
    'const b=Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()===args[0]&&!b.disabled);if(!b)throw new Error("Required action unavailable");b.click();return true;',
    [name],
  );
async function launch() {
  if (process.platform === 'win32') {
    const { chromium } = await import('@playwright/test');
    application = spawn(receipt.executable, [], {
      stdio: 'ignore',
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9335',
      },
    });
    for (let i = 0; i < 100 && !page; i++) {
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9335');
        page = browser.contexts()[0]?.pages()[0];
      } catch {
        await wait(300);
      }
    }
    assert.ok(page);
  } else {
    const value = await call('/session', {
      capabilities: { alwaysMatch: { 'tauri:options': { application: receipt.executable } } },
    });
    session = value.sessionId;
    await call(`/session/${session}/timeouts`, { script: 900000, implicit: 0, pageLoad: 60000 });
  }
  await until('return !!window.__TAURI_INTERNALS__ && !!document.querySelector("main")', 60);
  const status = await invoke('local_diagnostics_session', { enabled: true });
  assert.equal(status.build.identifier, receipt.identifier);
  launchProcessId = status.build.processId;
  assert.ok(
    Number.isInteger(launchProcessId),
    'Rebuild the isolated acceptance executable with process identity diagnostics.',
  );
}
async function close() {
  if (page) {
    await invoke('local_ai_unload').catch(() => {});
    await browser?.close().catch(() => {});
    application?.kill();
    page = undefined;
    browser = undefined;
  }
  if (session) {
    await call(`/session/${session}`, undefined, 'DELETE').catch(() => {});
    session = undefined;
  }
}
async function screenshot(name) {
  if (page) await page.screenshot({ path: path.join(receipt.profile, `${runId}-${name}`) });
  else {
    const bytes = await call(`/session/${session}/screenshot`);
    writeFileSync(path.join(receipt.profile, `${runId}-${name}`), Buffer.from(bytes, 'base64'));
  }
}
async function fill(selector, text) {
  if (process.platform === 'win32') return page.locator(selector).fill(text);
  const element = await call(`/session/${session}/element`, {
    using: 'css selector',
    value: selector,
  });
  const id = element['element-6066-11e4-a52e-4f735466cecf'];
  await call(`/session/${session}/element/${id}/clear`, {});
  await call(`/session/${session}/element/${id}/value`, { text });
}
async function check(name, fn) {
  console.info(`START ${name}`);
  const started = performance.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'pass', durationMs: performance.now() - started, detail });
    console.info(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      status: 'fail',
      durationMs: performance.now() - started,
      error: error instanceof Error ? error.message : 'Failure',
    });
    await screenshot('failure.png').catch(() => {});
    throw error;
  } finally {
    writeFileSync(
      path.join(receipt.profile, `native-results-${runId}.json`),
      JSON.stringify(
        {
          executableSha256: receipt.sha256,
          promptVersion: receipt.promptVersion ?? null,
          fixture,
          results,
        },
        null,
        2,
      ),
    );
  }
}
try {
  if (process.platform !== 'win32') {
    const binary =
      process.env.TASKLENS_TAURI_DRIVER ||
      (existsSync(path.join(root, '.local-ai/tools/bin/tauri-driver'))
        ? path.join(root, '.local-ai/tools/bin/tauri-driver')
        : 'tauri-driver');
    driver = spawn(binary, ['--port', String(port), '--native-port', '4457'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, TAURI_WEBVIEW_AUTOMATION: 'true' },
    });
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
  await check('fresh isolated asset initialization', async () => {
    const started = Date.now();
    let status;
    do {
      status = await invoke('local_intelligence_status');
      if (status.state === 'error') throw new Error('Bundled asset validation failed');
      if (status.state !== 'ready') await wait(1000);
    } while (status.state !== 'ready' && Date.now() - started < 600000);
    assert.equal(status.state, 'ready');
    return { elapsedMs: status.elapsedMs };
  });
  if (!process.argv.includes('--startup-only')) {
    if (
      await evaluate(
        'return !!Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Skip tour")',
      )
    )
      await click('Skip tour');
    await until('return !!document.querySelector(".capture-mic")');
    await click('Settings');
    await until('return !!document.querySelector("#local-ai-heading")');
    await click('Inbox');
    if (process.argv.includes('--text-only')) {
      await check(
        'real text extraction preserves explicit date, time and both supplies',
        async () => {
          await click('Capture text');
          await fill(
            '.voice-text textarea',
            'Meeting on October 23, 2026 at 10:30 PM. Bring a pencil and paper.',
          );
          await click('Extract actions');
          await until(
            'return !!document.querySelector(".bundle-review[open]") || document.querySelector(".capture-primary h2")?.textContent==="Capture needs attention"',
            900,
          );
          assert.equal(
            await evaluate('return !!document.querySelector(".bundle-review[open]")'),
            true,
          );
          assert.equal(
            await evaluate('return document.querySelectorAll(".bundle-selector option").length'),
            1,
          );
          await screenshot('real-text-review.png');
          await evaluate(
            'const b=Array.from(document.querySelectorAll(".bundle-review[open] button")).find(b=>/^Confirm & save/.test(b.textContent.trim()));if(!b)throw new Error("Save unavailable");b.click();return true;',
          );
          await until(
            'return JSON.parse(localStorage.getItem("tasklens:data:v1")).actions.some(a=>a.source.type==="text"&&/meeting/i.test(a.title))',
          );
          const action = await evaluate(
            'const a=JSON.parse(localStorage.getItem("tasklens:data:v1")).actions.find(a=>a.source.type==="text"&&/meeting/i.test(a.title));return {date:a.date,time:a.time,pencil:a.requirements.some(r=>/pencil/i.test(r)),paper:a.requirements.some(r=>/paper/i.test(r)),local:a.source.extractionMode==="local"};',
          );
          assert.deepEqual(action, {
            date: '2026-10-23',
            time: '22:30',
            pencil: true,
            paper: true,
            local: true,
          });
          return action;
        },
      );
    } else if (process.argv.includes('--cancel-only')) {
      await check('native loading/generation cancellation and subsequent inference', async () => {
        const cancellations = [];
        for (const phase of ['loading', 'generation']) {
          await invoke('local_ai_unload');
          if (phase === 'generation') await invoke('local_ai_load');
          const id = randomUUID();
          await evaluate(
            'window.__cancelProbe={};window.__TAURI_INTERNALS__.invoke("local_ai_complete",{id:args[0],prompt:"<|im_start|>user\\nReturn many words.<|im_end|>\\n<|im_start|>assistant\\n<think>\\n\\n</think>\\n\\n",schema:{type:"object",properties:{words:{type:"array",minItems:1000,items:{type:"string"}}},required:["words"]},maxTokens:1024}).then(v=>window.__cancelProbe.result={ok:true},e=>window.__cancelProbe.result={ok:false,error:String(e)});return true;',
            [id],
          );
          if (phase === 'generation') await wait(1500);
          else await wait(100);
          const started = performance.now();
          await invoke('local_jobs_cancel', { id });
          await until('return !!window.__cancelProbe.result', 10);
          const result = await evaluate('return window.__cancelProbe.result');
          assert.equal(result.ok, false);
          assert.match(result.error, /cancel/i);
          const elapsedMs = performance.now() - started;
          assert.ok(elapsedMs < 3000);
          assert.equal((await invoke('local_ai_status')).runtime.state, 'stopped');
          cancellations.push({ phase, elapsedMs });
        }
        const schema = {
          type: 'object',
          properties: { ok: { const: true } },
          required: ['ok'],
          additionalProperties: false,
        };
        const started = performance.now();
        const response = await invoke('local_ai_complete', {
          id: randomUUID(),
          prompt:
            '<|im_start|>user\nReturn {"ok":true}.<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n',
          schema,
          schemaJson: JSON.stringify(schema),
          maxTokens: 64,
        });
        assert.deepEqual(JSON.parse(response.content), { ok: true });
        return { cancellations, subsequentCompletionMs: performance.now() - started };
      });
    } else {
      await check('native bundled OCR before model inference', async () => {
        const bytes = Array.from(
          readFileSync(path.join(root, `tests/fixtures/screenshots/${fixture}.png`)),
        );
        const id = randomUUID();
        if (process.platform === 'win32') {
          const doc = await evaluate(
            'return window.__TAURI_INTERNALS__.invoke("ocr_recognize",new Uint8Array(args[0]),{headers:{"x-tasklens-job":args[1]}})',
            [bytes, id],
          );
          assert.match(doc.fullText, graduation ? /holy mass/i : /midterm/i);
          return { regions: doc.regions.length };
        }
        const result = await call(`/session/${session}/execute/async`, {
          script:
            'const done=arguments[arguments.length-1],graduation=arguments[2];window.__TAURI_INTERNALS__.invoke("ocr_recognize",new Uint8Array(arguments[0]),{headers:{"x-tasklens-job":arguments[1]}}).then(v=>done({ok:true,regions:v.regions.length,meaningful:(graduation?/holy mass/i:/midterm/i).test(v.fullText)}),e=>done({ok:false,error:String(e)}));',
          args: [bytes, randomUUID(), graduation],
        });
        assert.equal(result.ok, true);
        assert.equal(result.meaningful, true);
        return { regions: result.regions };
      });
      await check('real screenshot to review, Source Trace and explicit save', async () => {
        const bytes = readFileSync(
          path.join(root, `tests/fixtures/screenshots/${fixture}.png`),
        ).toString('base64');
        await evaluate(
          'const file=new File([Uint8Array.from(atob(args[0]),c=>c.charCodeAt(0))],args[1],{type:"image/png"});const transfer=new DataTransfer();transfer.items.add(file);document.querySelector(".dropzone").dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:transfer}));return true;',
          [bytes, `${fixture}.png`],
        );
        await until(
          'return !!document.querySelector(".inbox-result-dialog[open],.bundle-review[open]") || document.querySelector(".upload-card")?.dataset.state==="failed"',
          900,
        );
        assert.equal(
          await evaluate('return document.querySelector(".upload-card")?.dataset.state'),
          'review-ready',
        );
        const detail = await evaluate(
          'const panel=document.querySelector(".inbox-result-dialog[open] .details-panel,.bundle-review[open] .bundle-panel:not([hidden]) .details-panel");return {midterm:/midterm/i.test(panel?.textContent||""),evidenceButtons:panel?.querySelectorAll("button[aria-label^=\\"Show source\\"]").length||0};',
        );
        if (!graduation) assert.equal(detail.midterm, true);
        assert.ok(detail.evidenceButtons > 0);
        await screenshot('real-screenshot-review.png');
        await evaluate(
          'const panel=document.querySelector(".bundle-review[open] .bundle-panel:not([hidden]) .details-panel,.inbox-result-dialog[open]:not(.bundle-review) .details-panel");const b=panel?.querySelector("button[aria-label^=\\"Show source\\"]");if(!b)throw new Error("Source Trace unavailable");b.click();return true;',
        );
        await until(
          'return !!document.querySelector("dialog[open] .source-trace[open] .trace-box")',
        );
        await screenshot('real-screenshot-source-trace.png');
        await evaluate(
          'document.querySelectorAll("dialog[open] .source-trace[open]").forEach(d=>d.open=false);return true;',
        );
        const before = await evaluate(
          'return (JSON.parse(localStorage.getItem("tasklens:data:v1"))?.actions||[]).map(a=>a.id)',
        );
        const count = graduation ? 2 : 1;
        if (graduation)
          assert.equal(
            await evaluate('return document.querySelectorAll(".bundle-selector option").length'),
            2,
          );
        for (let index = 0; index < count; index++) {
          if (graduation)
            await evaluate(
              'const s=document.querySelector(".bundle-selector select");s.value=String(args[0]);s.dispatchEvent(new Event("change",{bubbles:true}));return true;',
              [index],
            );
          if (graduation)
            await until(
              'return document.querySelectorAll(".bundle-panel")[args[0]]?.hidden===false',
              20,
              [index],
            );
          await until(
            'const pattern=args[0]?/^Save draft$/:/^Confirm & save/;return !!Array.from(document.querySelectorAll("dialog[open] button")).find(b=>pattern.test(b.textContent.trim())&&!b.disabled&&b.getClientRects().length)',
            20,
            [graduation],
          );
          await evaluate(
            'const pattern=args[0]?/^Save draft$/:/^Confirm & save/;const b=Array.from(document.querySelectorAll("dialog[open] button")).find(b=>pattern.test(b.textContent.trim())&&!b.disabled&&b.getClientRects().length);b.click();return true;',
            [graduation],
          );
          await until(
            'return JSON.parse(localStorage.getItem("tasklens:data:v1")).actions.filter(a=>!args[0].includes(a.id)).length>=args[1]',
            60,
            [before, index + 1],
          );
        }
        const saved = await evaluate(
          'return JSON.parse(localStorage.getItem("tasklens:data:v1")).actions.filter(a=>!args[0].includes(a.id)).map(a=>({id:a.id,title:a.title,date:a.date,time:a.time,endTime:a.endTime,location:a.location,requirements:a.requirements,status:a.status,dateQuestion:a.ambiguities?.some(q=>q.field==="date")||false,ocr:!!a.source.ocr,evidence:!!a.evidence?.length}));',
          [before],
        );
        assert.equal(saved.length, count);
        assert.ok(saved.every((a) => a.ocr && a.evidence));
        if (graduation) {
          const mass = saved.find((a) => /holy mass|misa/i.test(a.title));
          const lunch = saved.find((a) => /lunch|paniudto|tanghalian/i.test(a.title));
          assert.ok(mass && lunch);
          assert.ok(saved.every((a) => !a.date && a.status === 'needs_review' && a.dateQuestion));
          assert.equal(mass.time, '10:00');
          assert.equal(mass.endTime, '11:00');
          assert.match(mass.location, /San Narciso Parish/i);
          assert.ok(mass.requirements.some((r) => /uniform/i.test(r)));
          assert.ok(mass.requirements.some((r) => /trousers|slacks/i.test(r)));
          assert.equal(lunch.time, '12:00');
          assert.match(lunch.location, /RTC Gym/i);
        } else {
          assert.equal(saved[0].status, 'confirmed');
          assert.equal(saved[0].date, '2026-10-11');
          assert.equal(saved[0].time, '08:00');
          assert.equal(saved[0].endTime, '13:00');
        }
        return { ids: saved.map((a) => a.id), actions: saved };
      });
      const savedIds = results.at(-1).detail.ids;
      await check('restart preserves saved action and source evidence', async () => {
        writeFileSync(
          path.join(receipt.profile, `${runId}-runtime-before-restart.json`),
          JSON.stringify(await invoke('local_diagnostics_session'), null, 2),
        );
        const previousProcessId = launchProcessId;
        await close();
        await launch();
        assert.notEqual(
          launchProcessId,
          previousProcessId,
          'Restart must launch a new native process',
        );
        await until('return !!localStorage.getItem("tasklens:data:v1")');
        const preserved = await evaluate(
          'return args[0].every(id=>JSON.parse(localStorage.getItem("tasklens:data:v1")).actions.some(a=>a.id===id&&a.source.ocr&&a.evidence?.length))',
          [savedIds],
        );
        assert.equal(preserved, true);
        return { preserved: true };
      });
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Native acceptance failed');
  process.exitCode = 1;
} finally {
  if (session || page)
    writeFileSync(
      path.join(receipt.profile, `${runId}-runtime-diagnostics.json`),
      JSON.stringify(await invoke('local_diagnostics_session').catch(() => null), null, 2),
    );
  await close();
  driver?.kill();
  writeFileSync(path.join(receipt.profile, `${runId}-driver.log`), logs.join(''));
  console.info(`Isolated evidence retained: ${receipt.profile}`);
}
