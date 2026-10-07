import type { ExtractedAction } from '../../types/action';
export type ExtractionInput = ExtractedAction['source'];
export interface ExtractionOptions {
  signal: AbortSignal;
  onProgress: (step: number) => void;
}
export interface ExtractionService {
  readonly mode: 'mock' | 'local';
  extract(input: ExtractionInput, options: ExtractionOptions): Promise<ExtractedAction[]>;
}
export const extractionSteps = [
  'Reading screenshot…',
  'Finding important information…',
  'Building structured result…',
];
