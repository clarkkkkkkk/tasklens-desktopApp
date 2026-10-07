import { actionSchema, defaultSettings, settingsSchema, snapshotSchema } from '../types/action';
import type { ExtractedAction, Settings, Snapshot } from '../types/action';
import type { ActionRepository } from './ActionRepository';
export const STORAGE_KEY = 'tasklens:data:v1';
export class LocalStorageRepository implements ActionRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private serialize(operation: () => Promise<Snapshot>): Promise<Snapshot> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  async load(): Promise<Snapshot> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      throw new Error(
        'Local storage is unavailable. Check your app or browser storage permissions, then retry.',
      );
    }
    if (raw === null) return { version: 1, actions: [], settings: { ...defaultSettings } };
    try {
      return snapshotSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error(
        'TaskLens could not read this local data version. Your data has been kept intact. Export a backup before repairing or migrating it.',
      );
    }
  }
  private write(snapshot: Snapshot): Snapshot {
    const valid = snapshotSchema.parse(snapshot);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(valid));
    } catch {
      throw new Error(
        'Could not save locally. Storage may be full or unavailable. Your edits are still here; free space and try again.',
      );
    }
    return valid;
  }
  async saveAction(action: ExtractedAction): Promise<Snapshot> {
    return this.serialize(async () => {
      const valid = actionSchema.parse(action);
      const snapshot = await this.load();
      const exists = snapshot.actions.some((a) => a.id === valid.id);
      return this.write({
        ...snapshot,
        actions: exists
          ? snapshot.actions.map((a) => (a.id === valid.id ? valid : a))
          : [valid, ...snapshot.actions],
      });
    });
  }
  async deleteAction(id: string): Promise<Snapshot> {
    return this.serialize(async () => {
      const s = await this.load();
      return this.write({ ...s, actions: s.actions.filter((a) => a.id !== id) });
    });
  }
  async saveSettings(settings: Settings): Promise<Snapshot> {
    return this.serialize(async () => {
      const s = await this.load();
      return this.write({ ...s, settings: settingsSchema.parse(settings) });
    });
  }
  exportRaw(): string {
    return (
      this.storage.getItem(STORAGE_KEY) ||
      JSON.stringify({ version: 1, actions: [], settings: defaultSettings })
    );
  }
}
