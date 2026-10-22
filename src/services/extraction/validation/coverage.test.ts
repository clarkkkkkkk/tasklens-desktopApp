import { expect, it } from 'vitest';
import { newAction } from '../../../lib/actions';
import { unitsFromText } from '../prompts/build-prompt';
import { coverageIssue, repairInstruction } from './coverage';
const context = (text: string) => ({
  kind: 'text' as const,
  units: unitsFromText(text),
  now: new Date('2026-10-21T07:00:00Z'),
  timezone: 'Asia/Manila',
});
it('requests repair for an omitted separate activity without inventing it', () => {
  const action = {
    ...newAction(),
    title: 'Holy Mass',
    evidence: [
      { field: 'title' as const, segmentIds: ['t1'], quote: 'Holy Mass', value: 'Holy Mass' },
    ],
  };
  expect(coverageIssue(context('Holy Mass.\nLunch at 12 PM at RTC Gym.'), [action])).toMatch(
    /separately scheduled meal/,
  );
  expect(coverageIssue(context('Holy Mass.\nLunch cancelled at 12 PM.'), [action])).toBeNull();
});
it('checks an explicit date and a simple two-supply list, without adding values', () => {
  const action = {
    ...newAction(),
    title: 'Meeting',
    evidence: [{ field: 'title' as const, segmentIds: ['t1'], quote: 'Meeting', value: 'Meeting' }],
  };
  expect(coverageIssue(context('Meeting on October 23, 2026.'), [action])).toMatch(
    /explicit calendar date/,
  );
  expect(action.date).toBeUndefined();
  expect(
    coverageIssue(context('Bring a pencil and paper.'), [
      { ...action, requirements: ['Bring a pencil'] },
    ]),
  ).toMatch(/bring-list/);
  expect(
    coverageIssue(context('Bring a pencil and paper.'), [
      { ...action, requirements: ['Bring a pencil and paper'] },
    ]),
  ).toBeNull();
});

it('accepts supplies already expressed by a task title', () => {
  expect(
    coverageIssue(context('Bring a pencil and paper.'), [
      { ...newAction(), title: 'Bring a pencil and paper' },
    ]),
  ).toBeNull();
});

it('requests a missing explicit event clock independently of its unknown date', () => {
  const lunch = {
    ...newAction(),
    type: 'event' as const,
    title: 'Lunch',
    evidence: [{ field: 'title' as const, segmentIds: ['t1'], quote: 'Lunch', value: 'Lunch' }],
  };
  expect(coverageIssue(context('Lunch at 12 PM at RTC Gym.'), [lunch])).toMatch(
    /explicit clock time/,
  );
  expect(
    coverageIssue(context('Lunch at 12 PM at RTC Gym.'), [{ ...lunch, time: '12:00' }]),
  ).toBeNull();
});

it('does not mistake a meal cited by another activity for a separate extracted meal', () => {
  const mass = {
    ...newAction(),
    type: 'event' as const,
    title: 'Holy Mass',
    notes: ['Lunch at 12 PM'],
    evidence: [
      { field: 'requirements' as const, segmentIds: ['t1'], quote: 'Lunch', value: 'Lunch' },
    ],
  };
  expect(coverageIssue(context('LUNCH - 12 PM at RTC Gym.'), [mass])).toMatch(
    /separately scheduled meal/,
  );
});

it('repair keeps source clock readings without assigning start/arrival roles or inventing dates', () => {
  const hint = repairInstruction(context('Be there by 9 AM.\nLunch at 12 PM.'), 'Activity omitted');
  expect(hint).toContain('[t1] 09:00');
  expect(hint).toContain('[t2] 12:00');
  expect(hint).toContain('Choose roles from the source');
  expect(hint).toContain('date:null');
  expect(repairInstruction(context('Time unclear.'), 'Unknown time')).not.toContain(
    'clock readings',
  );
  expect(repairInstruction(context('9 AM'), 'Truncated', true)).not.toContain('clock readings');
});

it('repair distinguishes context timestamps from written activity dates and clocks', () => {
  const c = context('Meeting on October 23, 2026 at 10:30 PM.');
  c.units.unshift({
    id: 'header',
    text: 'Oct 5, 2026, 9:14 AM',
    messageTimestamp: true,
  } as (typeof c.units)[number]);
  const hint = repairInstruction(c, 'Supply omitted');
  expect(hint).toContain('[t1] 2026-10-23');
  expect(hint).toContain('[t1] 22:30');
  expect(hint).not.toContain('09:14');
  expect(hint).not.toContain('2026-10-05');
});
