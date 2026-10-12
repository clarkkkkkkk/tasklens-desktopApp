import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractionPrompt, extractionJsonSchema, parseExtraction } from './LocalExtractionService';
import { phrases, transcript } from '../../../tests/fixtures/voice';
const run = promisify(execFile);
it.skipIf(!process.env.TASKLENS_NATIVE_MODELS)(
  'real local Qwen preserves the six semantic fixtures',
  async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'tasklens-model-test-'));
    try {
      await writeFile(path.join(folder, 'schema.json'), JSON.stringify(extractionJsonSchema));
      for (let i = 0; i < phrases.length; i++) {
        if (
          process.env.TASKLENS_NATIVE_FIXTURE &&
          Number(process.env.TASKLENS_NATIVE_FIXTURE) !== i + 1
        )
          continue;
        const source = {
          type: 'voice' as const,
          transcript: transcript(phrases[i]),
          capturedAt: '2026-10-11T04:00:00.000Z',
          timezone: 'Asia/Manila',
        };
        await writeFile(path.join(folder, 'prompt.txt'), extractionPrompt(source));
        await mkdir('.local-ai/evaluations', { recursive: true });
        const start = performance.now();
        const { stdout } = await run(
          path.resolve('src-tauri/resources/bin/llama-completion'),
          [
            '-m',
            path.resolve('.local-ai/models/Qwen3-4B-Q4_K_M.gguf'),
            '-f',
            path.join(folder, 'prompt.txt'),
            '-jf',
            path.join(folder, 'schema.json'),
            '-n',
            '4096',
            '-c',
            '8192',
            '-ngl',
            '0',
            '--temp',
            '0',
            '--no-context-shift',
            '--no-display-prompt',
            '--no-conversation',
            '--simple-io',
          ],
          { timeout: 600000, maxBuffer: 2_000_000 },
        );
        await writeFile(`.local-ai/evaluations/fixture-${i + 1}.json`, stdout);
        const result = parseExtraction(stdout, source);
        console.info(
          `Native fixture ${i + 1}: ${((performance.now() - start) / 1000).toFixed(1)} seconds, ${result.actions.length} actions`,
        );
        if (i === 0) {
          expect.soft(result.actions).toHaveLength(1);
          expect.soft(result.actions[0].time).toBe('09:00');
          expect.soft(new Date(result.actions[0].reminders[0].datetime).getHours()).toBe(8);
          expect
            .soft(result.actions[0].requirements.join(' ').toLowerCase())
            .toContain('calculator');
        }
        if (i === 1) {
          expect.soft(result.actions[0].arrivalTime).toBe('13:30');
          expect.soft(result.actions[0].time || '').toBe('');
          expect.soft(result.actions[0].location?.toLowerCase()).toContain('campus');
          expect.soft(result.actions[0].requirements.join(' ')).toContain('black pants');
        }
        if (i === 2) {
          expect.soft(result.actions).toHaveLength(2);
          expect.soft(result.actions.find((a) => a.type === 'deadline')?.time).toBe('17:00');
          expect.soft(result.actions.find((a) => a.type === 'deadline')?.date).toBe('2026-10-16');
          expect.soft(result.actions.find((a) => a.type === 'event')?.time).toBe('14:00');
        }
        if (i === 4) {
          expect.soft(result.actions).toHaveLength(1);
          expect.soft(result.actions[0]?.time).toBe('14:00');
          expect
            .soft(JSON.stringify(result.actions[0]?.requirements).toLowerCase())
            .toContain('questionnaire');
        }
        if (i === 5) {
          expect.soft(result.actions).toHaveLength(1);
          expect.soft(result.actions[0]?.type).toBe('task');
          expect.soft(result.actions[0]?.date).toBe('2026-10-12');
          expect.soft(JSON.stringify(result.actions[0]).toLowerCase()).toContain('calculator');
        }
        if (i === 3) {
          expect.soft(result.actions).toHaveLength(0);
          expect.soft(result.ambiguities.length).toBeGreaterThan(0);
        }
      }
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
  2400000,
);
