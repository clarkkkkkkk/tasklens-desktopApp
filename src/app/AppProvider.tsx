import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  defaultSettings,
  SNAPSHOT_VERSION,
  type ExtractedAction,
  type Settings,
  type Snapshot,
} from '../types/action';
import { AppContext } from './context';
import type { Services } from './services';
export function AppProvider({ services, children }: { services: Services; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    version: SNAPSHOT_VERSION,
    actions: [],
    settings: defaultSettings,
  });
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await services.repository.load());
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load local data');
    } finally {
      setLoading(false);
    }
  }, [services]);
  useEffect(() => {
    void reload();
    const unsubscribe = services.repository.subscribe(() => {
      // Repository notifications follow committed writes; reading again must not re-enter the native write fence.
      if (services.repository.reminderWarning) setNotice(services.repository.reminderWarning);
    });
    const listener = () => void reload();
    window.addEventListener('storage', listener);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', listener);
    };
  }, [reload, services.repository]);
  useEffect(() => {
    services.settings.current = snapshot.settings;
    // Provider options (Ollama on/off) change what discovery reports.
    services.ai.registry.invalidate();
    services.localAI.setConfig({
      contextSize: snapshot.settings.localAI.contextSize,
      threads: snapshot.settings.localAI.threads,
    });
  }, [services, snapshot.settings]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  /** Applies a committed write; a reminder registration warning outranks the success message. */
  async function commit(write: Promise<Snapshot>, success: string) {
    setSnapshot(await write);
    setNotice(services.repository.reminderWarning || success);
  }
  function persist(a: ExtractedAction) {
    return services.repository.saveAction({ ...a, updatedAt: new Date().toISOString() });
  }
  async function save(a: ExtractedAction) {
    await commit(
      persist(a),
      a.status === 'needs_review' ? 'Draft saved to Needs Review.' : 'Saved on this device.',
    );
  }
  async function remove(id: string) {
    await commit(services.repository.deleteAction(id), 'Item deleted.');
  }
  async function complete(a: ExtractedAction) {
    const restoring = a.status === 'completed';
    await commit(
      persist({ ...a, status: restoring ? 'confirmed' : 'completed' }),
      restoring ? 'Item restored.' : 'Item completed. Nicely done.',
    );
  }
  async function saveSettings(settings: Settings) {
    await commit(services.repository.saveSettings(settings), 'Preferences saved.');
  }
  return (
    <AppContext.Provider
      value={{
        snapshot,
        loading,
        loadError,
        notice,
        services,
        reload,
        save,
        remove,
        complete,
        saveSettings,
        announce: setNotice,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
