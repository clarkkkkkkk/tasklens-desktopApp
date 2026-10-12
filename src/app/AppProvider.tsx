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
    const listener = () => void reload();
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [reload]);
  useEffect(() => {
    services.settings.current = snapshot.settings;
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
  async function save(a: ExtractedAction) {
    setSnapshot(
      await services.repository.saveAction({ ...a, updatedAt: new Date().toISOString() }),
    );
    setNotice(
      a.status === 'needs_review' ? 'Draft saved to Needs Review.' : 'Saved on this device.',
    );
  }
  async function remove(id: string) {
    setSnapshot(await services.repository.deleteAction(id));
    setNotice('Item deleted.');
  }
  async function complete(a: ExtractedAction) {
    await save({ ...a, status: a.status === 'completed' ? 'confirmed' : 'completed' });
    setNotice(a.status === 'completed' ? 'Item restored.' : 'Item completed. Nicely done.');
  }
  async function saveSettings(settings: Settings) {
    setSnapshot(await services.repository.saveSettings(settings));
    setNotice('Preferences saved.');
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
