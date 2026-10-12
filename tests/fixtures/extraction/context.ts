import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  unitsFromOcr,
  unitsFromText,
  unitsFromTranscript,
} from '../../../src/services/extraction/prompts/build-prompt';
import type { ValidationContext } from '../../../src/services/extraction/validation/validate-extraction';
import { ocrDocumentSchema, type OcrDocument } from '../../../src/services/ocr/types';
import type { TranscriptDocument } from '../../../src/services/voice/types';
import type { ExtractionCase } from './cases';

export const TIMEZONE = 'Asia/Manila';

/** Real Tesseract output recorded from the rendered fixture (see ocr.rs `ocr_fixtures`). */
export function recordedOcr(id: string): OcrDocument {
  const file = path.resolve(__dirname, '../screenshots/ocr', `${id}.json`);
  return ocrDocumentSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

export function transcriptFor(text: string): TranscriptDocument {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let at = 0;
  const segments = sentences.map((s, i) => {
    const start = at;
    at += 3000;
    return { id: `s${i + 1}`, startMs: start, endMs: at, text: s };
  });
  return { fullText: text, segments, durationMs: at, language: 'en', model: 'whisper-small' };
}

/** The same context LocalAIExtractionService builds for this input. */
export function contextForCase(testCase: ExtractionCase): ValidationContext {
  const base = {
    now: new Date(testCase.now),
    timezone: TIMEZONE,
    capturedAt: testCase.capturedAt ?? null,
    recordingDate: testCase.recordingDate ?? null,
    defaultReminders: ['night' as const, 'hour' as const, 'quarter' as const],
  };
  if (testCase.kind === 'screenshot') {
    const ocr = recordedOcr(testCase.id);
    return {
      ...base,
      kind: 'screenshot',
      units: unitsFromOcr(ocr),
      source: { type: 'image', fileName: `${testCase.id}.png`, ocr, timezone: TIMEZONE },
    };
  }
  if (testCase.kind === 'voice') {
    const transcript = transcriptFor(testCase.text!);
    return {
      ...base,
      kind: 'voice',
      units: unitsFromTranscript(transcript),
      source: {
        type: 'voice',
        transcript,
        recordingDate: testCase.recordingDate,
        timezone: TIMEZONE,
      },
    };
  }
  return {
    ...base,
    kind: 'text',
    units: unitsFromText(testCase.text!),
    source: {
      type: 'text',
      text: testCase.text,
      capturedAt: testCase.capturedAt ? new Date(testCase.capturedAt).toISOString() : undefined,
      timezone: TIMEZONE,
    },
  };
}
