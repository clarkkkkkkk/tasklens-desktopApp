import type { ActionRepository } from './ActionRepository';
import type { ExtractedAction, Settings, Snapshot } from '../types/action';
import type { ReminderService } from '../services/reliability/Reminders';
/** A temporary two-store write protocol, replaced by an atomic SQLite mutation in milestone D. */
export class ReminderSafeRepository implements ActionRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private warning: string | null = null;
  constructor(
    private readonly tasks: ActionRepository,
    private readonly reminders: ReminderService,
  ) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  get reminderWarning() {
    return this.warning;
  }
  private serialize(operation: () => Promise<Snapshot>) {
    const next = this.queue.then(async () => {
      // A failed durable pause prevents the task write. A failed reconciliation DOES NOT undo a successful task save.
      const token = await this.reminders.pause();
      let snapshot: Snapshot;
      try {
        snapshot = await operation();
      } catch (error) {
        await this.resumeFromStored(token);
        throw error;
      }
      try {
        await this.reminders.reconcile(token, snapshot);
        this.warning = null;
      } catch {
        this.warning =
          'Your task data was saved. Reminder delivery is paused because registration failed. Open Settings and retry reconciliation.';
      }
      this.listeners.forEach((listener) => listener());
      return snapshot;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
  /** A failed write leaves stored tasks unchanged, so delivery can resume from them. Unreadable data stays paused. */
  private async resumeFromStored(token: string) {
    try {
      await this.reminders.reconcile(token, await this.tasks.load());
    } catch {
      // The fence stays paused; Settings reports it and offers retry.
    }
  }
  load() {
    return this.serialize(() => this.tasks.load());
  }
  saveAction(action: ExtractedAction) {
    return this.serialize(() => this.tasks.saveAction(action));
  }
  deleteAction(id: string) {
    return this.serialize(() => this.tasks.deleteAction(id));
  }
  saveSettings(settings: Settings) {
    return this.serialize(() => this.tasks.saveSettings(settings));
  }
  exportRaw() {
    return this.tasks.exportRaw();
  }
}
