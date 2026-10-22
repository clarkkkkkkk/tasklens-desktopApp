import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  defaultSettings,
  SNAPSHOT_VERSION,
  type ExtractedAction,
  type Settings,
  type Snapshot,
} from '../types/action';
import { AISetupDialog } from '../features/ai-setup/AISetupDialog';
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
  const [noticeTone, setNoticeTone] = useState<'success' | 'warning' | 'info'>('info');
  const announce = useCallback((message: string) => {
    setNoticeTone('info');
    setNotice(message);
  }, []);
  const processing = useSyncExternalStore(
    services.processing.subscribe,
    services.processing.getSnapshot,
  );
  const [setup, setSetup] = useState<'choice' | 'groq' | null>(null);
  const choiceHandledThisSession = useRef(false);
  const pendingSetup = useRef<((continueCapture: boolean) => void) | null>(null);
  const settingsQueue = useRef<Promise<unknown>>(Promise.resolve());
  const initializedSettings = useRef(false);
  const latestSettings = useRef(snapshot.settings);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void services.processing.watch().then((fn) => (disposed ? fn() : (cleanup = fn)));
    return () => {
      disposed = true;
      cleanup();
    };
  }, [services]);
  useEffect(() => {
    if (!loading && !loadError && !initializedSettings.current) {
      initializedSettings.current = true;
      void services.processing.sync(snapshot.settings.ai.executionMode);
    }
  }, [loading, loadError, snapshot.settings.ai.executionMode, services]);
  const ensureProcessing = useCallback(async () => {
    if (pendingSetup.current) return false;
    const state = services.processing.getSnapshot();
    if (state.connection.connectivity !== 'online' && !state.connection.providerReachable)
      return true;
    const first =
      !latestSettings.current.ai.modeChoiceCompleted && !choiceHandledThisSession.current;
    const needsSetup =
      state.preferredMode === 'groq' &&
      !state.connection.resumeRequired &&
      (!state.connection.connected || !state.connection.consent);
    if (!first && !needsSetup) return true;
    return new Promise<boolean>((resolve) => {
      pendingSetup.current = resolve;
      setSetup(first ? 'choice' : 'groq');
    });
  }, [services]);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await services.repository.load();
      latestSettings.current = stored.settings;
      services.settings.current = stored.settings;
      setSnapshot(stored);
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
      if (services.repository.reminderWarning) {
        setNoticeTone('warning');
        setNotice(services.repository.reminderWarning);
      }
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
    const stored = await write;
    latestSettings.current = stored.settings;
    setSnapshot(stored);
    setNoticeTone(services.repository.reminderWarning ? 'warning' : 'success');
    setNotice(services.repository.reminderWarning || success);
  }
  function persist(a: ExtractedAction) {
    return services.repository.saveAction({ ...a, updatedAt: new Date().toISOString() });
  }
  async function save(a: ExtractedAction) {
    await commit(
      persist(a),
      a.status === 'needs_review' ? 'Draft saved to Needs Review.' : 'Task saved.',
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
  function saveSettings(value: Settings | ((current: Settings) => Settings)): Promise<void> {
    const operation = settingsQueue.current.then(async () => {
      const previous = latestSettings.current;
      const settings = typeof value === 'function' ? value(previous) : value;
      if (settings.ai.executionMode !== previous.ai.executionMode)
        await services.processing.sync(settings.ai.executionMode);
      try {
        const stored = await services.repository.saveSettings(settings);
        latestSettings.current = stored.settings;
        services.settings.current = stored.settings;
        setSnapshot(stored);
      } catch (error) {
        await services.processing.sync(previous.ai.executionMode);
        throw error;
      }
    });
    settingsQueue.current = operation.catch(() => {});
    return operation;
  }
  return (
    <AppContext.Provider
      value={{
        snapshot,
        processing,
        noticeTone,
        ensureProcessing,
        setupOpen: setup !== null,
        openAISetup: () => {
          if (!pendingSetup.current) setSetup('groq');
        },
        loading,
        loadError,
        notice,
        services,
        reload,
        save,
        remove,
        complete,
        saveSettings,
        announce,
      }}
    >
      {children}
      {setup && (
        <AISetupDialog
          initial={setup}
          onFinish={(resume, choiceComplete = true) => {
            if (choiceComplete) choiceHandledThisSession.current = true;
            setSetup(null);
            const resolve = pendingSetup.current;
            pendingSetup.current = null;
            resolve?.(resume);
          }}
        />
      )}
    </AppContext.Provider>
  );
}
