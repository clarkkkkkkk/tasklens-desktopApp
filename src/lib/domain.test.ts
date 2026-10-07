import { describe, expect, it } from 'vitest';
import { actionSchema, defaultSettings } from '../types/action';
import { confirmAction, matchesSearch, newAction, selectActions, needsReview } from './actions';
import {
  buildReminders,
  ConfigurationReminderScheduler,
  rebaseReminders,
} from '../services/reminders/ReminderScheduler';
import { localDate, monthCells } from './dates';
const item = () => ({
  ...newAction(),
  title: 'Pictorial',
  date: '2026-10-08',
  arrivalTime: '13:30',
  location: 'Campus',
  notes: ['Exact time unconfirmed'],
  requirements: ['No jeans'],
});
describe('domain validation', () => {
  it('rejects empty titles, impossible dates, invalid times and unsafe previews', () => {
    expect(actionSchema.safeParse({ ...item(), title: '  ' }).success).toBe(false);
    expect(actionSchema.safeParse({ ...item(), date: '2026-02-30' }).success).toBe(false);
    expect(actionSchema.safeParse({ ...item(), time: '24:00' }).success).toBe(false);
    expect(actionSchema.safeParse({ ...item(), date: '', time: '13:00' }).success).toBe(false);
    expect(
      actionSchema.safeParse({
        ...item(),
        source: { type: 'image', previewUrl: 'https://tracker.test/pixel' },
      }).success,
    ).toBe(false);
  });
  it('acknowledges uncertain fields on confirmation without erasing inferred provenance', () => {
    const draft = {
      ...item(),
      status: 'needs_review' as const,
      confidence: {
        overall: 'needs_review' as const,
        time: 'needs_review' as const,
        date: 'inferred' as const,
      },
    };
    expect(needsReview(draft)).toBe(true);
    const confirmed = confirmAction(draft);
    expect(confirmed.confidence.time).toBe('confirmed');
    expect(confirmed.confidence.date).toBe('inferred');
    expect(needsReview(confirmed)).toBe(false);
  });
});
describe('selectors', () => {
  it('searches title, location, notes, requirements, with normalized multiword search', () => {
    for (const query of ['PICTORIAL', 'campus', 'unconfirmed', 'no jeans', 'pictorial campus'])
      expect(matchesSearch(item(), query)).toBe(true);
    expect(matchesSearch(item(), 'library')).toBe(false);
  });
  it('keeps unconfirmed and completed items out of active agendas', () => {
    const all = [
      item(),
      { ...item(), id: 'draft', status: 'needs_review' as const },
      { ...item(), id: 'done', status: 'completed' as const },
      { ...item(), id: 'future', date: '2026-10-09' },
    ];
    expect(selectActions(all, 'today', '', '2026-10-08')).toHaveLength(1);
    expect(selectActions(all, 'upcoming', '', '2026-10-08')).toHaveLength(2);
    expect(selectActions(all, 'completed')).toHaveLength(1);
    expect(selectActions(all, 'review')).toHaveLength(1);
    expect(selectActions(all, 'calendar')).toHaveLength(3);
  });
  it('uses local calendar days and handles month boundaries and leap years', () => {
    expect(localDate(new Date(2026, 9, 8, 0, 1))).toBe('2026-10-08');
    expect(monthCells(new Date(2024, 1, 1)).filter(Boolean)).toHaveLength(29);
    expect(monthCells(new Date(2026, 1, 1)).filter(Boolean)).toHaveLength(28);
    expect(monthCells(new Date(2026, 9, 1)).length % 7).toBe(0);
  });
});
describe('reminder configurations', () => {
  it('anchors night-before at local 20:00 and relative presets at arrival', () => {
    const r = buildReminders('2026-10-08', '13:30', ['night', 'hour', 'quarter']);
    expect(new Date(r[0].datetime).getHours()).toBe(20);
    expect(new Date(r[0].datetime).getDate()).toBe(7);
    expect(new Date(r[1].datetime).getHours()).toBe(12);
    expect(new Date(r[1].datetime).getMinutes()).toBe(30);
    expect(new Date(r[2].datetime).getMinutes()).toBe(15);
  });
  it('rebases reminders after date/time changes and preserves selections', () => {
    const a = { ...item(), reminders: buildReminders('2026-10-08', '13:30', ['hour']) };
    const edited = rebaseReminders({ ...a, date: '2026-10-09', arrivalTime: '15:00' });
    expect(edited.reminders.filter((r) => r.enabled)).toHaveLength(1);
    expect(new Date(edited.reminders[1].datetime).getHours()).toBe(14);
    expect(rebaseReminders({ ...a, date: undefined }).reminders).toEqual([]);
  });
  it('schedules only enabled future configurations on confirmed actions', () => {
    const scheduler = new ConfigurationReminderScheduler();
    const a = { ...item(), reminders: buildReminders('2026-10-08', '13:30', ['hour']) };
    expect(scheduler.upcoming([a], defaultSettings, new Date('2026-10-01'))).toHaveLength(1);
    expect(
      scheduler.upcoming(
        [a],
        { ...defaultSettings, remindersEnabled: false },
        new Date('2026-10-01'),
      ),
    ).toHaveLength(0);
    expect(
      scheduler.upcoming([{ ...a, status: 'completed' }], defaultSettings, new Date('2026-10-01')),
    ).toHaveLength(0);
    expect(scheduler.upcoming([a], defaultSettings, new Date('2026-10-10'))).toHaveLength(0);
  });
});
