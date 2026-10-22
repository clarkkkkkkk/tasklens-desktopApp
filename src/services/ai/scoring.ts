import type { DeviceAssessment } from './device';
import { estimateMemory, formatGB, qualityFromFootprint, type MemoryEstimate } from './footprint';
import type { AIPriority } from './policy';
import { OUTPUT_TOKENS, type TaskRequirements } from './requirements';
import {
  capabilityLabels,
  type AIModel,
  type ProviderKind,
  type ProviderStatus,
  type QualityClass,
  type SpeedClass,
} from './types';

/**
 * Weighted routing heuristics. The numbers express priorities, not benchmark results: they decide
 * which available model is the most sensible fit, and every score keeps its reasoning.
 */
export const dimensions = ['capability', 'device', 'quality', 'speed', 'reliability'] as const;
export type Dimension = (typeof dimensions)[number];
export type Weights = Record<Dimension, number>;

export const dimensionLabels: Record<Dimension, string> = {
  capability: 'Capability match',
  device: 'Device fit',
  quality: 'Expected quality',
  speed: 'Expected speed',
  reliability: 'Reliability',
};

/** Relative weights; `weightsForTask` normalizes them to 100. */
export const priorityWeights: Record<AIPriority, Weights> = {
  balanced: { capability: 30, device: 20, quality: 20, speed: 10, reliability: 5 },
  speed: { capability: 25, device: 20, quality: 10, speed: 30, reliability: 5 },
  quality: { capability: 30, device: 10, quality: 35, speed: 5, reliability: 5 },
};

/** Simple jobs favour fast, light models; complex or visual jobs favour capable ones. */
export function weightsForTask(base: Weights, requirements: TaskRequirements): Weights {
  const w = { ...base };
  if (requirements.complexity === 'simple') {
    w.quality -= 8;
    w.speed += 6;
  } else if (requirements.complexity === 'complex') {
    w.quality += 6;
    w.speed -= 4;
  }
  const total = dimensions.reduce((sum, d) => sum + Math.max(0, w[d]), 0);
  for (const d of dimensions) w[d] = (Math.max(0, w[d]) / total) * 100;
  return w;
}

export interface DimensionScore {
  /** 0–1. */
  score: number;
  /** Share of 100 after priority and task adjustments. */
  weight: number;
  points: number;
  note: string;
}

export interface ProviderMeta {
  id: string;
  name: string;
  kind: ProviderKind;
  runtime: string;
}

export interface ScoringContext {
  requirements: TaskRequirements;
  device: DeviceAssessment;
  weights: Weights;
  allowMock: boolean;
  /** Recent failures by model key, this session. */
  failures: number;
}

export type Offload = 'full' | 'partial' | 'none';

export type Evaluation =
  | {
      eligible: true;
      total: number;
      breakdown: Record<Dimension, DimensionScore>;
      memory?: MemoryEstimate;
      offload: Offload;
      speedClass: SpeedClass;
      qualityClass: QualityClass;
      /** Caveats worth showing even though the model is eligible. */
      cautions: string[];
      /** 1 when the model fits free memory; lower when it does not. */
      fitFactor: number;
    }
  | { eligible: false; reasons: string[] };

const SPEED_ORDER: SpeedClass[] = ['slow', 'moderate', 'fast'];
const step = (speed: SpeedClass, delta: number) =>
  SPEED_ORDER[Math.max(0, Math.min(2, SPEED_ORDER.indexOf(speed) + delta))];
const QUALITY_SCORE: Record<QualityClass, number> = { basic: 0.4, good: 0.7, excellent: 1 };
const SPEED_SCORE: Record<SpeedClass, number> = { slow: 0.3, moderate: 0.65, fast: 1 };

function offloadFor(model: AIModel, device: DeviceAssessment, memory?: MemoryEstimate): Offload {
  const usable = model.accelerators.some((a) => a !== 'cpu' && device.accelerators.includes(a));
  if (!usable || device.vramBudgetGB === null || !memory) return 'none';
  if (memory.weightsGB + 0.5 <= device.vramBudgetGB) return 'full';
  if (memory.weightsGB <= device.vramBudgetGB * 2) return 'partial';
  return 'none';
}

export function evaluate(
  model: AIModel,
  provider: ProviderMeta,
  status: ProviderStatus,
  ctx: ScoringContext,
): Evaluation {
  const { requirements: req, device } = ctx;
  const reasons: string[] = [];
  if (!status.available) reasons.push(status.reason ?? `${provider.name} is not available`);
  if (provider.kind === 'mock' && !ctx.allowMock)
    reasons.push('Demo / Mock AI is used only for demos, previews and tests');
  const missing = req.required.filter((c) => !model.capabilities.includes(c));
  if (missing.length)
    reasons.push(`Can't do ${missing.map((c) => capabilityLabels[c].toLowerCase()).join(' or ')}`);
  const context = model.footprint?.contextLength;
  if (context && req.estimatedInputTokens + OUTPUT_TOKENS > context)
    reasons.push(
      `Source is longer than its context window (needs ~${Math.round((req.estimatedInputTokens + OUTPUT_TOKENS) / 1000)}k tokens, has ${Math.round(context / 1000)}k)`,
    );
  const memory = provider.kind === 'local' ? estimateMemory(model) : undefined;
  if (memory && device.totalRamGB !== null && memory.minRamGB > device.totalRamGB * 0.8)
    reasons.push(
      `Too large for this device (needs ~${formatGB(memory.minRamGB)}; ${formatGB(device.totalRamGB)} RAM installed)`,
    );
  const offload = offloadFor(model, device, memory);
  if (model.requirements?.requiresGPU && offload === 'none')
    reasons.push('Needs a GPU this runtime can use');
  if (reasons.length) return { eligible: false, reasons };

  const cautions: string[] = [];
  const preferredTotal = req.preferred.reduce((sum, p) => sum + p.weight, 0);
  const met = req.preferred.filter((p) => model.capabilities.includes(p.capability));
  const metWeight = met.reduce((sum, p) => sum + p.weight, 0);
  const capability = preferredTotal ? 0.55 + 0.45 * (metWeight / preferredTotal) : 1;
  const unmet = req.preferred.filter((p) => !model.capabilities.includes(p.capability));

  // Device fit: judged by memory headroom.
  let deviceScore = 1;
  let deviceNote =
    provider.kind === 'cloud'
      ? 'Runs on Groq; requires internet, consent and your API key'
      : 'Runs anywhere';
  /**
   * A model that does not fit in free memory keeps only part of its score: being capable on
   * paper must not outrank a smaller model that actually fits. It is not excluded, so a device
   * whose only model is too big right now can still try it.
   */
  let fitFactor = 1;
  if (provider.kind === 'local') {
    const budget = offload === 'full' ? device.vramBudgetGB : device.ramBudgetGB;
    if (!memory || budget === null) {
      deviceScore = 0.6;
      deviceNote = memory ? 'Available memory could not be measured' : 'Memory needs unknown';
    } else if (budget >= memory.recommendedRamGB) {
      deviceScore = 1;
      deviceNote = `Fits within estimated available memory with a comfortable margin (needs ~${formatGB(memory.minRamGB)}, about ${formatGB(budget)} free${offload === 'full' ? ' on the GPU' : ''})`;
    } else if (budget >= memory.minRamGB * 1.15) {
      deviceScore = 0.8;
      deviceNote = `Fits within estimated available memory with a reasonable safety margin (needs ~${formatGB(memory.minRamGB)}, about ${formatGB(budget)} free)`;
    } else if (budget >= memory.minRamGB) {
      deviceScore = 0.55;
      deviceNote = `Fits, but memory is tight (needs ~${formatGB(memory.minRamGB)}, about ${formatGB(budget)} free)`;
      cautions.push('Memory is tight; closing other apps may help');
    } else {
      deviceScore = 0.2;
      fitFactor = budget >= memory.minRamGB * 0.7 ? 0.6 : 0.45;
      deviceNote = `Needs ~${formatGB(memory.minRamGB)} but only about ${formatGB(budget)} is free right now`;
      cautions.push('May be slow or fail while memory is low');
    }
    if (device.performanceClass === 'low' && memory && memory.weightsGB > 3) deviceScore -= 0.15;
    // Simple jobs should not occupy a large model: prefer the lightest one that can do them.
    if (req.complexity === 'simple' && memory)
      deviceScore -= Math.min(0.4, Math.max(0, (memory.weightsGB - 2) / 10));
  }

  const declaredQuality = model.estimatedPerformance?.qualityClass;
  const qualityClass = declaredQuality ?? qualityFromFootprint(model.footprint) ?? 'good';
  let quality = provider.kind === 'mock' ? 0 : QUALITY_SCORE[qualityClass];
  const vision = model.capabilities.includes('image-understanding');
  if (req.visualSignal === 'strong' && !vision) quality -= 0.25;
  else if (req.visualSignal === 'some' && !vision) quality -= 0.1;
  if (req.multilingual && !model.capabilities.includes('multilingual')) quality -= 0.15;

  let speedClass: SpeedClass = model.estimatedPerformance?.speedClass ?? 'moderate';
  if (provider.kind === 'local' && memory) {
    speedClass =
      offload === 'full'
        ? memory.weightsGB <= 6
          ? 'fast'
          : 'moderate'
        : offload === 'partial'
          ? 'moderate'
          : memory.weightsGB <= 1.5
            ? 'fast'
            : memory.weightsGB <= 3
              ? 'moderate'
              : 'slow';
    if (device.performanceClass === 'low') speedClass = step(speedClass, -1);
    if (offload !== 'full' && req.estimatedInputTokens > 5000) speedClass = step(speedClass, -1);
  }

  const reliability = Math.max(
    0,
    (provider.kind === 'mock' || model.ready ? 1 : 0.75) - 0.35 * ctx.failures,
  );
  if (ctx.failures) cautions.push('Failed earlier in this session');
  // A provider that keeps failing should stop winning, not just lose a few reliability points.
  const sessionFactor = Math.max(0.55, 1 - 0.15 * ctx.failures);

  const raw: Record<Dimension, [number, string]> = {
    capability: [
      capability,
      unmet.length
        ? `Missing: ${unmet.map((p) => capabilityLabels[p.capability].toLowerCase()).join(', ')}`
        : met.length
          ? `Has ${met.map((p) => capabilityLabels[p.capability].toLowerCase()).join(', ')}`
          : 'Meets every requirement',
    ],
    device: [Math.max(0, Math.min(1, deviceScore)), deviceNote],
    quality: [
      Math.max(0, Math.min(1, quality)),
      `${qualityClass[0].toUpperCase()}${qualityClass.slice(1)} expected quality`,
    ],
    speed: [
      SPEED_SCORE[speedClass],
      provider.kind === 'cloud'
        ? 'Online latency varies; not benchmarked'
        : `${speedClass[0].toUpperCase()}${speedClass.slice(1)} on this device`,
    ],
    reliability: [reliability, model.ready ? 'Verified and ready' : 'Not verified yet'],
  };
  const breakdown = {} as Record<Dimension, DimensionScore>;
  let total = 0;
  for (const d of dimensions) {
    const [score, note] = raw[d];
    const points = score * ctx.weights[d] * fitFactor * sessionFactor;
    breakdown[d] = { score, weight: ctx.weights[d], points, note };
    total += points;
  }
  return {
    eligible: true,
    total,
    breakdown,
    memory,
    offload,
    speedClass,
    qualityClass,
    cautions,
    fitFactor,
  };
}
