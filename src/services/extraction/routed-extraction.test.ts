import { describe, expect, it, vi } from 'vitest';
import { recordedOcr } from '../../../tests/fixtures/extraction/context';
import { rawBundle, rawItem } from '../../../tests/fixtures/extraction/raw';
import { ConsentBroker, type ConsentAnswer, type ConsentRequest } from '../ai/consent';
import type { DeviceProfiler } from '../ai/device';
import type { NetworkMonitor } from '../ai/network';
import type { RoutingPolicy } from '../ai/policy';
import { MockProvider } from '../ai/providers/MockProvider';
import { ProviderRegistry } from '../ai/registry';
import { AIRouter } from '../ai/router';
import { cloudModel, localModel, midRange, testPolicy } from '../ai/testing';
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
  kind: 'local' | 'cloud',
  model: AIModel,
  outputs: (string | Error)[] = [valid],
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
    kind,
    runtime: `${id} runtime`,
    isAvailable: async () => ({ available: true }),
    getModels: async () => [{ ...model, providerId: id }],
    generate,
  } satisfies AIProvider;
}

function setup(
  policy: Partial<RoutingPolicy> & Pick<RoutingPolicy, 'mode'>,
  providers: AIProvider[],
  online = true,
) {
  const device: DeviceProfiler = { profile: async () => midRange };
  const network = {
    current: () => ({ online, source: 'simulated', checkedAt: 0 }),
  } as unknown as NetworkMonitor;
  const router = new AIRouter(new ProviderRegistry(providers), device, network, () =>
    testPolicy(policy.mode, policy.priority, policy),
  );
  const consent = new ConsentBroker();
  const asked: ConsentRequest[] = [];
  const answerWith = (answer: ConsentAnswer) =>
    consent.subscribe((pending) => {
      if (!pending) return;
      asked.push(pending.request);
      queueMicrotask(() => consent.respond(pending.id, answer));
    });
  const encodeImage = vi.fn(async () => ({ mimeType: 'image/jpeg' as const, base64: 'AAAA' }));
  const ocr = fakeOcr();
  const service = new RoutedExtractionService(ocr, router, () => ({ defaultReminders: [] }), {
    consent,
    encodeImage,
  });
  return { service, consent, asked, answerWith, encodeImage, ocr, router };
}

const local = () => provider('local', 'local', localModel('local-4b', { params: 4, gpu: false }));
const cloud = (outputs?: (string | Error)[]) =>
  provider('cloud', 'cloud', cloudModel('cloud-vision'), outputs);

describe('RoutedExtractionService', () => {
  it('runs the selected local model and records where the draft came from', async () => {
    const l = local();
    const { service } = setup({ mode: 'local-only' }, [l, cloud()]);
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

  it('Local Only never calls a cloud provider, even when it would score higher', async () => {
    const c = cloud();
    const { service } = setup({ mode: 'local-only', priority: 'quality' }, [local(), c]);
    await service.extract(input, options());
    expect(c.generate).not.toHaveBeenCalled();
  });

  it('Ask Before Cloud: without an answer nothing is uploaded and the local alternative runs', async () => {
    const l = local();
    const c = cloud();
    const { service } = setup({ mode: 'ask-before-cloud' }, [l, c]);
    const bundle = await service.extract(input, options());
    expect(c.generate).not.toHaveBeenCalled();
    expect(l.generate).toHaveBeenCalledOnce();
    expect(bundle.actions[0].source.extractionMode).toBe('local');
  });

  it('Ask Before Cloud: approval sends OCR text and the image, and marks the draft as cloud', async () => {
    const c = cloud();
    const { service, asked, answerWith, encodeImage } = setup({ mode: 'ask-before-cloud' }, [
      local(),
      c,
    ]);
    answerWith('approve');
    const bundle = await service.extract(input, options());
    expect(asked).toHaveLength(1);
    expect(asked[0].kind).toBe('cloud');
    expect(asked[0].kind === 'cloud' && asked[0].candidate.dataFlow.sends).toContain(
      'The screenshot image',
    );
    expect(encodeImage).toHaveBeenCalledOnce();
    const request = c.generate.mock.calls[0][0];
    expect(request.images).toHaveLength(1);
    expect(request.user).toContain('[r3]');
    expect(bundle.actions[0].source).toMatchObject({
      extractionMode: 'cloud',
      extractedBy: { kind: 'cloud' },
    });
  });

  it('respects "share screenshots" off: cloud receives OCR text only', async () => {
    const c = cloud();
    const { service, answerWith, encodeImage } = setup(
      { mode: 'ask-before-cloud', shareImages: false },
      [local(), c],
    );
    answerWith('approve');
    await service.extract(input, options());
    expect(encodeImage).not.toHaveBeenCalled();
    expect(c.generate.mock.calls[0][0].images).toBeUndefined();
  });

  it('declining cloud consent with "use local" runs the local model', async () => {
    const l = local();
    const c = cloud();
    const { service, answerWith } = setup({ mode: 'ask-before-cloud' }, [l, c]);
    answerWith('alternative');
    await service.extract(input, options());
    expect(c.generate).not.toHaveBeenCalled();
    expect(l.generate).toHaveBeenCalledOnce();
  });

  it('cancelling cloud consent stops without sending or saving anything', async () => {
    const l = local();
    const c = cloud();
    const { service, answerWith } = setup({ mode: 'ask-before-cloud' }, [l, c]);
    answerWith('cancel');
    await expect(service.extract(input, options())).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(c.generate).not.toHaveBeenCalled();
    expect(l.generate).not.toHaveBeenCalled();
  });

  it('provider failure: offers a local fallback and continues only when accepted', async () => {
    const l = local();
    const c = cloud([new AIProviderError('network', 'Network unreachable.', 'cloud')]);
    const { service, asked, answerWith } = setup({ mode: 'automatic' }, [l, c]);
    answerWith('approve');
    const routes: string[] = [];
    const bundle = await service.extract(input, {
      ...options(),
      onRoute: (r) =>
        routes.push(`${r.candidate.key}${r.fallbackFrom ? ` after ${r.fallbackFrom.key}` : ''}`),
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ kind: 'fallback', error: 'Network unreachable.' });
    expect(asked[0].kind === 'fallback' && asked[0].alternative.model.privacy).toBe('local');
    expect(routes).toEqual(['cloud/cloud-vision', 'local/local-4b after cloud/cloud-vision']);
    expect(bundle.actions[0].source.extractionMode).toBe('local');
  });

  it('provider failure without acceptance never silently switches providers', async () => {
    const l = local();
    const c = cloud([new AIProviderError('failed', 'Service unavailable.', 'cloud')]);
    const { service } = setup({ mode: 'automatic' }, [l, c]);
    await expect(service.extract(input, options())).rejects.toMatchObject({
      code: 'MODEL_FAILED',
      message: expect.stringMatching(/cloud-vision could not complete this: Service unavailable/),
    });
    expect(l.generate).not.toHaveBeenCalled();
  });

  it('a cloud-to-cloud fallback is asked for and then counts as permission for that provider', async () => {
    const failing = cloud([new AIProviderError('rate-limit', 'Rate limited.', 'cloud')]);
    const other = provider('cloud-b', 'cloud', cloudModel('backup-cloud'));
    const { service, asked, answerWith } = setup({ mode: 'automatic' }, [failing, other]);
    answerWith('approve');
    const bundle = await service.extract(input, options());
    expect(asked[0]).toMatchObject({ kind: 'fallback' });
    expect(asked[0].kind === 'fallback' && asked[0].alternative.dataFlow.leavesDevice).toBe(true);
    expect(other.generate).toHaveBeenCalledOnce();
    expect(bundle.actions[0].source.extractedBy?.provider).toBe('cloud-b');
  });

  it('malformed AI output: one repair attempt on the same provider, then a validation error and no fallback', async () => {
    const l = local();
    const bad = provider(
      'local-b',
      'local',
      localModel('local-small', { params: 1.5, gpu: false }),
      ['not json', '{"items": 3}'],
    );
    const { service, asked, answerWith } = setup({ mode: 'local-only', priority: 'speed' }, [
      bad,
      l,
    ]);
    answerWith('approve');
    await expect(service.extract(input, options())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(bad.generate).toHaveBeenCalledTimes(2);
    expect(bad.generate.mock.calls[1][0].repair).toMatch(/previous answer was invalid/);
    expect(asked).toHaveLength(0);
    expect(l.generate).not.toHaveBeenCalled();
  });

  it('repairs malformed output once and succeeds', async () => {
    const l = provider('local', 'local', localModel('local-4b', { params: 4 }), ['{oops', valid]);
    const { service } = setup({ mode: 'local-only' }, [l]);
    const bundle = await service.extract(input, options());
    expect(bundle.diagnostics?.attempts).toHaveLength(2);
    expect(bundle.actions[0].title).toBe('Pictorial');
  });

  it('fails fast before OCR when no AI can run, with the reason', async () => {
    const { service, ocr } = setup({ mode: 'local-only' }, [cloud()]);
    await expect(service.extract(input, options())).rejects.toMatchObject({
      code: 'NO_AI_AVAILABLE',
      message: expect.stringMatching(/Local Only mode keeps everything on this device/),
    });
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('offline: cloud is skipped and the local model runs', async () => {
    const c = cloud();
    const { service } = setup({ mode: 'automatic' }, [local(), c], false);
    await service.extract(input, options());
    expect(c.generate).not.toHaveBeenCalled();
  });

  it('cancellation while waiting for consent sends nothing', async () => {
    const c = cloud();
    const { service, consent } = setup({ mode: 'ask-before-cloud' }, [local(), c]);
    const controller = new AbortController();
    consent.subscribe((pending) => pending && controller.abort());
    await expect(
      service.extract(input, { signal: controller.signal, onProgress: () => {} }),
    ).rejects.toThrow();
    expect(c.generate).not.toHaveBeenCalled();
  });

  it('Demo / Mock AI produces a validated draft that is clearly marked as a sample', async () => {
    const { service } = setup({ mode: 'local-only', allowMock: true }, [new MockProvider()]);
    const bundle = await service.extract(
      { type: 'text', text: 'Bring your ID to the orientation.' },
      options(),
    );
    expect(bundle.actions[0].source.extractionMode).toBe('mock');
    expect(bundle.actions[0].notes).toContain('Demo / Mock AI sample, not an AI analysis.');
  });

  it('Demo / Mock AI is not used in production routing', async () => {
    const { service } = setup({ mode: 'local-only' }, [new MockProvider()]);
    await expect(
      service.extract({ type: 'text', text: 'Bring your ID.' }, options()),
    ).rejects.toMatchObject({
      code: 'NO_AI_AVAILABLE',
    });
  });
});
