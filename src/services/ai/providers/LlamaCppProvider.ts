import assets from '../../../../src-tauri/resources/models.json';
import { qwenChatPrompt, qwenPromptPrefix } from '../../extraction/prompts/build-prompt';
import type { IntelligenceStatus } from '../../localai/LocalIntelligence';
import type { LocalAIStatus, LocalModelManager } from '../../localai/LocalModelManager';
import { parseModelName } from '../footprint';
import type { AICapability, AIModel, AIProvider, AIRequest, ProviderStatus } from '../types';

export const LLAMA_PROVIDER_ID = 'llama-cpp';
const READINESS_COMPONENTS = ['extraction', 'llama-server'];

/** The bundled extraction model, described from the manifest and the detected file. */
export function bundledModel(status: LocalAIStatus | null, contextSize: number): AIModel {
  const spec = assets.extraction;
  return {
    id: spec.file,
    providerId: LLAMA_PROVIDER_ID,
    name: spec.model,
    capabilities: spec.capabilities as AICapability[],
    footprint: {
      ...parseModelName(spec.file),
      quantization: spec.quantization,
      fileBytes: status?.model.bytes ?? spec.bytes,
      contextLength: contextSize,
    },
    specSource: status?.model.bytes ? 'detected' : 'manifest',
    // The bundled llama.cpp sidecars are CPU builds (baseline/AVX2).
    accelerators: ['cpu'],
    ready: status?.model.state === 'verified',
  };
}

/** The TaskLens-managed llama.cpp runtime with the bundled GGUF model. */
export class LlamaCppProvider implements AIProvider {
  readonly id = LLAMA_PROVIDER_ID;
  readonly name = 'llama.cpp (bundled)';
  readonly kind = 'local' as const;
  readonly runtime = 'Bundled llama.cpp';

  constructor(
    private readonly manager: LocalModelManager,
    private readonly readiness: () => IntelligenceStatus | null = () => null,
    private readonly contextSize: () => number = () => 8192,
  ) {}

  async isAvailable(): Promise<ProviderStatus> {
    if (!this.manager.available)
      return { available: false, reason: 'Requires the TaskLens desktop app' };
    const readiness = this.readiness();
    if (readiness && readiness.state !== 'ready') {
      const failed = READINESS_COMPONENTS.map((name) => readiness.components[name]).find(
        (c) => c?.state === 'error',
      );
      if (failed)
        return {
          available: false,
          reason: failed.message?.replace(/^[A-Z_]+: /, '') ?? readiness.message,
        };
      if (!READINESS_COMPONENTS.every((name) => readiness.components[name]?.state === 'ready'))
        return { available: false, reason: readiness.message };
    }
    const status = await this.manager.getModelStatus().catch(() => null);
    if (!status) return { available: false, reason: 'Could not read the bundled model status' };
    if (status.model.state === 'not_installed')
      return { available: false, reason: 'The bundled model is missing. Reinstall TaskLens.' };
    if (status.model.state === 'corrupted')
      return {
        available: false,
        reason: 'The bundled model file is damaged. Validate or reinstall it.',
      };
    if (!status.runtime.binaryFound)
      return { available: false, reason: 'The llama.cpp runtime is missing from this build' };
    return { available: true };
  }

  async getModels(): Promise<AIModel[]> {
    const status = this.manager.available
      ? await this.manager.getModelStatus().catch(() => null)
      : null;
    return [bundledModel(status, this.contextSize())];
  }

  async generate(request: AIRequest) {
    const { content, truncated, elapsedMs } = await this.manager.complete(
      {
        jobId: request.jobId,
        prompt: qwenChatPrompt(request.system, request.user, request.repair),
        schema: request.schema,
        maxTokens: request.maxOutputTokens,
      },
      request.signal,
    );
    return { content, truncated, elapsedMs };
  }

  /** Loads the model and caches the fixed prompt prefix while OCR runs. */
  prepare(_modelId: string, system: string, signal: AbortSignal) {
    return this.manager.prewarm(qwenPromptPrefix(system), signal);
  }
}
