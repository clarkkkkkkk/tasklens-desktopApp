import { expect, it, vi } from 'vitest';
import { MockExtractionService } from './MockExtractionService';
import { actionSchema } from '../../types/action';
it('returns a valid marked review fixture and ordered progress without analyzing input', async () => {
  vi.useFakeTimers();
  try {
    const onProgress = vi.fn();
    const promise = new MockExtractionService().extract(
      { type: 'image', fileName: 'anything.png' },
      { signal: new AbortController().signal, onProgress },
    );
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(actionSchema.safeParse(result.actions[0]).success).toBe(true);
    expect(result.actions[0].title).toBe('Pictorial');
    expect(result.actions[0].status).toBe('needs_review');
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3]);
  } finally {
    vi.useRealTimers();
  }
});
it('cancels pending extraction without producing a result', async () => {
  const controller = new AbortController();
  const result = new MockExtractionService().extract(
    { type: 'image' },
    { signal: controller.signal, onProgress: () => {} },
  );
  const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await assertion;
});
