import type { Settings } from '../../types/action';
import type { LocalModelManager } from '../localai/LocalModelManager';
import { LocalAIError, toLocalAIError } from '../localai/native';
import type { OcrDocument, OcrService } from '../ocr/types';
import type {
  ExtractionAttempt,
  ExtractionBundle,
  ExtractionInput,
  ExtractionOptions,
  ExtractionService,
} from './ExtractionService';
import {
  EXTRACTION_CACHE_PREFIX,
  buildExtractionPrompt,
  unitsFromOcr,
  unitsFromText,
  unitsFromTranscript,
  type PromptContext,
} from './prompts/build-prompt';
import { TASKLENS_EXTRACTION_PROMPT_VERSION } from './prompts/extraction-prompt-version';
import { validateExtraction } from './validation/validate-extraction';

const MAX_OUTPUT_TOKENS = 2048;
/** Minimum readable text before the model is worth running. */
const MIN_OCR_CHARACTERS = 8;

/**
 * Screenshot/voice/text → local OCR (screenshots) → Qwen3-4B through the
 * TaskLens-managed llama.cpp runtime → validation → review. Everything runs on this device.
 */
export class LocalAIExtractionService implements ExtractionService {
  readonly mode = 'local' as const;

  constructor(
    private readonly ocr: OcrService,
    private readonly model: LocalModelManager,
    private readonly settings: () => Pick<Settings, 'defaultReminders'>,
  ) {}

  async extract(input: ExtractionInput, { signal, onProgress }: ExtractionOptions) {
    const image = input.image;
    const source = { ...input };
    delete source.image;
    signal.throwIfAborted();
    const timezone = source.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let ocr: OcrDocument | undefined;
    let context: PromptContext;
    // Load the model and its cached prompt prefix while OCR runs. The completion waits on the
    // same native gate; failures here surface (if at all) when the completion runs.
    void this.model.prewarm(EXTRACTION_CACHE_PREFIX(), signal).catch(() => {});
    if (source.type === 'image') {
      if (!image) throw new LocalAIError('UNKNOWN', 'The screenshot is no longer available.');
      onProgress(0);
      ocr = await this.ocr.recognize(image, {
        jobId: crypto.randomUUID(),
        signal,
        onStage: (stage) => onProgress(stage === 'preparing_image' ? 0 : 1),
      });
      signal.throwIfAborted();
      const readable = ocr.regions
        .map((r) => r.text)
        .join('')
        .replace(/\W/g, '');
      if (readable.length < MIN_OCR_CHARACTERS)
        throw Object.assign(
          new LocalAIError(
            'OCR_EMPTY',
            'TaskLens could not read enough text in this image. Try a sharper or larger screenshot.',
          ),
          { ocr },
        );
      context = { kind: 'screenshot', units: unitsFromOcr(ocr), now: new Date(), timezone };
      context.capturedAt = source.capturedAt ?? null;
    } else if (source.type === 'voice' && source.transcript) {
      context = {
        kind: 'voice',
        units: unitsFromTranscript(source.transcript),
        now: new Date(),
        timezone,
        capturedAt: source.capturedAt ?? null,
        recordingDate: source.recordingDate ?? null,
      };
    } else {
      const units = unitsFromText(source.text || '');
      if (
        units
          .map((u) => u.text)
          .join('')
          .trim().length < 3
      )
        throw new LocalAIError('OCR_EMPTY', 'Enter a little more information before extracting.');
      context = {
        kind: 'text',
        units,
        now: new Date(),
        timezone,
        capturedAt: source.capturedAt ?? null,
        recordingDate: source.recordingDate ?? null,
      };
    }

    onProgress(2);
    const persistedSource = { ...source, timezone, ...(ocr ? { ocr } : {}) };
    const validationContext = {
      ...context,
      source: persistedSource,
      defaultReminders: this.settings().defaultReminders,
    };
    const attempts: ExtractionAttempt[] = [];
    let repair: string | undefined;
    // One controlled retry: the second attempt is told what was wrong with the first.
    for (let attempt = 0; attempt < 2; attempt++) {
      const built = buildExtractionPrompt(context, repair);
      let content: string;
      let truncated: boolean;
      let elapsedMs: number;
      try {
        ({ content, truncated, elapsedMs } = await this.model.complete(
          {
            jobId: crypto.randomUUID(),
            prompt: built.prompt,
            schema: built.schema,
            maxTokens: MAX_OUTPUT_TOKENS,
          },
          signal,
        ));
      } catch (error) {
        throw Object.assign(toLocalAIError(error), { ocr });
      }
      signal.throwIfAborted();
      onProgress(3);
      const result = validateExtraction(content, validationContext);
      attempts.push({
        rawOutput: content,
        elapsedMs,
        truncated,
        ...(result.ok ? {} : { error: `${result.stage}: ${result.error}` }),
      });
      if (result.ok) {
        const bundle: ExtractionBundle = {
          actions: result.actions,
          ambiguities: result.ambiguities,
          diagnostics: {
            promptVersion: TASKLENS_EXTRACTION_PROMPT_VERSION,
            ocr,
            attempts,
            issues: result.issues,
          },
        };
        return bundle;
      }
      repair = truncated
        ? 'Your previous answer was cut off. Return fewer, shorter items and keep notes brief.'
        : `Your previous answer was invalid (${result.error}). Return only a valid JSON object for the schema.`;
      onProgress(2);
    }
    throw Object.assign(
      new LocalAIError(
        'VALIDATION_FAILED',
        'The extracted details could not be validated, so nothing was saved. Try again.',
      ),
      {
        ocr,
        diagnostics: {
          promptVersion: TASKLENS_EXTRACTION_PROMPT_VERSION,
          ocr,
          attempts,
          issues: [],
        },
      },
    );
  }
}
