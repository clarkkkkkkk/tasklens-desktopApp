import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import type { AIRoutingSettings } from '../../types/action';
import type { RoutingPolicy } from '../../services/ai/policy';
import { deriveRequirements, type TaskSignals } from '../../services/ai/requirements';
import { recommend, type RouteDecision, type RoutingSnapshot } from '../../services/ai/router';

export function policyFrom(ai: AIRoutingSettings, allowMock: boolean): RoutingPolicy {
  return {
    mode: ai.mode,
    executionMode: ai.executionMode,
    priority: ai.priority,
    manualModel: ai.manualModel,
    allowMock,
  };
}

/** Live device/provider snapshot and the router's decision for a sample task. */
export function useAIRouting(signals: TaskSignals) {
  const { services, snapshot: data } = useApp();
  const { router } = services.ai;
  const [snapshot, setSnapshot] = useState<RoutingSnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');

  const refresh = useCallback(
    async (force = false) => {
      setLoading(true);
      try {
        setSnapshot(await router.snapshot(force));
        setError('');
      } catch {
        setError('Could not check this device and its AI providers.');
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  // Provider options change what discovery reports, so re-read them with the settings.
  const ai = data.settings.ai;
  useEffect(() => {
    void refresh();
  }, [refresh, ai.ollama.enabled, ai.executionMode]);

  useEffect(() => {
    const listener = () => void refresh(true);
    window.addEventListener('tasklens-groq-change', listener);
    return () => window.removeEventListener('tasklens-groq-change', listener);
  }, [refresh]);

  const allowMock = router.currentPolicy().allowMock;
  const policy = useMemo(() => policyFrom(ai, allowMock), [ai, allowMock]);
  const decision: RouteDecision | null = useMemo(
    () => (snapshot ? recommend(deriveRequirements(signals), snapshot, policy) : null),
    [snapshot, policy, signals],
  );
  return { snapshot, decision, policy, loading, error, refresh };
}
