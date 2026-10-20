import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Snapshot } from '../../types/action';
export interface Occurrence {
  fingerprint: string;
  actionId: string;
  reminderId: string;
  at: string;
  timezone: string;
  state: string;
}
export interface ReminderStatus {
  revision: number;
  activated: boolean;
  paused: boolean;
  includeTitle: boolean;
  background: boolean;
  upcoming: Occurrence[];
  history: Occurrence[];
  needsConfirmation: string[];
  warning: string | null;
  availability: string;
}
export interface ActivationPreview {
  revision: number;
  eligible: number;
  needsConfirmation: string[];
  token: string;
}
export interface ReminderService {
  readonly available: boolean;
  status(): Promise<ReminderStatus>;
  subscribe(listener: (status: ReminderStatus) => void): Promise<() => void>;
  pause(): Promise<string>;
  reconcile(token: string, snapshot: Snapshot): Promise<void>;
  preview(): Promise<ActivationPreview>;
  activate(preview: ActivationPreview): Promise<void>;
  disable(): Promise<void>;
  preferences(includeTitle: boolean, background: boolean): Promise<void>;
  test(): Promise<string>;
}
async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('Native reminders require the TaskLens desktop application.');
  try {
    return await invoke<T>(name, args);
  } catch (error) {
    throw new Error(
      typeof error === 'string'
        ? error
        : 'Native reminders are unavailable. Retry reconciliation before enabling delivery.',
    );
  }
}
export class NativeReminders implements ReminderService {
  readonly available = isTauri();
  status() {
    return command<ReminderStatus>('reminder_status');
  }
  async subscribe(listener: (status: ReminderStatus) => void) {
    if (!this.available) return () => {};
    return listen<ReminderStatus>('reminder-status', ({ payload }) => listener(payload));
  }
  pause() {
    return command<string>('reminder_pause');
  }
  reconcile(token: string, snapshot: Snapshot) {
    // Only scheduling data crosses IPC: never source, notes, screenshots or transcripts.
    const items = snapshot.actions.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      date: a.date || null,
      time: a.time || null,
      arrivalTime: a.arrivalTime || null,
      dateConfirmed: a.confidence.date !== 'needs_review',
      anchorConfirmed:
        a.confidence.date !== 'needs_review' &&
        (a.arrivalTime
          ? a.confidence.arrivalTime === 'confirmed'
          : a.confidence.time === 'confirmed'),
      reminders: a.reminders.map((r) => ({
        id: r.id,
        datetime: r.datetime,
        enabled: r.enabled,
        approval: r.approval || null,
        customApproved: !!r.customApproved,
      })),
    }));
    return command<void>('reminder_reconcile', {
      token,
      items,
      enabled: snapshot.settings.remindersEnabled,
    });
  }
  preview() {
    return command<ActivationPreview>('reminder_preview');
  }
  activate(preview: ActivationPreview) {
    return command<void>('reminder_activate', { token: preview.token, revision: preview.revision });
  }
  disable() {
    return command<void>('reminder_disable');
  }
  preferences(includeTitle: boolean, background: boolean) {
    return command<void>('reminder_preferences', { includeTitle, background });
  }
  test() {
    return command<string>('reminder_test');
  }
}
