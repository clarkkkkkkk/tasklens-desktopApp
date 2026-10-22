import { nativeAvailable, nativeInvoke } from './native';
export type DiagnosticStage =
  | 'selection'
  | 'preparing_image'
  | 'reading_text'
  | 'routing'
  | 'readiness'
  | 'inference'
  | 'validation'
  | 'review';
let recording = false;
export async function diagnosticSession(enabled?: boolean) {
  if (!nativeAvailable()) return { enabled: false, events: [] };
  const result = await nativeInvoke<{
    enabled: boolean;
    events: unknown[];
    build?: unknown;
    runtimeReceipt?: unknown;
  }>('local_diagnostics_session', { enabled: enabled ?? null });
  recording = result.enabled;
  return result;
}
export function diagnosticStage(
  traceId: string,
  stage: DiagnosticStage,
  event: 'start' | 'end' | 'failed' | 'cancelled',
) {
  if (recording && nativeAvailable())
    void nativeInvoke('local_diagnostics_stage', { traceId, stage, event }).catch(() => {});
}

export const diagnosticIdentity = () => nativeInvoke('local_diagnostics_identity');
