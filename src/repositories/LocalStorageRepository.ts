import {
  actionSchema,
  defaultSettings,
  SNAPSHOT_VERSION,
  settingsSchema,
  snapshotSchema,
} from '../types/action';
import type { ExtractedAction, Settings, Snapshot } from '../types/action';
import type { ActionRepository } from './ActionRepository';
import { migrateSnapshot, SnapshotReadError, snapshotMigrations } from './migrations';
import type { Migrations } from './migrations';
/** The key is stable across schema versions; the envelope's `version` field drives migration. */
export const STORAGE_KEY = 'tasklens:data:v1';
/** Copy of the stored data as it was before upgrading from `version`. */
export const backupKey = (version: number) => `tasklens:backup:pre-migration:v${version}`;
export type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class LocalStorageRepository implements ActionRepository {
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private queue: Promise<unknown> = Promise.resolve();
  /** Original data awaiting a backup before the first write in the current version. */
  private preMigration: { version: number; raw: string } | null = null;
  private serialize(operation: () => Promise<Snapshot>): Promise<Snapshot> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  constructor(
    private readonly storage: SnapshotStorage,
    private readonly migrations: Migrations = snapshotMigrations,
  ) {}
  /** Reads and upgrades stored data in memory. Stored data changes only on the next write. */
  async load(): Promise<Snapshot> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      throw new Error(
        'Local storage is unavailable. Check your app or browser storage permissions, then retry.',
      );
    }
    if (raw === null) {
      this.preMigration = null;
      return { version: SNAPSHOT_VERSION, actions: [], settings: { ...defaultSettings } };
    }
    try {
      const { snapshot, fromVersion } = migrateSnapshot(JSON.parse(raw), this.migrations);
      this.preMigration = fromVersion < SNAPSHOT_VERSION ? { version: fromVersion, raw } : null;
      return snapshot;
    } catch (e) {
      throw new Error(
        e instanceof SnapshotReadError && e.problem === 'newer'
          ? 'This data was saved by a newer version of TaskLens. Your data has been kept intact. Update TaskLens to open it, or export a backup.'
          : 'TaskLens could not read this local data version. Your data has been kept intact. Export a backup before repairing or migrating it.',
      );
    }
  }
  private write(snapshot: Snapshot): Snapshot {
    const valid = snapshotSchema.parse(snapshot);
    const pending = this.preMigration;
    let backedUp = false;
    if (pending)
      try {
        // Best effort: a full store must not block saving the already-validated upgrade.
        this.storage.setItem(backupKey(pending.version), pending.raw);
        backedUp = true;
      } catch {
        // Keep going without the backup; the export in Settings remains available.
      }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(valid));
    } catch {
      if (backedUp)
        try {
          this.storage.removeItem(backupKey(pending!.version));
        } catch {
          // The original data is still under STORAGE_KEY, so a stale backup is harmless.
        }
      throw new Error(
        'Could not save locally. Storage may be full or unavailable. Your edits are still here; free space and try again.',
      );
    }
    this.preMigration = null;
    this.listeners.forEach((listener) => listener());
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
  async exportRaw(): Promise<string> {
    return (
      this.storage.getItem(STORAGE_KEY) ||
      JSON.stringify({ version: SNAPSHOT_VERSION, actions: [], settings: defaultSettings })
    );
  }
}
