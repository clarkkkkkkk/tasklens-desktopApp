import { describe, expect, it } from 'vitest';
import { backupKey, LocalStorageRepository, STORAGE_KEY } from './LocalStorageRepository';
import type { Migrations } from './migrations';
import { newAction } from '../lib/actions';
function storage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
const action = () => ({ ...newAction(), title: 'Saved locally' });
describe('local repository', () => {
  it('round trips data across instances, updates without duplicates and deletes', async () => {
    const s = storage(),
      repository = new LocalStorageRepository(s);
    expect((await repository.load()).actions).toEqual([]);
    const a = action();
    await repository.saveAction(a);
    await repository.saveAction({ ...a, title: 'Updated' });
    const restarted = new LocalStorageRepository(s);
    expect((await restarted.load()).actions.map((a) => a.title)).toEqual(['Updated']);
    await restarted.deleteAction(a.id);
    expect((await restarted.load()).actions).toEqual([]);
  });
  it('preserves newer-version and corrupt data, including on attempted writes', async () => {
    const s = storage();
    s.setItem(STORAGE_KEY, '{"version":99}');
    const r = new LocalStorageRepository(s);
    await expect(r.load()).rejects.toThrow('newer version of TaskLens');
    await expect(r.saveAction(action())).rejects.toThrow('kept intact');
    expect(await r.exportRaw()).toBe('{"version":99}');
    s.setItem(STORAGE_KEY, '{"version":1,"actions":"oops"}');
    await expect(r.load()).rejects.toThrow('could not read this local data version');
    await expect(r.saveAction(action())).rejects.toThrow();
    expect(await r.exportRaw()).toBe('{"version":1,"actions":"oops"}');
  });
  it('reports denied/quota storage without claiming success', async () => {
    const r = new LocalStorageRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    });
    await expect(r.saveAction(action())).rejects.toThrow('edits are still here');
    await expect(
      new LocalStorageRepository({
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {},
        removeItem: () => {},
      }).load(),
    ).rejects.toThrow('unavailable');
  });
  it('does not lose concurrent saves and preferences', async () => {
    const r = new LocalStorageRepository(storage());
    const a = action(),
      b = action();
    await Promise.all([r.saveAction(a), r.saveAction(b)]);
    expect((await r.load()).actions).toHaveLength(2);
  });
});
describe('schema migration in the repository', () => {
  // Version 0 stands in for an older release; real steps live in snapshotMigrations.
  const legacy = JSON.stringify({
    version: 0,
    items: [{ ...newAction(), title: 'From an older release' }],
    preferences: { remindersEnabled: false, defaultReminders: ['hour'], theme: 'light' },
  });
  const steps: Migrations = {
    0: ({ items, preferences }) => ({ version: 1, actions: items, settings: preferences }),
  };
  it('upgrades in memory on load and leaves stored data untouched until a write', async () => {
    const s = storage();
    s.setItem(STORAGE_KEY, legacy);
    const loaded = await new LocalStorageRepository(s, steps).load();
    expect(loaded.version).toBe(1);
    expect(loaded.actions.map((a) => a.title)).toEqual(['From an older release']);
    expect(loaded.settings).toMatchObject({
      remindersEnabled: false,
      onboardingCompletedVersion: 0,
    });
    expect(s.getItem(STORAGE_KEY)).toBe(legacy);
    expect(s.map.has(backupKey(0))).toBe(false);
  });
  it('backs up the original once, then persists the current version', async () => {
    const s = storage();
    s.setItem(STORAGE_KEY, legacy);
    const r = new LocalStorageRepository(s, steps);
    await r.saveAction(action());
    expect(s.getItem(backupKey(0))).toBe(legacy);
    expect(JSON.parse(s.getItem(STORAGE_KEY)!)).toMatchObject({ version: 1 });
    expect((await r.load()).actions).toHaveLength(2);
    s.map.delete(backupKey(0));
    await r.saveAction(action());
    expect(s.map.has(backupKey(0))).toBe(false);
  });
  it('removes the backup when the upgraded write fails, and retries cleanly', async () => {
    const s = storage();
    s.setItem(STORAGE_KEY, legacy);
    let full = true;
    const r = new LocalStorageRepository(
      {
        ...s,
        setItem: (key, value) => {
          if (full && key === STORAGE_KEY) throw new Error('quota');
          s.setItem(key, value);
        },
      },
      steps,
    );
    await expect(r.saveAction(action())).rejects.toThrow('edits are still here');
    expect(s.getItem(STORAGE_KEY)).toBe(legacy);
    expect(s.map.has(backupKey(0))).toBe(false);
    full = false;
    await r.saveAction(action());
    expect(s.getItem(backupKey(0))).toBe(legacy);
    expect(JSON.parse(s.getItem(STORAGE_KEY)!)).toMatchObject({ version: 1 });
  });
  it('still saves the upgrade when there is no room for the backup', async () => {
    const s = storage();
    s.setItem(STORAGE_KEY, legacy);
    const r = new LocalStorageRepository(
      {
        ...s,
        setItem: (key, value) => {
          if (key === backupKey(0)) throw new Error('quota');
          s.setItem(key, value);
        },
      },
      steps,
    );
    await r.saveAction(action());
    expect(JSON.parse(s.getItem(STORAGE_KEY)!).actions).toHaveLength(2);
  });
  it('keeps data intact when no migration path exists', async () => {
    const s = storage();
    s.setItem(STORAGE_KEY, legacy);
    const r = new LocalStorageRepository(s);
    await expect(r.load()).rejects.toThrow('kept intact');
    await expect(r.saveAction(action())).rejects.toThrow();
    expect(s.getItem(STORAGE_KEY)).toBe(legacy);
  });
});
