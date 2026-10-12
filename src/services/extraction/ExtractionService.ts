import type { ExtractedAction, ExtractionAmbiguity } from '../../types/action';
import type { OcrDocument } from '../ocr/types';

/** Source metadata (persisted with results) plus, for screenshots, the image itself. */
export type ExtractionInput = ExtractedAction['source'] & {
  /** Screenshot bytes. Used for local OCR only and never stored. */
  image?: Blob;
};
export interface ExtractionOptions {
  signal: AbortSignal;
  /** Index into extractionSteps. */
  onProgress: (step: number) => void;
}
export interface ExtractionAttempt {
  rawOutput: string;
  elapsedMs: number;
  truncated: boolean;
  error?: string;
}
/** Developer diagnostics. Never shown in the main UI; never persisted. */
export interface ExtractionDiagnostics {
  promptVersion: number;
  ocr?: OcrDocument;
  attempts: ExtractionAttempt[];
  issues: string[];
}
export interface ExtractionBundle {
  actions: ExtractedAction[];
  ambiguities: ExtractionAmbiguity[];
  diagnostics?: ExtractionDiagnostics;
}
export interface ExtractionService {
  readonly mode: 'mock' | 'local';
  extract(input: ExtractionInput, options: ExtractionOptions): Promise<ExtractionBundle>;
}
/** Real processing stages, shared by local and demo extraction. */
export const extractionSteps = [
  'Preparing image…',
  'Reading text locally…',
  'Understanding details locally…',
  'Checking extracted information…',
];
