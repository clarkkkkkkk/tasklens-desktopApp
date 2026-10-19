import { appendRepair } from '../../extraction/prompts/build-prompt';
import { cancelNativeJob, nativeAvailable, nativeInvoke } from '../../localai/native';
import { parseModelName, parseParameterSize } from '../footprint';
import { estimateTokens } from '../requirements';
import {
  AIProviderError,
  type AICapability,
  type AIModel,
  type AIProvider,
  type AIRequest,
  type ProviderStatus,
} from '../types';

export const OLLAMA_PROVIDER_ID = 'ollama';

/** What the native side reports about a local Ollama server on 127.0.0.1:11434. */
export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
  parameterSize?: string | null;
  quantization?: string | null;
  family?: string | null;
  /** From /api/show, e.g. ["completion", "vision", "thinking"]. Absent on older servers. */
  capabilities?: string[] | null;
  contextLength?: number | null;
}
export interface OllamaDiscovery {
  running: boolean;
  version?: string | null;
  models: OllamaModelInfo[];
}
export interface OllamaChatResult {
  content: string;
  truncated: boolean;
  elapsedMs: number;
}
export interface OllamaNative {
  discover(): Promise<OllamaDiscovery>;
  chat(id: string, body: object, signal: AbortSignal): Promise<OllamaChatResult>;
}

/** Rust reaches Ollama through the loopback-only HTTP client; the webview never does. */
export const nativeOllama: OllamaNative = {
  discover: () =>
    nativeAvailable()
      ? nativeInvoke<OllamaDiscovery>('ai_ollama_discover')
      : Promise.resolve({ running: false, models: [] }),
  async chat(id, body, signal) {
    signal.throwIfAborted();
    const cancel = () => void cancelNativeJob(id);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await nativeInvoke<OllamaChatResult>('ai_ollama_chat', { id, body });
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  },
};

const BASE_CAPABILITIES: AICapability[] = [
  'text-generation',
  'structured-extraction',
  'json-output',
  'summarization',
  'classification',
];

export function ollamaModel(info: OllamaModelInfo): AIModel | null {
  const caps = info.capabilities ?? [];
  // Embedding-only models cannot generate text.
  if (caps.length ? !caps.includes('completion') : /embed/i.test(info.name)) return null;
  const capabilities = [...BASE_CAPABILITIES];
  if (caps.includes('vision')) capabilities.push('image-understanding');
  if ((info.contextLength ?? 0) >= 32768) capabilities.push('long-context');
  if (caps.includes('thinking')) capabilities.push('reasoning');
  const parsed = parseModelName(info.name);
  return {
    id: info.name,
    providerId: OLLAMA_PROVIDER_ID,
    name: info.name,
    capabilities,
    footprint: {
      parameterBillions:
        parseParameterSize(info.parameterSize ?? undefined) ?? parsed.parameterBillions,
      quantization: info.quantization ?? parsed.quantization,
      fileBytes: info.sizeBytes || undefined,
      contextLength: info.contextLength ?? undefined,
    },
    privacy: 'local',
    supportsOffline: true,
    cost: 'free',
    specSource: 'detected',
    // Ollama offloads to whatever GPU backend the system has.
    accelerators: ['cpu', 'cuda', 'rocm', 'metal'],
    ready: true,
  };
}

/** Models served by a local Ollama installation. Nothing leaves this computer. */
export class OllamaProvider implements AIProvider {
  readonly id = OLLAMA_PROVIDER_ID;
  readonly name = 'Ollama';
  readonly kind = 'local' as const;
  readonly runtime = 'Ollama on this computer';
  private discovery?: { at: number; value: Promise<OllamaDiscovery> };
  private thinking = new Set<string>();

  constructor(
    private readonly native: OllamaNative = nativeOllama,
    private readonly enabled: () => boolean = () => true,
  ) {}

  private discover(): Promise<OllamaDiscovery> {
    if (this.discovery && Date.now() - this.discovery.at < 3000) return this.discovery.value;
    const value = this.native
      .discover()
      .catch(() => ({ running: false, models: [] }) as OllamaDiscovery);
    this.discovery = { at: Date.now(), value };
    return value;
  }

  async isAvailable(): Promise<ProviderStatus> {
    if (!this.enabled()) return { available: false, reason: 'Turned off in Settings' };
    const found = await this.discover();
    if (!found.running)
      return { available: false, reason: 'Ollama is not running on this computer' };
    if (!found.models.length) return { available: false, reason: 'Ollama has no models installed' };
    return { available: true };
  }

  async getModels(): Promise<AIModel[]> {
    if (!this.enabled()) return [];
    const found = await this.discover();
    this.thinking = new Set(
      found.models.filter((m) => m.capabilities?.includes('thinking')).map((m) => m.name),
    );
    return found.models.map(ollamaModel).filter((m): m is AIModel => !!m);
  }

  async generate(request: AIRequest) {
    const user = appendRepair(request.user, request.repair);
    const needed = estimateTokens(request.system + user) + request.maxOutputTokens + 512;
    const body = {
      model: request.modelId,
      messages: [
        { role: 'system', content: request.system },
        {
          role: 'user',
          content: user,
          ...(request.images?.length ? { images: request.images.map((i) => i.base64) } : {}),
        },
      ],
      format: request.schema,
      ...(this.thinking.has(request.modelId) ? { think: false } : {}),
      options: {
        temperature: 0,
        seed: 7,
        num_predict: request.maxOutputTokens,
        num_ctx: Math.min(32768, Math.max(8192, Math.ceil(needed / 1024) * 1024)),
      },
    };
    try {
      return await this.native.chat(request.jobId, body, request.signal);
    } catch (error) {
      if (request.signal.aborted) throw error;
      throw new AIProviderError(
        'failed',
        error instanceof Error
          ? error.message.replace(/^[A-Z_]+: /, '')
          : 'Ollama did not respond.',
        this.id,
      );
    }
  }
}
