import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
import { NativeVoiceCapture, NativeSpeechToText } from './NativeVoiceServices';
it('late cancellation of an old recording cannot detach the new recording listener', async () => {
  const firstListener = vi.fn(),
    secondListener = vi.fn();
  mocks.listen.mockResolvedValueOnce(firstListener).mockResolvedValueOnce(secondListener);
  mocks.invoke.mockResolvedValueOnce('first').mockResolvedValueOnce('second');
  const capture = new NativeVoiceCapture();
  const first = await capture.start(() => {});
  const second = await capture.start(() => {});
  await capture.cancel(first);
  expect(secondListener).not.toHaveBeenCalled();
  await capture.cancel(second);
  expect(secondListener).toHaveBeenCalledOnce();
});
it('aborting while transcription subscribes prevents inference from starting', async () => {
  mocks.invoke.mockClear();
  let subscribed!: (dispose: () => void) => void;
  mocks.listen.mockReturnValueOnce(
    new Promise((resolve) => {
      subscribed = resolve;
    }),
  );
  const controller = new AbortController();
  const work = new NativeSpeechToText().transcribe({ jobId: 'first' }, controller.signal, () => {});
  controller.abort();
  const dispose = vi.fn();
  subscribed(dispose);
  await expect(work).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});
