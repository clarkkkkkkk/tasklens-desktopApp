import type { AIProcessingStatus } from '../ai/types';
import type { ExtractedAction, ExtractionAmbiguity } from '../../types/action';
import type { RouteDecision, ScoredCandidate } from '../ai/router';
import type { OcrDocument } from '../ocr/types';

/** Source metadata (persisted with results) plus, for screenshots, the image itself. */
export type ExtractionInput = ExtractedAction['source'] & {
  /** Screenshot bytes for local OCR/vision only; never sent to a cloud provider or stored. */
  image?: Blob;
};
/** Which AI is about to run, and why. Sent again when a fallback replaces a failed provider. */
export interface RouteNotice {
  decision: RouteDecision;
  candidate: ScoredCandidate;
  fallbackFrom?: ScoredCandidate;
}
export interface OcrCheckpoint {
  image: Blob;
  document: OcrDocument;
}
export interface ExtractionOptions {
  traceId?: string;
  onStatus?: (status: AIProcessingStatus) => void;
  ocrCheckpoint?: OcrCheckpoint;
  onOcr?: (checkpoint: OcrCheckpoint) => void;
  signal: AbortSignal;
  /** Index into extractionSteps. */
  onProgress: (step: number) => void;
  onRoute?: (route: RouteNotice) => void;
}
export interface ExtractionAttempt {
  rawOutput: string;
  elapsedMs: number;
  truncated: boolean;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}
/** Developer diagnostics. Never shown in the main UI; never persisted. */
export interface ExtractionDiagnostics {
  promptVersion: number;
  totalElapsedMs?: number;
  ocr?: OcrDocument;
  attempts: ExtractionAttempt[];
  issues: string[];
  /** Routing summary: the chosen model, its score and the reasons. */
  route?: { provider: string; model: string; score: number; reasons: string[] };
}
export interface ExtractionBundle {
  actions: ExtractedAction[];
  ambiguities: ExtractionAmbiguity[];
  diagnostics?: ExtractionDiagnostics;
}
export interface ExtractionService {
  /** `mock`: the demo fixture. `local`/`routed`: real AI chosen by the router. */
  readonly mode: 'mock' | 'local' | 'routed';
  extract(input: ExtractionInput, options: ExtractionOptions): Promise<ExtractionBundle>;
}
/** Real processing stages, shared by local and demo extraction. */
export const extractionSteps = [
  'Preparing image…',
  'Reading text locally…',
  'Understanding details locally…',
  'Checking extracted information…',
];
