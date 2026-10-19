/* Test builders for routing scenarios. Imported only by *.test.ts files. */
import type { DeviceProfile, GpuInfo } from './device';
import { defaultPolicy, type AIMode, type AIPriority, type RoutingPolicy } from './policy';
import type { ProviderSnapshot } from './registry';
import type { RoutingSnapshot } from './router';
import type { ProviderMeta } from './scoring';
import type { AICapability, AIModel } from './types';

const GB = 1024 ** 3;

export function testDevice(options: {
  ramGB: number;
  freeGB: number;
  threads?: number;
  gpu?: {
    vendor: GpuInfo['vendor'];
    name: string;
    vramGB: number;
    freeGB?: number;
    integrated?: boolean;
  };
}): DeviceProfile {
  const gpu = options.gpu;
  return {
    source: 'simulated',
    os: 'windows',
    arch: 'x86_64',
    cpu: {
      vendor: 'AMD',
      model: 'AMD Ryzen 5 3600 6-Core Processor',
      logicalCores: options.threads ?? 12,
      physicalCores: 6,
      features: ['avx2'],
    },
    memory: { totalBytes: options.ramGB * GB, availableBytes: options.freeGB * GB },
    gpus: gpu
      ? [
          {
            vendor: gpu.vendor,
            name: gpu.name,
            vramBytes: gpu.vramGB * GB,
            vramFreeBytes: (gpu.freeGB ?? gpu.vramGB) * GB,
            integrated: gpu.integrated ?? false,
            backends:
              gpu.vendor === 'nvidia'
                ? ['cuda', 'vulkan']
                : gpu.vendor === 'apple'
                  ? ['metal']
                  : ['vulkan'],
          },
        ]
      : [],
  };
}

export const lowEnd = testDevice({ ramGB: 8, freeGB: 3.5, threads: 4 });
export const midRange = testDevice({
  ramGB: 16,
  freeGB: 9,
  gpu: { vendor: 'nvidia', name: 'NVIDIA GeForce RTX 3060 Ti', vramGB: 8, freeGB: 7 },
});
export const highEnd = testDevice({
  ramGB: 64,
  freeGB: 48,
  threads: 32,
  gpu: { vendor: 'nvidia', name: 'NVIDIA GeForce RTX 4090', vramGB: 24, freeGB: 22 },
});

const TEXT: AICapability[] = ['text-generation', 'structured-extraction', 'json-output'];

export function localModel(
  id: string,
  options: {
    params: number;
    vision?: boolean;
    multilingual?: boolean;
    context?: number;
    gpu?: boolean;
    providerId?: string;
    ready?: boolean;
  },
): AIModel {
  return {
    id,
    providerId: options.providerId ?? 'local',
    name: id,
    capabilities: [
      ...TEXT,
      ...(options.vision ? (['image-understanding'] as const) : []),
      ...(options.multilingual ? (['multilingual'] as const) : []),
    ],
    footprint: {
      parameterBillions: options.params,
      quantization: 'Q4_K_M',
      contextLength: options.context ?? 32768,
    },
    specSource: 'declared',
    accelerators: options.gpu === false ? ['cpu'] : ['cpu', 'cuda', 'rocm', 'metal'],
    ready: options.ready ?? true,
  };
}

export const meta = (id: string, kind: ProviderMeta['kind'], name = id): ProviderMeta => ({
  id,
  name,
  kind,
  runtime: `${name} runtime`,
});

export function providerGroup(
  id: string,
  kind: ProviderMeta['kind'],
  models: AIModel[],
  available = true,
  reason?: string,
): ProviderSnapshot {
  return {
    provider: meta(id, kind),
    status: available ? { available } : { available, reason },
    models,
  };
}

export function testSnapshot(
  device: DeviceProfile,
  providers: ProviderSnapshot[],
): RoutingSnapshot {
  return { device, providers };
}

export const testPolicy = (
  mode: AIMode,
  priority: AIPriority = 'balanced',
  extra: Partial<RoutingPolicy> = {},
): RoutingPolicy => ({
  ...defaultPolicy,
  mode,
  priority,
  ...extra,
});
