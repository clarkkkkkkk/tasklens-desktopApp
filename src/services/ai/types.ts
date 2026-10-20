/**
 * Provider-agnostic AI contracts. The router, the extraction pipeline and the UI depend only on
 * these types; provider-specific formats, discovery and authentication stay inside adapters.
 */

/** What a model can do, independent of its name. */
export const aiCapabilities = [
  'text-generation',
  'structured-extraction',
  'image-understanding',
  'ocr',
  'summarization',
  'classification',
  'translation',
  'multilingual',
  'voice-transcription',
  'reasoning',
  'long-context',
  'json-output',
] as const;
export type AICapability = (typeof aiCapabilities)[number];

export const capabilityLabels: Record<AICapability, string> = {
  'text-generation': 'Text generation',
  'structured-extraction': 'Structured extraction',
  'image-understanding': 'Image understanding',
  ocr: 'Text recognition',
  summarization: 'Summarization',
  classification: 'Classification',
  translation: 'Translation',
  multilingual: 'Multilingual',
  'voice-transcription': 'Voice transcription',
  reasoning: 'Reasoning',
  'long-context': 'Long context',
  'json-output': 'JSON output',
};

/** Every real provider runs on this device; `mock` is the labelled demo provider. */
export type ProviderKind = 'local' | 'mock';
/** Hardware a runtime can use. The bundled llama.cpp build is CPU-only. */
export type Accelerator = 'cpu' | 'cuda' | 'rocm' | 'metal' | 'vulkan' | 'intel';
export type SpeedClass = 'slow' | 'moderate' | 'fast';
export type QualityClass = 'basic' | 'good' | 'excellent';
/**
 * Where a model's specifications came from. Detected facts (file size, parameter count,
 * quantization, context length) are preferred over hand-entered requirements.
 */
export type SpecSource = 'detected' | 'manifest' | 'declared' | 'example';

export interface ModelFootprint {
  parameterBillions?: number;
  /** e.g. Q4_K_M, Q8_0, F16. */
  quantization?: string;
  /** Size of the weights on disk. */
  fileBytes?: number;
  /** Maximum context window in tokens. */
  contextLength?: number;
}

export interface ModelRequirements {
  minRamGB?: number;
  recommendedRamGB?: number;
  minVramGB?: number;
  recommendedVramGB?: number;
  requiresGPU?: boolean;
}

export interface AIModel {
  /** Unique within its provider. */
  id: string;
  providerId: string;
  name: string;
  capabilities: AICapability[];
  footprint?: ModelFootprint;
  /** Used only when the footprint cannot be detected. */
  requirements?: ModelRequirements;
  estimatedPerformance?: { speedClass?: SpeedClass; qualityClass?: QualityClass };
  specSource: SpecSource;
  accelerators: Accelerator[];
  /** Verified/loaded and ready to run without further checks. */
  ready?: boolean;
}

export interface ProviderStatus {
  available: boolean;
  /** Plain-language reason when unavailable (or a caveat when available). */
  reason?: string;
}

export interface AIImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Base64 without a data: prefix. */
  base64: string;
}

/** One structured-output request. Never contains credentials. */
export interface AIRequest {
  jobId: string;
  modelId: string;
  /** Fixed system prompt (cacheable). */
  system: string;
  /** Source metadata and the citable source units. */
  user: string;
  /** What was wrong with the previous attempt, for the single repair retry. */
  repair?: string;
  /** JSON schema the answer must follow. */
  schema: object;
  maxOutputTokens: number;
  /** Attached only for image-capable models. */
  images?: AIImage[];
  signal: AbortSignal;
}

export interface AIResponse {
  /** Raw model text; always validated before use. */
  content: string;
  truncated: boolean;
  elapsedMs: number;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  /** User-facing runtime label, e.g. "llama.cpp (bundled)". */
  readonly runtime: string;
  isAvailable(): Promise<ProviderStatus>;
  getModels(): Promise<AIModel[]>;
  generate(request: AIRequest): Promise<AIResponse>;
  /** Optional warm-up while OCR runs (load weights, cache the fixed prompt prefix). */
  prepare?(modelId: string, system: string, signal: AbortSignal): Promise<void>;
}

export type ProviderErrorKind = 'unavailable' | 'rejected' | 'failed' | 'cancelled';

/** A provider failure. Messages are user-presentable and never include secrets or source text. */
export class AIProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly providerId: string,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

/** Stable key for a model across providers. */
export const modelKey = (model: Pick<AIModel, 'providerId' | 'id'>) =>
  `${model.providerId}/${model.id}`;
