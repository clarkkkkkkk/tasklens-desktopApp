import type { ExtractedAction, Reminder, Settings } from '../../types/action';
import { parseLocalDate } from '../../lib/dates';
export const presets = [
  { id: 'night', label: 'Night before', offsetMinutes: -1 },
  { id: 'hour', label: '1 hour before', offsetMinutes: 60 },
  { id: 'quarter', label: '15 minutes before', offsetMinutes: 15 },
] as const;
export function buildReminders(
  date?: string,
  time?: string,
  selected: Settings['defaultReminders'] = [],
): Reminder[] {
  if (!date) return [];
  const anchor = new Date(`${date}T${time || '00:00'}:00`);
  if (Number.isNaN(anchor.getTime())) return [];
  return presets
    .filter((p) => p.id === 'night' || !!time)
    .map((p) => {
      let when: Date;
      if (p.id === 'night') {
        when = parseLocalDate(date);
        when.setDate(when.getDate() - 1);
        when.setHours(20, 0, 0, 0);
      } else when = new Date(anchor.getTime() - p.offsetMinutes * 60000);
      return {
        id: p.id,
        label: p.label,
        datetime: when.toISOString(),
        enabled: selected.includes(p.id),
        offsetMinutes: p.offsetMinutes,
      };
    });
}
export function rebaseReminders(item: ExtractedAction): ExtractedAction {
  const selected = presets
    .filter((p) => item.reminders.find((r) => r.id === p.id)?.enabled)
    .map((p) => p.id);
  const standard = buildReminders(item.date, item.arrivalTime || item.time, selected);
  return {
    ...item,
    reminders: [
      ...standard,
      ...item.reminders
        .filter((r) => !presets.some((p) => p.id === r.id))
        .map((r) => ({ ...r, enabled: !!item.date && r.enabled })),
    ],
  };
}
export interface UpcomingReminder {
  actionId: string;
  title: string;
  reminder: Reminder;
}
export interface ReminderScheduler {
  readonly delivery: 'configuration-only' | 'native';
  upcoming(actions: ExtractedAction[], settings: Settings, now?: Date): UpcomingReminder[];
}
export class ConfigurationReminderScheduler implements ReminderScheduler {
  readonly delivery = 'configuration-only' as const;
  upcoming(actions: ExtractedAction[], settings: Settings, now = new Date()): UpcomingReminder[] {
    if (!settings.remindersEnabled) return [];
    return actions
      .filter((a) => a.status === 'confirmed')
      .flatMap((a) =>
        a.reminders
          .filter((r) => r.enabled && new Date(r.datetime) > now)
          .map((reminder) => ({ actionId: a.id, title: a.title, reminder })),
      )
      .sort((a, b) => a.reminder.datetime.localeCompare(b.reminder.datetime));
  }
}

/** Explicit editor save approves the exact displayed custom instants; legacy values stay unapproved on load. */
export function approveDisplayedReminders(reminders: Reminder[]): Reminder[] {
  return reminders.map((reminder) =>
    presets.some((preset) => preset.id === reminder.id)
      ? reminder
      : { ...reminder, customApproved: reminder.enabled },
  );
}
