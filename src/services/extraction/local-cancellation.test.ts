import { expect, it, vi } from 'vitest';
const call = vi.hoisted(() => vi.fn());
vi.mock('../voice/NativeVoiceServices', () => ({ nativeCall: call }));
import { LocalExtractionService } from './LocalExtractionService';
it('cancels a prepared native job if aborted while registration is pending', async () => {
  let release!: (id: string) => void;
  call.mockImplementation((name: string) =>
    name === 'local_prepare'
      ? new Promise<string>((resolve) => {
          release = resolve;
        })
      : Promise.resolve(),
  );
  const controller = new AbortController();
  const result = new LocalExtractionService().extract(
    { type: 'text', text: 'Bring an ID tomorrow', capturedAt: '2026-10-11T04:00:00.000Z' },
    { signal: controller.signal, onProgress: () => {} },
  );
  const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  release('registered-native-job');
  await assertion;
  expect(call).toHaveBeenCalledWith('voice_cancel', { id: 'registered-native-job' });
  expect(call.mock.calls.some(([name]) => name === 'local_extract')).toBe(false);
});
