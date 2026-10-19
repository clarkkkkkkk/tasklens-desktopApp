import { describe, expect, it, vi } from 'vitest';
import { recordedOcr } from '../../../tests/fixtures/extraction/context';
import { rawBundle, rawItem } from '../../../tests/fixtures/extraction/raw';
import type { DeviceProfiler } from '../ai/device';
import type { RoutingPolicy } from '../ai/policy';
import { MockProvider } from '../ai/providers/MockProvider';
import { ProviderRegistry } from '../ai/registry';
import { AIRouter } from '../ai/router';
import { localModel, midRange, testPolicy } from '../ai/testing';
import { AIProviderError, type AIModel, type AIProvider, type AIRequest } from '../ai/types';
import type { OcrService } from '../ocr/types';
import { RoutedExtractionService } from './RoutedExtractionService';

const doc = recordedOcr('pictorial');
const valid = rawBundle([
  rawItem({ title: { evidence: ['r3'], value: 'Pictorial', confidence: 'confirmed' } }),
]);
const input = {
  type: 'image' as const,
  fileName: 'pictorial.png',
  image: new Blob(['png']),
  timezone: 'Asia/Manila',
};
const options = () => ({ signal: new AbortController().signal, onProgress: () => {} });

function fakeOcr(): OcrService & { recognize: ReturnType<typeof vi.fn> } {
  return { recognize: vi.fn(async () => doc) };
}

function provider(
  id: string,
  model: AIModel,
  outputs: (string | Error)[] = [valid],
  available = true,
) {
  const generate = vi.fn(async (request: AIRequest) => {
    request.signal.throwIfAborted();
    const next = outputs.length > 1 ? outputs.shift()! : outputs[0];
    if (next instanceof Error) throw next;
    return { content: next, truncated: false, elapsedMs: 1 };
  });
  return {
    id,
    name: id,
    kind: 'local',
    runtime: `${id} runtime`,
    isAvailable: async () =>
      available ? { available } : { available, reason: `${id} is not running` },
    getModels: async () => [{ ...model, providerId: id }],
    generate,
  } satisfies AIProvider;
}

function setup(
  policy: Partial<RoutingPolicy> & Pick<RoutingPolicy, 'mode'>,
  providers: AIProvider[],
) {
  const device: DeviceProfiler = { profile: async () => midRange };
  const router = new AIRouter(new ProviderRegistry(providers), device, () =>
    testPolicy(policy.mode, policy.priority, policy),
  );
  const encodeImage = vi.fn(async () => ({ mimeType: 'image/jpeg' as const, base64: 'AAAA' }));
  const ocr = fakeOcr();
  const service = new RoutedExtractionService(ocr, router, () => ({ defaultReminders: [] }), {
    encodeImage,
  });
  return { service, encodeImage, ocr, router };
}

const local = (outputs?: (string | Error)[]) =>
  provider('local', localModel('local-4b', { params: 4, gpu: false }), outputs);
const vision = (outputs?: (string | Error)[]) =>
  provider('vision', localModel('vision-7b', { params: 7, vision: true }), outputs);

describe('RoutedExtractionService', () => {
  it('runs the selected local model and records where the draft came from', async () => {
    const l = local();
    const { service } = setup({ mode: 'automatic' }, [l]);
    const routes: string[] = [];
    const bundle = await service.extract(input, {
      ...options(),
      onRoute: (r) => routes.push(r.candidate.key),
    });
    expect(routes).toEqual(['local/local-4b']);
    expect(bundle.actions[0].source).toMatchObject({
      extractionMode: 'local',
      extractedBy: { provider: 'local', model: 'local-4b', kind: 'local' },
    });
    expect(bundle.diagnostics?.route?.model).toBe('local-4b');
  });

  it('a local vision model receives OCR text and the screenshot; a text model gets text only', async () => {
    const v = vision();
    const withVision = setup({ mode: 'automatic', priority: 'quality' }, [v]);
    await withVision.service.extract(input, options());
    expect(withVision.encodeImage).toHaveBeenCalledOnce();
    const request = v.generate.mock.calls[0][0];
    expect(request.images).toHaveLength(1);
    expect(request.user).toContain('[r3]');

    const l = local();
    const textOnly = setup({ mode: 'automatic' }, [l]);
    await textOnly.service.extract(input, options());
    expect(textOnly.encodeImage).not.toHaveBeenCalled();
    expect(l.generate.mock.calls[0][0].images).toBeUndefined();
  });

  it('provider failure: the next best local model takes over and the route says so', async () => {
    const v = vision([new AIProviderError('failed', 'Model crashed.', 'vision')]);
    const l = local();
    const { service } = setup({ mode: 'automatic', priority: 'quality' }, [v, l]);
    const routes: string[] = [];
    const bundle = await service.extract(input, {
      ...options(),
      onRoute: (r) =>
        routes.push(`${r.candidate.key}${r.fallbackFrom ? ` after ${r.fallbackFrom.key}` : ''}`),
    });
    expect(routes).toEqual(['vision/vision-7b', 'local/local-4b after vision/vision-7b']);
    expect(l.generate).toHaveBeenCalledOnce();
    expect(bundle.actions[0].source.extractedBy?.provider).toBe('local');
    expect(bundle.diagnostics?.route?.reasons).toEqual(['Used after vision-7b failed']);
  });

  it('provider failure with no other model reports the failure', async () => {
    const l = local([new AIProviderError('failed', 'Service unavailable.', 'local')]);
    const { service } = setup({ mode: 'automatic' }, [l]);
    await expect(service.extract(input, options())).rejects.toMatchObject({
      code: 'MODEL_FAILED',
      message: expect.stringMatching(/local-4b could not complete this: Service unavailable/),
    });
  });

  it('malformed AI output: one repair attempt on the same provider, then a validation error and no fallback', async () => {
    const l = local();
    const bad = provider('local-b', localModel('local-small', { params: 1.5, gpu: false }), [
      'not json',
      '{"items": 3}',
    ]);
    const { service } = setup({ mode: 'automatic', priority: 'speed' }, [bad, l]);
    await expect(service.extract(input, options())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(bad.generate).toHaveBeenCalledTimes(2);
    expect(bad.generate.mock.calls[1][0].repair).toMatch(/previous answer was invalid/);
    expect(l.generate).not.toHaveBeenCalled();
  });

  it('repairs malformed output once and succeeds', async () => {
    const l = provider('local', localModel('local-4b', { params: 4 }), ['{oops', valid]);
    const { service } = setup({ mode: 'automatic' }, [l]);
    const bundle = await service.extract(input, options());
    expect(bundle.diagnostics?.attempts).toHaveLength(2);
    expect(bundle.actions[0].title).toBe('Pictorial');
  });

  it('fails fast before OCR when no AI can run, with the reason', async () => {
    const down = provider('local', localModel('local-4b', { params: 4 }), [valid], false);
    const { service, ocr } = setup({ mode: 'automatic' }, [down]);
    await expect(service.extract(input, options())).rejects.toMatchObject({
      code: 'NO_AI_AVAILABLE',
      message: expect.stringMatching(/local is not running/),
    });
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('cancellation stops without falling back to another model', async () => {
    const controller = new AbortController();
    const v = vision();
    v.generate.mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    const l = local();
    const { service } = setup({ mode: 'automatic', priority: 'quality' }, [v, l]);
    await expect(
      service.extract(input, { signal: controller.signal, onProgress: () => {} }),
    ).rejects.toThrow();
    expect(l.generate).not.toHaveBeenCalled();
  });

  it('Demo / Mock AI produces a validated draft that is clearly marked as a sample', async () => {
    const { service } = setup({ mode: 'automatic', allowMock: true }, [new MockProvider()]);
    const bundle = await service.extract(
      { type: 'text', text: 'Bring your ID to the orientation.' },
      options(),
    );
    expect(bundle.actions[0].source.extractionMode).toBe('mock');
    expect(bundle.actions[0].notes).toContain('Demo / Mock AI sample, not an AI analysis.');
  });

  it('Demo / Mock AI is not used in production routing', async () => {
    const { service } = setup({ mode: 'automatic' }, [new MockProvider()]);
    await expect(
      service.extract({ type: 'text', text: 'Bring your ID.' }, options()),
    ).rejects.toMatchObject({
      code: 'NO_AI_AVAILABLE',
    });
  });
});
