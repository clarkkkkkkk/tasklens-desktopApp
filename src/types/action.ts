import { z } from 'zod';
import { transcriptSchema } from '../services/voice/types';
import { ocrDocumentSchema } from '../services/ocr/types';

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine((value) => {
    const date = new Date(`${value}T12:00:00`);
    return (
      !Number.isNaN(date.getTime()) &&
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` ===
        value
    );
  }, 'Use a real calendar date');
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid time');
const optionalDate = z.union([dateSchema, z.literal('')]).optional();
const optionalTime = z.union([timeSchema, z.literal('')]).optional();
export const confidenceSchema = z.enum(['confirmed', 'inferred', 'needs_review']);
export const reminderSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  datetime: z.string().datetime({ offset: true }),
  enabled: z.boolean(),
  offsetMinutes: z.number().optional(),
});
/** Fields that can cite source evidence (OCR regions or transcript segments). */
export const evidenceFields = [
  'title',
  'date',
  'time',
  'endTime',
  'arrivalTime',
  'location',
  'requirements',
  'notes',
  'reminders',
] as const;
export type EvidenceField = (typeof evidenceFields)[number];
const ambiguityObject = z.object({
  id: z.string().min(1).max(100),
  field: z.string().min(1).max(40),
  question: z.string().min(1).max(2000),
  options: z.array(z.string().max(500)).max(8).default([]),
  /** Source unit IDs (OCR regions `r*`, transcript segments `s*`, text lines `t*`). */
  segmentIds: z.array(z.string().max(40)).max(50).default([]),
});
/** Structured open question. Legacy plain-string entries are upgraded on read. */
export const ambiguitySchema = z.union([
  ambiguityObject,
  z
    .string()
    .max(2000)
    .transform((question, ctx) => ({
      id: `legacy-${ctx.path.join('-')}`,
      field: 'general',
      question,
      options: [],
      segmentIds: [],
    })),
]);
export type ExtractionAmbiguity = z.infer<typeof ambiguityObject>;
export const actionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['task', 'event', 'deadline']),
    title: z
      .string()
      .trim()
      .min(1, 'Give this item a title')
      .max(180, 'Keep the title under 180 characters'),
    date: optionalDate,
    time: optionalTime,
    endTime: optionalTime,
    arrivalTime: optionalTime,
    location: z.string().max(500).optional(),
    requirements: z.array(z.string().max(1000)).max(100),
    notes: z.array(z.string().max(5000)).max(100),
    confidence: z.object({
      overall: confidenceSchema,
      title: confidenceSchema.optional(),
      date: confidenceSchema.optional(),
      time: confidenceSchema.optional(),
      endTime: confidenceSchema.optional(),
      arrivalTime: confidenceSchema.optional(),
      location: confidenceSchema.optional(),
      requirements: confidenceSchema.optional(),
    }),
    reminders: z.array(reminderSchema).max(20),
    source: z.object({
      type: z.enum(['image', 'text', 'voice']),
      text: z.string().max(100000).optional(),
      transcript: transcriptSchema.optional(),
      /** OCR regions with bounding boxes, retained for Source Trace. */
      ocr: ocrDocumentSchema.optional(),
      capturedAt: z.string().datetime().optional(),
      recordingDate: dateSchema.optional(),
      timezone: z.string().max(100).optional(),
      extractionMode: z.enum(['mock', 'local']).optional(),
      fileName: z.string().optional(),
      previewUrl: z
        .string()
        .max(400000)
        .refine((v) => /^data:image\/(png|jpeg|webp);base64,/.test(v), 'Invalid source preview')
        .optional(),
    }),
    evidence: z
      .array(
        z.object({
          field: z.enum(evidenceFields),
          segmentIds: z.array(z.string()).min(1).max(100),
          quote: z.string().min(1).max(10000),
          value: z.string().max(10000),
        }),
      )
      .max(100)
      .optional(),
    ambiguities: z.array(ambiguitySchema).max(30).optional(),
    status: z.enum(['needs_review', 'confirmed', 'completed']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((item, ctx) => {
    // Drafts may keep a reviewed time while the date is still an open question
    // (e.g. a confirmed 1:30 PM arrival with an ambiguous "tomorrow").
    if (
      !item.date &&
      (item.time || item.arrivalTime || item.endTime) &&
      item.status !== 'needs_review'
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date'],
        message: 'Add a date before setting a time',
      });
    if (!item.date && item.reminders.some((r) => r.enabled))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date'],
        message: 'A date is required for reminders',
      });
  });
export type ConfidenceLevel = z.infer<typeof confidenceSchema>;
export type ActionType = z.infer<typeof actionSchema>['type'];
export type Reminder = z.infer<typeof reminderSchema>;
export type ExtractedAction = z.infer<typeof actionSchema>;
/** Optional developer controls; sensible defaults work automatically. */
export const localAISettingsSchema = z.object({
  developerMode: z.boolean().default(false),
  contextSize: z.number().int().min(2048).max(32768).default(8192),
  threads: z.number().int().min(1).max(64).nullable().default(null),
});
export const settingsSchema = z.object({
  onboardingCompletedVersion: z.number().int().nonnegative().default(0),
  localAI: localAISettingsSchema.default({}),
  remindersEnabled: z.boolean(),
  defaultReminders: z.array(z.enum(['night', 'hour', 'quarter'])),
  theme: z.literal('light'),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  onboardingCompletedVersion: 0,
  localAI: { developerMode: false, contextSize: 8192, threads: null },
  remindersEnabled: true,
  defaultReminders: ['night', 'hour', 'quarter'],
  theme: 'light',
};
/** Stored envelope version. Bump it only together with a step in repositories/migrations.ts. */
export const SNAPSHOT_VERSION = 1;
export const snapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  actions: z.array(actionSchema),
  settings: settingsSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type View =
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'calendar'
  | 'all'
  | 'completed'
  | 'review'
  | 'settings';
