import assets from '../../../../src-tauri/resources/models.json';
import { execFileSync } from 'node:child_process';
/**
 * Local model evaluation. Opt-in and slow; never part of `npm test`:
 *
 *   TASKLENS_EVAL=1 npx vitest run src/services/extraction/evaluation
 *
 * Starts the pinned llama-server (src-tauri/binaries) on 127.0.0.1 with the installed
 * Qwen3-4B model, runs every regression case through the production prompt and
 * validator, and writes docs/evaluation/local-ai-eval.{md,json}. A handful of fixtures is a
 * regression signal, not a production accuracy claim.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { StringDecoder } from 'node:string_decoder';
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
const speculative = process.env.TASKLENS_EVAL_SPECULATIVE === 'ngram-simple';
// Experimental only until the complete suite verifies the upstream recommended profile.
const sampling =
  process.env.TASKLENS_EVAL_SAMPLING === 'qwen-non-thinking'
    ? { temperature: 0.7, top_k: 20, top_p: 0.8, min_p: 0, presence_penalty: 1.5, seed: 7 }
    : { temperature: 0, top_k: 1, top_p: 1, seed: 7 };
const target = enabled
  ? execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim()
  : 'unused';
const binary =
  process.env.TASKLENS_RUNTIME ??
  path.resolve(
    'src-tauri/binaries',
    `tasklens-llama-server${process.env.TASKLENS_EVAL_CPU === 'avx2' ? '-avx2' : ''}-${target}${process.platform === 'win32' ? '.exe' : ''}`,
  );
const model =
  process.env.TASKLENS_MODEL ?? path.resolve('src-tauri/resources/models', assets.extraction.file);
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

async function request(pathname: string, body?: object, progressId?: string): Promise<Response> {
  // Built-in HTTP avoids fetch's independent five-minute header deadline during
  // slow CPU inference. The bounded overall timeout matches native completion.
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        agent: false,
        port,
        path: pathname,
        method: body ? 'POST' : 'GET',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        let pending = '';
        let updates = 0;
        const decoder = new StringDecoder('utf8');
        const completion = {
          promptVersion: TASKLENS_EXTRACTION_PROMPT_VERSION,
          sampling,
          modelSha256: assets.extraction.sha256,
          promptLookup: speculative ? 'ngram-simple (N=4, M=8)' : 'disabled',
          content: '',
          stopped_limit: false,
          timings: undefined as Record<string, number> | undefined,
        };
        const streaming = !!body && 'stream' in body && body.stream === true;
        const saveProgress = () => {
          if (!progressId) return;
          mkdirSync(path.resolve('.local-ai/evaluation-raw'), { recursive: true });
          writeFileSync(
            path.resolve('.local-ai/evaluation-raw', `${progressId}.json`),
            JSON.stringify(completion, null, 2),
          );
        };
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) req.destroy(new Error('Oversized local completion'));
          else {
            chunks.push(chunk);
            if (streaming && res.statusCode === 200) {
              pending += decoder.write(chunk);
              let newline;
              while ((newline = pending.indexOf('\n')) >= 0) {
                const line = pending.slice(0, newline).trim();
                pending = pending.slice(newline + 1);
                if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') continue;
                try {
                  const event = JSON.parse(line.slice(5));
                  if (typeof event.content === 'string') {
                    completion.content += event.content;
                    updates++;
                  }
                  if (event.stop) {
                    completion.stopped_limit = !!event.stopped_limit;
                    completion.timings = event.timings;
                  }
                  if (updates % 64 === 0 || event.stop) saveProgress();
                } catch (error) {
                  req.destroy(error instanceof Error ? error : new Error(String(error)));
                }
              }
            }
          }
        });
        res.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        res.on('end', () => {
          clearTimeout(timeout);
          if (streaming && res.statusCode === 200) saveProgress();
          resolve(
            new Response(
              streaming && res.statusCode === 200
                ? JSON.stringify(completion)
                : Buffer.concat(chunks),
              { status: res.statusCode ?? 500 },
            ),
          );
        });
      },
    );
    const timeout = setTimeout(
      () => req.destroy(new Error('Local inference exceeded its deadline')),
      body ? 900_000 : 5_000,
    );
    req.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    req.end(payload);
  });
}

beforeAll(async () => {
  if (!enabled) return;
  port = await freePort();
  mkdirSync('.local-ai', { recursive: true });
  const runtimeLog = openSync('.local-ai/eval-runtime.log', 'w');
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
      ...(speculative
        ? [
            '--spec-type',
            'ngram-simple',
            '--spec-ngram-simple-size-n',
            '4',
            '--spec-ngram-simple-size-m',
            '8',
          ]
        : []),
    ],
    { stdio: ['ignore', runtimeLog, runtimeLog], cwd: path.dirname(binary) },
  );
  closeSync(runtimeLog);
  server.on('exit', (code, signal) => {
    writeFileSync('.local-ai/eval-server-exit.json', JSON.stringify({ code, signal }));
  });
  const started = Date.now();
  while (Date.now() - started < 300_000) {
    if (server.exitCode !== null || server.signalCode !== null)
      throw new Error('llama-server exited; see .local-ai/eval-runtime.log');
    const ok = await request('/health').then(
      (r) => r.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('llama-server did not become healthy');
}, 320_000);

afterAll(async () => {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const child = server;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
});

it.skipIf(!enabled)(
  'local Qwen3 extraction regression suite',
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
      timings?: Record<string, number>;
    }[] = [];
    const selectedCases = extractionCases.filter((c) => !only || only.includes(c.id));
    for (const testCase of selectedCases) {
      const context = contextForCase(testCase);
      const started = performance.now();
      let repair: string | undefined;
      let record: (typeof results)[number] | undefined;
      for (let attempt = 1; attempt <= 2 && !record?.output; attempt++) {
        const built = buildExtractionPrompt(context, repair);
        console.info(`${testCase.id}: attempt ${attempt} started`);
        const response = await request(
          '/completion',
          {
            prompt: built.prompt,
            json_schema: built.schema,
            n_predict: 2048,
            ...sampling,
            cache_prompt: true,
            stream: true,
            stop: assets.extraction.stopTokens,
          },
          `${testCase.id}-${attempt}`,
        );
        if (!response.ok) throw new Error(`Completion failed: HTTP ${response.status}`);
        const data = (await response.json()) as {
          content: string;
          stopped_limit?: boolean;
          timings?: Record<string, number>;
        };
        const result = data.stopped_limit
          ? {
              ok: false as const,
              stage: 'generation',
              error: 'OUTPUT_TRUNCATED',
              issues: [] as string[],
            }
          : validateExtraction(data.content, context);
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
        record.timings = data.timings;
      }
      results.push(record!);
      mkdirSync(path.resolve('.local-ai'), { recursive: true });
      writeFileSync(
        path.resolve('.local-ai/evaluation-progress.json'),
        JSON.stringify(results, null, 2),
      );
      const failed = record!.checks.filter((c) => !c.ok);
      console.info(
        `${record!.id}: ${record!.checks.length - failed.length}/${record!.checks.length} checks, ${record!.seconds.toFixed(1)}s` +
          failed.map((c) => `\n   ✗ ${c.name} — ${c.detail ?? ''}`).join(''),
      );
      // Development diagnosis may stop at the first scored failure; assertions and
      // the default complete-suite run remain unchanged.
      if (failed.length && process.env.TASKLENS_EVAL_FAIL_FAST) break;
    }

    const total = results.flatMap((r) => r.checks);
    const passed = total.filter((c) => c.ok).length;
    const lines = [
      '# Local AI evaluation report',
      '',
      `- Prompt version: ${TASKLENS_EXTRACTION_PROMPT_VERSION}`,
      `- Model: Qwen3-4B Q4_K_M (llama.cpp, CPU)`,
      `- Sampling: ${JSON.stringify(sampling)}`,
      `- Runtime: ${path.basename(binary)}`,
      `- Prompt lookup: ${speculative ? 'ngram-simple (N=4, M=8)' : 'disabled'}`,
      `- Run: ${new Date().toISOString()} on ${os.cpus()[0]?.model ?? 'unknown CPU'}`,
      `- Checks passed: ${passed}/${total.length} across ${results.length} cases`,
      `- Suite coverage: ${results.length}/${selectedCases.length} requested cases${process.env.TASKLENS_EVAL_FAIL_FAST ? ' (fail-fast diagnosis)' : ''}`,
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
    expect(
      total.filter((c) => !c.ok),
      'Real extraction regression failures',
    ).toEqual([]);
  },
  3_600_000,
);
