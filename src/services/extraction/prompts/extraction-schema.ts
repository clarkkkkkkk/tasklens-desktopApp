import { z } from 'zod';

/** Limits shared by the generation grammar and the validator. */
export const LIMITS = {
  items: 8,
  requirements: 15,
  notes: 8,
  reminders: 3,
  ambiguities: 8,
  options: 4,
  evidence: 12,
  title: 120,
  text: 300,
} as const;

const DATE = '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
const TIME = '^([01][0-9]|2[0-3]):[0-5][0-9]$';
export const confidenceValues = ['confirmed', 'inferred', 'needs_review'] as const;
export const dateBases = ['explicit', 'message_timestamp', 'capture_time', 'unknown'] as const;
export const ambiguityFields = [
  'item',
  'title',
  'date',
  'time',
  'end_time',
  'arrival_time',
  'location',
  'requirements',
  'notes',
] as const;

/**
 * JSON Schema handed to llama.cpp, which compiles it into a decoding grammar. Evidence is an
 * enum of the unit IDs actually present, so generation cannot cite an invented unit.
 * Property order is generation order: evidence is written before each value.
 *
 * Compact representation (prompt v7): a date, time, end_time, arrival_time or location the
 * source does not mention is generated as `null` instead of an object of empty values.
 * `expandCompactBundle` restores the full shape before validation, so the validator, review
 * and storage contracts are unchanged. Absent fields were ~20 output tokens each.
 */
export function buildOutputJsonSchema(unitIds: string[]) {
  const evidence = {
    type: 'array',
    items: { type: 'string', enum: unitIds },
    maxItems: LIMITS.evidence,
  };
  const confidence = { type: 'string', enum: confidenceValues };
  const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
  const text = (max: number) => ({ type: 'string', minLength: 1, maxLength: max });
  // `text` is the time exactly as written; the validator converts it deterministically.
  const timeField = nullable({
    type: 'object',
    additionalProperties: false,
    required: ['evidence', 'text', 'value', 'confidence'],
    properties: {
      evidence,
      text: nullable(text(60)),
      value: nullable({ type: 'string', pattern: TIME }),
      confidence,
    },
  });
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'ambiguities'],
    properties: {
      items: {
        type: 'array',
        maxItems: LIMITS.items,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'type',
            'title',
            'date',
            'time',
            'end_time',
            'arrival_time',
            'location',
            'requirements',
            'notes',
            'reminders',
          ],
          properties: {
            type: { type: 'string', enum: ['event', 'deadline', 'task'] },
            title: {
              type: 'object',
              additionalProperties: false,
              required: ['evidence', 'value', 'confidence'],
              properties: { evidence, value: text(LIMITS.title), confidence },
            },
            date: nullable({
              type: 'object',
              additionalProperties: false,
              required: ['evidence', 'expression', 'basis', 'value', 'confidence'],
              properties: {
                evidence,
                expression: nullable(text(LIMITS.text)),
                basis: { type: 'string', enum: dateBases },
                value: nullable({ type: 'string', pattern: DATE }),
                confidence,
              },
            }),
            time: timeField,
            end_time: timeField,
            arrival_time: timeField,
            location: nullable({
              type: 'object',
              additionalProperties: false,
              required: ['evidence', 'value', 'confidence'],
              properties: { evidence, value: nullable(text(LIMITS.text)), confidence },
            }),
            requirements: {
              type: 'array',
              maxItems: LIMITS.requirements,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['evidence', 'text'],
                properties: { evidence, text: text(LIMITS.text) },
              },
            },
            notes: { type: 'array', maxItems: LIMITS.notes, items: text(LIMITS.text) },
            reminders: {
              type: 'array',
              maxItems: LIMITS.reminders,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['evidence', 'time'],
                properties: { evidence, time: { type: 'string', pattern: TIME } },
              },
            },
          },
        },
      },
      ambiguities: {
        type: 'array',
        maxItems: LIMITS.ambiguities,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item', 'field', 'question', 'options', 'evidence'],
          properties: {
            item: nullable({ type: 'integer', minimum: 0, maximum: LIMITS.items - 1 }),
            field: { type: 'string', enum: ambiguityFields },
            question: text(LIMITS.text),
            options: { type: 'array', maxItems: LIMITS.options, items: text(120) },
            evidence,
          },
        },
      },
    },
  };
}

const ABSENT = {
  date: {
    evidence: [],
    expression: null,
    basis: 'unknown',
    value: null,
    confidence: 'needs_review',
  },
  time: { evidence: [], text: null, value: null, confidence: 'needs_review' },
  location: { evidence: [], value: null, confidence: 'needs_review' },
} as const;
const COMPACT_FIELDS = {
  date: ABSENT.date,
  time: ABSENT.time,
  end_time: ABSENT.time,
  arrival_time: ABSENT.time,
  location: ABSENT.location,
} as const;

/**
 * Maps the compact generated representation to the full raw bundle: each `null` date/time/
 * location becomes the empty field the model previously had to spell out. Full objects pass
 * through unchanged, so older raw outputs still validate.
 */
export function expandCompactBundle(json: unknown): unknown {
  if (!json || typeof json !== 'object' || !Array.isArray((json as { items?: unknown }).items))
    return json;
  const bundle = json as { items: unknown[] };
  return {
    ...bundle,
    items: bundle.items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const expanded: Record<string, unknown> = { ...item };
      for (const [field, empty] of Object.entries(COMPACT_FIELDS))
        if (expanded[field] === null) expanded[field] = { ...empty, evidence: [] };
      return expanded;
    }),
  };
}

/* Zod mirror of the generation schema. Evidence IDs are validated separately against the
 * supplied units so that a single invented ID downgrades confidence instead of failing. */
const ids = z.array(z.string().max(20)).max(LIMITS.evidence);
const confidence = z.enum(confidenceValues);
const timeField = z.object({
  evidence: ids,
  text: z.string().max(60).nullable(),
  value: z.string().nullable(),
  confidence,
});
export const rawItemSchema = z.object({
  type: z.enum(['event', 'deadline', 'task']),
  title: z.object({ evidence: ids, value: z.string().trim().min(1).max(LIMITS.title), confidence }),
  date: z.object({
    evidence: ids,
    expression: z.string().max(LIMITS.text).nullable(),
    basis: z.enum(dateBases),
    value: z.string().nullable(),
    confidence,
  }),
  time: timeField,
  end_time: timeField,
  arrival_time: timeField,
  location: z.object({
    evidence: ids,
    value: z.string().max(LIMITS.text).nullable(),
    confidence,
  }),
  requirements: z
    .array(z.object({ evidence: ids, text: z.string().trim().min(1).max(LIMITS.text) }))
    .max(LIMITS.requirements),
  notes: z.array(z.string().trim().min(1).max(LIMITS.text)).max(LIMITS.notes),
  reminders: z.array(z.object({ evidence: ids, time: z.string() })).max(LIMITS.reminders),
});
export const rawAmbiguitySchema = z.object({
  item: z.number().int().min(0).nullable(),
  field: z.enum(ambiguityFields),
  question: z.string().trim().min(1).max(LIMITS.text),
  options: z.array(z.string().trim().min(1).max(120)).max(LIMITS.options),
  evidence: ids,
});
export const rawBundleSchema = z.object({
  items: z.array(rawItemSchema).max(LIMITS.items),
  ambiguities: z.array(rawAmbiguitySchema).max(LIMITS.ambiguities),
});
export type RawItem = z.infer<typeof rawItemSchema>;
export type RawBundle = z.infer<typeof rawBundleSchema>;
