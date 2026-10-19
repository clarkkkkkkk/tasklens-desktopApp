import { describe, expect, it, vi } from 'vitest';
import { buildExtractionPrompt } from '../extraction/prompts/build-prompt';
import { contextForCase } from '../../../tests/fixtures/extraction/context';
import { extractionCases } from '../../../tests/fixtures/extraction/cases';
import type { LocalModelManager } from '../localai/LocalModelManager';
import type { IntelligenceStatus } from '../localai/LocalIntelligence';
import { LlamaCppProvider } from './providers/LlamaCppProvider';
import { OllamaProvider, ollamaModel, type OllamaNative } from './providers/OllamaProvider';
import type { AIRequest } from './types';

const request = (extra: Partial<AIRequest> = {}): AIRequest => ({
  jobId: '5f1c9a5e-7d2f-4b8e-9a51-6f0f2a9b1c3d',
  modelId: 'model-x',
  system: 'SYSTEM PROMPT',
  user: 'SOURCE_UNITS\n[t1] Quiz on Friday.',
  schema: { type: 'object' },
  maxOutputTokens: 2048,
  signal: new AbortController().signal,
  ...extra,
});

describe('Ollama adapter', () => {
  it('derives capabilities and footprint from detected facts', () => {
    const vision = ollamaModel({
      name: 'qwen2.5vl:7b',
      sizeBytes: 6e9,
      parameterSize: '8.3B',
      quantization: 'Q4_K_M',
      capabilities: ['completion', 'vision'],
      contextLength: 128000,
    })!;
    expect(vision.capabilities).toEqual(
      expect.arrayContaining(['image-understanding', 'long-context', 'json-output']),
    );
    expect(vision.footprint).toMatchObject({
      parameterBillions: 8.3,
      quantization: 'Q4_K_M',
      fileBytes: 6e9,
    });
    expect(vision.specSource).toBe('detected');
    expect(
      ollamaModel({ name: 'nomic-embed-text', sizeBytes: 1, capabilities: ['embedding'] }),
    ).toBeNull();
    expect(ollamaModel({ name: 'old:3b', sizeBytes: 2e9 })?.footprint?.parameterBillions).toBe(3);
  });

  it('builds a schema-constrained chat with images and disables thinking where supported', async () => {
    const native: OllamaNative = {
      discover: async () => ({
        running: true,
        models: [{ name: 'qwen3:8b', sizeBytes: 5e9, capabilities: ['completion', 'thinking'] }],
      }),
      chat: vi.fn(async () => ({ content: '{}', truncated: false, elapsedMs: 3 })),
    };
    const ollama = new OllamaProvider(native);
    expect(await ollama.isAvailable()).toEqual({ available: true });
    await ollama.getModels();
    await ollama.generate(
      request({ modelId: 'qwen3:8b', images: [{ mimeType: 'image/jpeg', base64: 'CCCC' }] }),
    );
    const body = (native.chat as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body).toMatchObject({ model: 'qwen3:8b', format: { type: 'object' }, think: false });
    expect(body.messages[1].images).toEqual(['CCCC']);
    expect(body.options.num_ctx).toBeGreaterThanOrEqual(8192);
  });

  it('reports why it is unavailable and wraps runtime failures', async () => {
    const stopped = new OllamaProvider({
      discover: async () => ({ running: false, models: [] }),
      chat: vi.fn(),
    });
    expect((await stopped.isAvailable()).reason).toBe('Ollama is not running on this computer');
    const off = new OllamaProvider({ discover: vi.fn(), chat: vi.fn() }, () => false);
    expect((await off.isAvailable()).reason).toBe('Turned off in Settings');
    const failing = new OllamaProvider({
      discover: async () => ({ running: true, models: [] }),
      chat: async () => {
        throw new Error('MODEL_FAILED: Ollama could not run this request.');
      },
    });
    await expect(failing.generate(request())).rejects.toMatchObject({
      kind: 'failed',
      message: 'Ollama could not run this request.',
    });
  });
});

describe('bundled llama.cpp adapter', () => {
  const manager = (state: 'verified' | 'not_installed' = 'verified') =>
    ({
      available: true,
      getModelStatus: vi.fn(async () => ({
        model: { state, bytes: 2497280256 },
        runtime: { state: 'stopped', binaryFound: true },
      })),
      complete: vi.fn(async () => ({
        content: '{}',
        truncated: false,
        elapsedMs: 1,
        timings: null,
      })),
      prewarm: vi.fn(async () => {}),
    }) as unknown as LocalModelManager;
  const status = (
    state: IntelligenceStatus['state'],
    components: IntelligenceStatus['components'] = {},
  ): IntelligenceStatus => ({ state, message: 'Preparing local intelligence…', components });

  it('waits for local intelligence readiness and reports file problems', async () => {
    expect(
      (await new LlamaCppProvider(manager(), () => status('preparing')).isAvailable()).reason,
    ).toBe('Preparing local intelligence…');
    const broken = status('error', {
      extraction: { state: 'error', message: 'MODEL_CORRUPTED: The model file is damaged.' },
      'llama-server': { state: 'ready', message: null },
    });
    expect((await new LlamaCppProvider(manager(), () => broken).isAvailable()).reason).toBe(
      'The model file is damaged.',
    );
    expect(
      (await new LlamaCppProvider(manager('not_installed'), () => status('ready')).isAvailable())
        .available,
    ).toBe(false);
    expect(await new LlamaCppProvider(manager(), () => status('ready')).isAvailable()).toEqual({
      available: true,
    });
  });

  it('describes the bundled model from the manifest and the detected file', async () => {
    const [model] = await new LlamaCppProvider(
      manager(),
      () => null,
      () => 16384,
    ).getModels();
    expect(model).toMatchObject({
      privacy: 'local',
      specSource: 'detected',
      ready: true,
      accelerators: ['cpu'],
    });
    expect(model.footprint).toMatchObject({
      parameterBillions: 4,
      quantization: 'Q4_K_M',
      fileBytes: 2497280256,
      contextLength: 16384,
    });
    expect(model.capabilities).toContain('multilingual');
  });

  it('formats the same Qwen prompt as the extraction prompt builder', async () => {
    const m = manager();
    const context = contextForCase(extractionCases.find((c) => c.id === 'pictorial')!);
    const built = buildExtractionPrompt(context);
    const { buildUserMessage } = await import('../extraction/prompts/build-prompt');
    const { TASKLENS_SYSTEM_PROMPT } = await import('../extraction/prompts/tasklens-system-prompt');
    await new LlamaCppProvider(m).generate(
      request({ system: TASKLENS_SYSTEM_PROMPT, user: buildUserMessage(context) }),
    );
    expect((m.complete as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt).toBe(built.prompt);
  });
});
