import {
  assessDevice,
  type DeviceAssessment,
  type DeviceProfile,
  type DeviceProfiler,
} from './device';
import { highlights, privacyStatement, reasonsFor, tradeoff } from './explain';
import type { MemoryEstimate } from './footprint';
import type { NetworkMonitor, NetworkState } from './network';
import { cloudPermission, dataFlow, type DataFlow, type RoutingPolicy } from './policy';
import type { ProviderRegistry, ProviderSnapshot } from './registry';
import type { TaskRequirements } from './requirements';
import {
  CLOUD_MARGIN,
  evaluate,
  priorityWeights,
  weightsForTask,
  type Dimension,
  type DimensionScore,
  type Offload,
  type ProviderMeta,
  type Weights,
} from './scoring';
import {
  modelKey,
  type AIModel,
  type AIProvider,
  type QualityClass,
  type SpeedClass,
} from './types';

export interface RoutingSnapshot {
  device: DeviceProfile;
  network: NetworkState;
  providers: ProviderSnapshot[];
}

export interface ScoredCandidate {
  key: string;
  model: AIModel;
  provider: ProviderMeta;
  total: number;
  breakdown: Record<Dimension, DimensionScore>;
  memory?: MemoryEstimate;
  offload: Offload;
  speedClass: SpeedClass;
  qualityClass: QualityClass;
  cautions: string[];
  dataFlow: DataFlow;
  highlights: string[];
  /** Trade-off compared with the selected candidate (alternatives only). */
  tradeoff?: string;
}

export interface ExcludedModel {
  key: string;
  model: AIModel;
  provider: ProviderMeta;
  reasons: string[];
}

export interface Reason {
  tone: 'pro' | 'con' | 'info';
  text: string;
}

export interface RouteDecision {
  status: 'ready' | 'needs-consent' | 'no-candidate';
  requirements: TaskRequirements;
  device: DeviceAssessment;
  network: NetworkState;
  policy: RoutingPolicy;
  weights: Weights;
  selected?: ScoredCandidate;
  /** Every eligible candidate, best first (mock last). */
  ranked: ScoredCandidate[];
  /** Up to three runners-up with trade-offs. */
  alternatives: ScoredCandidate[];
  excluded: ExcludedModel[];
  /** Best local candidate when the selection is a cloud model. */
  localAlternative?: ScoredCandidate;
  reasons: Reason[];
  privacy: string;
  headline: string;
}

const isLocal = (c: ScoredCandidate) => c.model.privacy === 'local';

/**
 * Chooses the most appropriate available model for one job. Pure: the same inputs always give
 * the same decision, so routing is testable and explainable.
 */
export function recommend(
  requirements: TaskRequirements,
  snapshot: RoutingSnapshot,
  policy: RoutingPolicy,
  failures: ReadonlyMap<string, number> = new Map(),
): RouteDecision {
  const device = assessDevice(snapshot.device);
  const weights = weightsForTask(priorityWeights[policy.priority], requirements);
  const permission = cloudPermission(policy);
  const ranked: ScoredCandidate[] = [];
  const excluded: ExcludedModel[] = [];

  for (const { provider, status, models } of snapshot.providers) {
    for (const model of models) {
      const key = modelKey(model);
      const evaluation = evaluate(model, provider, status, {
        requirements,
        device,
        network: snapshot.network,
        permission,
        weights,
        allowMock: policy.allowMock,
        failures: failures.get(key) ?? 0,
        manuallyChosen: policy.mode === 'manual' && policy.manualModel === key,
      });
      if (!evaluation.eligible) {
        excluded.push({ key, model, provider, reasons: evaluation.reasons });
        continue;
      }
      const candidate: ScoredCandidate = {
        key,
        model,
        provider,
        total: evaluation.total,
        breakdown: evaluation.breakdown,
        memory: evaluation.memory,
        offload: evaluation.offload,
        speedClass: evaluation.speedClass,
        qualityClass: evaluation.qualityClass,
        cautions: evaluation.cautions,
        dataFlow: dataFlow(model, provider.name, requirements, policy),
        highlights: [],
      };
      candidate.highlights = highlights(candidate);
      ranked.push(candidate);
    }
    if (!models.length && !status.available)
      excluded.push({
        key: `${provider.id}/*`,
        model: {
          id: '*',
          providerId: provider.id,
          name: provider.name,
          capabilities: [],
          privacy: provider.kind === 'cloud' ? 'cloud' : 'local',
          supportsOffline: provider.kind !== 'cloud',
          specSource: 'declared',
          accelerators: [],
        },
        provider,
        reasons: [status.reason ?? `${provider.name} is not available`],
      });
  }

  // Real models first; demo/mock only when nothing real can run. Ties favour local, then smaller.
  ranked.sort(
    (a, b) =>
      Number(a.provider.kind === 'mock') - Number(b.provider.kind === 'mock') ||
      b.total - a.total ||
      Number(isLocal(b)) - Number(isLocal(a)) ||
      (a.memory?.minRamGB ?? 0) - (b.memory?.minRamGB ?? 0),
  );
  const real = ranked.filter((c) => c.provider.kind !== 'mock');
  const bestLocal = real.find(isLocal);
  const bestCloud = real.find((c) => !isLocal(c));

  let selected = ranked[0];
  let marginApplied = false;
  const manual =
    policy.mode === 'manual' ? ranked.find((c) => c.key === policy.manualModel) : undefined;
  if (manual) selected = manual;
  else if (
    selected &&
    !isLocal(selected) &&
    bestLocal &&
    selected.total - bestLocal.total < CLOUD_MARGIN
  ) {
    selected = bestLocal;
    marginApplied = true;
  }

  const needsConsent =
    !!selected && !isLocal(selected) && permission === 'ask' && !(manual && manual === selected);
  const alternatives = ranked
    .filter((c) => c !== selected)
    .slice(0, 3)
    .map((c) => ({ ...c, tradeoff: selected ? tradeoff(c, selected, requirements) : undefined }));
  const reasons = selected
    ? reasonsFor(selected, {
        requirements,
        device,
        network: snapshot.network,
        bestLocal,
        bestCloud,
        marginApplied,
        manual: !!manual,
      })
    : noCandidateReasons(excluded);
  if (policy.mode === 'manual' && policy.manualModel && !manual) {
    const missing = excluded.find((e) => e.key === policy.manualModel);
    reasons.unshift({
      tone: 'con',
      text: missing
        ? `Your chosen model can't run this job: ${missing.reasons[0]}`
        : 'Your chosen model is no longer available',
    });
  }

  return {
    status: !selected ? 'no-candidate' : needsConsent ? 'needs-consent' : 'ready',
    requirements,
    device,
    network: snapshot.network,
    policy,
    weights,
    selected,
    ranked,
    alternatives,
    excluded,
    localAlternative: selected && !isLocal(selected) ? bestLocal : undefined,
    reasons,
    privacy: privacyStatement(selected, needsConsent),
    headline: selected
      ? selected.provider.kind === 'mock'
        ? 'Demo / Mock AI: no real model available'
        : `Best match for ${requirements.label}`
      : 'No AI model can run this job right now',
  };
}

function noCandidateReasons(excluded: ExcludedModel[]): RouteDecision['reasons'] {
  // Local, real providers first: their reasons are the ones a user can act on.
  const order = (e: ExcludedModel) =>
    e.provider.kind === 'local' ? 0 : e.provider.kind === 'cloud' ? 1 : 2;
  const seen = new Set<string>();
  return [...excluded]
    .sort((a, b) => order(a) - order(b))
    .flatMap((e) =>
      e.reasons.map((r) => `${e.model.id === '*' ? e.provider.name : e.model.name}: ${r}`),
    )
    .filter((text) => !seen.has(text) && !!seen.add(text))
    .slice(0, 4)
    .map((text) => ({ tone: 'con' as const, text }));
}

/**
 * A different candidate that can still do the job after `failedProviders` failed. Local
 * candidates come first because they never upload anything. The caller must still offer it to
 * the user: fallbacks are never silent.
 */
export function fallbackFor(
  decision: RouteDecision,
  failedProviders: string[],
): ScoredCandidate | undefined {
  const remaining = decision.ranked.filter(
    (c) => !failedProviders.includes(c.provider.id) && c.provider.kind !== 'mock',
  );
  return remaining.find(isLocal) ?? remaining[0];
}

/** Stateful front end: gathers the snapshot, remembers failures and applies the policy. */
export class AIRouter {
  private failures = new Map<string, number>();

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly device: DeviceProfiler,
    private readonly network: NetworkMonitor,
    private readonly policy: () => RoutingPolicy,
  ) {}

  async snapshot(refresh = false): Promise<RoutingSnapshot> {
    const [device, providers] = await Promise.all([
      this.device.profile(),
      this.registry.discover(refresh),
    ]);
    return { device, network: this.network.current(), providers };
  }

  async decide(requirements: TaskRequirements, snapshot?: RoutingSnapshot): Promise<RouteDecision> {
    return recommend(
      requirements,
      snapshot ?? (await this.snapshot()),
      this.policy(),
      this.failures,
    );
  }

  fallbackFor(decision: RouteDecision, failedProviders: string[]) {
    return fallbackFor(decision, failedProviders);
  }

  provider(id: string): AIProvider | undefined {
    return this.registry.get(id);
  }

  recordFailure(key: string) {
    this.failures.set(key, (this.failures.get(key) ?? 0) + 1);
    this.registry.invalidate();
  }

  recordSuccess(key: string) {
    this.failures.delete(key);
  }

  currentPolicy(): RoutingPolicy {
    return this.policy();
  }
}
