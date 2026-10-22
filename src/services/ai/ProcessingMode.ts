import { groqConnection, disconnectedGroq, type GroqStatus } from './providers/GroqProvider';
import { LocalAIError, nativeAvailable, onNativeEvent } from '../localai/native';
export type ExecutionMode = 'local' | 'groq';
export interface ProcessingState {
  preferredMode: ExecutionMode;
  effectiveMode: ExecutionMode;
  connection: GroqStatus;
  initialized: boolean;
}
/** One authority for effective routing. Neither connectivity restoration nor preference saves clear a loss latch. */
export class ProcessingMode {
  private state: ProcessingState = {
    preferredMode: 'local',
    effectiveMode: 'local',
    connection: disconnectedGroq,
    initialized: false,
  };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private revision = 0;
  private refreshRevision = 0;
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(connection: GroqStatus, initialized = true) {
    const effectiveMode =
      this.state.preferredMode === 'groq' && connection.enabled && !connection.resumeRequired
        ? 'groq'
        : 'local';
    this.state = { ...this.state, connection, effectiveMode, initialized };
    this.listeners.forEach((fn) => fn());
  }
  async refresh() {
    const revision = this.revision;
    const refreshRevision = ++this.refreshRevision;
    const connection = await groqConnection.status();
    if (revision === this.revision && refreshRevision === this.refreshRevision)
      this.publish(connection);
    return connection;
  }
  async watch() {
    const unlisten = nativeAvailable()
      ? await onNativeEvent<GroqStatus>('groq-connection', () => {
          void this.sync(this.state.preferredMode).catch(() => {});
        })
      : () => {};
    const refresh = () => {
      void this.refresh().catch(() => {});
    };
    window.addEventListener('tasklens-groq-change', refresh);
    return () => {
      unlisten();
      window.removeEventListener('tasklens-groq-change', refresh);
    };
  }
  sync(mode: ExecutionMode, explicit = false): Promise<void> {
    const previousMode = this.state.preferredMode;
    const revision = ++this.revision;
    this.state = { ...this.state, preferredMode: mode, effectiveMode: 'local' };
    // Invalidate capture results immediately; synchronization may await secure native storage.
    this.listeners.forEach((fn) => fn());
    const operation = this.queue.then(async () => {
      if (revision !== this.revision) return;
      let connection = await groqConnection.status();
      if (revision !== this.revision) return;
      const available =
        connection.connectivity === 'online' || connection.providerReachable === true;
      const enable = mode === 'groq' && available && (explicit || !connection.resumeRequired);
      try {
        if (explicit && mode === 'groq' && !available)
          throw new LocalAIError(
            'GROQ_NETWORK',
            'Groq is unavailable. Verify the connection or use Local AI.',
          );
        connection = await groqConnection.configure(enable, false, explicit && enable);
      } catch (error) {
        if (revision === this.revision) {
          if (explicit) this.state = { ...this.state, preferredMode: previousMode };
          this.publish({ ...connection, enabled: false });
        }
        if (explicit) throw error;
        return;
      }
      if (revision === this.revision) this.publish(connection);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
