import { describe, expect, it } from 'vitest';
import { deriveRequirements } from './requirements';
import { fallbackFor, recommend } from './router';
import { CLOUD_MARGIN, priorityWeights, weightsForTask } from './scoring';
import {
  cloudModel,
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
const cloud = cloudModel('cloud-vision');

const everything = [
  providerGroup('llama-cpp', 'local', [bundled]),
  providerGroup('local', 'local', [small, vision7b, large14b]),
  providerGroup('cloud', 'cloud', [cloud]),
];
const bundledAndCloud = [
  providerGroup('llama-cpp', 'local', [bundled]),
  providerGroup('cloud', 'cloud', [cloud]),
];

describe('network-aware routing', () => {
  it('offline: only local providers run, even when a cloud model would win', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, false, bundledAndCloud),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.privacy).toBe('local');
    expect(decision.excluded.find((e) => e.model.id === cloud.id)?.reasons).toContain(
      'No internet connection',
    );
    expect(decision.reasons.map((r) => r.text)).toContain('No source material leaves this device');
  });

  it('online + cloud allowed + screenshot: a strong vision model is chosen without asking', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.id).toBe(cloud.id);
    expect(decision.status).toBe('ready');
    expect(decision.selected?.dataFlow.leavesDevice).toBe(true);
    expect(decision.selected?.dataFlow.sends).toContain('The screenshot image');
    expect(decision.localAlternative?.model.id).toBe(bundled.id);
    const texts = decision.reasons.map((r) => r.text);
    expect(texts).toEqual(
      expect.arrayContaining([
        'Current task contains a screenshot',
        'Strong image understanding',
        'Internet connection available',
        `Local ${bundled.name} is weaker for image extraction`,
      ]),
    );
    expect(decision.privacy).toMatch(/^Cloud processing required/);
  });

  it('online + simple text: the local model is enough, so nothing is uploaded', () => {
    const decision = recommend(
      simpleText,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.id).toBe(bundled.id);
    expect(decision.alternatives[0].tradeoff).toMatch(/cloud, sends data off this device/);
  });

  it('privacy-first keeps a screenshot local even when cloud is allowed', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('automatic', 'privacy'),
    );
    expect(decision.selected?.model.privacy).toBe('local');
  });

  it('quality-first prefers cloud vision for screenshots', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('automatic', 'quality'),
    );
    expect(decision.selected?.model.id).toBe(cloud.id);
  });
});

describe('privacy modes', () => {
  it('Local Only excludes cloud providers completely', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('local-only', 'quality'),
    );
    expect(decision.selected?.model.id).toBe(bundled.id);
    expect(decision.ranked.some((c) => c.model.privacy === 'cloud')).toBe(false);
    expect(decision.alternatives.some((c) => c.model.privacy === 'cloud')).toBe(false);
    expect(decision.excluded.find((e) => e.model.id === cloud.id)?.reasons).toContain(
      'Local Only mode keeps everything on this device',
    );
  });

  it('Ask Before Cloud recommends the cloud model but requires confirmation', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('ask-before-cloud'),
    );
    expect(decision.selected?.model.id).toBe(cloud.id);
    expect(decision.status).toBe('needs-consent');
    expect(decision.localAlternative?.model.id).toBe(bundled.id);
    expect(decision.privacy).toMatch(/TaskLens asks before sending/);
  });

  it('keeps data local when cloud is only marginally better', () => {
    // A local vision model that fits the GPU is close enough to the cloud model.
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, [
        providerGroup('local', 'local', [vision7b]),
        providerGroup('cloud', 'cloud', [cloud]),
      ]),
      testPolicy('automatic'),
    );
    const cloudCandidate = decision.ranked.find((c) => c.model.id === cloud.id)!;
    expect(cloudCandidate.total).toBeGreaterThan(decision.selected!.total);
    expect(cloudCandidate.total - decision.selected!.total).toBeLessThan(CLOUD_MARGIN);
    expect(decision.selected?.model.id).toBe(vision7b.id);
    expect(decision.reasons.some((r) => /not enough to justify sending data/.test(r.text))).toBe(
      true,
    );
  });

  it('Manual mode uses the chosen model; choosing a cloud model is the permission', () => {
    const decision = recommend(
      simpleText,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('manual', 'balanced', { manualModel: 'cloud/cloud-vision' }),
    );
    expect(decision.selected?.model.id).toBe(cloud.id);
    expect(decision.status).toBe('ready');
    expect(decision.reasons[0].text).toBe('You chose this model in Manual mode');
  });

  it('Manual mode explains when the chosen model cannot run, and asks before cloud', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, false, bundledAndCloud),
      testPolicy('manual', 'balanced', { manualModel: 'cloud/cloud-vision' }),
    );
    expect(decision.selected?.model.id).toBe(bundled.id);
    expect(decision.reasons[0]).toMatchObject({
      tone: 'con',
      text: expect.stringMatching(/No internet connection/),
    });
  });
});

describe('device-aware routing', () => {
  it('low-RAM device: recommends the small model instead of a capable model that does not fit', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(lowEnd, false, everything),
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
      testSnapshot(testDevice({ ramGB: 8, freeGB: 1.5 }), false, [
        providerGroup('llama-cpp', 'local', [bundled]),
      ]),
      testPolicy('local-only'),
    );
    expect(decision.selected?.model.id).toBe(bundled.id);
    expect(decision.selected?.cautions).toContain('May be slow or fail while memory is low');
  });

  it('high-RAM device with a large GPU: a larger local multimodal model for screenshots', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(highEnd, false, everything),
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
      testSnapshot(highEnd, false, everything),
      testPolicy('automatic'),
    );
    expect(decision.selected?.model.id).toBe(small.id);
    expect(decision.reasons.map((r) => r.text)).toContain('Fast enough for a short, simple job');
  });

  it('GPU vs no GPU: GPU-capable runtimes speed up, CPU-only runtimes say the GPU is unused', () => {
    const gpu = recommend(
      simpleText,
      testSnapshot(highEnd, false, [providerGroup('local', 'local', [vision7b])]),
      testPolicy('local-only'),
    );
    const cpu = recommend(
      simpleText,
      testSnapshot(testDevice({ ramGB: 64, freeGB: 48 }), false, [
        providerGroup('local', 'local', [vision7b]),
      ]),
      testPolicy('local-only'),
    );
    expect(gpu.selected?.offload).toBe('full');
    expect(gpu.selected?.speedClass).toBe('fast');
    expect(cpu.selected?.offload).toBe('none');
    expect(cpu.selected?.speedClass).toBe('slow');
    const bundledOnGpu = recommend(
      simpleText,
      testSnapshot(highEnd, false, [providerGroup('llama-cpp', 'local', [bundled])]),
      testPolicy('local-only'),
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
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, false, pair),
      testPolicy('local-only'),
    );
    expect(decision.selected?.model.id).toBe(vision7b.id);
    expect(decision.selected?.dataFlow.attachImage).toBe(true);
    expect(decision.selected?.breakdown.capability.score).toBe(1);
  });

  it('text task prefers the fast lightweight model', () => {
    const decision = recommend(
      simpleText,
      testSnapshot(midRange, false, pair),
      testPolicy('local-only'),
    );
    expect(decision.selected?.model.id).toBe(small.id);
    expect(decision.selected?.dataFlow.attachImage).toBe(false);
  });

  it('long sources skip models whose context window is too small', () => {
    const decision = recommend(
      longText,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('automatic'),
    );
    expect(decision.excluded.find((e) => e.model.id === bundled.id)?.reasons[0]).toMatch(
      /longer than its context window/,
    );
    expect(decision.selected?.model.id).toBe(cloud.id);
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
      testSnapshot(midRange, true, [
        providerGroup('llama-cpp', 'local', [bundled], false, 'Preparing local intelligence…'),
        providerGroup('ollama', 'local', [], false, 'Ollama is not running on this computer'),
      ]),
      testPolicy('local-only'),
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
      testSnapshot(midRange, false, [mockGroup]),
      testPolicy('local-only'),
    );
    expect(production.status).toBe('no-candidate');
    expect(production.excluded[0].reasons).toContain(
      'Demo / Mock AI is used only for demos, previews and tests',
    );
    const preview = recommend(
      simpleText,
      testSnapshot(midRange, false, [mockGroup, providerGroup('local', 'local', [small])]),
      testPolicy('local-only', 'balanced', { allowMock: true }),
    );
    expect(preview.selected?.model.id).toBe(small.id);
    const demo = recommend(
      simpleText,
      testSnapshot(midRange, false, [mockGroup]),
      testPolicy('local-only', 'balanced', { allowMock: true }),
    );
    expect(demo.selected?.provider.kind).toBe('mock');
    expect(demo.headline).toMatch(/Demo \/ Mock AI/);
    expect(demo.selected?.highlights).toContain('Not real AI');
  });

  it('fallback prefers a local model, skips the failed provider and never offers the mock', () => {
    const mock = { ...localModel('sample', { params: 0.1 }), providerId: 'mock' };
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, [
        providerGroup('cloud', 'cloud', [cloud]),
        providerGroup('cloud-b', 'cloud', [cloudModel('other-cloud', { providerId: 'cloud-b' })]),
        providerGroup('llama-cpp', 'local', [bundled]),
        providerGroup('mock', 'mock', [mock]),
      ]),
      testPolicy('automatic', 'balanced', { allowMock: true }),
    );
    expect(decision.selected?.model.privacy).toBe('cloud');
    expect(fallbackFor(decision, [decision.selected!.provider.id])?.model.id).toBe(bundled.id);
    expect(fallbackFor(decision, ['cloud', 'llama-cpp'])?.model.id).toBe('other-cloud');
    expect(fallbackFor(decision, ['cloud', 'cloud-b', 'llama-cpp'])).toBeUndefined();
  });

  it('recent failures lower reliability for that model', () => {
    const decision = recommend(
      screenshot,
      testSnapshot(midRange, true, bundledAndCloud),
      testPolicy('automatic'),
      new Map([['cloud/cloud-vision', 2]]),
    );
    expect(decision.selected?.model.id).toBe(bundled.id);
    const failed = decision.ranked.find((c) => c.model.id === cloud.id)!;
    expect(failed.breakdown.reliability.score).toBeLessThan(0.2);
    expect(failed.cautions).toContain('Failed earlier in this session');
  });
});
