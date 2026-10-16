import { expect, it, vi } from 'vitest';
import {
  componentsReady,
  watchLocalIntelligence,
  type IntelligenceStatus,
} from './LocalIntelligence';
import { nativeInvoke, onNativeEvent } from './native';
vi.mock('./native', () => ({ nativeInvoke: vi.fn(), onNativeEvent: vi.fn() }));
it('subscribes before querying and retains the newer event when a stale query arrives', async () => {
  const updates: IntelligenceStatus[] = [];
  const dispose = vi.fn();
  let event!: (status: IntelligenceStatus) => void;
  vi.mocked(onNativeEvent).mockImplementation(async (_name, callback) => {
    event = callback as typeof event;
    return dispose;
  });
  vi.mocked(nativeInvoke).mockImplementation(async () => {
    event({ revision: 2, state: 'ready', message: 'Local AI is ready.', components: {} });
    return {
      revision: 1,
      state: 'preparing',
      message: 'Preparing local intelligence…',
      components: {},
    };
  });
  const stop = await watchLocalIntelligence((next) => updates.push(next));
  expect(updates.map((v) => v.state)).toEqual(['ready']);
  stop();
  expect(dispose).toHaveBeenCalledOnce();
});
it('keeps text usable if only OCR fails, while speech and screenshots need their components', () => {
  const status: IntelligenceStatus = {
    state: 'error',
    message: 'Repair OCR',
    components: {
      extraction: { state: 'ready', message: null },
      'llama-server': { state: 'ready', message: null },
      tesseract: { state: 'error', message: 'Missing runtime' },
    },
  };
  expect(componentsReady(status, ['extraction', 'llama-server'])).toBe(true);
  expect(componentsReady(status, ['extraction', 'tesseract'])).toBe(false);
  expect(componentsReady(status, ['whisper', 'whisper-cli'])).toBe(false);
});
