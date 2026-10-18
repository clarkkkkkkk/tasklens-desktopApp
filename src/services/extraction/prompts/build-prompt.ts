import assets from '../../../../src-tauri/resources/models.json';
import type { OcrDocument } from '../../ocr/types';
import type { TranscriptDocument } from '../../voice/types';
import { TASKLENS_EXTRACTION_PROMPT_VERSION } from './extraction-prompt-version';
import { buildOutputJsonSchema } from './extraction-schema';
import { TASKLENS_SYSTEM_PROMPT } from './tasklens-system-prompt';

/** One citable piece of source text: an OCR line, a transcript segment or a typed line. */
export interface SourceUnit {
  id: string;
  text: string;
  lowConfidence?: boolean;
  /** Underlying OCR line IDs when one unit spans a wrapped paragraph. */
  members?: string[];
}

export type SourceKind = 'screenshot' | 'voice' | 'text';

export interface PromptContext {
  kind: SourceKind;
  units: SourceUnit[];
  /** The user's current local time. Never used as the sending date of a message. */
  now: Date;
  timezone: string;
  /**
   * When the source was captured. For screenshots this is only the image file time and not
   * necessarily when a message was sent; for voice and text, relative dates refer to it.
   */
  capturedAt?: string | null;
  recordingDate?: string | null;
}

const LOW_OCR_CONFIDENCE = 0.6;

const LABEL_LINE = /^[\p{L}][\p{L}\s]{0,25}:(\s|$)/u;
const LIST_LINE = /^\s*([-•*–]|\d{1,2}[.)])\s/;
const TIME_IN_LINE = /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*[ap]\.?m\b/i;
const DATE_IN_LINE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\//i;
/** Chat timestamps such as "Mon, Oct 5, 2026 at 9:14 AM" stand alone as their own unit. */
const isTimestamp = (text: string) =>
  DATE_IN_LINE.test(text) && TIME_IN_LINE.test(text) && text.split(/\s+/).length <= 8;

type Region = OcrDocument['regions'][number];
/**
 * Lines wrapped from one statement (a chat bubble, a sentence) belong together when they
 * share a left edge, sit at line spacing and the earlier line runs nearly full width.
 * Labels ("Venue:"), list items and timestamps never merge.
 */
function continues(previous: Region, line: Region): boolean {
  const height = Math.max(previous.box.height, line.box.height);
  const gap = line.box.y - (previous.box.y + previous.box.height);
  return (
    gap >= -height / 2 &&
    gap <= height * 0.65 &&
    Math.abs(line.box.x - previous.box.x) <= height / 2 &&
    previous.box.width >= 0.6 * Math.max(previous.box.width, line.box.width) &&
    !previous.text.trim().endsWith(':') &&
    !LABEL_LINE.test(line.text) &&
    !LIST_LINE.test(line.text) &&
    !isTimestamp(previous.text) &&
    !isTimestamp(line.text)
  );
}

/**
 * Groups wrapped OCR lines into statements so the model reads whole sentences. A unit takes
 * its first line's ID and keeps every line as a member, so Source Trace still highlights
 * exact line boxes.
 */
export function unitsFromOcr(doc: OcrDocument): SourceUnit[] {
  const units: (SourceUnit & { last: Region; minConfidence: number })[] = [];
  for (const region of doc.regions) {
    const open = units[units.length - 1];
    if (open && continues(open.last, region)) {
      open.text = open.text.endsWith('-') ? open.text + region.text : `${open.text} ${region.text}`;
      open.members!.push(region.id);
      open.last = region;
      open.minConfidence = Math.min(open.minConfidence, region.confidence);
    } else
      units.push({
        id: region.id,
        text: region.text,
        members: [region.id],
        last: region,
        minConfidence: region.confidence,
      });
  }
  return units.map(({ id, text, members, minConfidence }) => ({
    id,
    text,
    members,
    lowConfidence: minConfidence < LOW_OCR_CONFIDENCE,
  }));
}

export function unitsFromTranscript(transcript: TranscriptDocument): SourceUnit[] {
  return transcript.segments.map((s) => ({ id: s.id, text: s.text }));
}

/** Typed text: one unit per sentence, so each statement can be cited separately. */
export function unitsFromText(text: string): SourceUnit[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, i) => ({ id: `t${i + 1}`, text: part }));
}

const weekday = (date: Date, timeZone: string) =>
  date.toLocaleDateString('en-US', { weekday: 'long', timeZone });

export function localStamp(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${weekday(date, timeZone)}, ${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** Strips control characters and chat-template markers so source text stays quoted data. */
export function sanitizeUnitText(text: string): string {
  return text
    .replace(/<\|[^|>]*\|>/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildUserMessage(context: PromptContext): string {
  const tz = context.timezone;
  const lines = ['SOURCE_METADATA'];
  lines.push(
    `Source: ${{ screenshot: 'screenshot (OCR lines)', voice: 'voice note transcript', text: 'typed text' }[context.kind]}`,
  );
  lines.push(`Current local date and time: ${localStamp(context.now, tz)} (${tz})`);
  if (context.kind === 'screenshot') {
    lines.push(
      context.capturedAt
        ? `Image file time: ${localStamp(new Date(context.capturedAt), tz)}. This is only when the image file was saved, not when any message in it was sent.`
        : 'Image file time: not available.',
    );
    lines.push(
      'Message sending dates are known only if they are visible in the screenshot itself.',
    );
  } else if (context.recordingDate) {
    lines.push(`Captured on: ${context.recordingDate}. Relative dates in this source refer to it.`);
  } else if (context.capturedAt) {
    lines.push(
      `Captured at: ${localStamp(new Date(context.capturedAt), tz)}. Relative dates in this source refer to it.`,
    );
  } else {
    lines.push('Capture date: not available.');
  }
  lines.push('', 'SOURCE_UNITS');
  for (const unit of context.units)
    lines.push(
      `[${unit.id}]${unit.lowConfidence ? ' (low OCR confidence)' : ''} ${sanitizeUnitText(unit.text)}`,
    );
  return lines.join('\n');
}

/** Qwen3 non-thinking template. The empty thought block prevents reasoning in JSON output. */
export function qwenChatPrompt(system: string, user: string, repair?: string): string {
  const reminder = repair ? `\n\nPREVIOUS_ATTEMPT_PROBLEM\n${sanitizeUnitText(repair)}` : '';
  if (assets.extraction.promptTemplate !== 'qwen3-non-thinking')
    throw new Error('Unsupported extraction template');
  return `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}${reminder}\n/no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

export interface BuiltPrompt {
  version: number;
  prompt: string;
  schema: ReturnType<typeof buildOutputJsonSchema>;
  /** Conservative token estimate for context budgeting. */
  estimatedTokens: number;
}

export function buildExtractionPrompt(context: PromptContext, repair?: string): BuiltPrompt {
  if (!context.units.length) throw new Error('No source text to extract from.');
  const prompt = qwenChatPrompt(TASKLENS_SYSTEM_PROMPT, buildUserMessage(context), repair);
  return {
    version: TASKLENS_EXTRACTION_PROMPT_VERSION,
    prompt,
    schema: buildOutputJsonSchema(context.units.map((u) => u.id)),
    estimatedTokens: Math.ceil(prompt.length / 3),
  };
}
