import { describe, expect, it } from 'vitest';
import { assessDevice } from './device';
import {
  estimateMemory,
  parseModelName,
  parseParameterSize,
  qualityFromFootprint,
} from './footprint';
import { bundledModel } from './providers/LlamaCppProvider';
import { deriveRequirements } from './requirements';
import { testDevice } from './testing';

describe('model footprint', () => {
  it('parses parameter counts and quantization from names without special-casing models', () => {
    expect(parseModelName('Qwen3-4B-Q4_K_M.gguf')).toEqual({
      parameterBillions: 4,
      quantization: 'Q4_K_M',
    });
    expect(parseModelName('qwen2.5:1.5b-instruct-q5_K_M')).toEqual({
      parameterBillions: 1.5,
      quantization: 'Q5_K_M',
    });
    expect(parseModelName('phi4-mini:3.8b')).toEqual({ parameterBillions: 3.8 });
    expect(parseModelName('llama3.1:8b-instruct-fp16')).toEqual({
      parameterBillions: 8,
      quantization: 'FP16',
    });
    expect(parseModelName('mystery-model')).toEqual({});
    expect(parseParameterSize('7.6B')).toBe(7.6);
    expect(parseParameterSize('494.03M')).toBeCloseTo(0.494);
  });

  it('estimates memory from the detected file size before parameters', () => {
    const fromFile = estimateMemory(bundledModel(null, 8192))!;
    expect(fromFile.basis).toBe('file size');
    expect(fromFile.weightsGB).toBeCloseTo(2.33, 1);
    expect(fromFile.minRamGB).toBeGreaterThan(fromFile.weightsGB);
    expect(fromFile.recommendedRamGB).toBeGreaterThan(fromFile.minRamGB);
    const q4 = estimateMemory({
      ...bundledModel(null, 8192),
      footprint: { parameterBillions: 7, quantization: 'Q4_K_M' },
    })!;
    const q8 = estimateMemory({
      ...bundledModel(null, 8192),
      footprint: { parameterBillions: 7, quantization: 'Q8_0' },
    })!;
    expect(q4.basis).toBe('parameters and quantization');
    expect(q8.weightsGB).toBeGreaterThan(q4.weightsGB * 1.6);
  });

  it('quality heuristic grows with size and drops for very low-bit quantization', () => {
    expect(qualityFromFootprint({ parameterBillions: 1.5 })).toBe('basic');
    expect(qualityFromFootprint({ parameterBillions: 7, quantization: 'Q4_K_M' })).toBe('good');
    expect(qualityFromFootprint({ parameterBillions: 14 })).toBe('excellent');
    expect(qualityFromFootprint({ parameterBillions: 14, quantization: 'Q2_K' })).toBe('good');
  });
});

describe('device assessment', () => {
  it('summarises this kind of machine and keeps headroom for the system', () => {
    const device = assessDevice(
      testDevice({
        ramGB: 32,
        freeGB: 16,
        gpu: { vendor: 'nvidia', name: 'NVIDIA GeForce GTX 1650', vramGB: 4, freeGB: 2.6 },
      }),
    );
    expect(device.summary).toBe('Ryzen 5 3600 • 32 GB RAM • GTX 1650 (4 GB)');
    expect(device.ramBudgetGB).toBeCloseTo(14.5);
    expect(device.vramBudgetGB).toBeCloseTo(2.1);
    expect(device.performanceClass).toBe('mid');
    expect(device.accelerators).toEqual(['cpu', 'cuda', 'vulkan']);
  });

  it('classifies low-end and memory pressure', () => {
    const device = assessDevice(testDevice({ ramGB: 8, freeGB: 0.8, threads: 4 }));
    expect(device.performanceClass).toBe('low');
    expect(device.memoryPressure).toBe('high');
    expect(device.summary).toMatch(/No GPU detected$/);
  });
});

describe('task requirements', () => {
  it('screenshots prefer image understanding, strongly when the text is hard to read', () => {
    const plain = deriveRequirements({
      kind: 'screenshot',
      texts: [
        'MIDTERM EXAMINATION',
        'Friday, October 9 at 9:00 AM',
        'Room 204, Science Building',
        'Bring two pencils and your school ID.',
        'No calculators allowed.',
      ],
      ocrConfidences: [0.95, 0.93, 0.96, 0.94, 0.95],
      imagePixels: 400_000,
    });
    expect(plain.visualSignal).toBe('some');
    expect(plain.preferred[0]).toMatchObject({ capability: 'image-understanding', weight: 0.5 });
    const hard = deriveRequirements({
      kind: 'screenshot',
      texts: ['P1ctorial', 'Thurs'],
      ocrConfidences: [0.4, 0.55],
      imagePixels: 2_000_000,
    });
    expect(hard.visualSignal).toBe('strong');
    expect(hard.complexity).toBe('complex');
    expect(hard.preferred[0].weight).toBe(1);
    expect(hard.localStages).toEqual(['Text recognition (Tesseract)']);
  });

  it('short typed text is a simple job; voice notes are transcribed locally first', () => {
    const text = deriveRequirements({ kind: 'text', texts: ['Quiz on Friday 9 AM.'] });
    expect(text).toMatchObject({ complexity: 'simple', hasImage: false, preferred: [] });
    const voice = deriveRequirements({ kind: 'voice', texts: ['Submit the report before 5.'] });
    expect(voice.localStages).toEqual(['Speech-to-text (Whisper)']);
    expect(voice.required).toEqual(['structured-extraction', 'json-output']);
  });

  it('detects mixed Cebuano/Tagalog and long sources', () => {
    const mixed = deriveRequirements({
      kind: 'text',
      texts: ['Ugma na ang quiz sa math, magdala mo ug calculator para sa klase.'],
    });
    expect(mixed.multilingual).toBe(true);
    expect(mixed.preferred.map((p) => p.capability)).toContain('multilingual');
    const long = deriveRequirements({
      kind: 'text',
      texts: Array.from(
        { length: 200 },
        (_, i) => `Line ${i}: the schedule for section ${i} changes next week.`,
      ),
    });
    expect(long.complexity).toBe('complex');
    expect(long.preferred.map((p) => p.capability)).toContain('long-context');
  });
});
