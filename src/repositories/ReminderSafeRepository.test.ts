import { describe, expect, it, vi } from 'vitest';
import { LocalStorageRepository, STORAGE_KEY } from './LocalStorageRepository';
import { ReminderSafeRepository } from './ReminderSafeRepository';
import { newAction } from '../lib/actions';
import type { ReminderService } from '../services/reliability/Reminders';
function fixture() {
  const map = new Map<string, string>();
  const repository = new LocalStorageRepository({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  });
  const pause = vi.fn(async () => 'fence');
  const reconcile = vi.fn(async () => {});
  const service = { pause, reconcile } as unknown as ReminderService;
  return { map, pause, reconcile, repository: new ReminderSafeRepository(repository, service) };
}
describe('durable scheduler fence around localStorage writes', () => {
  it('does not save if the durable pause cannot be established', async () => {
    const f = fixture();
    f.pause.mockRejectedValueOnce(new Error('disk full'));
    await expect(f.repository.saveAction({ ...newAction(), title: 'A' })).rejects.toThrow(
      'disk full',
    );
    expect(f.map.has(STORAGE_KEY)).toBe(false);
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it('distinguishes a successful task save from failed registration', async () => {
    const f = fixture();
    f.reconcile.mockRejectedValueOnce(new Error('journal unavailable'));
    const action = { ...newAction(), title: 'A' };
    expect((await f.repository.saveAction(action)).actions[0].id).toBe(action.id);
    expect(JSON.parse(f.map.get(STORAGE_KEY)!).actions[0].id).toBe(action.id);
    expect(f.repository.reminderWarning).toContain('saved');
    expect(f.repository.reminderWarning).toContain('paused');
    await f.repository.load();
    expect(f.repository.reminderWarning).toBeNull();
  });
  it('serializes concurrent mutations through reconciliation', async () => {
    const f = fixture();
    const order: string[] = [];
    f.pause.mockImplementation(async () => {
      order.push('pause');
      return 'fence';
    });
    f.reconcile.mockImplementation(async () => {
      await Promise.resolve();
      order.push('reconcile');
    });
    await Promise.all([
      f.repository.saveAction({ ...newAction(), title: 'A' }),
      f.repository.saveAction({ ...newAction(), title: 'B' }),
    ]);
    expect(order).toEqual(['pause', 'reconcile', 'pause', 'reconcile']);
    expect((await f.repository.load()).actions).toHaveLength(2);
  });
  it('leaves the fence paused when canonical data cannot be read', async () => {
    const f = fixture();
    f.map.set(STORAGE_KEY, 'not json');
    await expect(f.repository.load()).rejects.toThrow('kept intact');
    expect(f.pause).toHaveBeenCalledOnce();
    expect(f.reconcile).not.toHaveBeenCalled();
    expect(await f.repository.exportRaw()).toBe('not json');
  });
});
