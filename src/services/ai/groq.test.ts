import { describe, expect, it, vi } from 'vitest';
import {
  GroqProvider,
  GROQ_MODEL,
  groqSchema,
  disconnectedGroq,
  type GroqNative,
} from './providers/GroqProvider';
import { AIRouter, fallbackFor, recommend } from './router';
import { ProviderRegistry } from './registry';
import { defaultPolicy } from './policy';
import { lowEnd, localModel, providerGroup } from './testing';
import { deriveRequirements } from './requirements';
import { buildOutputJsonSchema } from '../extraction/prompts/extraction-schema';
import { rawBundle, rawItem } from '../../../tests/fixtures/extraction/raw';
import { recordedOcr } from '../../../tests/fixtures/extraction/context';
import { RoutedExtractionService } from '../extraction/RoutedExtractionService';
import { defaultSettings, settingsSchema, snapshotSchema } from '../../types/action';
import { LocalAIError, toLocalAIError } from '../localai/native';

const output = rawBundle([
  rawItem({ title: { evidence: ['r3'], value: 'Pictorial', confidence: 'confirmed' } }),
]);
function fixture() {
  const native: GroqNative = {
    status: vi.fn(async () => ({ ...disconnectedGroq, connected: true, consent: true })),
    begin: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    generate: vi.fn(async () => ({
      content: output,
      truncated: false,
      elapsedMs: 7,
      inputTokens: 100,
      outputTokens: 60,
    })),
  };
  const provider = new GroqProvider(native);
  const local = {
    id: 'local',
    name: 'Local',
    kind: 'local' as const,
    runtime: 'test',
    isAvailable: async () => ({ available: true }),
    getModels: async () => [localModel('small', { params: 1 })],
    generate: vi.fn(async () => ({ content: output, truncated: false, elapsedMs: 1 })),
  };
  const policy = { ...defaultPolicy, executionMode: 'groq' as 'local' | 'groq' };
  const router = new AIRouter(
    new ProviderRegistry([local, provider]),
    { profile: async () => lowEnd },
    () => policy,
  );
  const ocr = { recognize: vi.fn(async () => recordedOcr('pictorial')) };
  const service = new RoutedExtractionService(ocr, router, () => defaultSettings, {
    encodeImage: vi.fn(async () => ({ mimeType: 'image/png' as const, base64: 'PRIVATE_IMAGE' })),
  });
  const input = {
    type: 'image' as const,
    image: new Blob(['PRIVATE_IMAGE']),
    previewUrl: 'data:image/png;base64,PRIVATE_IMAGE',
    fileName: 'PRIVATE_FILENAME',
    timezone: 'Asia/Manila',
  };
  return { native, provider, local, router, ocr, service, input, policy };
}
const options = () => ({ signal: new AbortController().signal, onProgress: () => {} });

describe('Groq provider and routing isolation', () => {
  it('keeps discovery offline and local mode excludes cloud', async () => {
    const f = fixture();
    f.policy.executionMode = 'local';
    expect(
      (await f.router.decide(deriveRequirements({ kind: 'text' }))).selected?.provider.kind,
    ).toBe('local');
    expect(f.native.generate).not.toHaveBeenCalled();
    expect(f.native.begin).not.toHaveBeenCalled();
    expect(await f.provider.getModels()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: GROQ_MODEL })]),
    );
    const snap = {
      device: lowEnd,
      providers: [providerGroup('groq', 'cloud', await f.provider.getModels())],
    };
    expect(
      recommend(deriveRequirements({ kind: 'text' }), snap, defaultPolicy).selected,
    ).toBeUndefined();
  });
  it('never falls back across the explicit execution mode', async () => {
    const f = fixture();
    const decision = await f.router.decide(deriveRequirements({ kind: 'text' }));
    expect(decision.selected?.provider.id).toBe('groq');
    expect(decision.selected?.memory).toBeUndefined();
    expect(decision.privacy).toContain('sent to Groq');
    expect(fallbackFor(decision, ['groq'])).toBeUndefined();
    vi.mocked(f.native.generate).mockRejectedValueOnce(
      new LocalAIError('GROQ_NETWORK', 'Network unavailable'),
    );
    await expect(f.service.extract(f.input, options())).rejects.toMatchObject({
      code: 'GROQ_NETWORK',
      ocr: expect.any(Object),
    });
    expect(f.local.generate).not.toHaveBeenCalled();
    expect(f.native.finish).toHaveBeenCalledOnce();
  });
  it('reuses OCR, transmits text only, preserves provenance and forces review', async () => {
    const f = fixture();
    const result = await f.service.extract(f.input, options());
    const sent = JSON.stringify(vi.mocked(f.native.generate).mock.calls);
    expect(sent).not.toContain('PRIVATE_IMAGE');
    expect(sent).not.toContain('PRIVATE_FILENAME');
    expect(sent).toContain('[r3]');
    expect(result.actions[0]).toMatchObject({
      status: 'needs_review',
      source: { extractionMode: 'cloud', extractedBy: { kind: 'cloud', provider: 'Groq Cloud' } },
    });
    expect(result.actions[0].evidence?.length).toBeGreaterThan(0);
    expect(result.diagnostics?.attempts[0].inputTokens).toBe(100);
    expect(result.diagnostics?.totalElapsedMs).toBeGreaterThanOrEqual(0);
    expect(f.native.finish).toHaveBeenCalledOnce();
    expect(
      snapshotSchema.parse({ version: 1, actions: result.actions, settings: defaultSettings })
        .actions[0].source.extractedBy?.kind,
    ).toBe('cloud');
  });
  it('retains semantic validation and skips repair when allowance is exhausted', async () => {
    const f = fixture();
    vi.mocked(f.native.generate).mockResolvedValue({
      content: '{"items":[{}],"ambiguities":[]}',
      truncated: false,
      elapsedMs: 2,
      canRepair: false,
    } as Awaited<ReturnType<GroqNative['generate']>>);
    await expect(f.service.extract(f.input, options())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(f.native.generate).toHaveBeenCalledOnce();
    expect(f.native.finish).toHaveBeenCalledOnce();
  });
  it('finishes failed/cancelled session admission and rejects mode changes during OCR', async () => {
    const f = fixture();
    vi.mocked(f.native.begin).mockRejectedValueOnce(new LocalAIError('CANCELLED', 'Cancelled'));
    await expect(f.service.extract(f.input, options())).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(f.native.finish).toHaveBeenCalledOnce();
    const g = fixture();
    g.ocr.recognize.mockImplementationOnce(async () => {
      g.policy.executionMode = 'local';
      return recordedOcr('pictorial');
    });
    await expect(g.service.extract(g.input, options())).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(g.native.generate).not.toHaveBeenCalled();
  });
  it('projects strict wire constraints while keeping evidence enums and closed required objects', () => {
    const projected = groqSchema(buildOutputJsonSchema(['r1', 'r2']));
    const raw = JSON.stringify(projected);
    for (const keyword of ['maxItems', 'minLength', 'pattern', 'minimum'])
      expect(raw).not.toContain(keyword);
    expect(raw).toContain('"enum":["r1","r2"]');
    expect(raw).toContain('"additionalProperties":false');
    expect(raw).toContain('"required"');
    expect(raw).toContain('"type":"null"');
  });
  it('defaults old settings to Local and retains structured retry metadata', () => {
    expect(
      settingsSchema.parse({ remindersEnabled: true, defaultReminders: [], theme: 'light' }).ai
        .executionMode,
    ).toBe('local');
    expect(
      toLocalAIError({ code: 'GROQ_RATE_LIMIT', message: 'Wait', retryAt: 1234 }),
    ).toMatchObject({ code: 'GROQ_RATE_LIMIT', retryAt: 1234 });
  });
});
