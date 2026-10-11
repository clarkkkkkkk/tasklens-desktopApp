import { describe, expect, it } from 'vitest';
import {
  migrateSnapshot,
  runMigrations,
  snapshotMigrations,
  SnapshotReadError,
} from './migrations';
import type { Migrations } from './migrations';
import { defaultSettings, SNAPSHOT_VERSION } from '../types/action';
import { newAction } from '../lib/actions';
const current = () => ({
  version: SNAPSHOT_VERSION,
  actions: [{ ...newAction(), title: 'Kept' }],
  settings: defaultSettings,
});
function problem(run: () => unknown) {
  try {
    run();
  } catch (e) {
    if (e instanceof SnapshotReadError) return e.problem;
    throw e;
  }
  return 'none';
}
describe('snapshot migrations', () => {
  it('has a step for every released version below the current one', () => {
    for (let version = 1; version < SNAPSHOT_VERSION; version++)
      expect(snapshotMigrations[version], `step from v${version}`).toBeTypeOf('function');
  });
  it('returns current data unchanged and reports its version', () => {
    const data = current();
    expect(migrateSnapshot(data)).toEqual({ snapshot: data, fromVersion: SNAPSHOT_VERSION });
  });
  it('applies each step once, in order', () => {
    const seen: number[] = [];
    const step =
      (from: number): Migrations[number] =>
      (envelope) => {
        seen.push(from);
        return { ...envelope, version: from + 1, [`v${from + 1}`]: true };
      };
    const steps: Migrations = { 0: step(0), 1: step(1), 2: step(2) };
    expect(runMigrations({ version: 0 }, 3, steps)).toEqual({
      version: 3,
      v1: true,
      v2: true,
      v3: true,
    });
    expect(seen).toEqual([0, 1, 2]);
    expect(runMigrations({ version: 2 }, 3, steps)).toEqual({ version: 3, v3: true });
  });
  it('classifies newer, unreachable, broken and corrupt data', () => {
    expect(problem(() => migrateSnapshot({ ...current(), version: SNAPSHOT_VERSION + 1 }))).toBe(
      'newer',
    );
    const toOne: Migrations = { 0: (e) => ({ ...e, version: 1 }) };
    expect(problem(() => runMigrations({ version: 0 }, 2, toOne))).toBe('unsupported');
    expect(problem(() => runMigrations({ version: 0 }, 1, { 0: (e) => e }))).toBe('unsupported');
    const broken: Migrations = {
      0: () => {
        throw new Error('bad step');
      },
    };
    expect(problem(() => runMigrations({ version: 0 }, 1, broken))).toBe('unsupported');
    for (const data of [null, [], 'text', {}, { version: '1' }, { version: -1 }, { version: 1.5 }])
      expect(problem(() => migrateSnapshot(data))).toBe('corrupt');
    expect(problem(() => migrateSnapshot({ ...current(), actions: 'oops' }))).toBe('corrupt');
  });
  it('rejects a migrated result that fails the current schema', () => {
    const steps: Migrations = { 0: () => ({ version: 1, actions: [{ title: 'no id' }] }) };
    expect(problem(() => migrateSnapshot({ version: 0 }, steps))).toBe('unsupported');
  });
});
