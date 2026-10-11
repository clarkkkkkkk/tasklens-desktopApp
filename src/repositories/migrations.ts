import { SNAPSHOT_VERSION, snapshotSchema } from '../types/action';
import type { Snapshot } from '../types/action';
export type Envelope = Record<string, unknown> & { version: number };
/**
 * Upgrades a stored envelope from `version` to `version + 1`. Steps are pure and lossless: they
 * must keep IDs, timestamps, source previews and reminder selections, and return the next version.
 */
export type Migration = (envelope: Envelope) => Envelope;
export type Migrations = Readonly<Record<number, Migration>>;
/**
 * Keyed by the version each step upgrades from. When SNAPSHOT_VERSION becomes N + 1, add the
 * `[N]` step here with a fixture test in migrations.test.ts. Never edit a released step.
 */
export const snapshotMigrations: Migrations = {};
export type SnapshotReadProblem = 'corrupt' | 'newer' | 'unsupported';
export class SnapshotReadError extends Error {
  constructor(
    readonly problem: SnapshotReadProblem,
    message: string,
  ) {
    super(message);
    this.name = 'SnapshotReadError';
  }
}
function storedVersion(data: unknown): number {
  const version =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>).version
      : undefined;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0)
    throw new SnapshotReadError('corrupt', 'Stored data has no valid version');
  return version;
}
/** Applies each step from the stored version up to `target`, in order. Does not validate. */
export function runMigrations(
  data: unknown,
  target: number,
  steps: Migrations = snapshotMigrations,
): Envelope {
  const from = storedVersion(data);
  if (from > target)
    throw new SnapshotReadError('newer', `Stored version ${from} is newer than ${target}`);
  let envelope = data as Envelope;
  for (let version = from; version < target; version++) {
    const step = steps[version];
    if (!step) throw new SnapshotReadError('unsupported', `No migration from version ${version}`);
    try {
      envelope = step(envelope);
    } catch (e) {
      throw new SnapshotReadError(
        'unsupported',
        `Migration from version ${version} failed: ${e instanceof Error ? e.message : e}`,
      );
    }
    if (envelope?.version !== version + 1)
      throw new SnapshotReadError(
        'unsupported',
        `Migration from version ${version} did not produce version ${version + 1}`,
      );
  }
  return envelope;
}
export interface MigrationResult {
  snapshot: Snapshot;
  fromVersion: number;
}
/** Upgrades parsed storage to the current snapshot and validates the result. */
export function migrateSnapshot(
  data: unknown,
  steps: Migrations = snapshotMigrations,
): MigrationResult {
  const fromVersion = storedVersion(data);
  const parsed = snapshotSchema.safeParse(runMigrations(data, SNAPSHOT_VERSION, steps));
  if (!parsed.success)
    throw new SnapshotReadError(
      fromVersion === SNAPSHOT_VERSION ? 'corrupt' : 'unsupported',
      `Stored data failed validation: ${parsed.error.issues[0]?.message}`,
    );
  return { snapshot: parsed.data, fromVersion };
}
