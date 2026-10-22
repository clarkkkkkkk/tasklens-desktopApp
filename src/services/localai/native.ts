import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function nativeAvailable(): boolean {
  return isTauri();
}

export type LocalAIErrorCode =
  | 'OCR_FAILED'
  | 'OCR_NOT_INSTALLED'
  | 'RUNTIME_MISSING'
  | 'MODEL_NOT_INSTALLED'
  | 'MODEL_CORRUPTED'
  | 'MODEL_LOAD_FAILED'
  | 'MODEL_FAILED'
  | 'OCR_EMPTY'
  | 'VALIDATION_FAILED'
  | 'CANCELLED'
  | 'DESKTOP_REQUIRED'
  | 'NO_AI_AVAILABLE'
  | 'GROQ_STORAGE'
  | 'GROQ_RATE_LIMIT'
  | 'GROQ_DAILY_LIMIT'
  | 'GROQ_TIMEOUT'
  | 'GROQ_NETWORK'
  | 'GROQ_INVALID_KEY'
  | 'GROQ_MODEL_UNAVAILABLE'
  | 'GROQ_REQUEST_REJECTED'
  | 'GROQ_UNAVAILABLE'
  | 'GROQ_INVALID_OUTPUT'
  | 'GROQ_DISABLED'
  | 'GROQ_CONSENT'
  | 'GROQ_FORBIDDEN'
  | 'GROQ_DUPLICATE'
  | 'GROQ_QUEUE_FULL'
  | 'GROQ_INPUT_LIMIT'
  | 'UNKNOWN';

/** A user-presentable failure. Native messages are already free of paths and stack traces. */
export class LocalAIError extends Error {
  constructor(
    readonly code: LocalAIErrorCode,
    message: string,
    readonly detailCode?: string,
    readonly stage?: string,
    readonly retryAt?: number,
  ) {
    super(message);
    this.name = 'LocalAIError';
  }
}

const codes = new Set<string>([
  'GROQ_STORAGE',
  'GROQ_RATE_LIMIT',
  'GROQ_DAILY_LIMIT',
  'GROQ_TIMEOUT',
  'GROQ_NETWORK',
  'GROQ_INVALID_KEY',
  'GROQ_MODEL_UNAVAILABLE',
  'GROQ_REQUEST_REJECTED',
  'GROQ_UNAVAILABLE',
  'GROQ_INVALID_OUTPUT',
  'GROQ_DISABLED',
  'GROQ_CONSENT',
  'GROQ_FORBIDDEN',
  'GROQ_DUPLICATE',
  'GROQ_QUEUE_FULL',
  'GROQ_INPUT_LIMIT',
  'OCR_FAILED',
  'CANCELLED',
  'OCR_NOT_INSTALLED',
  'RUNTIME_MISSING',
  'MODEL_NOT_INSTALLED',
  'MODEL_CORRUPTED',
  'MODEL_LOAD_FAILED',
  'MODEL_FAILED',
]);

export function toLocalAIError(error: unknown): LocalAIError {
  if (error instanceof LocalAIError) return error;
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'Local processing could not complete. Please try again.';
  try {
    const failure =
      typeof error === 'object' && error !== null && 'code' in error ? error : JSON.parse(text);
    if (failure && codes.has(failure.code) && typeof failure.message === 'string')
      return new LocalAIError(
        failure.code as LocalAIErrorCode,
        failure.message,
        typeof failure.detailCode === 'string' ? failure.detailCode : undefined,
        typeof failure.stage === 'string' ? failure.stage : undefined,
        typeof failure.retryAt === 'number' ? failure.retryAt : undefined,
      );
  } catch {
    /* Legacy native string errors remain supported. */
  }
  const match = /^([A-Z_]+): (.*)$/s.exec(text);
  if (match && codes.has(match[1])) return new LocalAIError(match[1] as LocalAIErrorCode, match[2]);
  if (/cancelled/i.test(text)) return new LocalAIError('CANCELLED', 'Processing was cancelled.');
  return new LocalAIError('UNKNOWN', text);
}

export async function nativeInvoke<T>(
  command: string,
  args?: Record<string, unknown> | Uint8Array,
  headers?: Record<string, string>,
): Promise<T> {
  if (!nativeAvailable())
    throw new LocalAIError('DESKTOP_REQUIRED', 'Local AI requires the TaskLens desktop app.');
  try {
    return await invoke<T>(command, args, headers ? { headers } : undefined);
  } catch (error) {
    throw toLocalAIError(error);
  }
}

export async function cancelNativeJob(id: string): Promise<void> {
  if (!nativeAvailable()) return;
  await invoke('local_jobs_cancel', { id }).catch(() => {});
}

export async function onNativeEvent<T>(event: string, handler: (payload: T) => void) {
  if (!nativeAvailable()) return () => {};
  return listen<T>(event, ({ payload }) => handler(payload));
}
