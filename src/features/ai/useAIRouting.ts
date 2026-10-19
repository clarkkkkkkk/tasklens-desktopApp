import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import type { AIRoutingSettings } from '../../types/action';
import type { RoutingPolicy } from '../../services/ai/policy';
import { deriveRequirements, type TaskSignals } from '../../services/ai/requirements';
import { recommend, type RouteDecision, type RoutingSnapshot } from '../../services/ai/router';

export function policyFrom(ai: AIRoutingSettings, allowMock: boolean): RoutingPolicy {
  return {
    mode: ai.mode,
    priority: ai.priority,
    manualModel: ai.manualModel,
    shareImages: ai.shareImages,
    allowMock,
  };
}

/** Live device/network/provider snapshot and the router's decision for a sample task. */
export function useAIRouting(signals: TaskSignals) {
  const { services, snapshot: data } = useApp();
  const { router, network } = services.ai;
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
  }, [refresh, ai.ollama.enabled]);

  useEffect(
    () => network.subscribe((state) => setSnapshot((s) => (s ? { ...s, network: state } : s))),
    [network],
  );

  const allowMock = router.currentPolicy().allowMock;
  const policy = useMemo(() => policyFrom(ai, allowMock), [ai, allowMock]);
  const decision: RouteDecision | null = useMemo(
    () => (snapshot ? recommend(deriveRequirements(signals), snapshot, policy) : null),
    [snapshot, policy, signals],
  );
  return { snapshot, decision, policy, loading, error, refresh };
}
