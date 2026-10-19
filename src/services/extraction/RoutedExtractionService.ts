import type { ExtractedAction, Settings } from '../../types/action';
import { ConsentBroker } from '../ai/consent';
import { deriveRequirements, type TaskInputKind, type TaskRequirements } from '../ai/requirements';
import type { RouteDecision, ScoredCandidate } from '../ai/router';
import { AIProviderError, type AIImage, type AIProvider } from '../ai/types';
import { LocalAIError, toLocalAIError } from '../localai/native';
import type { OcrDocument, OcrService } from '../ocr/types';
import type {
  ExtractionAttempt,
  ExtractionBundle,
  ExtractionDiagnostics,
  ExtractionInput,
  ExtractionOptions,
  ExtractionService,
} from './ExtractionService';
import {
  buildUserMessage,
  unitsFromOcr,
  unitsFromText,
  unitsFromTranscript,
  type PromptContext,
} from './prompts/build-prompt';
import { TASKLENS_EXTRACTION_PROMPT_VERSION } from './prompts/extraction-prompt-version';
import { buildOutputJsonSchema } from './prompts/extraction-schema';
import { TASKLENS_SYSTEM_PROMPT } from './prompts/tasklens-system-prompt';
import { validateExtraction, type ValidationContext } from './validation/validate-extraction';

const MAX_OUTPUT_TOKENS = 2048;
/** Minimum readable text before the model is worth running. */
const MIN_OCR_CHARACTERS = 8;

/** What the pipeline needs from the router. `AIRouter` implements it. */
export interface ExtractionRouting {
  decide(requirements: TaskRequirements): Promise<RouteDecision>;
  fallbackFor(decision: RouteDecision, failedProviders: string[]): ScoredCandidate | undefined;
  provider(id: string): AIProvider | undefined;
  recordFailure(key: string): void;
  recordSuccess(key: string): void;
}

export interface RoutedExtractionOptions {
  /** Asks before uploads and fallbacks. Without a listening UI every request is declined. */
  consent?: ConsentBroker;
  /** Downscales a screenshot for image-capable models. Only called when policy allows. */
  encodeImage?: (image: Blob) => Promise<AIImage>;
}

const isCancellation = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof LocalAIError && error.code === 'CANCELLED') ||
  (error instanceof AIProviderError && error.kind === 'cancelled');

/** Throws with the OCR and routing context attached, so the UI can show diagnostics. */
const withContext = (
  error: unknown,
  extra: { ocr?: OcrDocument; decision?: RouteDecision; diagnostics?: ExtractionDiagnostics },
) => Object.assign(error instanceof Error ? error : toLocalAIError(error), extra);

/** Source material may go to a cloud provider only under one of these explicit permissions. */
function mayUpload(
  candidate: ScoredCandidate,
  decision: RouteDecision,
  consented: boolean,
): boolean {
  if (candidate.model.privacy !== 'cloud') return true;
  const { mode, manualModel } = decision.policy;
  if (mode === 'local-only') return false;
  return consented || mode === 'automatic' || (mode === 'manual' && manualModel === candidate.key);
}

function noCandidate(decision: RouteDecision): LocalAIError {
  const first = decision.reasons[0]?.text.replace(/^[^:]+: /, '');
  return Object.assign(
    new LocalAIError(
      'NO_AI_AVAILABLE',
      first
        ? `No AI model can run this right now. ${first}`
        : 'No AI model can run this right now.',
    ),
    { decision },
  );
}

/**
 * Screenshot/voice/text → local OCR (screenshots) → router picks the best available model →
 * consent when required → provider → validation (one repair) → review. A failed provider is
 * replaced only after the user accepts the offered fallback.
 */
export class RoutedExtractionService implements ExtractionService {
  readonly mode: 'local' | 'routed' = 'routed';
  private readonly consent: ConsentBroker;

  constructor(
    private readonly ocr: OcrService,
    private readonly routing: ExtractionRouting,
    private readonly settings: () => Pick<Settings, 'defaultReminders'>,
    private readonly options: RoutedExtractionOptions = {},
  ) {
    this.consent = options.consent ?? new ConsentBroker();
  }

  async extract(input: ExtractionInput, { signal, onProgress, onRoute }: ExtractionOptions) {
    const image = input.image;
    const source = { ...input };
    delete source.image;
    signal.throwIfAborted();
    const timezone = source.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const kind: TaskInputKind =
      source.type === 'image'
        ? 'screenshot'
        : source.type === 'voice' && source.transcript
          ? 'voice'
          : 'text';

    // Route on what is known before OCR: fail fast when nothing can run, and warm a local winner
    // while OCR runs. Warm-up failures surface (if at all) when the completion runs.
    const early = await this.routing.decide(
      deriveRequirements({
        kind,
        texts:
          kind === 'text'
            ? unitsFromText(source.text || '').map((u) => u.text)
            : kind === 'voice'
              ? unitsFromTranscript(source.transcript!).map((u) => u.text)
              : undefined,
      }),
    );
    if (!early.selected) throw noCandidate(early);
    if (early.selected.model.privacy === 'local')
      void this.routing
        .provider(early.selected.provider.id)
        ?.prepare?.(early.selected.model.id, TASKLENS_SYSTEM_PROMPT, signal)
        .catch(() => {});

    let ocr: OcrDocument | undefined;
    let context: PromptContext;
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
        throw withContext(
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
    const validationContext: ValidationContext = {
      ...context,
      source: persistedSource,
      defaultReminders: this.settings().defaultReminders,
    };
    const decision = await this.routing.decide(
      deriveRequirements({
        kind,
        texts: context.units.map((u) => u.text),
        ocrConfidences: ocr?.regions.map((r) => r.confidence),
        imagePixels: ocr ? ocr.imageWidth * ocr.imageHeight : undefined,
      }),
    );
    let { candidate, consented } = await this.choose(decision, signal, ocr);
    const failed: string[] = [];
    let fallbackFrom: ScoredCandidate | undefined;
    for (;;) {
      onRoute?.({ decision, candidate, fallbackFrom });
      try {
        if (!mayUpload(candidate, decision, consented))
          throw new LocalAIError(
            'CANCELLED',
            'Nothing was sent: cloud processing needs your permission.',
          );
        const bundle = await this.run(
          candidate,
          decision,
          context,
          validationContext,
          image,
          signal,
          onProgress,
          ocr,
        );
        this.routing.recordSuccess(candidate.key);
        return bundle;
      } catch (error) {
        if (signal.aborted || isCancellation(error)) throw withContext(error, { ocr, decision });
        // Invalid output after the repair attempt is not a provider failure: the user retries.
        if (error instanceof LocalAIError && error.code === 'VALIDATION_FAILED') throw error;
        this.routing.recordFailure(candidate.key);
        failed.push(candidate.provider.id);
        const alternative = this.routing.fallbackFor(decision, failed);
        const failure =
          error instanceof Error
            ? error.message.replace(/^[A-Z_]+: /, '')
            : `${candidate.provider.name} failed.`;
        if (!alternative)
          throw withContext(
            error instanceof AIProviderError
              ? new LocalAIError(
                  'MODEL_FAILED',
                  `${candidate.model.name} could not complete this: ${failure}`,
                )
              : toLocalAIError(error),
            { ocr, decision },
          );
        const answer = await this.consent.request(
          { kind: 'fallback', decision, failed: candidate, error: failure, alternative },
          signal,
        );
        if (answer !== 'approve')
          throw withContext(
            new LocalAIError(
              'MODEL_FAILED',
              `${candidate.model.name} could not complete this: ${failure}`,
            ),
            { ocr, decision },
          );
        fallbackFrom = candidate;
        candidate = alternative;
        // Accepting a fallback that uploads is explicit permission for that provider.
        consented = alternative.model.privacy === 'cloud';
        onProgress(2);
      }
    }
  }

  private async choose(decision: RouteDecision, signal: AbortSignal, ocr?: OcrDocument) {
    if (!decision.selected) throw withContext(noCandidate(decision), { ocr });
    if (decision.status !== 'needs-consent')
      return { candidate: decision.selected, consented: false };
    const answer = await this.consent.request(
      {
        kind: 'cloud',
        decision,
        candidate: decision.selected,
        alternative: decision.localAlternative,
      },
      signal,
    );
    if (answer === 'approve') return { candidate: decision.selected, consented: true };
    if (answer === 'alternative' && decision.localAlternative)
      return { candidate: decision.localAlternative, consented: false };
    throw withContext(
      new LocalAIError('CANCELLED', 'Nothing was sent. Processing was cancelled.'),
      {
        ocr,
        decision,
      },
    );
  }

  private async run(
    candidate: ScoredCandidate,
    decision: RouteDecision,
    context: PromptContext,
    validationContext: ValidationContext,
    image: Blob | undefined,
    signal: AbortSignal,
    onProgress: (step: number) => void,
    ocr: OcrDocument | undefined,
  ): Promise<ExtractionBundle> {
    const provider = this.routing.provider(candidate.provider.id);
    if (!provider)
      throw new AIProviderError(
        'unavailable',
        `${candidate.provider.name} is not available.`,
        candidate.provider.id,
      );
    const images =
      candidate.dataFlow.attachImage && image && this.options.encodeImage
        ? [await this.options.encodeImage(image)]
        : undefined;
    signal.throwIfAborted();
    const user = buildUserMessage(context);
    const schema = buildOutputJsonSchema(context.units.map((u) => u.id));
    const route = {
      provider: candidate.provider.name,
      model: candidate.model.name,
      score: Math.round(candidate.total),
      reasons:
        decision.selected === candidate
          ? decision.reasons.map((r) => r.text)
          : ['Fallback chosen by you'],
    };
    const extractionMode: ExtractedAction['source']['extractionMode'] =
      candidate.provider.kind === 'cloud'
        ? 'cloud'
        : candidate.provider.kind === 'mock'
          ? 'mock'
          : 'local';
    const attempts: ExtractionAttempt[] = [];
    let repair: string | undefined;
    // One controlled retry: the second attempt is told what was wrong with the first.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await provider.generate({
        jobId: crypto.randomUUID(),
        modelId: candidate.model.id,
        system: TASKLENS_SYSTEM_PROMPT,
        user,
        repair,
        schema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        images,
        signal,
      });
      signal.throwIfAborted();
      onProgress(3);
      const result = validateExtraction(response.content, validationContext);
      attempts.push({
        rawOutput: response.content,
        elapsedMs: response.elapsedMs,
        truncated: response.truncated,
        ...(result.ok ? {} : { error: `${result.stage}: ${result.error}` }),
      });
      if (result.ok)
        return {
          actions: result.actions.map((action) => ({
            ...action,
            source: {
              ...action.source,
              extractionMode,
              extractedBy: {
                provider: candidate.provider.name,
                model: candidate.model.name,
                kind: candidate.provider.kind,
              },
            },
          })),
          ambiguities: result.ambiguities,
          diagnostics: {
            promptVersion: TASKLENS_EXTRACTION_PROMPT_VERSION,
            ocr,
            attempts,
            issues: result.issues,
            route,
          },
        };
      repair = response.truncated
        ? 'Your previous answer was cut off. Return fewer, shorter items and keep notes brief.'
        : `Your previous answer was invalid (${result.error}). Return only a valid JSON object for the schema.`;
      onProgress(2);
    }
    throw withContext(
      new LocalAIError(
        'VALIDATION_FAILED',
        'The extracted details could not be validated, so nothing was saved. Try again.',
      ),
      {
        ocr,
        decision,
        diagnostics: {
          promptVersion: TASKLENS_EXTRACTION_PROMPT_VERSION,
          ocr,
          attempts,
          issues: [],
          route,
        },
      },
    );
  }
}
