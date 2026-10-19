export interface NetworkState {
  online: boolean;
  /** `browser`: the OS connection state reported to the webview. No server is contacted. */
  source: 'browser' | 'simulated';
  checkedAt: number;
}

/**
 * Online/offline as reported by the operating system. TaskLens does not probe any server to
 * decide this: the flag only gates cloud candidates, and a failed request still falls back.
 */
export class NetworkMonitor {
  private listeners = new Set<(state: NetworkState) => void>();
  private state: NetworkState = NetworkMonitor.read();
  private attached = false;

  private static read(): NetworkState {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    return { online, source: 'browser', checkedAt: Date.now() };
  }

  current(): NetworkState {
    this.state = NetworkMonitor.read();
    return this.state;
  }

  subscribe(listener: (state: NetworkState) => void): () => void {
    this.listeners.add(listener);
    if (!this.attached && typeof window !== 'undefined') {
      this.attached = true;
      window.addEventListener('online', this.update);
      window.addEventListener('offline', this.update);
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.attached) {
        this.attached = false;
        window.removeEventListener('online', this.update);
        window.removeEventListener('offline', this.update);
      }
    };
  }

  private update = () => {
    const next = this.current();
    for (const listener of this.listeners) listener(next);
  };
}
