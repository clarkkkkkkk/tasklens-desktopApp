import {
  assessDevice,
  type DeviceAssessment,
  type DeviceProfile,
  type DeviceProfiler,
} from './device';
import { highlights, privacyStatement, reasonsFor, tradeoff } from './explain';
import type { MemoryEstimate } from './footprint';
import type { RoutingPolicy } from './policy';
import type { ProviderRegistry, ProviderSnapshot } from './registry';
import type { TaskRequirements } from './requirements';
import {
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
  /** The screenshot itself is given to the model, not only its recognized text. */
  attachImage: boolean;
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
  status: 'ready' | 'no-candidate';
  requirements: TaskRequirements;
  device: DeviceAssessment;
  policy: RoutingPolicy;
  weights: Weights;
  selected?: ScoredCandidate;
  /** Every eligible candidate, best first (mock last). */
  ranked: ScoredCandidate[];
  /** Up to three runners-up with trade-offs. */
  alternatives: ScoredCandidate[];
  excluded: ExcludedModel[];
  reasons: Reason[];
  privacy: string;
  headline: string;
}

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
  policy = { ...policy };
  const device = assessDevice(snapshot.device);
  const weights = weightsForTask(priorityWeights[policy.priority], requirements);
  const ranked: ScoredCandidate[] = [];
  const excluded: ExcludedModel[] = [];

  for (const { provider, status, models } of snapshot.providers) {
    const mode = policy.executionMode ?? 'local';
    if (
      mode === 'groq'
        ? provider.kind !== 'cloud' || provider.id !== 'groq'
        : provider.kind === 'cloud'
    )
      continue;
    for (const model of models) {
      const key = modelKey(model);
      const evaluation = evaluate(model, provider, status, {
        requirements,
        device,
        weights,
        allowMock: policy.allowMock,
        failures: failures.get(key) ?? 0,
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
        attachImage:
          provider.kind === 'local' &&
          requirements.hasImage &&
          model.capabilities.includes('image-understanding'),
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
          specSource: 'declared',
          accelerators: [],
        },
        provider,
        reasons: [status.reason ?? `${provider.name} is not available`],
      });
  }

  // Real models first; demo/mock only when nothing real can run. Ties favour smaller models.
  ranked.sort(
    (a, b) =>
      Number(a.provider.kind === 'mock') - Number(b.provider.kind === 'mock') ||
      b.total - a.total ||
      (a.memory?.minRamGB ?? 0) - (b.memory?.minRamGB ?? 0),
  );

  const manual =
    policy.executionMode !== 'groq' && policy.mode === 'manual'
      ? ranked.find((c) => c.key === policy.manualModel)
      : undefined;
  const selected = manual ?? ranked[0];
  const alternatives = ranked
    .filter((c) => c !== selected)
    .slice(0, 3)
    .map((c) => ({ ...c, tradeoff: selected ? tradeoff(c, selected, requirements) : undefined }));
  const reasons = selected
    ? reasonsFor(selected, {
        requirements,
        device,
        manual: !!manual,
      })
    : noCandidateReasons(excluded);
  if (
    policy.executionMode !== 'groq' &&
    policy.mode === 'manual' &&
    policy.manualModel &&
    !manual
  ) {
    const missing = excluded.find((e) => e.key === policy.manualModel);
    reasons.unshift({
      tone: 'con',
      text: missing
        ? `Your chosen model can't run this job: ${missing.reasons[0]}`
        : 'Your chosen model is no longer available',
    });
  }

  return {
    status: selected ? 'ready' : 'no-candidate',
    requirements,
    device,
    policy,
    weights,
    selected,
    ranked,
    alternatives,
    excluded,
    reasons,
    privacy: privacyStatement(selected),
    headline: selected
      ? selected.provider.kind === 'mock'
        ? 'Demo / Mock AI: no real model available'
        : selected.provider.kind === 'cloud'
          ? 'Selected online provider'
          : `Best match for ${requirements.label}`
      : 'No AI model can run this job right now',
  };
}

function noCandidateReasons(excluded: ExcludedModel[]): RouteDecision['reasons'] {
  // Local, real providers first: their reasons are the ones a user can act on.
  const order = (e: ExcludedModel) => (e.provider.kind === 'local' ? 0 : 1);
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
 * Local-mode fallback only. Cloud selection never crosses into a local or mock provider;
 * local provider switches are reported by the caller.
 */
export function fallbackFor(
  decision: RouteDecision,
  failedProviders: string[],
): ScoredCandidate | undefined {
  if (decision.selected?.provider.kind === 'cloud') return undefined;
  return decision.ranked.find(
    (c) => !failedProviders.includes(c.provider.id) && c.provider.kind === 'local',
  );
}

/** Stateful front end: gathers the snapshot, remembers failures and applies the policy. */
export class AIRouter {
  private failures = new Map<string, number>();

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly device: DeviceProfiler,
    private readonly policy: () => RoutingPolicy,
  ) {}

  async snapshot(refresh = false): Promise<RoutingSnapshot> {
    const [device, providers] = await Promise.all([
      this.device.profile(),
      this.registry.discover(refresh),
    ]);
    return { device, providers };
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
