import type { OcrStatus } from '../ocr/types';
import { cancelNativeJob, nativeAvailable, nativeInvoke, onNativeEvent } from './native';

export type ModelFileState = 'not_installed' | 'unverified' | 'verified' | 'corrupted';
export type RuntimeState = 'stopped' | 'loading' | 'ready' | 'processing' | 'failed';

export interface ModelMetadata {
  name: string;
  publisher: string;
  license: string;
  quantization: string;
  file: string;
  expectedBytes: number;
  sha256: string;
  source: string;
  path: string | null;
  bytes: number | null;
  state: ModelFileState;
}
export interface RuntimeStatus {
  state: RuntimeState;
  message: string;
  binaryFound?: boolean;
  binaryName?: string;
  cpuVariant?: 'baseline' | 'avx2';
}
export interface LocalAIStatus {
  model: ModelMetadata;
  runtime: RuntimeStatus;
  ocr: OcrStatus;
  localOnly: true;
}
export interface RuntimeConfig {
  contextSize: number;
  threads: number | null;
}
export interface CompletionResult {
  content: string;
  truncated: boolean;
  elapsedMs: number;
  timings: Record<string, number> | null;
}

/** Manages the on-device model and its llama.cpp runtime. */
export interface LocalModelManager {
  readonly available: boolean;
  getModelStatus(): Promise<LocalAIStatus | null>;
  importModel(): Promise<LocalAIStatus>;
  validateModel(): Promise<LocalAIStatus>;
  loadModel(): Promise<LocalAIStatus>;
  unloadModel(): Promise<LocalAIStatus>;
  reloadModel(): Promise<LocalAIStatus>;
  importOcrLanguages(): Promise<OcrStatus>;
  setConfig(config: RuntimeConfig): void;
  complete(
    request: { jobId: string; prompt: string; schema: object; maxTokens: number },
    signal: AbortSignal,
  ): Promise<CompletionResult>;
  diagnostics(): Promise<{ runtimeLog: string[] }>;
  onRuntimeStatus(listener: (status: RuntimeStatus) => void): Promise<() => void>;
}

export class NativeLocalModelManager implements LocalModelManager {
  readonly available = nativeAvailable();
  private config: RuntimeConfig = { contextSize: 8192, threads: null };

  setConfig(config: RuntimeConfig) {
    this.config = config;
  }
  async getModelStatus() {
    if (!this.available) return null;
    return nativeInvoke<LocalAIStatus>('local_ai_status');
  }
  importModel() {
    return nativeInvoke<LocalAIStatus>('local_ai_import_model');
  }
  validateModel() {
    return nativeInvoke<LocalAIStatus>('local_ai_validate_model');
  }
  loadModel() {
    return nativeInvoke<LocalAIStatus>('local_ai_load', { config: this.config });
  }
  unloadModel() {
    return nativeInvoke<LocalAIStatus>('local_ai_unload');
  }
  reloadModel() {
    return nativeInvoke<LocalAIStatus>('local_ai_load', { config: this.config, restart: true });
  }
  importOcrLanguages() {
    return nativeInvoke<OcrStatus>('ocr_import_languages');
  }
  diagnostics() {
    return nativeInvoke<{ runtimeLog: string[] }>('local_ai_diagnostics');
  }
  async complete(
    request: { jobId: string; prompt: string; schema: object; maxTokens: number },
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const cancel = () => void cancelNativeJob(request.jobId);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await nativeInvoke<CompletionResult>('local_ai_complete', {
        id: request.jobId,
        prompt: request.prompt,
        schema: request.schema,
        maxTokens: request.maxTokens,
        config: this.config,
      });
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
  onRuntimeStatus(listener: (status: RuntimeStatus) => void) {
    return onNativeEvent<RuntimeStatus>('local-ai-status', listener);
  }
}
