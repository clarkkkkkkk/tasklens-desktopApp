// Opt-in, real-model performance diagnostic. Synthetic content only; never imported by the app.
// node scripts/benchmark-audio-extraction.mjs [default|single-slot]
import { createServer } from 'vite';
import { spawn, execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { createServer as netServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const variant = process.argv[2] || 'default';
if (!['default', 'single-slot'].includes(variant)) throw new Error('Use default or single-slot');
const output = path.join(root, '.local-ai/audio-performance');
mkdirSync(output, { recursive: true });
const vite = await createServer({
  root,
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  clearScreen: false,
});
const { buildExtractionPrompt, unitsFromText, unitsFromTranscript } = await vite.ssrLoadModule(
  '/src/services/extraction/prompts/build-prompt.ts',
);
const { validateExtraction } = await vite.ssrLoadModule(
  '/src/services/extraction/validation/validate-extraction.ts',
);
await vite.close();
const manifest = JSON.parse(
  readFileSync(path.join(root, 'src-tauri/resources/models.json'), 'utf8'),
);
const target = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
const binary =
  process.env.TASKLENS_PERF_RUNTIME ||
  path.join(
    root,
    'src-tauri/binaries',
    `tasklens-llama-server-avx2-${target}${process.platform === 'win32' ? '.exe' : ''}`,
  );
const model = path.join(root, 'src-tauri/resources/models', manifest.extraction.file);
const port = await new Promise((resolve) => {
  const socket = netServer().listen(0, '127.0.0.1', () => {
    const port = socket.address().port;
    socket.close(() => resolve(port));
  });
});
const key = randomUUID();
const args = [
  '--model',
  model,
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--api-key',
  key,
  '--ctx-size',
  '8192',
  '--parallel',
  '1',
  '--n-gpu-layers',
  '0',
  '--no-webui',
  '--slot-save-path',
  output,
];
if (variant === 'single-slot') args.push('--cache-ram', '0', '--no-cache-idle-slots');
const fd = openSync(path.join(output, `${variant}.log`), 'w');
const child = spawn(binary, args, { stdio: ['ignore', 'ignore', fd] });
closeSync(fd);
let spawnError;
child.on('error', (error) => {
  spawnError = error;
});
let peakRssKiB = 0;
const sample = setInterval(() => {
  try {
    const text = readFileSync(`/proc/${child.pid}/status`, 'utf8');
    peakRssKiB = Math.max(peakRssKiB, Number(/VmHWM:\s+(\d+)/.exec(text)?.[1] || 0));
  } catch {
    /* exited or non-Linux */
  }
}, 200);
const report = {
  variant,
  modelSha256: manifest.extraction.sha256,
  promptVersion: null,
  loadMs: 0,
  prewarmMs: 0,
  restoreMs: 0,
  peakRssKiB: 0,
  cases: [],
};
const save = () => {
  report.peakRssKiB = peakRssKiB;
  writeFileSync(path.join(output, `${variant}.json`), JSON.stringify(report, null, 2));
};
function call(route, body, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: route,
        method: data ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (part) => {
          raw += part;
          if (raw.length > 8 * 1024 * 1024) req.destroy(new Error('Oversized response'));
        });
        res.on('end', () => {
          try {
            const value = JSON.parse(raw);
            if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
            else resolve(value);
          } catch (error) {
            reject(error);
          }
        });
        res.on('error', reject);
      },
    );
    req.setTimeout(timeout, () => req.destroy(new Error('Local inference timeout')));
    req.on('error', reject);
    req.end(data);
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text =
  'I have a meeting on October 23, 2026 at 10:30 PM. Please remind me to bring a pencil and paper.';
const now = new Date('2026-10-21T07:00:00Z');
const transcript = {
  fullText: text,
  segments: [{ id: 's1', startMs: 0, endMs: 10000, text }],
  durationMs: 10000,
  language: 'en',
  model: manifest.whisper.model,
};
const fixtures = [
  {
    id: 'meeting-voice',
    source: { type: 'voice', transcript, capturedAt: now.toISOString(), timezone: 'Asia/Manila' },
    kind: 'voice',
    units: unitsFromTranscript(transcript),
  },
  {
    id: 'meeting-text',
    source: { type: 'text', text, capturedAt: now.toISOString(), timezone: 'Asia/Manila' },
    kind: 'text',
    units: unitsFromText(text),
  },
];
try {
  const loaded = performance.now();
  while (performance.now() - loaded < 180000) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Runtime exited (${child.exitCode})`);
    try {
      await call('/health', null, 2000);
      break;
    } catch {
      await sleep(300);
    }
  }
  await call('/health', null, 2000);
  report.loadMs = performance.now() - loaded;
  const first = buildExtractionPrompt({
    ...fixtures[0],
    now,
    timezone: 'Asia/Manila',
    capturedAt: now.toISOString(),
  });
  report.promptVersion = first.version;
  const prefixFile = `benchmark-${createHash('sha256').update(manifest.extraction.sha256).update(first.cachePrefix).digest('hex').slice(0, 24)}.bin`;
  const start = performance.now();
  report.prefixRestored = existsSync(path.join(output, prefixFile));
  if (report.prefixRestored) {
    await call('/slots/0?action=restore', { filename: prefixFile });
  } else {
    await call('/completion', { prompt: first.cachePrefix, n_predict: 0, cache_prompt: true });
  }
  report.prewarmMs = performance.now() - start;
  await call('/slots/0?action=save', { filename: prefixFile });
  save();
  console.log(
    `${variant}: ready; prefix ${report.prefixRestored ? 'restored' : 'evaluated'} in ${(report.prewarmMs / 1000).toFixed(1)}s`,
  );
  for (const fixture of fixtures) {
    const context = {
      kind: fixture.kind,
      units: fixture.units,
      now,
      timezone: 'Asia/Manila',
      capturedAt: now.toISOString(),
    };
    const prompt = buildExtractionPrompt(context);
    const before = performance.now();
    try {
      const response = await call('/completion', {
        prompt: prompt.prompt,
        json_schema: prompt.schema,
        n_predict: 2048,
        temperature: 0,
        top_k: 1,
        top_p: 1,
        seed: 7,
        cache_prompt: true,
        stream: false,
        stop: manifest.extraction.stopTokens,
      });
      const valid = validateExtraction(response.content, {
        ...context,
        source: fixture.source,
        defaultReminders: [],
      });
      const action = valid.ok ? valid.actions[0] : null;
      const checks = {
        valid: valid.ok,
        oneAction: valid.ok && valid.actions.length === 1,
        date: action?.date === '2026-10-23',
        time: action?.time === '22:30',
        requirements:
          !!action &&
          /pencil/i.test(action.requirements.join(' ')) &&
          /paper/i.test(action.requirements.join(' ')),
      };
      report.cases.push({
        id: fixture.id,
        elapsedMs: performance.now() - before,
        timings: response.timings,
        checks,
        truncated: response.stopped_limit,
        content: response.content,
      });
      save();
      console.log(
        `${variant}: ${fixture.id} ${(report.cases.at(-1).elapsedMs / 1000).toFixed(1)}s`,
        checks,
      );
    } catch (error) {
      report.cases.push({
        id: fixture.id,
        error: String(error),
        elapsedMs: performance.now() - before,
      });
      save();
      throw error;
    }
  }
  const before = performance.now();
  await call('/slots/0?action=restore', { filename: prefixFile });
  report.restoreMs = performance.now() - before;
  save();
  assert.ok(
    report.cases.every((fixture) => Object.values(fixture.checks).every(Boolean)),
    'Fixture correctness checks failed; inspect the local report',
  );
} catch (error) {
  report.error = String(error);
  save();
  throw error;
} finally {
  clearInterval(sample);
  child.kill('SIGTERM');
}
