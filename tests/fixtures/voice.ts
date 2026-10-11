import type { TranscriptDocument } from '../../src/services/voice/types';
export const phrases = [
  'Remind me tomorrow at eight to bring my calculator and ID because our exam starts at nine.',
  'Ugma among pictorial. Kinahanglan naa na tanan sa campus by one thirty. Mag black pants, no jeans.',
  'Submit Chapter 3 Friday before five. Consultation Monday at two. Bring the revised questionnaire.',
  'Actually move the meeting from two to three PM.',
  'May consultation kami Monday at 2 PM, dalhin yung revised questionnaire.',
  'Please remind me nga magdala ko calculator tomorrow.',
];
export function transcript(text = phrases[0]): TranscriptDocument {
  return {
    fullText: text,
    segments: [{ id: 's1', startMs: 0, endMs: 6000, text }],
    durationMs: 6000,
    language: 'en',
    model: 'whisper-small',
  };
}
export function rawAction(overrides: Record<string, unknown> = {}) {
  return {
    type: 'event',
    title: 'Midterm exam',
    date: '2026-10-12',
    dateExpression: 'tomorrow',
    time: '09:00',
    arrivalTime: '',
    location: '',
    requirements: ['Bring calculator', 'Bring ID'],
    notes: [],
    reminderTimes: ['08:00'],
    evidence: [{ field: 'time', segmentIds: ['s1'], quote: 'our exam starts at nine' }],
    ...overrides,
  };
}
