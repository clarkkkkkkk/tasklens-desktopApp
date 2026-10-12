import { expect, it } from 'vitest';
import { parseExtraction, extractionPrompt } from './LocalExtractionService';
import { phrases, rawAction, transcript } from '../../../tests/fixtures/voice';
const source = {
  type: 'voice' as const,
  transcript: transcript(),
  capturedAt: '2026-10-11T04:00:00.000Z',
};
it('keeps explicit reminder, event time and supported evidence distinct', () => {
  const result = parseExtraction(
    JSON.stringify({ actions: [rawAction()], ambiguities: [] }),
    source,
  ).actions[0];
  expect(result.time).toBe('09:00');
  expect(new Date(result.reminders[0].datetime).getHours()).toBe(8);
  expect(result.requirements).toContain('Bring ID');
  expect(result.evidence?.[0].segmentIds).toEqual(['s1']);
  expect(result.status).toBe('needs_review');
});
it('retains arrival-only details and multiple actions without collapsing results', () => {
  const pictorial = parseExtraction(
    JSON.stringify({
      actions: [
        rawAction({
          title: 'Pictorial',
          time: '',
          arrivalTime: '13:30',
          requirements: ['black pants', 'no jeans'],
          reminderTimes: [],
          evidence: [],
        }),
      ],
      ambiguities: [],
    }),
    { ...source, transcript: transcript(phrases[1]) },
  );
  expect(pictorial.actions[0].time).toBe('');
  expect(pictorial.actions[0].arrivalTime).toBe('13:30');
  const multiple = parseExtraction(
    JSON.stringify({
      actions: [
        rawAction({ type: 'deadline', title: 'Submit Chapter 3', time: '17:00' }),
        rawAction({
          title: 'Consultation',
          time: '14:00',
          requirements: ['Bring revised questionnaire'],
        }),
      ],
      ambiguities: [],
    }),
    { ...source, transcript: transcript(phrases[2]) },
  );
  expect(multiple.actions).toHaveLength(2);
  expect(multiple.actions[1].requirements).toEqual(['Bring revised questionnaire']);
});
it('removes invented evidence and blocks relative date resolution without a recording date', () => {
  const result = parseExtraction(
    JSON.stringify({
      actions: [
        rawAction({
          evidence: [{ field: 'title', segmentIds: ['invented'], quote: 'not spoken' }],
        }),
      ],
      ambiguities: [],
    }),
    { type: 'voice', transcript: transcript() },
  );
  expect(result.actions[0].date).toBeUndefined();
  expect(result.actions[0].evidence).toEqual([]);
  expect(result.ambiguities.join()).toContain('Recording date');
});
it('surfaces contextless corrections as ambiguity without fabricating an action', () => {
  const result = parseExtraction(
    JSON.stringify({ actions: [], ambiguities: ['Which meeting should move?'] }),
    { ...source, transcript: transcript(phrases[3]) },
  );
  expect(result.actions).toEqual([]);
  expect(result.ambiguities).toHaveLength(1);
});
it('preserves multilingual text, temporal context and bounded prompts', () => {
  for (const phrase of phrases) {
    expect(extractionPrompt({ ...source, transcript: transcript(phrase) })).toContain(phrase);
  }
  expect(() => extractionPrompt({ type: 'text', text: 'x'.repeat(20001) })).toThrow('too long');
});

it('supplies capture time and resolves the reference date in the capture timezone', () => {
  const prompt = extractionPrompt({
    type: 'text',
    text: 'Tomorrow at noon',
    capturedAt: '2026-10-11T20:30:00.000Z',
    timezone: 'Asia/Manila',
  });
  expect(prompt).toContain('"referenceDate":"2026-10-12"');
  expect(prompt).toContain('"referenceTime":"04:30:00"');
  expect(prompt).toContain('"captureTimestamp":"2026-10-11T20:30:00.000Z"');
});

it('corrects model weekday arithmetic with a visible review warning', () => {
  const result = parseExtraction(
    JSON.stringify({
      actions: [rawAction({ type: 'deadline', dateExpression: 'Friday', date: '2026-10-12' })],
      ambiguities: [],
    }),
    { ...source, timezone: 'Asia/Manila' },
  );
  expect(result.actions[0].date).toBe('2026-10-16');
  expect(result.ambiguities.join()).toContain('relative date resolved');
});

it('keeps a blank reminder time unresolved instead of fabricating a schedule', () => {
  const result = parseExtraction(
    JSON.stringify({ actions: [rawAction({ reminderTimes: [''] })], ambiguities: [] }),
    source,
  );
  expect(result.actions[0].reminders).toEqual([]);
  expect(result.ambiguities.join()).toContain('reminder time is unspecified');
});
