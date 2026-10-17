import {
  actionSchema,
  type ConfidenceLevel,
  type EvidenceField,
  type ExtractedAction,
  type ExtractionAmbiguity,
  type Settings,
} from '../../../types/action';
import { buildReminders } from '../../reminders/ReminderScheduler';
import type { PromptContext, SourceUnit } from '../prompts/build-prompt';
import { localStamp } from '../prompts/build-prompt';
import { rawBundleSchema, type RawBundle, type RawItem } from '../prompts/extraction-schema';
import {
  dateSupport,
  findExplicitDates,
  findTimes,
  isoDate,
  isRelativeExpression,
  relativeMentions,
  resolveRelative,
  timeSupport,
  toMinutes,
} from './temporal';

/*
 * Never trust raw model output. Pipeline:
 *   JSON parse → schema → evidence IDs → date/time → confidence → actionSchema
 * The validator may downgrade confidence; it never upgrades it.
 */

export interface ValidationContext extends PromptContext {
  source: ExtractedAction['source'];
  defaultReminders: Settings['defaultReminders'];
}

export type ValidationResult =
  | {
      ok: true;
      actions: ExtractedAction[];
      ambiguities: ExtractionAmbiguity[];
      /** Corrections the validator made, for diagnostics and evaluation. */
      issues: string[];
    }
  | { ok: false; stage: 'json' | 'schema' | 'actions'; error: string; issues: string[] };

const RANK: Record<ConfidenceLevel, number> = { needs_review: 0, inferred: 1, confirmed: 2 };
const weaker = (a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel =>
  RANK[a] <= RANK[b] ? a : b;

const STOPWORDS = new Set(
  'the and for with from that this ang mga nga kay sa ng na pa ug og si ni para all you your our are will be is at by on in of to'.split(
    ' ',
  ),
);
const tokens = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

/** Share of a value's meaningful words that appear in the cited source text. */
function overlap(value: string, text: string): number {
  const wanted = tokens(value);
  if (!wanted.length) return 0;
  const have = new Set(tokens(text));
  return wanted.filter((w) => have.has(w)).length / wanted.length;
}

/**
 * Share of a title's words found anywhere in the source, allowing inflections
 * ("exam" ~ "examination", "choice" ~ "choices"). Guards against items invented from
 * nothing, such as content copied from the prompt's illustrative examples.
 */
function grounding(title: string, source: string): number {
  const wanted = tokens(title);
  if (!wanted.length) return 0;
  const have = tokens(source);
  const found = (w: string) =>
    have.some(
      (h) => h === w || (w.length >= 4 && h.length >= 4 && (h.startsWith(w) || w.startsWith(h))),
    );
  return wanted.filter(found).length / wanted.length;
}

const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

export function parseModelJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model output.');
  return JSON.parse(raw.slice(start, end + 1));
}

const fieldName = (field: string): EvidenceField | 'item' | 'general' =>
  (
    ({
      end_time: 'endTime',
      arrival_time: 'arrivalTime',
    }) as Record<string, EvidenceField>
  )[field] ?? (field as EvidenceField);

export function validateExtraction(raw: string, context: ValidationContext): ValidationResult {
  const issues: string[] = [];
  let json: unknown;
  try {
    json = parseModelJson(raw);
  } catch (e) {
    return { ok: false, stage: 'json', error: (e as Error).message, issues };
  }
  const parsed = rawBundleSchema.safeParse(json);
  if (!parsed.success)
    return {
      ok: false,
      stage: 'schema',
      error: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
      issues,
    };
  return buildResult(parsed.data, context, issues);
}

function buildResult(
  bundle: RawBundle,
  context: ValidationContext,
  issues: string[],
): ValidationResult {
  const units = new Map<string, SourceUnit>(context.units.map((u) => [u.id, u]));
  const validIds = (ids: string[], where: string) => {
    const kept = [...new Set(ids)].filter((id) => units.has(id));
    if (kept.length !== new Set(ids).size) issues.push(`${where}: removed unknown evidence IDs`);
    return kept;
  };
  const textOf = (ids: string[]) => ids.map((id) => units.get(id)!.text).join(' ');
  /** Evidence is stored as underlying line IDs so Source Trace can highlight each box. */
  const expand = (ids: string[]) => [
    ...new Set(ids.flatMap((id) => units.get(id)?.members ?? [id])),
  ];
  const today = localStamp(context.now, context.timezone).split(' ')[1];
  const now = new Date();
  let ambiguitySeq = 0;
  const ambiguities: (ExtractionAmbiguity & { item: number | null })[] = [];
  const single = bundle.items.length === 1;
  const sameQuestion = (
    a: { item: number | null; field: string },
    item: number | null,
    field: string,
  ) => a.field === field && (a.item === item || (single && (a.item ?? 0) === (item ?? 0)));
  for (const a of bundle.ambiguities) {
    const item = a.item !== null && a.item < bundle.items.length ? a.item : null;
    const field = fieldName(a.field);
    const options = cleanOptions(field, a.options);
    const ids = validIds(a.evidence, 'ambiguity');
    const existing = ambiguities.find((x) => sameQuestion(x, item, field));
    if (existing) {
      existing.options = [...new Set([...existing.options, ...options])].slice(0, 4);
      existing.segmentIds = [...new Set([...existing.segmentIds, ...ids])];
      continue;
    }
    ambiguities.push({
      id: `amb-${++ambiguitySeq}`,
      item,
      field,
      question: a.question,
      options,
      segmentIds: ids,
    });
  }
  /** Validator-raised questions replace a vaguer model question on the same field. */
  const ask = (item: number, field: string, question: string, options: string[], ids: string[]) => {
    const existing = ambiguities.find((a) => sameQuestion(a, item, field));
    if (existing) {
      existing.question = question;
      existing.item = item;
      existing.options = [...new Set([...options, ...existing.options])].slice(0, 4);
      existing.segmentIds = [...new Set([...existing.segmentIds, ...ids])];
      return;
    }
    ambiguities.push({
      id: `amb-${++ambiguitySeq}`,
      item,
      field,
      question,
      options: [...new Set(options)].slice(0, 4),
      segmentIds: ids,
    });
  };

  const sections = repeatedSections(context);
  const sourceText = context.units.map((u) => u.text).join('\n');
  const actions: { action: ExtractedAction; index: number }[] = [];
  bundle.items.forEach((item, index) => {
    const label = `item ${index + 1}`;
    if (grounding(item.title.value, sourceText) < 0.5) {
      issues.push(`${label} dropped: “${item.title.value}” is not grounded in the source`);
      return;
    }
    const confidence: ExtractedAction['confidence'] = { overall: 'needs_review' };
    const evidence: NonNullable<ExtractedAction['evidence']> = [];
    const cite = (field: EvidenceField, ids: string[], value: string) => {
      if (ids.length && value)
        evidence.push({ field, segmentIds: expand(ids), quote: textOf(ids).slice(0, 2000), value });
    };

    // Title: summaries are allowed, but only cited and overlapping titles stay confirmed.
    const titleIds = validIds(item.title.evidence, `${label} title`);
    const title = item.title.value.trim();
    confidence.title = weaker(
      item.title.confidence,
      titleIds.length && overlap(title, textOf(titleIds)) >= 0.5 ? 'confirmed' : 'inferred',
    );
    cite('title', titleIds, title);

    const time = checkTime(
      item.time,
      validIds(item.time.evidence, `${label} time`),
      textOf,
      `${label} time`,
      issues,
      context.units,
    );
    let endTime = checkTime(
      item.end_time,
      validIds(item.end_time.evidence, `${label} end`),
      textOf,
      `${label} end time`,
      issues,
      context.units,
      'end',
    );
    const arrival = checkTime(
      item.arrival_time,
      validIds(item.arrival_time.evidence, `${label} arrival`),
      textOf,
      `${label} arrival time`,
      issues,
      context.units,
    );
    // One statement cannot be both the start and the arrival time: keep whichever the
    // wording supports ("starts at" vs "naa na", "be there by"); default to arrival.
    if (
      time.value &&
      arrival.value === time.value &&
      time.ids.some((id) => arrival.ids.includes(id))
    ) {
      const said = textOf(time.ids);
      if (START_CUES.test(said) && !ARRIVAL_CUES.test(said)) {
        issues.push(`${label}: arrival time duplicated the stated start time; arrival cleared`);
        arrival.value = null;
        arrival.ids = [];
      } else {
        issues.push(`${label}: start time duplicated the arrival time; start cleared`);
        time.value = null;
        time.ids = [];
        time.confidence = 'needs_review';
      }
    }
    if (endTime.value && time.value && toMinutes(endTime.value) <= toMinutes(time.value)) {
      issues.push(`${label}: end time not after start time`);
      endTime = { ...endTime, confidence: 'needs_review' };
    }
    if (time.value) {
      confidence.time = time.confidence;
      cite('time', time.ids, time.value);
    } else if (item.type !== 'task') confidence.time = 'needs_review';
    if (endTime.value) {
      confidence.endTime = endTime.confidence;
      cite('endTime', endTime.ids, endTime.value);
    }
    if (arrival.value) {
      confidence.arrivalTime = arrival.confidence;
      cite('arrivalTime', arrival.ids, arrival.value);
    }

    // The item's own statement: units cited for its title and times.
    const statementIds = [...new Set([...titleIds, ...time.ids, ...arrival.ids, ...endTime.ids])];
    const date = checkDate({
      item,
      index,
      context,
      ids: validIds(item.date.evidence, `${label} date`),
      statementIds,
      textOf,
      today,
      ask,
      issues,
    });
    if (date.value) cite('date', date.ids, date.value);
    if (date.confidence) confidence.date = date.confidence;

    const locationIds = validIds(item.location.evidence, `${label} location`);
    const location = meaningful(item.location.value ?? '')
      ? item.location.value!.trim()
      : undefined;
    if (location) {
      confidence.location = weaker(
        item.location.confidence,
        !locationIds.length
          ? 'needs_review'
          : overlap(location, textOf(locationIds)) >= 0.5
            ? 'confirmed'
            : 'needs_review',
      );
      cite('location', locationIds, location);
    }

    let unsupported = 0,
      partial = 0;
    const requirements = item.requirements
      .filter((r) => meaningful(r.text))
      .map((r, i) => {
        const ids = validIds(r.evidence, `${label} requirement ${i + 1}`);
        if (!ids.length) unsupported++;
        else if (overlap(r.text, textOf(ids)) < 0.34) partial++;
        cite('requirements', ids, r.text);
        return r.text.trim();
      });
    if (requirements.length !== item.requirements.length)
      issues.push(`${label}: removed empty or placeholder requirements`);
    if (requirements.length)
      confidence.requirements = unsupported ? 'needs_review' : partial ? 'inferred' : 'confirmed';
    const notes = item.notes.filter(meaningful).map((n) => n.trim());

    // Visible sections that repeat a heading ("Coverage:" twice) are separate unless the
    // source connects them; an item drawing on several of them needs a human decision.
    const itemText = [title, ...requirements, ...notes].join(' ');
    for (const [heading, occurrences] of sections) {
      const touched = occurrences.filter((lines) =>
        lines.some((line) => overlap(line, itemText) >= 0.5),
      );
      if (touched.length >= 2) {
        issues.push(`${label}: combines ${touched.length} separate “${heading}” sections`);
        ask(
          index,
          'notes',
          `This screenshot has more than one “${heading}” section. Do they all belong to “${title}”?`,
          [],
          [],
        );
      }
    }

    const dateValue = date.value ?? undefined;
    const requested = item.reminders.flatMap((r, i) => {
      if (!dateValue) {
        issues.push(`${label}: reminder at ${r.time} needs a date`);
        return [];
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) return [];
      const at = new Date(`${dateValue}T${r.time}:00`);
      if (Number.isNaN(at.getTime())) return [];
      cite('reminders', validIds(r.evidence, `${label} reminder`), r.time);
      return [
        {
          id: `requested-${i + 1}`,
          label: `Requested reminder · ${r.time}`,
          datetime: at.toISOString(),
          enabled: true,
        },
      ];
    });
    const reminders = [
      ...buildReminders(
        dateValue,
        arrival.value || time.value || undefined,
        context.defaultReminders,
      ),
      ...requested,
    ];

    const levels = Object.entries(confidence)
      .filter(([key]) => key !== 'overall')
      .map(([, v]) => v as ConfidenceLevel);
    const hasQuestion = ambiguities.some((a) => a.item === index || a.item === null);
    confidence.overall =
      hasQuestion || levels.includes('needs_review')
        ? 'needs_review'
        : levels.includes('inferred')
          ? 'inferred'
          : 'confirmed';

    const stamp = now.toISOString();
    // Deadlines are handed in, not attended: one with an arrival time is an event.
    const type = item.type === 'deadline' && arrival.value ? 'event' : item.type;
    if (type !== item.type)
      issues.push(`${label}: deadline with an arrival time treated as an event`);
    const candidate = {
      id: crypto.randomUUID(),
      type,
      title,
      date: dateValue,
      time: time.value ?? undefined,
      endTime: endTime.value ?? undefined,
      arrivalTime: arrival.value ?? undefined,
      location,
      requirements,
      notes,
      confidence,
      reminders,
      source: { ...context.source, extractionMode: 'local' as const },
      evidence: evidence.slice(0, 100),
      ambiguities: [],
      status: 'needs_review' as const,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const checked = actionSchema.safeParse(candidate);
    if (checked.success) actions.push({ action: checked.data, index });
    else
      issues.push(
        `${label} dropped: ${checked.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
  });

  if (bundle.items.length && !actions.length)
    return { ok: false, stage: 'actions', error: 'No extracted item passed validation.', issues };
  for (const a of ambiguities) a.segmentIds = expand(a.segmentIds);
  // A start-time option equal to the item's arrival time would invite exactly the
  // arrival-is-start assumption TaskLens must avoid; offer it only as the arrival time.
  for (const { action, index } of actions)
    for (const a of ambiguities)
      if (
        a.field === 'time' &&
        (a.item === index || (a.item === null && actions.length === 1)) &&
        action.arrivalTime
      ) {
        const kept = a.options.filter((o) => toTimeValue(o) !== action.arrivalTime);
        if (kept.length !== a.options.length)
          issues.push(`item ${index + 1}: start-time option equal to the arrival time removed`);
        a.options = kept;
      }
  const strip = ({ item, ...rest }: (typeof ambiguities)[number]) => (void item, rest);
  for (const { action, index } of actions)
    action.ambiguities = ambiguities.filter((a) => a.item === index || a.item === null).map(strip);
  return {
    ok: true,
    actions: actions.map((a) => a.action),
    ambiguities: ambiguities.map(strip),
    issues,
  };
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
/** "1:30PM" → "13:30"; HH:MM passes through; anything else → null. */
function toTimeValue(option: string): string | null {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(option)) return option;
  const found = findTimes(option).find((t) => t.explicit);
  return found ? hhmm(found.minutes) : null;
}
const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PLACEHOLDER =
  /^(unknown|unsure|not sure|n\/?a|none|null|undefined|not (specified|stated|given|mentioned)|tbd|tba|other)$/i;
const START_CUES = /\b(start|starts|starting|begin|begins|magsugod|magsisimula|sisimulan|sugod)\b/i;
const ARRIVAL_CUES =
  /\b(arrive|arrival|be there|be at|call ?time|naa na|kinahanglan naa|dapat naa|nandoon|nandito|present by)\b/i;

/** Has real content: at least two letters or digits and not a placeholder word. */
function meaningful(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2 && !PLACEHOLDER.test(trimmed);
}

/** Headings that appear more than once ("Coverage:"), each with the lines that follow it. */
function repeatedSections(context: ValidationContext): Map<string, string[][]> {
  const lines = context.source.ocr?.regions.map((r) => r.text) ?? context.units.map((u) => u.text);
  const isHeading = (line: string) => /^[\p{L}][\p{L}\s]{1,40}:$/u.test(line.trim());
  const found = new Map<string, string[][]>();
  lines.forEach((line, i) => {
    if (!isHeading(line)) return;
    const key = line.trim().slice(0, -1).trim();
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && j <= i + 10 && !isHeading(lines[j]); j++)
      body.push(lines[j]);
    found.set(key, [...(found.get(key) ?? []), body]);
  });
  return new Map([...found].filter(([, occurrences]) => occurrences.length > 1));
}

/** Keeps only options that can actually be applied to the field. */
function cleanOptions(field: string, options: string[]): string[] {
  const useful = options.map((o) => o.trim()).filter((o) => o && !PLACEHOLDER.test(o));
  if (field === 'date')
    return useful.filter(
      (o) =>
        /^\d{4}-\d{2}-\d{2}$/.test(o) &&
        !!isoDate(...(o.split('-').map(Number) as [number, number, number])),
    );
  if (field === 'time' || field === 'endTime' || field === 'arrivalTime')
    return useful.filter((o) => VALID_TIME.test(o) || findTimes(o).some((t) => t.explicit));
  return useful;
}

function checkTime(
  field: RawItem['time'],
  ids: string[],
  textOf: (ids: string[]) => string,
  label: string,
  issues: string[],
  units: SourceUnit[],
  rangeEdge: 'start' | 'end' = 'start',
): { value: string | null; ids: string[]; confidence: ConfidenceLevel } {
  let value = field.value && VALID_TIME.test(field.value) ? field.value : null;
  // Convert the time as written ourselves: small models misconvert 12-hour times.
  const written = field.text ? findTimes(field.text) : [];
  const explicitTimes = written.filter((t) => t.explicit);
  // Models may quote the entire range in both fields. Keep its two boundaries distinct.
  const isRange = field.text && /[-–—]|\bto\b/i.test(field.text);
  const explicit = rangeEdge === 'end' && isRange ? explicitTimes.at(-1) : explicitTimes[0];
  if (explicit) {
    const converted = hhmm(explicit.minutes);
    if (value !== converted) issues.push(`${label}: “${field.text}” converted to ${converted}`);
    value = converted;
  } else if (written.length && value && !written.some((t) => hhmm(t.minutes) === value)) {
    issues.push(`${label}: ${value} does not match “${field.text}”`);
    value = null;
  }
  if (!value) return { value: null, ids: [], confidence: 'needs_review' };
  // A time with no source support is treated as unsupported, never merely inferred.
  let support = ids.length ? timeSupport(value, textOf(ids)) : 'none';
  if (support !== 'exact') {
    // Recover the citation only when exactly one unit states this time explicitly.
    const time = value;
    const stating = units.filter((u) => timeSupport(time, u.text) === 'exact');
    if (stating.length === 1) {
      issues.push(`${label}: cited ${stating[0].id}, the only unit stating ${value}`);
      ids = [stating[0].id];
      support = 'exact';
    }
  }
  if (support === 'none') {
    issues.push(`${label}: unsupported time ${value} removed`);
    return { value: null, ids: [], confidence: 'needs_review' };
  }
  const allowed: ConfidenceLevel =
    support === 'exact' ? 'confirmed' : support === 'partial' ? 'inferred' : 'needs_review';
  return { value, ids, confidence: weaker(field.confidence, allowed) };
}

interface DateCheck {
  item: RawItem;
  index: number;
  context: ValidationContext;
  /** Valid evidence IDs the model cited for the date. */
  ids: string[];
  /** Units that state the item itself (title and times). */
  statementIds: string[];
  textOf: (ids: string[]) => string;
  today: string;
  ask: (item: number, field: string, question: string, options: string[], ids: string[]) => void;
  issues: string[];
}

/**
 * Dates. Explicit calendar dates must be written in the cited units. Relative dates
 * ("ugma", "karong Friday", "Huwebes") are resolved here, deterministically, from the
 * sending date: a message timestamp visible above the statement, or for voice and typed
 * text the capture date. Screenshot file times never count. Otherwise the user is asked.
 */
function checkDate({
  item,
  index,
  context,
  ids,
  statementIds,
  textOf,
  today,
  ask,
  issues,
}: DateCheck): { value: string | null; ids: string[]; confidence?: ConfidenceLevel } {
  const label = `item ${index + 1}`;
  // A date expression only counts if it is actually written in the source.
  let expression = item.date.expression?.trim() ?? '';
  const written = normalized(context.units.map((u) => u.text).join(' '));
  if (expression && !written.includes(normalized(expression))) {
    issues.push(`${label}: date expression “${expression}” is not in the source; ignored`);
    expression = '';
  }
  const statement = textOf(statementIds.length ? statementIds : ids);
  let value =
    item.date.value && /^\d{4}-\d{2}-\d{2}$/.test(item.date.value) ? item.date.value : null;
  if (value && !isoDate(...(value.split('-').map(Number) as [number, number, number])))
    value = null;

  const statementExplicit = findExplicitDates(statement).length > 0;
  const phrase = statementExplicit
    ? null
    : isRelativeExpression(expression)
      ? expression
      : (relativeMentions(statement)[0] ?? null);

  if (!phrase) {
    if (!value)
      return {
        value: null,
        ids: [],
        confidence: item.type === 'task' ? undefined : 'needs_review',
      };
    const cited = textOf([...new Set([...ids, ...statementIds])]);
    const support = cited ? dateSupport(value, cited) : 'none';
    if (support === 'none') {
      issues.push(`${label}: unsupported date ${value} removed`);
      ask(index, 'date', 'Which date does this activity refer to?', [], statementIds);
      return { value: null, ids: [], confidence: 'needs_review' };
    }
    let allowed: ConfidenceLevel =
      support === 'exact' ? 'confirmed' : support === 'partial' ? 'inferred' : 'needs_review';
    const year = Number(value.slice(0, 4));
    const thisYear = Number(today.slice(0, 4));
    if (year < thisYear - 1 || year > thisYear + 2) allowed = 'needs_review';
    return { value, ids, confidence: weaker(item.date.confidence, allowed) };
  }

  // Find the sending date: a dated unit the model cited outside the statement, else the
  // nearest dated unit above the statement (chat timestamps sit above their messages).
  const position = new Map(context.units.map((u, i) => [u.id, i]));
  const dated = (id: string) => findExplicitDates(context.units[position.get(id)!].text)[0];
  let base: string | null = null;
  let baseIds: string[] = [];
  const toIso = (d: { year?: number; month: number; day: number }) =>
    isoDate(d.year ?? Number(today.slice(0, 4)), d.month, d.day);
  const citedStamp = ids.find((id) => !statementIds.includes(id) && dated(id));
  const first = Math.min(...[...statementIds, ...ids].map((id) => position.get(id)!));
  let stampId = citedStamp;
  if (!stampId && Number.isFinite(first))
    for (let i = first - 1; i >= 0 && !stampId; i--)
      if (dated(context.units[i].id)) stampId = context.units[i].id;
  if (stampId) {
    base = toIso(dated(stampId));
    baseIds = [stampId];
  } else if (context.kind !== 'screenshot') {
    base =
      context.recordingDate ??
      (context.capturedAt
        ? localStamp(new Date(context.capturedAt), context.timezone).split(' ')[1]
        : null);
  }
  const computed = base ? resolveRelative(phrase, base) : null;
  const evidenceIds = [...new Set([...statementIds, ...ids, ...baseIds])];
  if (base && computed) {
    if (value && value !== computed)
      issues.push(`${label}: model date ${value} corrected to ${computed} for “${phrase}”`);
    else if (!value) issues.push(`${label}: resolved “${phrase}” to ${computed}`);
    return {
      value: computed,
      ids: evidenceIds,
      confidence: weaker(item.date.confidence, 'inferred'),
    };
  }
  const options = [value].filter((v): v is string => !!v);
  if (!base && context.kind === 'screenshot') {
    // Offer what the phrase would mean relative to the file time and to today.
    const fileDay = context.capturedAt
      ? localStamp(new Date(context.capturedAt), context.timezone).split(' ')[1]
      : null;
    for (const anchor of [fileDay, today])
      if (anchor) {
        const option = resolveRelative(phrase, anchor);
        if (option) options.unshift(option);
      }
  }
  issues.push(`${label}: relative date “${phrase}” left for review`);
  ask(
    index,
    'date',
    base
      ? `“${phrase}” could mean more than one date. Which date is it?`
      : `The source says “${phrase}”, but when it was originally sent is unclear. Which date did it refer to?`,
    [...new Set(options)],
    evidenceIds,
  );
  return { value: null, ids: evidenceIds, confidence: 'needs_review' };
}
