import type { AICapability } from './types';

export type TaskInputKind = 'screenshot' | 'voice' | 'text';
export type VisualSignal = 'none' | 'some' | 'strong';
export type Complexity = 'simple' | 'standard' | 'complex';

export interface PreferredCapability {
  capability: AICapability;
  /** 0–1: how much this job benefits from the capability. */
  weight: number;
  reason: string;
}

/** What one job needs from a model. Derived from the source, never from a model name. */
export interface TaskRequirements {
  input: TaskInputKind;
  required: AICapability[];
  preferred: PreferredCapability[];
  /** Stages that always run on this device before the model (OCR, speech-to-text). */
  localStages: string[];
  estimatedInputTokens: number;
  complexity: Complexity;
  visualSignal: VisualSignal;
  /** A screenshot exists that an image-capable model could look at. */
  hasImage: boolean;
  /** Non-English (Cebuano/Tagalog) wording detected. */
  multilingual: boolean;
  /** Short label for UI, e.g. "screenshot extraction". */
  label: string;
}

export interface TaskSignals {
  kind: TaskInputKind;
  /** Source text units (OCR lines, transcript segments, typed lines). Absent before OCR. */
  texts?: string[];
  /** OCR line confidences (0–1), screenshots only. */
  ocrConfidences?: number[];
  /** Image size in pixels, screenshots only. */
  imagePixels?: number;
  /** Developer-chosen variant for the settings preview. */
  assumeLong?: boolean;
}

/** Tokens of fixed system prompt and schema sent with every request. */
const FIXED_PROMPT_TOKENS = 2200;
/** Output budget reserved by the extraction pipeline. */
export const OUTPUT_TOKENS = 2048;

const FILIPINO_WORDS =
  /\b(ang|mga|sa|ng|nga|ug|kay|bukas|ugma|para|naa|wala|dili|hindi|po|lang|kami|kita|ninyo|inyo|og|unta|karon|ngayon|mag|magdala|dala|ipasa|pasa|klase|walay|adlaw|araw)\b/gi;

/** Rough token count for mixed English/Filipino text. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.2);

export function deriveRequirements(signals: TaskSignals): TaskRequirements {
  const texts = signals.texts ?? [];
  const joined = texts.join('\n');
  const words = joined.split(/\s+/).filter(Boolean).length;
  const filipino = (joined.match(FILIPINO_WORDS) ?? []).length;
  const multilingual = words > 0 && filipino / words > 0.06;
  const sourceTokens = signals.texts
    ? estimateTokens(joined)
    : signals.kind === 'screenshot'
      ? 600
      : 300;
  const estimatedInputTokens = FIXED_PROMPT_TOKENS + (signals.assumeLong ? 9000 : sourceTokens);

  const hasImage = signals.kind === 'screenshot';
  let visualSignal: VisualSignal = hasImage ? 'some' : 'none';
  if (hasImage && signals.ocrConfidences?.length) {
    const confidences = signals.ocrConfidences;
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const low = confidences.filter((c) => c < 0.6).length / confidences.length;
    // Sparse text on a large image usually means posters, pictorials or layouts that carry
    // meaning visually; text-only announcements measure ~300–450 characters per megapixel.
    const megapixels = (signals.imagePixels ?? 0) / 1e6;
    const sparse = megapixels > 0.3 && joined.length / megapixels < 100;
    visualSignal = mean < 0.72 || low > 0.25 || sparse ? 'strong' : 'some';
  }

  const long = estimatedInputTokens - FIXED_PROMPT_TOKENS > 3000;
  const complexity: Complexity =
    long || texts.length > 40 || visualSignal === 'strong'
      ? 'complex'
      : !hasImage && texts.length > 0 && texts.length <= 4 && joined.length < 400
        ? 'simple'
        : 'standard';

  const preferred: PreferredCapability[] = [];
  if (hasImage)
    preferred.push({
      capability: 'image-understanding',
      weight: visualSignal === 'strong' ? 1 : 0.5,
      reason:
        visualSignal === 'strong'
          ? 'The screenshot carries meaning visually (sparse or hard-to-read text)'
          : 'The task contains a screenshot',
    });
  if (multilingual)
    preferred.push({
      capability: 'multilingual',
      weight: 0.6,
      reason: 'The source mixes English with Cebuano or Tagalog',
    });
  if (long)
    preferred.push({
      capability: 'long-context',
      weight: estimatedInputTokens > 6000 ? 1 : 0.5,
      reason: 'The source is long',
    });

  const localStages =
    signals.kind === 'screenshot'
      ? ['Text recognition (Tesseract)']
      : signals.kind === 'voice'
        ? ['Speech-to-text (Whisper)']
        : [];
  const label = signals.assumeLong
    ? 'long announcement extraction'
    : {
        screenshot: 'screenshot extraction',
        voice: 'voice note extraction',
        text: 'text extraction',
      }[signals.kind];
  return {
    input: signals.kind,
    required: ['structured-extraction', 'json-output'],
    preferred,
    localStages,
    estimatedInputTokens,
    complexity,
    visualSignal,
    hasImage,
    multilingual,
    label,
  };
}
