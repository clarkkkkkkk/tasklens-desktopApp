// Real Qwen using the production Rust HTTP transport, prompts and TypeScript validator.
// Synthetic inputs only. Not a replacement for full-window acceptance.
import { createServer } from 'vite';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { manifest, verify, hash, targetTriple, sidecar } from './ai-assets.mjs';
const root = path.resolve(import.meta.dirname, '..');
const name = process.argv[2] || 'simple-english';
const output = path.join(root, '.local-ai/reliability-probe', name);
mkdirSync(output, { recursive: true });
const vite = await createServer({
  root,
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
});
const { buildExtractionPrompt, unitsFromText, unitsFromOcr } = await vite.ssrLoadModule(
  '/src/services/extraction/prompts/build-prompt.ts',
);
const { validateExtraction } = await vite.ssrLoadModule(
  '/src/services/extraction/validation/validate-extraction.ts',
);
const { extractionCases } = await vite.ssrLoadModule('/tests/fixtures/extraction/cases.ts');
const { scoreCase } = await vite.ssrLoadModule('/tests/fixtures/extraction/score.ts');
await vite.close();
const now = new Date('2026-10-21T07:00:00Z');
const text = 'Meeting on October 23, 2026 at 10:30 PM. Bring a pencil and paper.';
let source, units, kind;
if (name === 'simple-english') {
  source = { type: 'text', text, timezone: 'Asia/Manila', capturedAt: now.toISOString() };
  units = unitsFromText(text);
  kind = 'text';
} else {
  const ocr = JSON.parse(
    readFileSync(path.join(root, 'tests/fixtures/screenshots/ocr', `${name}.json`)),
  );
  source = { type: 'image', fileName: `${name}.png`, ocr, timezone: 'Asia/Manila' };
  units = unitsFromOcr(ocr);
  kind = 'screenshot';
}
const context = {
  kind,
  units,
  now,
  timezone: 'Asia/Manila',
  capturedAt: source.capturedAt ?? null,
};
const prompt = buildExtractionPrompt(context);
const model = path.join(root, 'src-tauri/resources/models', manifest.extraction.file);
await verify(model, manifest.extraction);
const binary = path.join(
  root,
  'src-tauri/binaries',
  sidecar(process.arch === 'x64' ? 'llama-server-avx2' : 'llama-server'),
);
const runtimeReceipt = JSON.parse(
  readFileSync(path.join(root, 'src-tauri/resources/notices/runtime-build.json')),
);
if (
  (await hash(binary)) !==
  runtimeReceipt.runtimes[process.arch === 'x64' ? 'llama-server-avx2' : 'llama-server'].sha256
)
  throw new Error('Runtime hash mismatch');
const cacheDirectory = path.join(root, '.local-ai/audio-performance');
mkdirSync(cacheDirectory, { recursive: true });
const prefixFile = `benchmark-${createHash('sha256').update(manifest.extraction.sha256).update(prompt.cachePrefix).digest('hex').slice(0, 24)}.bin`;
const requestFile = path.join(output, 'request.json');
writeFileSync(
  requestFile,
  JSON.stringify({
    binary,
    model,
    cacheDirectory,
    prefixFile: existsSync(path.join(cacheDirectory, prefixFile)) ? prefixFile : null,
    prefix: prompt.cachePrefix,
    prompt: prompt.prompt,
    schema: prompt.schema,
    schemaJson: JSON.stringify(prompt.schema),
    output: path.join(output, 'native.json'),
  }),
);
const result = spawnSync(
  'cargo',
  [
    'test',
    '--locked',
    '--manifest-path',
    path.join(root, 'src-tauri/Cargo.toml'),
    'local_ai::tests::native_completion_smoke',
    '--',
    '--ignored',
    '--exact',
    '--nocapture',
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, TASKLENS_NATIVE_REQUEST: requestFile } },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const native = JSON.parse(readFileSync(path.join(output, 'native.json')));
const validation = validateExtraction(native.report.response.content, {
  ...context,
  source,
  defaultReminders: [],
});
const expected = extractionCases.find(
  (c) => c.id === (name === 'simple-english' ? 'pencil-and-paper' : name),
);
const checks =
  validation.ok && expected
    ? scoreCase(expected, { actions: validation.actions, ambiguities: validation.ambiguities })
    : [];
writeFileSync(
  path.join(output, 'validation.json'),
  JSON.stringify(
    {
      target: targetTriple(),
      promptVersion: prompt.version,
      prefixRestored: existsSync(path.join(cacheDirectory, prefixFile)),
      validation,
      checks,
    },
    null,
    2,
  ),
);
console.info(
  JSON.stringify({
    nativeSuccess: !!native.report.response,
    validated: validation.ok,
    loadMs: native.report.loadMs,
    prefixMs: native.report.prefixMs,
    requestMs: native.report.requestMs,
    actions: validation.ok ? validation.actions.length : 0,
  }),
);
if (!validation.ok || checks.some((c) => !c.ok)) process.exitCode = 1;
console.info(checks.filter((c) => !c.ok));
