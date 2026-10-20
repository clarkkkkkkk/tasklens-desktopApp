import type { DeviceProfile } from './device';
import { bundledModel, LLAMA_PROVIDER_ID } from './providers/LlamaCppProvider';
import type { ProviderSnapshot } from './registry';
import type { TaskSignals } from './requirements';
import type { AIModel } from './types';

/**
 * Example devices and models for the router simulator in Settings. They demonstrate routing
 * decisions only; nothing here is installed, detected or run.
 */
const GB = 1024 ** 3;

export const exampleDevices: { id: string; label: string; profile: DeviceProfile }[] = [
  {
    id: 'low',
    label: 'Low-end laptop · 8 GB RAM · integrated graphics',
    profile: {
      source: 'simulated',
      os: 'windows',
      arch: 'x86_64',
      cpu: {
        vendor: 'Intel',
        model: 'Intel Core i3-1115G4',
        logicalCores: 4,
        physicalCores: 2,
        features: ['avx2'],
      },
      memory: { totalBytes: 8 * GB, availableBytes: 3.5 * GB },
      gpus: [
        {
          vendor: 'intel',
          name: 'Intel UHD Graphics',
          vramBytes: null,
          vramFreeBytes: null,
          integrated: true,
          backends: ['intel', 'vulkan'],
        },
      ],
    },
  },
  {
    id: 'mid',
    label: 'Mid-range desktop · 16 GB RAM · 8 GB GPU',
    profile: {
      source: 'simulated',
      os: 'windows',
      arch: 'x86_64',
      cpu: {
        vendor: 'AMD',
        model: 'AMD Ryzen 5 5600',
        logicalCores: 12,
        physicalCores: 6,
        features: ['avx2'],
      },
      memory: { totalBytes: 16 * GB, availableBytes: 9 * GB },
      gpus: [
        {
          vendor: 'nvidia',
          name: 'NVIDIA GeForce RTX 3060 Ti',
          vramBytes: 8 * GB,
          vramFreeBytes: 7 * GB,
          integrated: false,
          backends: ['cuda', 'vulkan'],
        },
      ],
    },
  },
  {
    id: 'high',
    label: 'High-end workstation · 64 GB RAM · 24 GB GPU',
    profile: {
      source: 'simulated',
      os: 'linux',
      arch: 'x86_64',
      cpu: {
        vendor: 'AMD',
        model: 'AMD Ryzen 9 7950X',
        logicalCores: 32,
        physicalCores: 16,
        features: ['avx2', 'avx512f'],
      },
      memory: { totalBytes: 64 * GB, availableBytes: 48 * GB },
      gpus: [
        {
          vendor: 'nvidia',
          name: 'NVIDIA GeForce RTX 4090',
          vramBytes: 24 * GB,
          vramFreeBytes: 22 * GB,
          integrated: false,
          backends: ['cuda', 'vulkan'],
        },
      ],
    },
  },
];

const example = (
  model: Omit<AIModel, 'specSource' | 'providerId'>,
  providerId: string,
): AIModel => ({
  ...model,
  providerId,
  specSource: 'example',
});

const localExamples: AIModel[] = [
  example(
    {
      id: 'example-1.5b-q4',
      name: 'Small local model · 1.5B Q4',
      capabilities: ['text-generation', 'structured-extraction', 'json-output'],
      footprint: { parameterBillions: 1.5, quantization: 'Q4_K_M', contextLength: 32768 },
      accelerators: ['cpu', 'cuda', 'rocm', 'metal'],
      ready: true,
    },
    'example-local',
  ),
  example(
    {
      id: 'example-7b-vision-q4',
      name: 'Local vision model · 7B Q4',
      capabilities: [
        'text-generation',
        'structured-extraction',
        'json-output',
        'image-understanding',
        'long-context',
      ],
      footprint: { parameterBillions: 7, quantization: 'Q4_K_M', contextLength: 128000 },
      accelerators: ['cpu', 'cuda', 'rocm', 'metal'],
      ready: true,
    },
    'example-local',
  ),
  example(
    {
      id: 'example-14b-q4',
      name: 'Large local model · 14B Q4',
      capabilities: [
        'text-generation',
        'structured-extraction',
        'json-output',
        'multilingual',
        'long-context',
        'reasoning',
      ],
      footprint: { parameterBillions: 14, quantization: 'Q4_K_M', contextLength: 32768 },
      accelerators: ['cpu', 'cuda', 'rocm', 'metal'],
      ready: true,
    },
    'example-local',
  ),
];

export interface CatalogChoice {
  bundled: boolean;
  small: boolean;
  vision: boolean;
  large: boolean;
}

export function exampleProviders(choice: CatalogChoice): ProviderSnapshot[] {
  const local = localExamples.filter(
    (m) =>
      (choice.small && m.id === 'example-1.5b-q4') ||
      (choice.vision && m.id === 'example-7b-vision-q4') ||
      (choice.large && m.id === 'example-14b-q4'),
  );
  return [
    ...(choice.bundled
      ? [
          {
            provider: {
              id: LLAMA_PROVIDER_ID,
              name: 'llama.cpp (bundled)',
              kind: 'local' as const,
              runtime: 'Bundled llama.cpp',
            },
            status: { available: true },
            models: [{ ...bundledModel(null, 8192), ready: true }],
          },
        ]
      : []),
    {
      provider: {
        id: 'example-local',
        name: 'Example local runtime',
        kind: 'local',
        runtime: 'Example GPU-capable runtime',
      },
      status: { available: true },
      models: local,
    },
  ];
}

/** Representative inputs for previewing routing per input kind. */
export const sampleTasks: { id: string; label: string; signals: TaskSignals }[] = [
  { id: 'screenshot', label: 'Screenshot', signals: { kind: 'screenshot' } },
  {
    id: 'text',
    label: 'Typed text',
    signals: { kind: 'text', texts: ['Quiz on Friday 9 AM, Room 204.'] },
  },
  {
    id: 'voice',
    label: 'Voice note',
    signals: {
      kind: 'voice',
      texts: ['Remind me to submit the lab report before 5 tomorrow.', 'Also bring a calculator.'],
    },
  },
  {
    id: 'long',
    label: 'Long announcement',
    signals: { kind: 'text', assumeLong: true, texts: [] },
  },
];
