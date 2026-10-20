import { describe, expect, it } from 'vitest';
import { deriveRequirements } from './requirements';
import { fallbackFor, recommend } from './router';
import { priorityWeights, weightsForTask } from './scoring';
import {
  highEnd,
  localModel,
  lowEnd,
  midRange,
  providerGroup,
  testDevice,
  testPolicy,
  testSnapshot,
} from './testing';
import { bundledModel } from './providers/LlamaCppProvider';
import type { AIModel } from './types';

const screenshot = deriveRequirements({ kind: 'screenshot' });
const simpleText = deriveRequirements({ kind: 'text', texts: ['Quiz on Friday 9 AM, Room 204.'] });
const longText = deriveRequirements({ kind: 'text', texts: [], assumeLong: true });

const small = localModel('small-1.5b', { params: 1.5 });
const vision7b = localModel('vision-7b', { params: 7, vision: true });
const large14b = localModel('large-14b', { params: 14, multilingual: true });
const bundled: AIModel = { ...bundledModel(null, 8192), ready: true };

const everything = [
  providerGroup('llama-cpp', 'local', [bundled]),
  providerGroup('local', 'local', [small, vision7b, large14b]),
];

describe('on-device routing', () => {
  it('every decision stays on this device and says so', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, everything),
      testPolicy('automatic'),
    );
    expect(decision.status).toBe('ready');
    expect(decision.ranked.every((c) => c.provider.kind === 'local')).toBe(true);
    expect(decision.reasons.map((r) => r.text)).toContain('No source material leaves this device');
    expect(decision.privacy).toBe('Processed on this device. No source material leaves it.');
    expect(decision.selected?.highlights).toEqual(expect.arrayContaining(['Private', 'Offline']));
  });

  it('quality-first prefers a local vision model for screenshots', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, everything),
      testPolicy('automatic', 'quality'),
    );
    expect(decision.selected?.model.id).toBe(vision7b.id);
  });

  it('Manual mode uses the chosen model', () => {
    const decision = recommend(
      simpleText,
      testSnapshot(midRange, everything),
      testPolicy('manual', 'balanced', { manualModel: 'local/large-14b' }),
    );
    expect(decision.selected?.model.id).toBe(large14b.id);
    expect(decision.status).toBe('ready');
    expect(decision.reasons[0].text).toBe('You chose this model in Manual mode');
  });

  it('Manual mode explains when the chosen model cannot run', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(lowEnd, everything),
      testPolicy('manual', 'balanced', { manualModel: 'local/large-14b' }),
    );
    expect(decision.selected?.model.id).not.toBe(large14b.id);
    expect(decision.reasons[0]).toMatchObject({
      tone: 'con',
      text: expect.stringMatching(/Too large for this device/),
    });
  });
});

describe('device-aware routing', () => {
  it('low-RAM device: recommends the small model instead of a capable model that does not fit', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(lowEnd, everything),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.id).toBe(small.id);
    expect(decision.reasons.map((r) => r.text)).toContain('Device has limited RAM (8 GB)');
    expect(decision.reasons.some((r) => /reasonable safety margin/.test(r.text))).toBe(true);
    const vision = decision.alternatives.find((c) => c.model.id === vision7b.id)!;
    expect(vision.cautions).toContain('May be slow or fail while memory is low');
    expect(vision.tradeoff).toMatch(/needs more memory than is free now/);
    // 14B needs more than 80 % of installed RAM: excluded outright.
    expect(decision.excluded.find((e) => e.model.id === large14b.id)?.reasons[0]).toMatch(
      /Too large for this device/,
    );
  });

  it('a too-big bundled model is still usable when it is the only option', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(testDevice({ ramGB: 8, freeGB: 1.5 }), [
        providerGroup('llama-cpp', 'local', [bundled]),
      ]),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.id).toBe(bundled.id);
    expect(decision.selected?.cautions).toContain('May be slow or fail while memory is low');
  });

  it('high-RAM device with a large GPU: a larger local multimodal model for screenshots', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(highEnd, everything),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.id).toBe(vision7b.id);
    expect(decision.selected?.offload).toBe('full');
    expect(decision.reasons.map((r) => r.text)).toContain(
      'Accelerated by your NVIDIA GeForce RTX 4090',
    );
  });

  it('simple jobs do not occupy a large model, even on a high-end device', () => {
    const decision = recommend(
      simpleText,
      testSnapshot(highEnd, everything),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.id).toBe(small.id);
    expect(decision.reasons.map((r) => r.text)).toContain('Fast enough for a short, simple job');
  });

  it('GPU vs no GPU: GPU-capable runtimes speed up, CPU-only runtimes say the GPU is unused', () => {
    const gpu = recommend(
      simpleText,
      testSnapshot(highEnd, [providerGroup('local', 'local', [vision7b])]),
      testPolicy('automatic'),
    );
    const cpu = recommend(
      simpleText,
      testSnapshot(testDevice({ ramGB: 64, freeGB: 48 }), [
        providerGroup('local', 'local', [vision7b]),
      ]),
      testPolicy('automatic'),
    );
    expect(gpu.selected?.offload).toBe('full');
    expect(gpu.selected?.speedClass).toBe('fast');
    expect(cpu.selected?.offload).toBe('none');
    expect(cpu.selected?.speedClass).toBe('slow');
    const bundledOnGpu = recommend(
      simpleText,
      testSnapshot(highEnd, [providerGroup('llama-cpp', 'local', [bundled])]),
      testPolicy('automatic'),
    );
    expect(bundledOnGpu.selected?.offload).toBe('none');
    expect(
      bundledOnGpu.reasons.some((r) =>
        /runs on the CPU; your NVIDIA GeForce RTX 4090 isn't used by it/.test(r.text),
      ),
    ).toBe(true);
  });
});

describe('task-specific routing', () => {
  const pair = [providerGroup('local', 'local', [small, vision7b])];
  it('image task prefers an image-capable model', () => {
    const decision = recommend(screenshot, testSnapshot(midRange, pair), testPolicy('automatic'));
    expect(decision.selected?.model.id).toBe(vision7b.id);
    expect(decision.selected?.attachImage).toBe(true);
    expect(decision.selected?.breakdown.capability.score).toBe(1);
  });

  it('text task prefers the fast lightweight model', () => {
    const decision = recommend(simpleText, testSnapshot(midRange, pair), testPolicy('automatic'));
    expect(decision.selected?.model.id).toBe(small.id);
    expect(decision.selected?.attachImage).toBe(false);
  });

  it('long sources skip models whose context window is too small', () => {
    const decision = recommend(
      longText,
      testSnapshot(midRange, everything),
      testPolicy('automatic'),
    );
    expect(decision.excluded.find((e) => e.model.id === bundled.id)?.reasons[0]).toMatch(
      /longer than its context window/,
    );
    expect(decision.selected).toBeDefined();
    expect(decision.selected?.model.id).not.toBe(bundled.id);
  });

  it('task weights stay normalised and shift toward speed for simple jobs', () => {
    const simple = weightsForTask(priorityWeights.balanced, simpleText);
    const total = Object.values(simple).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100);
    expect(simple.speed).toBeGreaterThan(priorityWeights.balanced.speed);
    expect(simple.quality).toBeLessThan(priorityWeights.balanced.quality);
  });
});

describe('availability, mock and fallback', () => {
  it('unavailable providers are excluded with their own reason', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, [
        providerGroup('llama-cpp', 'local', [bundled], false, 'Preparing local intelligence…'),
        providerGroup('ollama', 'local', [], false, 'Ollama is not running on this computer'),
      ]),
      testPolicy('automatic'),
    );
    expect(decision.status).toBe('no-candidate');
    expect(decision.headline).toBe('No AI model can run this job right now');
    expect(decision.reasons.map((r) => r.text)).toEqual([
      `${bundled.name}: Preparing local intelligence…`,
      'ollama: Ollama is not running on this computer',
    ]);
  });

  it('the mock provider is never chosen outside demos, and never over a real model', () => {
    const mock = {
      ...localModel('sample', { params: 0.1 }),
      providerId: 'mock',
      estimatedPerformance: { qualityClass: 'basic' as const },
    };
    const mockGroup = providerGroup('mock', 'mock', [mock]);
    const production = recommend(
      simpleText,
      testSnapshot(midRange, [mockGroup]),
      testPolicy('automatic'),
    );
    expect(production.status).toBe('no-candidate');
    expect(production.excluded[0].reasons).toContain(
      'Demo / Mock AI is used only for demos, previews and tests',
    );
    const preview = recommend(
      simpleText,
      testSnapshot(midRange, [mockGroup, providerGroup('local', 'local', [small])]),
      testPolicy('automatic', 'balanced', { allowMock: true }),
    );
    expect(preview.selected?.model.id).toBe(small.id);
    const demo = recommend(
      simpleText,
      testSnapshot(midRange, [mockGroup]),
      testPolicy('automatic', 'balanced', { allowMock: true }),
    );
    expect(demo.selected?.provider.kind).toBe('mock');
    expect(demo.headline).toMatch(/Demo \/ Mock AI/);
    expect(demo.selected?.highlights).toContain('Not real AI');
  });

  it('fallback takes the next best model, skips failed providers and never offers the mock', () => {
    const mock = { ...localModel('sample', { params: 0.1 }), providerId: 'mock' };
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, [
        providerGroup('local', 'local', [vision7b]),
        providerGroup('llama-cpp', 'local', [bundled]),
        providerGroup('mock', 'mock', [mock]),
      ]),
      testPolicy('automatic', 'balanced', { allowMock: true }),
    );
    expect(decision.selected?.model.id).toBe(vision7b.id);
    expect(fallbackFor(decision, ['local'])?.model.id).toBe(bundled.id);
    expect(fallbackFor(decision, ['local', 'llama-cpp'])).toBeUndefined();
  });

  it('recent failures lower reliability for that model', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, [
        providerGroup('local', 'local', [vision7b]),
        providerGroup('llama-cpp', 'local', [bundled]),
      ]),
      testPolicy('automatic'),
      new Map([['local/vision-7b', 2]]),
    );
    expect(decision.selected?.model.id).toBe(bundled.id);
    const failed = decision.ranked.find((c) => c.model.id === vision7b.id)!;
    expect(failed.breakdown.reliability.score).toBeCloseTo(0.3);
    expect(failed.cautions).toContain('Failed earlier in this session');
  });
});
