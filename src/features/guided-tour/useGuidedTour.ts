import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { View } from '../../types/action';
import { tourSteps } from './tourSteps';
import { hasStartedTour, isFirstRunWorkspace, storeTourStatus } from './tourStorage';

type Origin = 'first-run' | 'replay';
export function useGuidedTour({
  blocked,
  navigate,
  onDismiss,
  announce,
}: {
  blocked: boolean;
  navigate: (view: View) => void;
  onDismiss: (origin: Origin, finished: boolean) => void;
  announce: (message: string) => void;
}) {
  const steps = useMemo(tourSteps, []);
  const [firstRunEligible] = useState(isFirstRunWorkspace);
  const [pending, setPending] = useState<Origin | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [index, setIndex] = useState(0);
  const consumed = useRef(false);
  const activeRef = useRef(false);
  const callbacks = useRef({ navigate, onDismiss, announce });
  callbacks.current = { navigate, onDismiss, announce };
  const queueFirstRun = useCallback(() => {
    if (!firstRunEligible || consumed.current || hasStartedTour()) return false;
    setPending('first-run');
    return true;
  }, [firstRunEligible]);
  const replay = useCallback(() => {
    if (!activeRef.current) setPending('replay');
  }, []);
  useEffect(() => {
    if (!pending || blocked || origin) return;
    const start = () => {
      if (activeRef.current || document.querySelector('dialog[open], [data-tour-busy="true"]'))
        return;
      activeRef.current = true;
      consumed.current = true;
      if (!storeTourStatus('started'))
        callbacks.current.announce(
          'The guided tour works for this session. Its progress could not be saved.',
        );
      setIndex(0);
      callbacks.current.navigate(steps[0].view);
      setOrigin(pending);
      setPending(null);
    };
    start();
    const observer = new MutationObserver(start);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'data-tour-busy'],
    });
    return () => observer.disconnect();
  }, [pending, blocked, origin, steps]);

  const dismiss = useCallback(
    (finished = false) => {
      if (!activeRef.current || !origin) return;
      activeRef.current = false;
      if (!storeTourStatus(finished ? 'completed' : 'skipped'))
        callbacks.current.announce('The guided tour is closed. Its progress could not be saved.');
      setOrigin(null);
      callbacks.current.onDismiss(origin, finished);
    },
    [origin],
  );
  useEffect(() => {
    // Recovery, externally opened setup, or new capture ownership takes priority.
    // In particular, a storage reload must never reopen the tour over onboarding.
    if (origin && blocked) dismiss();
  }, [origin, blocked, dismiss]);
  const move = useCallback(
    (direction: number) => {
      setIndex((current) => Math.max(0, Math.min(steps.length - 1, current + direction)));
    },
    [steps.length],
  );
  const step = steps[index];
  useEffect(() => {
    if (origin) callbacks.current.navigate(step.view);
  }, [origin, step]);
  return {
    active: !!origin,
    step,
    index,
    count: steps.length,
    pending: !!pending,
    queueFirstRun,
    replay,
    dismiss,
    move,
  };
}
