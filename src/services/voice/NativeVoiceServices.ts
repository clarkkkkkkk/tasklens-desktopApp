import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  audioPreprocessor,
  transcriptSchema,
  type AudioSource,
  type VoiceCaptureService,
  type SpeechToTextService,
  type ModelManager,
  type ModelStatus,
} from './types';
const unavailable = 'Local voice and text processing requires the TaskLens desktop app.';
export function nativeAvailable() {
  return isTauri();
}
export async function nativeCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!nativeAvailable()) throw new Error(unavailable);
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(
      typeof error === 'string' ? error : 'Local processing could not complete. Please retry.',
    );
  }
}
export class NativeVoiceCapture implements VoiceCaptureService {
  readonly available = nativeAvailable();
  private unlisten?: () => void;
  async start(onLevel: (elapsed: number, level: number) => void) {
    const capturedAt = new Date().toISOString();
    let id: string | undefined;
    if (!this.available) throw new Error(unavailable);
    this.unlisten?.();
    this.unlisten = await listen<{ jobId: string; elapsedMs: number; level: number }>(
      'voice-level',
      ({ payload }) => {
        if (payload.jobId === id) onLevel(payload.elapsedMs, payload.level);
      },
    );
    try {
      id = await nativeCall<string>('voice_start');
      return { jobId: id, capturedAt };
    } catch (error) {
      this.unlisten?.();
      throw error;
    }
  }
  async stop(source: AudioSource) {
    try {
      await nativeCall('voice_stop', { id: source.jobId });
    } finally {
      this.unlisten?.();
    }
  }
  async importFile(file: File, signal: AbortSignal) {
    audioPreprocessor.validateFile(file);
    const jobId = await nativeCall<string>('voice_import_begin', {
      name: file.name,
      size: file.size,
    });
    try {
      for (let offset = 0; offset < file.size; offset += 262144) {
        signal.throwIfAborted();
        const bytes = Array.from(
          new Uint8Array(await file.slice(offset, offset + 262144).arrayBuffer()),
        );
        await nativeCall('voice_import_chunk', { id: jobId, bytes });
      }
      signal.throwIfAborted();
      return { jobId, fileName: file.name };
    } catch (error) {
      await this.cancel({ jobId });
      throw error;
    }
  }
  async cancel(source: AudioSource) {
    this.unlisten?.();
    await nativeCall('voice_cancel', { id: source.jobId });
  }
  async guardClose(onRequest: () => void) {
    if (!this.available) return () => {};
    return getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      onRequest();
    });
  }
}
export class NativeSpeechToText implements SpeechToTextService {
  async transcribe(
    source: AudioSource,
    signal: AbortSignal,
    progress: Parameters<SpeechToTextService['transcribe']>[2],
  ) {
    signal.throwIfAborted();
    const unlisten = await listen<{ jobId: string; stage: 'preprocessing' | 'transcribing' }>(
      'voice-progress',
      ({ payload }) => {
        if (payload.jobId === source.jobId) progress(payload.stage);
      },
    );
    const cancel = () => {
      void nativeCall('voice_cancel', { id: source.jobId }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await nativeCall('voice_transcribe', { id: source.jobId });
      signal.throwIfAborted();
      return transcriptSchema.parse(result);
    } finally {
      unlisten();
      signal.removeEventListener('abort', cancel);
    }
  }
}
export class NativeModelManager implements ModelManager {
  async list() {
    if (!nativeAvailable()) return [];
    return nativeCall<ModelStatus[]>('voice_models');
  }
  async validate(kind: ModelStatus['kind'], importFile: boolean) {
    await nativeCall('voice_validate_model', { kind, import: importFile });
  }
}
