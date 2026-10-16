// Run against an extracted/installed RPM or AppDir, inside a network namespace with lo up.
// Requires a native tauri-driver/WebKitWebDriver; creates only its own XDG profile.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const executable = process.argv[2];
if (!executable || !path.isAbsolute(executable))
  throw new Error('Provide an absolute installed TaskLens executable path');
const out = path.resolve(
  process.env.TASKLENS_ACCEPTANCE_OUTPUT || 'test-results-native/offline-linux',
);
mkdirSync(out, { recursive: true });
const driver = spawn(process.env.TASKLENS_TAURI_DRIVER || 'tauri-driver', ['--port', '4444'], {
  env: {
    ...process.env,
    TAURI_WEBVIEW_AUTOMATION: 'true',
    XDG_DATA_HOME: path.join(out, 'data'),
    XDG_CONFIG_HOME: path.join(out, 'config'),
    XDG_CACHE_HOME: path.join(out, 'cache'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = [];
driver.stdout.on('data', (v) => log.push(v.toString()));
driver.stderr.on('data', (v) => log.push(v.toString()));
let session;
const results = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`http://127.0.0.1:4444${route}`, {
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
  const result = await call(`/session/${session}/execute/async`, {
    script: `const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then(value=>done({ok:true,value}),error=>done({ok:false,error:String(error)}));`,
    args: [command, args],
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function launch() {
  const value = await call('/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: executable } } },
  });
  session = value.sessionId;
  await call(`/session/${session}/timeouts`, { script: 900000, implicit: 0, pageLoad: 60000 });
  for (let i = 0; i < 100; i++) {
    if (await sync('return !!window.__TAURI_INTERNALS__')) return;
    await wait(200);
  }
  throw new Error('Native window did not initialize');
}
async function check(name, fn) {
  const start = performance.now();
  const detail = await fn();
  results.push({ name, seconds: (performance.now() - start) / 1000, detail });
  console.info(`PASS ${name}`);
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      await call('/status');
      break;
    } catch {
      await wait(200);
    }
  }
  await launch();
  await check('native first-launch readiness without imports', async () => {
    let status;
    for (let i = 0; i < 600; i++) {
      status = await invoke('local_intelligence_status');
      if (status.state !== 'preparing') break;
      await wait(500);
    }
    if (process.env.TASKLENS_ACCEPTANCE_EXPECT_ERROR) {
      assert.equal(status.state, 'error');
      assert.equal(status.components[process.env.TASKLENS_ACCEPTANCE_EXPECT_ERROR]?.state, 'error');
      return status;
    }
    assert.equal(status.state, 'ready', JSON.stringify(status));
    const metadata = await invoke('local_ai_status');
    assert.equal(metadata.model.state, 'verified');
    assert.equal(metadata.runtime.state, 'stopped');
    assert.ok(
      metadata.model.path.startsWith(path.dirname(executable).replace(/\/bin$/, '/lib/tasklens')) ||
        process.env.APPDIR,
    );
    return { status, model: metadata.model.path, ocr: metadata.ocr };
  });
  if (!process.env.TASKLENS_ACCEPTANCE_EXPECT_ERROR) {
    await check('onboarding skip and screenshot OCR', async () => {
      await sync(
        `Array.from(document.querySelectorAll('button')).find(b=>/^Skip/.test(b.textContent.trim()))?.click(); return true;`,
      );
      await wait(1000);
      const image = readFileSync('tests/fixtures/screenshots/pictorial.png').toString('base64');
      const value = await call(`/session/${session}/execute/async`, {
        script: `const done=arguments[arguments.length-1]; const bytes=Uint8Array.from(atob(arguments[0]),c=>c.charCodeAt(0));window.__TAURI_INTERNALS__.invoke('ocr_recognize',bytes,{headers:{'x-tasklens-job':crypto.randomUUID()}}).then(v=>done({ok:true,value:v}),e=>done({ok:false,error:String(e)}));`,
        args: [image],
      });
      assert.ok(value.ok, value.error);
      assert.match(value.value.fullText, /pictorial/i);
      return { regions: value.value.regions.length, text: value.value.fullText };
    });
    await check('real typed text extraction and review', async () => {
      await sync(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Capture text').click(); return true;`,
      );
      await sync(
        `const t=document.querySelector('.voice-text textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Math exam on October 20, 2026 at 10:00 AM in Room 204. Bring a calculator.');t.dispatchEvent(new Event('input',{bubbles:true}));return true;`,
      );
      await wait(300);
      await sync(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Extract actions').click(); return true;`,
      );
      let text = '';
      for (let i = 0; i < 1800; i++) {
        text = await sync('return document.body.innerText');
        if (
          text.includes('Review extracted actions') ||
          text.includes('Confirm & save') ||
          text.includes('Save draft')
        )
          break;
        await wait(500);
      }
      assert.match(text, /Math|exam/i);
      assert.match(text, /Confirm|Save draft/);
      const shot = await call(`/session/${session}/screenshot`);
      writeFileSync(path.join(out, 'review.png'), Buffer.from(shot, 'base64'));
      await sync(
        `Array.from(document.querySelectorAll('button')).find(b=>!b.disabled && /Confirm & save|Save draft/.test(b.textContent))?.click(); return true;`,
      );
      await wait(1000);
      const saved = await sync(
        `return JSON.parse(localStorage.getItem('tasklens:data:v1')).actions`,
      );
      assert.ok(saved.length > 0);
      await sync(
        `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Close review')?.click(); return true;`,
      );
      return { review: text, saved: saved.length };
    });
    await check('real imported audio transcription unloads extraction', async () => {
      const bytes = readFileSync(
        process.env.TASKLENS_ACCEPTANCE_AUDIO || '.local-ai/whisper/samples/jfk.wav',
      );
      const id = await invoke('voice_import_begin', {
        name: 'offline-speech.wav',
        size: bytes.length,
      });
      for (let offset = 0; offset < bytes.length; offset += 262144)
        await invoke('voice_import_chunk', {
          id,
          bytes: Array.from(bytes.subarray(offset, offset + 262144)),
        });
      const transcript = await invoke('voice_transcribe', { id });
      assert.ok(transcript.fullText.length > 10);
      assert.ok(transcript.segments.length > 0);
      assert.equal((await invoke('local_ai_status')).runtime.state, 'stopped');
      return transcript;
    });
    if (process.env.TASKLENS_ACCEPTANCE_AUDIO)
      await check('voice-to-action through the production import and review UI', async () => {
        const base64 = readFileSync(process.env.TASKLENS_ACCEPTANCE_AUDIO).toString('base64');
        await sync(
          `const f=new File([Uint8Array.from(atob(arguments[0]),c=>c.charCodeAt(0))],'exam.wav',{type:'audio/wav'}); const transfer=new DataTransfer(); transfer.items.add(f); document.querySelector('.voice-capture').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));return true;`,
          [base64],
        );
        let text = '';
        for (let i = 0; i < 1800; i++) {
          text = await sync('return document.body.innerText');
          if (await sync("return !!document.querySelector('dialog.bundle-review[open]')")) break;
          await wait(500);
        }
        assert.equal(
          await sync("return !!document.querySelector('dialog.bundle-review[open]')"),
          true,
          text,
        );
        assert.match(text, /exam|Math/i);
        return text;
      });
    await check('returning native window preserves onboarding state', async () => {
      const before = await sync(`return localStorage.getItem('tasklens:data:v1')`);
      assert.ok(before);
      await call(`/session/${session}`, undefined, 'DELETE');
      session = undefined;
      await launch();
      await wait(1500);
      assert.equal(await sync(`return localStorage.getItem('tasklens:data:v1')`), before);
      assert.equal(await sync(`return !!document.querySelector('.onboarding')`), false);
      return { persisted: true };
    });
  }
} finally {
  if (session) await call(`/session/${session}`, undefined, 'DELETE').catch(() => {});
  driver.kill();
  writeFileSync(path.join(out, 'driver.log'), log.join(''));
}
