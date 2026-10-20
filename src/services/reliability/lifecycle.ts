import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
type Guard = (finish: () => Promise<void>) => void;
const guards = new Set<Guard>();
let busy = false;
let generation = 0;
function failure() {
  window.dispatchEvent(new CustomEvent('lifecycle-error'));
}
export function registerCloseGuard(guard: Guard) {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}
export async function requestClose(quit = false) {
  if (!isTauri() || busy) return;
  busy = true;
  const version = ++generation;
  const ordered = [...guards].reverse();
  async function next(index: number): Promise<void> {
    if (index < ordered.length) {
      // Existing recording/review guards own confirmation and cleanup.
      busy = false;
      let used = false;
      ordered[index](() => {
        if (used || version !== generation) return Promise.resolve();
        used = true;
        busy = true;
        return next(index + 1);
      });
    } else {
      try {
        await invoke('lifecycle_finish', { quit });
      } catch {
        failure();
      } finally {
        busy = false;
      }
    }
  }
  try {
    await next(0);
  } catch {
    busy = false;
    failure();
  }
}
export async function installLifecycle() {
  if (!isTauri()) return () => {};
  const close = await getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    void requestClose();
  });
  const quit = await listen('lifecycle-request', () => void requestClose(true));
  return () => {
    close();
    quit();
  };
}
