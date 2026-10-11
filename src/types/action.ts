import { z } from 'zod';
import { transcriptSchema } from '../services/voice/types';

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
    arrivalTime: optionalTime,
    location: z.string().max(500).optional(),
    requirements: z.array(z.string().max(1000)).max(100),
    notes: z.array(z.string().max(5000)).max(100),
    confidence: z.object({
      overall: confidenceSchema,
      date: confidenceSchema.optional(),
      time: confidenceSchema.optional(),
      location: confidenceSchema.optional(),
      requirements: confidenceSchema.optional(),
    }),
    reminders: z.array(reminderSchema).max(20),
    source: z.object({
      type: z.enum(['image', 'text', 'voice']),
      text: z.string().max(100000).optional(),
      transcript: transcriptSchema.optional(),
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
          field: z.enum([
            'title',
            'date',
            'time',
            'arrivalTime',
            'location',
            'requirements',
            'notes',
            'reminders',
          ]),
          segmentIds: z.array(z.string()).min(1).max(100),
          quote: z.string().min(1).max(10000),
          value: z.string().max(10000),
        }),
      )
      .max(100)
      .optional(),
    ambiguities: z.array(z.string().max(2000)).max(30).optional(),
    status: z.enum(['needs_review', 'confirmed', 'completed']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((item, ctx) => {
    if (!item.date && (item.time || item.arrivalTime))
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
export const settingsSchema = z.object({
  onboardingCompletedVersion: z.number().int().nonnegative().default(0),
  remindersEnabled: z.boolean(),
  defaultReminders: z.array(z.enum(['night', 'hour', 'quarter'])),
  theme: z.literal('light'),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  onboardingCompletedVersion: 0,
  remindersEnabled: true,
  defaultReminders: ['night', 'hour', 'quarter'],
  theme: 'light',
};
export const snapshotSchema = z.object({
  version: z.literal(1),
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
