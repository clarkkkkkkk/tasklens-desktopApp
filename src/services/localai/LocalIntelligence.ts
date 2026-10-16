import { nativeInvoke, onNativeEvent } from './native';
export interface IntelligenceStatus {
  revision?: number;
  state: 'preparing' | 'ready' | 'error';
  message: string;
  components: Record<string, { state: 'ready' | 'error'; message: string | null }>;
  elapsedMs?: number;
}
export const preparingIntelligence: IntelligenceStatus = {
  state: 'preparing',
  message: 'Preparing local intelligence…',
  components: {},
};
export function componentsReady(status: IntelligenceStatus, names: string[]): boolean {
  return (
    status.state === 'ready' || names.every((name) => status.components[name]?.state === 'ready')
  );
}
export async function watchLocalIntelligence(update: (status: IntelligenceStatus) => void) {
  let revision = -1;
  const accept = (next: IntelligenceStatus) => {
    if ((next.revision ?? 0) < revision) return;
    revision = next.revision ?? 0;
    update(next);
  };
  const dispose = await onNativeEvent<IntelligenceStatus>('local-intelligence-status', accept);
  // Subscribe before querying, and ignore a query overtaken by a newer event.
  try {
    accept(await nativeInvoke<IntelligenceStatus>('local_intelligence_status'));
  } catch (e) {
    if (revision < 0) {
      dispose();
      throw e;
    }
  }
  return dispose;
}
