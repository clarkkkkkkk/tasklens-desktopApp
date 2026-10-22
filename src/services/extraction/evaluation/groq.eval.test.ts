/** Opt-in native Groq evaluation. Never reads or transmits an API key from JavaScript. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { extractionCases } from '../../../../tests/fixtures/extraction/cases';
import { contextForCase } from '../../../../tests/fixtures/extraction/context';
import { scoreCase, type Check } from '../../../../tests/fixtures/extraction/score';
import { groqSchema } from '../../ai/providers/GroqProvider';
import type { AIResponse } from '../../ai/types';
import { buildUserMessage, appendRepair } from '../prompts/build-prompt';
import { buildOutputJsonSchema } from '../prompts/extraction-schema';
import { TASKLENS_SYSTEM_PROMPT } from '../prompts/tasklens-system-prompt';
import { TASKLENS_EXTRACTION_PROMPT_VERSION } from '../prompts/extraction-prompt-version';
import { validateExtraction } from '../validation/validate-extraction';
import { coverageIssue, repairInstruction } from '../validation/coverage';

type Row = {
  id: string;
  language: string;
  checks: Check[];
  cloudResponseMs: number[];
  pipelineMs: number;
  attempts: number;
  inputTokens: number[];
  outputTokens: number[];
  completed?: boolean;
  error?: string;
};
it.skipIf(process.env.TASKLENS_GROQ_EVAL !== '1')(
  'evaluates synthetic multilingual cases through native Groq and the existing validator',
  () => {
    // The key is inherited by cargo/Rust, never inspected here or written to reports.
    const outputDir = path.resolve('docs/evaluation');
    mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'groq-eval.json');
    const signature = createHash('sha256')
      .update(
        TASKLENS_SYSTEM_PROMPT +
          JSON.stringify(extractionCases, (_k, v: unknown) => (v instanceof RegExp ? v.source : v)),
      )
      .digest('hex');
    const previous = existsSync(outputPath)
      ? (JSON.parse(readFileSync(outputPath, 'utf8')) as { signature: string; rows: Row[] })
      : undefined;
    const rows: Row[] = previous?.signature === signature ? [...previous.rows] : [];
    const usage = path.resolve(
      process.env.TASKLENS_GROQ_EVAL_USAGE ??
        path.join(os.homedir(), '.local', 'share', 'tasklens-groq-evaluation', 'groq-usage.json'),
    );
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'tasklens-groq-evaluation-'));
    let stopReason: string | undefined;
    try {
      for (const testCase of extractionCases) {
        if (rows.some((row) => row.id === testCase.id && row.completed)) continue;
        const context = contextForCase(testCase);
        const started = performance.now();
        const row: Row = {
          id: testCase.id,
          language: testCase.languages,
          checks: [],
          cloudResponseMs: [],
          pipelineMs: 0,
          attempts: 0,
          inputTokens: [],
          outputTokens: [],
        };
        let repair: string | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          const inputPath = path.join(temporary, 'request.json');
          const resultPath = path.join(temporary, 'response.json');
          rmSync(resultPath, { force: true });
          writeFileSync(
            inputPath,
            JSON.stringify({
              system: TASKLENS_SYSTEM_PROMPT,
              user: appendRepair(buildUserMessage(context), repair),
              schema: groqSchema(buildOutputJsonSchema(context.units.map((u) => u.id))),
              maxOutputTokens: 4096,
            }),
          );
          execFileSync(
            'cargo',
            [
              'test',
              '--locked',
              '--manifest-path',
              'src-tauri/Cargo.toml',
              'live_groq_evaluation_request',
              '--',
              '--ignored',
            ],
            {
              env: {
                ...process.env,
                TASKLENS_GROQ_LIVE: '1',
                TASKLENS_GROQ_EVAL_INPUT: inputPath,
                TASKLENS_GROQ_EVAL_OUTPUT: resultPath,
                TASKLENS_GROQ_EVAL_USAGE: usage,
              },
              stdio: ['ignore', 'pipe', 'pipe'],
              timeout: 600_000,
            },
          );
          const response = JSON.parse(readFileSync(resultPath, 'utf8')) as {
            ok: boolean;
            response: AIResponse;
            error: { code: string; message: string };
          };
          if (!response.ok) {
            row.error = response.error.message;
            if (
              ['GROQ_DAILY_LIMIT', 'GROQ_RATE_LIMIT', 'GROQ_INVALID_KEY', 'GROQ_NETWORK'].includes(
                response.error.code,
              )
            )
              stopReason = response.error.message;
            break;
          }
          const generated = response.response;
          row.attempts++;
          row.cloudResponseMs.push(generated.elapsedMs);
          if (generated.inputTokens !== undefined) row.inputTokens.push(generated.inputTokens);
          if (generated.outputTokens !== undefined) row.outputTokens.push(generated.outputTokens);
          let validated = validateExtraction(generated.content, context);
          if (validated.ok) {
            const omitted = coverageIssue(context, validated.actions);
            if (omitted)
              validated = { ok: false, stage: 'actions', error: omitted, issues: validated.issues };
          }
          if (validated.ok) {
            row.error = undefined;
            row.checks = scoreCase(testCase, {
              actions: validated.actions,
              ambiguities: validated.ambiguities,
            });
            break;
          }
          row.error = validated.error;
          if (generated.canRepair === false) break;
          repair = repairInstruction(context, validated.error, generated.truncated);
        }
        row.pipelineMs = performance.now() - started;
        row.completed = !stopReason;
        const old = rows.findIndex((r) => r.id === row.id);
        if (old >= 0) rows[old] = row;
        else rows.push(row);
        writeFileSync(
          outputPath,
          JSON.stringify(
            {
              signature,
              promptVersion: TASKLENS_EXTRACTION_PROMPT_VERSION,
              model: 'openai/gpt-oss-20b',
              recordedOcr: true,
              rows,
              stopReason,
            },
            null,
            2,
          ) + '\n',
        );
        if (stopReason) break;
      }
      const report = [
        '# Groq synthetic extraction evaluation',
        '',
        `Prompt version: ${TASKLENS_EXTRACTION_PROMPT_VERSION}. Model: openai/gpt-oss-20b.`,
        '',
        'Cloud response time is measured in native HTTPS code. Pipeline time includes the Rust test bridge, queueing, retries and validation. Screenshot cases replay recorded local OCR; this is not a live capture latency measurement.',
        '',
        '| Case | Languages | Checks | HTTP response ms | Pipeline ms | Attempts |',
        '| --- | --- | --- | --- | --- | --- |',
        ...rows.map(
          (r) =>
            `| ${r.id} | ${r.language} | ${r.checks.filter((c) => c.ok).length}/${r.checks.length} | ${r.cloudResponseMs.join(', ')} | ${Math.round(r.pipelineMs)} | ${r.attempts} |`,
        ),
        '',
        ...(stopReason ? [`Paused: ${stopReason}`] : []),
        '',
        'Compare against reliability-v10-full.md with caution: it uses an earlier prompt and different runtime conditions. Fixture results do not establish general cloud superiority.',
      ];
      writeFileSync(path.join(outputDir, 'groq-eval.md'), report.join('\n') + '\n');
      expect(rows.length).toBeGreaterThan(0);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  },
  7_200_000,
);
