/**
 * Local model evaluation. Opt-in and slow; never part of `npm test`:
 *
 *   TASKLENS_EVAL=1 npx vitest run src/services/extraction/evaluation
 *
 * Starts the pinned llama-server (src-tauri/resources/bin) on 127.0.0.1 with the installed
 * Phi-4-mini-instruct model, runs every regression case through the production prompt and
 * validator, and writes docs/evaluation/local-ai-eval.{md,json}. A handful of fixtures is a
 * regression signal, not a production accuracy claim.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { extractionCases } from '../../../../tests/fixtures/extraction/cases';
import { contextForCase } from '../../../../tests/fixtures/extraction/context';
import { scoreCase, type Check } from '../../../../tests/fixtures/extraction/score';
import { buildExtractionPrompt } from '../prompts/build-prompt';
import { TASKLENS_EXTRACTION_PROMPT_VERSION } from '../prompts/extraction-prompt-version';
import { validateExtraction } from '../validation/validate-extraction';

const enabled = !!process.env.TASKLENS_EVAL;
const only = process.env.TASKLENS_EVAL_ONLY?.split(',');
const binary = path.resolve(
  'src-tauri/resources/bin',
  `llama-server${process.platform === 'win32' ? '.exe' : ''}`,
);
const model =
  process.env.TASKLENS_MODEL ??
  path.join(
    process.platform === 'win32'
      ? process.env.APPDATA!
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library/Application Support')
        : path.join(os.homedir(), '.local/share'),
    'app.tasklens.desktop/models/Phi-4-mini-instruct-Q4_K_M.gguf',
  );
const key = crypto.randomUUID();
let server: ChildProcess | undefined;
let port = 0;

async function freePort() {
  return new Promise<number>((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
  });
}

async function request(pathname: string, body?: object) {
  // Loopback only: the evaluation never contacts another host.
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  if (!enabled) return;
  port = await freePort();
  server = spawn(
    binary,
    [
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
    ],
    { stdio: 'ignore', cwd: path.dirname(binary) },
  );
  const started = Date.now();
  while (Date.now() - started < 300_000) {
    const ok = await request('/health').then(
      (r) => r.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('llama-server did not become healthy');
}, 320_000);

afterAll(() => server?.kill());

it.skipIf(!enabled)(
  'local Phi-4-mini extraction regression suite',
  async () => {
    const results: {
      id: string;
      languages: string;
      seconds: number;
      attempts: number;
      checks: Check[];
      output: unknown;
      issues: string[];
      error?: string;
    }[] = [];
    for (const testCase of extractionCases.filter((c) => !only || only.includes(c.id))) {
      const context = contextForCase(testCase);
      const started = performance.now();
      let repair: string | undefined;
      let record: (typeof results)[number] | undefined;
      for (let attempt = 1; attempt <= 2 && !record?.output; attempt++) {
        const built = buildExtractionPrompt(context, repair);
        const response = await request('/completion', {
          prompt: built.prompt,
          json_schema: built.schema,
          n_predict: 2048,
          temperature: 0,
          top_k: 1,
          top_p: 1,
          seed: 7,
          cache_prompt: true,
          stop: ['<|end|>', '<|endoftext|>'],
        });
        const data = (await response.json()) as { content: string; stopped_limit?: boolean };
        const result = validateExtraction(data.content, context);
        const seconds = (performance.now() - started) / 1000;
        if (result.ok) {
          const bundle = { actions: result.actions, ambiguities: result.ambiguities };
          record = {
            id: testCase.id,
            languages: testCase.languages,
            seconds,
            attempts: attempt,
            checks: scoreCase(testCase, bundle),
            output: bundle.actions.map((a) => ({
              type: a.type,
              title: a.title,
              date: a.date,
              time: a.time,
              endTime: a.endTime,
              arrivalTime: a.arrivalTime,
              location: a.location,
              requirements: a.requirements,
              notes: a.notes,
              confidence: a.confidence,
            })),
            issues: result.issues,
          };
          (record.output as unknown[]).push({
            ambiguities: bundle.ambiguities.map(
              (a) => `${a.field}: ${a.question} ${JSON.stringify(a.options)}`,
            ),
          });
        } else {
          repair = `Your previous answer was invalid (${result.error}). Return only a valid JSON object for the schema.`;
          record = {
            id: testCase.id,
            languages: testCase.languages,
            seconds,
            attempts: attempt,
            checks: [{ name: 'valid output', ok: false, detail: result.error }],
            output: undefined,
            issues: result.issues,
            error: `${result.stage}: ${result.error}`,
          };
        }
      }
      results.push(record!);
      const failed = record!.checks.filter((c) => !c.ok);
      console.info(
        `${record!.id}: ${record!.checks.length - failed.length}/${record!.checks.length} checks, ${record!.seconds.toFixed(1)}s` +
          failed.map((c) => `\n   ✗ ${c.name} — ${c.detail ?? ''}`).join(''),
      );
    }

    const total = results.flatMap((r) => r.checks);
    const passed = total.filter((c) => c.ok).length;
    const lines = [
      '# Local AI evaluation report',
      '',
      `- Prompt version: ${TASKLENS_EXTRACTION_PROMPT_VERSION}`,
      `- Model: Phi-4-mini-instruct Q4_K_M (llama.cpp, CPU, temperature 0)`,
      `- Run: ${new Date().toISOString()} on ${os.cpus()[0]?.model ?? 'unknown CPU'}`,
      `- Checks passed: ${passed}/${total.length} across ${results.length} cases`,
      '',
      'A small fixture suite is a regression signal, not a measure of production accuracy.',
      '',
      '| Case | Languages | Checks | Seconds | Attempts |',
      '| --- | --- | --- | --- | --- |',
      ...results.map(
        (r) =>
          `| ${r.id} | ${r.languages} | ${r.checks.filter((c) => c.ok).length}/${r.checks.length} | ${r.seconds.toFixed(1)} | ${r.attempts} |`,
      ),
      '',
      ...results.flatMap((r) => [
        `## ${r.id}`,
        '',
        ...r.checks.map(
          (c) => `- ${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`,
        ),
        ...(r.issues.length
          ? ['', 'Validator corrections:', ...r.issues.map((i) => `- ${i}`)]
          : []),
        '',
      ]),
    ];
    const folder = path.resolve('docs/evaluation');
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'local-ai-eval.md'), lines.join('\n'));
    writeFileSync(path.join(folder, 'local-ai-eval.json'), JSON.stringify(results, null, 2));
    expect(results.length).toBeGreaterThan(0);
  },
  3_600_000,
);
