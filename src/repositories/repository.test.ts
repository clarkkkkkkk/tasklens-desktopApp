import { describe, expect, it } from 'vitest';
import { LocalStorageRepository, STORAGE_KEY } from './LocalStorageRepository';
import { newAction } from '../lib/actions';
function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
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
  it('preserves unknown/corrupt data, including on attempted writes', async () => {
    const s = storage();
    s.setItem(STORAGE_KEY, '{"version":99}');
    const r = new LocalStorageRepository(s);
    await expect(r.load()).rejects.toThrow('kept intact');
    await expect(r.saveAction(action())).rejects.toThrow();
    expect(r.exportRaw()).toBe('{"version":99}');
  });
  it('reports denied/quota storage without claiming success', async () => {
    const r = new LocalStorageRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    await expect(r.saveAction(action())).rejects.toThrow('edits are still here');
    await expect(
      new LocalStorageRepository({
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {},
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
