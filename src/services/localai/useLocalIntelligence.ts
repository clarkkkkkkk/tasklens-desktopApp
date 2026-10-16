import { useEffect, useState } from 'react';
import { nativeAvailable, nativeInvoke } from './native';
import {
  preparingIntelligence,
  watchLocalIntelligence,
  type IntelligenceStatus,
} from './LocalIntelligence';
export { componentsReady } from './LocalIntelligence';
export function useLocalIntelligence() {
  const available = nativeAvailable();
  const [status, setStatus] = useState<IntelligenceStatus>(
    available ? preparingIntelligence : { ...preparingIntelligence, state: 'ready' },
  );
  useEffect(() => {
    if (!available) return;
    let alive = true;
    let dispose: (() => void) | undefined;
    void watchLocalIntelligence((next) => {
      if (alive) setStatus(next);
    })
      .then((fn) => {
        if (alive) dispose = fn;
        else fn();
      })
      .catch(() => {
        if (alive)
          setStatus({
            ...preparingIntelligence,
            state: 'error',
            message: 'Could not check local intelligence. Retry validation or restart TaskLens.',
          });
      });
    return () => {
      alive = false;
      dispose?.();
    };
  }, [available]);
  return { available, status, retry: () => nativeInvoke<void>('local_intelligence_retry') };
}
