import type { AIModel, ModelFootprint, QualityClass } from './types';

const GB = 1024 ** 3;

/**
 * Approximate bits per weight for common GGUF quantizations. Used only when the file size is
 * unknown; real file sizes always win.
 */
const BITS_PER_WEIGHT: [RegExp, number][] = [
  [/^(F32|FP32)$/, 32],
  [/^(F16|FP16|BF16)$/, 16],
  [/^Q8/, 8.5],
  [/^Q6/, 6.6],
  [/^Q5/, 5.7],
  [/^(Q4_K|Q4_K_M|Q4_K_S)$/, 4.85],
  [/^(Q4|IQ4)/, 4.5],
  [/^(Q3|IQ3)/, 3.9],
  [/^(Q2|IQ2)/, 3.0],
  [/^(Q1|IQ1)/, 2.0],
];

export function bitsPerWeight(quantization?: string): number | undefined {
  if (!quantization) return undefined;
  const q = quantization.toUpperCase();
  return BITS_PER_WEIGHT.find(([pattern]) => pattern.test(q))?.[1];
}

/**
 * Reads the parameter count and quantization from a model or file name such as
 * "Qwen3-4B-Q4_K_M.gguf" or "qwen2.5vl:7b". Generic parsing only; no model is special-cased.
 */
export function parseModelName(
  name: string,
): Pick<ModelFootprint, 'parameterBillions' | 'quantization'> {
  const params = /(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*([bm])(?![a-z])/i.exec(name);
  const quant = /\b((?:I?Q\d(?:_[A-Z0-9]+)*)|BF16|F16|FP16|F32)\b/i.exec(
    name.replace(/[-.:]/g, ' '),
  );
  const value = params ? Number(params[1]) / (params[2].toLowerCase() === 'm' ? 1000 : 1) : NaN;
  return {
    ...(Number.isFinite(value) && value > 0 && value < 2000 ? { parameterBillions: value } : {}),
    ...(quant ? { quantization: quant[1].toUpperCase() } : {}),
  };
}

/** Parses Ollama's "7.6B" / "494.03M" parameter sizes. */
export function parseParameterSize(text?: string): number | undefined {
  const match = text && /^(\d+(?:\.\d+)?)\s*([BMK])$/i.exec(text.trim());
  if (!match) return undefined;
  const scale = { B: 1, M: 1e-3, K: 1e-6 }[match[2].toUpperCase() as 'B' | 'M' | 'K'];
  return Number(match[1]) * scale;
}

/** Bytes of weights: the detected file size, else parameters × bits per weight. */
export function weightBytes(footprint?: ModelFootprint): number | undefined {
  if (!footprint) return undefined;
  if (footprint.fileBytes) return footprint.fileBytes;
  const bits = bitsPerWeight(footprint.quantization) ?? (footprint.parameterBillions ? 4.85 : 0);
  return footprint.parameterBillions && bits
    ? (footprint.parameterBillions * 1e9 * bits) / 8
    : undefined;
}

export interface MemoryEstimate {
  weightsGB: number;
  /** Weights + KV cache for the working context + runtime overhead. */
  minRamGB: number;
  /** Minimum plus headroom so the rest of the system stays responsive. */
  recommendedRamGB: number;
  /** How the numbers were obtained, for explanations. */
  basis: 'file size' | 'parameters and quantization' | 'declared requirements';
}

/** Working context TaskLens uses for extraction (prompt + output). */
export const WORKING_CONTEXT_TOKENS = 8192;

/**
 * Rough memory needs. KV cache grows with context and model size; the constants are
 * conservative heuristics for grouped-query-attention models, not measurements.
 */
export function estimateMemory(model: AIModel): MemoryEstimate | undefined {
  const weights = weightBytes(model.footprint);
  if (weights) {
    const weightsGB = weights / GB;
    const params = model.footprint?.parameterBillions ?? weightsGB * 1.65;
    const context = Math.min(
      model.footprint?.contextLength ?? WORKING_CONTEXT_TOKENS,
      WORKING_CONTEXT_TOKENS,
    );
    const kvGB = (context / 8192) * (0.25 + 0.1 * params);
    const visionGB =
      model.capabilities.includes('image-understanding') && !model.footprint?.fileBytes ? 0.6 : 0;
    const minRamGB = weightsGB + kvGB + visionGB + 0.3;
    return {
      weightsGB,
      minRamGB,
      recommendedRamGB: minRamGB * 1.3 + 1,
      basis: model.footprint?.fileBytes ? 'file size' : 'parameters and quantization',
    };
  }
  const declared = model.requirements;
  if (declared?.minRamGB)
    return {
      weightsGB: declared.minRamGB * 0.7,
      minRamGB: declared.minRamGB,
      recommendedRamGB: declared.recommendedRamGB ?? declared.minRamGB * 1.3 + 1,
      basis: 'declared requirements',
    };
  return undefined;
}

/**
 * Expected extraction quality from size and quantization. A heuristic for routing, not a
 * benchmark: larger models follow complex schemas more reliably; very low-bit quantization loses
 * accuracy.
 */
export function qualityFromFootprint(footprint?: ModelFootprint): QualityClass | undefined {
  const params = footprint?.parameterBillions;
  if (!params) return undefined;
  const order: QualityClass[] = ['basic', 'good', 'excellent'];
  let index = params >= 14 ? 2 : params >= 3 ? 1 : 0;
  const bits = bitsPerWeight(footprint?.quantization);
  if (bits !== undefined && bits < 4) index = Math.max(0, index - 1);
  return order[index];
}

export const formatGB = (gb: number) =>
  `${gb >= 10 || Math.abs(gb - Math.round(gb)) < 0.05 ? Math.round(gb) : gb.toFixed(1)} GB`;
