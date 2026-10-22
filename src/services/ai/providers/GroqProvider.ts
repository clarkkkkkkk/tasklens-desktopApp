import { nativeAvailable, nativeInvoke, onNativeEvent } from '../../localai/native';
import { appendRepair } from '../../extraction/prompts/build-prompt';
import {
  AIProviderError,
  type AIModel,
  type AIProcessingStatus,
  type AIProvider,
  type AIRequest,
  type AIResponse,
} from '../types';

export const GROQ_MODEL = 'openai/gpt-oss-20b';
export interface GroqStatus {
  connected: boolean;
  verified?: boolean;
  providerReachable?: boolean;
  connectivity?: 'online' | 'offline' | 'unknown';
  resumeRequired?: boolean;
  storage: 'persistent' | 'session' | 'none';
  consent: boolean;
  enabled: boolean;
  dailyUsed: number;
  dailyLimit: number;
  retryAt?: number | null;
  removalIncomplete: boolean;
  remainingTokens?: number | null;
}
export const disconnectedGroq: GroqStatus = {
  connected: false,
  verified: false,
  providerReachable: false,
  connectivity: 'unknown',
  resumeRequired: false,
  storage: 'none',
  consent: false,
  enabled: false,
  dailyUsed: 0,
  dailyLimit: 10,
  removalIncomplete: false,
};
export const groqConnection = {
  status: () =>
    nativeAvailable() ? nativeInvoke<GroqStatus>('groq_status') : Promise.resolve(disconnectedGroq),
  connect: (key: string) => nativeInvoke<GroqStatus>('groq_connect', { key }),
  verify: () => nativeInvoke<GroqStatus>('groq_verify'),
  disconnect: () => nativeInvoke<GroqStatus>('groq_disconnect'),
  openLink: (destination: 'keys' | 'data-policy') =>
    nativeInvoke<void>('groq_open_link', { destination }),
  configure: (enabled: boolean, consent = false, resume = false) =>
    nativeAvailable()
      ? nativeInvoke<GroqStatus>('groq_configure', { enabled, consent, resume })
      : Promise.resolve(disconnectedGroq),
};

/** Shared semantic schema, projected to Groq's conservative strict-output subset. */
export function groqSchema(schema: object): object {
  const omitted = new Set([
    'minLength',
    'maxLength',
    'pattern',
    'minItems',
    'maxItems',
    'minimum',
    'maximum',
  ]);
  const project = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(project);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !omitted.has(key))
        .map(([key, child]) => [key, project(child)]),
    );
  };
  return project(schema) as object;
}
export interface GroqNative {
  status(): Promise<GroqStatus>;
  begin(
    id: string,
    fingerprint: string,
    signal: AbortSignal,
    onStatus?: (status: AIProcessingStatus) => void,
  ): Promise<void>;
  finish(id: string): Promise<void>;
  generate(id: string, request: object, signal: AbortSignal): Promise<AIResponse>;
}
const listeners = new Map<string, () => void>();
const nativeGroq: GroqNative = {
  status: groqConnection.status,
  async begin(id, fingerprint, signal, onStatus) {
    signal.throwIfAborted();
    const unlisten = await onNativeEvent<AIProcessingStatus & { id: string }>(
      'groq-progress',
      (event) => {
        if (event.id === id && !signal.aborted) onStatus?.(event);
      },
    );
    const cancel = () => {
      void nativeInvoke('groq_finish', { id }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    listeners.set(id, () => {
      unlisten();
      signal.removeEventListener('abort', cancel);
    });
    signal.throwIfAborted();
    await nativeInvoke('groq_begin', { id, fingerprint });
    signal.throwIfAborted();
  },
  async finish(id) {
    listeners.get(id)?.();
    listeners.delete(id);
    await nativeInvoke('groq_finish', { id });
    window.dispatchEvent(new Event('tasklens-groq-change'));
  },
  async generate(id, request, signal) {
    signal.throwIfAborted();
    const result = await nativeInvoke<AIResponse>('groq_generate', { id, request });
    signal.throwIfAborted();
    return result;
  },
};
export class GroqProvider implements AIProvider {
  readonly id = 'groq';
  readonly name = 'Groq Cloud';
  readonly kind = 'cloud' as const;
  readonly runtime = 'Groq HTTPS · your API key';
  constructor(private readonly native: GroqNative = nativeGroq) {}
  async isAvailable() {
    const status = await this.native.status();
    return {
      available: status.connected,
      reason: status.connected ? undefined : 'Connect your Groq API key in Settings',
    };
  }
  async getModels(): Promise<AIModel[]> {
    return [
      {
        id: GROQ_MODEL,
        providerId: this.id,
        name: 'GPT-OSS 20B',
        capabilities: ['text-generation', 'structured-extraction', 'json-output', 'multilingual'],
        specSource: 'declared',
        accelerators: [],
      },
    ];
  }
  beginExtraction(
    id: string,
    fingerprint: string,
    signal: AbortSignal,
    onStatus?: (status: AIProcessingStatus) => void,
  ) {
    return this.native.begin(id, fingerprint, signal, onStatus);
  }
  endExtraction(id: string) {
    return this.native.finish(id);
  }
  async generate(request: AIRequest): Promise<AIResponse> {
    if (request.images?.length || request.modelId !== GROQ_MODEL || !request.extractionId)
      throw new AIProviderError('rejected', 'Groq accepts text extraction sessions only.', this.id);
    return this.native.generate(
      request.extractionId,
      {
        system: request.system,
        user: appendRepair(request.user, request.repair),
        schema: groqSchema(request.schema),
        maxOutputTokens: Math.min(4096, request.maxOutputTokens),
      },
      request.signal,
    );
  }
}
