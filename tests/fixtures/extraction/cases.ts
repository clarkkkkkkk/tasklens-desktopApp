import type { ExtractionBundle } from '../../../src/services/extraction/ExtractionService';
import type { ExtractedAction } from '../../../src/types/action';

/**
 * Regression and evaluation cases for local extraction. Screenshot cases use the rendered
 * PNGs in ../screenshots (and their recorded OCR output); text cases stand in for typed or
 * transcribed input. The purpose is action extraction, not translation quality.
 */
export interface ExpectedAction {
  /** Matched against the title to pair expected and extracted actions. */
  title: RegExp;
  type?: ExtractedAction['type'];
  /** `null` asserts the field is empty. Omit to leave unchecked. */
  date?: string | null;
  time?: string | null;
  endTime?: string | null;
  arrivalTime?: string | null;
  location?: RegExp | null;
  requirements?: RegExp[];
  confidence?: Partial<
    Record<keyof ExtractedAction['confidence'], ExtractedAction['confidence']['overall']>
  >;
  reminderTimes?: string[];
}
export interface ExtractionCase {
  id: string;
  languages: string;
  kind: 'screenshot' | 'text' | 'voice';
  /** Text for text/voice cases; screenshot cases load fixtures/screenshots/<id>. */
  text?: string;
  /** Evaluation clock, so relative dates are reproducible. */
  now: string;
  capturedAt?: string;
  recordingDate?: string;
  expect: {
    actionCount: number | [number, number];
    actions: ExpectedAction[];
    /** Field that must carry an open question (on any action or the bundle). */
    ambiguity?: string;
  };
  /** Hallucinations that must not occur. Each returns a description when violated. */
  forbidden: { description: string; violated: (bundle: ExtractionBundle) => boolean }[];
}

const NOW = '2026-10-12T11:00:00+08:00';
const find = (bundle: ExtractionBundle, title: RegExp) =>
  bundle.actions.find((a) => title.test(a.title));

export const extractionCases: ExtractionCase[] = [
  {
    id: 'pictorial',
    languages: 'Cebuano + English',
    kind: 'screenshot',
    now: NOW,
    expect: {
      actionCount: 1,
      actions: [
        {
          title: /pictorial/i,
          type: 'event',
          date: null,
          time: null,
          arrivalTime: '13:30',
          location: /campus/i,
          requirements: [/black pants/i, /jeans/i],
          confidence: { arrivalTime: 'confirmed', time: 'needs_review', date: 'needs_review' },
        },
      ],
      ambiguity: 'date',
    },
    forbidden: [
      {
        description: '1:30 PM interpreted as the event start time',
        violated: (b) => b.actions.some((a) => a.time === '13:30'),
      },
      {
        description: '“tomorrow/ugma” resolved without a known sending date',
        violated: (b) => b.actions.some((a) => !!a.date),
      },
    ],
  },
  {
    id: 'midterm',
    languages: 'English',
    kind: 'screenshot',
    now: NOW,
    expect: {
      actionCount: [1, 2],
      actions: [
        {
          title: /midterm|exam|cecc483/i,
          type: 'event',
          date: '2026-10-11',
          time: '08:00',
          endTime: '13:00',
          location: /gymnasium/i,
          confidence: { date: 'confirmed', time: 'confirmed', location: 'confirmed' },
        },
      ],
    },
    forbidden: [
      {
        description:
          'unrelated coverage section merged into the CECC483 exam without an open question',
        violated: (b) => {
          const exam = find(b, /midterm|exam|cecc483/i);
          if (!exam) return false;
          const text = [...exam.requirements, ...exam.notes].join(' ');
          const merged =
            /statics|deformable/i.test(text) && /algebra|calculus|trigonometry/i.test(text);
          return merged && !b.ambiguities.length;
        },
      },
    ],
  },
  {
    id: 'bundle-english',
    languages: 'English',
    kind: 'screenshot',
    now: NOW,
    expect: {
      actionCount: 2,
      actions: [
        { title: /chapter 3/i, type: 'deadline', date: '2026-10-09', time: '17:00' },
        {
          title: /consultation/i,
          type: 'event',
          date: '2026-10-12',
          time: '14:00',
          requirements: [/questionnaire/i],
        },
      ],
    },
    forbidden: [
      {
        description: 'deadline and consultation merged into one item',
        violated: (b) =>
          b.actions.some((a) => /chapter/i.test(a.title) && /consult/i.test(a.title)),
      },
      {
        description: 'deadline time used as consultation time',
        violated: (b) => find(b, /consultation/i)?.time === '17:00',
      },
    ],
  },
  {
    id: 'cebuano-mixed',
    languages: 'Cebuano + English',
    kind: 'screenshot',
    now: NOW,
    expect: {
      actionCount: 1,
      actions: [{ title: /reflection/i, type: 'deadline', date: '2026-10-09', time: '17:00' }],
    },
    forbidden: [
      {
        description: 'cancelled seminar created as an event to attend',
        violated: (b) => b.actions.some((a) => /seminar/i.test(a.title) && a.type === 'event'),
      },
    ],
  },
  {
    id: 'tagalog-mixed',
    languages: 'Tagalog + English',
    kind: 'screenshot',
    now: NOW,
    expect: {
      actionCount: 1,
      actions: [
        {
          title: /quiz|biology/i,
          type: 'event',
          date: '2026-10-08',
          time: '10:00',
          requirements: [/lab manual/i, /calculator/i],
        },
      ],
    },
    forbidden: [
      {
        description: 'invented location',
        violated: (b) => b.actions.some((a) => !!a.location && !/bio/i.test(a.location)),
      },
    ],
  },
  {
    id: 'tagalog',
    languages: 'Tagalog',
    kind: 'screenshot',
    now: NOW,
    expect: {
      actionCount: 1,
      actions: [
        {
          title: /orientation/i,
          type: 'event',
          date: null,
          time: '15:00',
          location: /204/,
          requirements: [/ballpen/i],
        },
      ],
      ambiguity: 'date',
    },
    forbidden: [
      {
        description: '“bukas” resolved without a known sending date',
        violated: (b) => b.actions.some((a) => !!a.date),
      },
    ],
  },
  {
    id: 'voice-exam-reminder',
    languages: 'English',
    kind: 'voice',
    text: 'Remind me tomorrow at eight to bring my calculator and ID because our exam starts at nine.',
    now: NOW,
    recordingDate: '2026-10-11',
    expect: {
      actionCount: [1, 2],
      actions: [
        {
          title: /exam/i,
          type: 'event',
          date: '2026-10-12',
          time: '09:00',
          requirements: [/calculator/i, /\bID\b/i],
        },
      ],
    },
    forbidden: [
      {
        description: 'reminder time used as the exam start',
        violated: (b) => find(b, /exam/i)?.time === '08:00',
      },
    ],
  },
  {
    id: 'cebuano-inig-udto',
    languages: 'Cebuano',
    kind: 'text',
    text: 'Ugma inig udto naa tay meeting sa library. Palihug dala sa inyong ID.',
    now: NOW,
    capturedAt: '2026-10-12T08:00:00+08:00',
    expect: {
      actionCount: 1,
      actions: [
        {
          title: /meeting/i,
          type: 'event',
          date: '2026-10-13',
          time: '12:00',
          location: /library/i,
          requirements: [/\bID\b/i],
        },
      ],
    },
    forbidden: [],
  },
  {
    id: 'mixed-moved-to',
    languages: 'Cebuano + English',
    kind: 'text',
    text: 'Palihug ayaw kalimti: ang consultation moved to Thursday 3 PM. Submit sa draft before 5 karong Wednesday.',
    now: NOW,
    capturedAt: '2026-10-12T08:00:00+08:00',
    expect: {
      actionCount: 2,
      actions: [
        { title: /consultation/i, type: 'event', date: '2026-10-15', time: '15:00' },
        { title: /draft/i, type: 'deadline', date: '2026-10-14', time: '17:00' },
      ],
    },
    forbidden: [],
  },
  {
    id: 'contextless-correction',
    languages: 'English',
    kind: 'text',
    text: 'Actually move the meeting from two to three PM.',
    now: NOW,
    capturedAt: '2026-10-12T08:00:00+08:00',
    expect: { actionCount: [0, 1], actions: [] },
    forbidden: [
      {
        description: 'invented a date for an unidentified meeting',
        violated: (b) => b.actions.some((a) => !!a.date),
      },
    ],
  },
];
