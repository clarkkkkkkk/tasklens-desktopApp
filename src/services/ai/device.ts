import { nativeAvailable, nativeInvoke } from '../localai/native';
import { formatGB } from './footprint';
import type { Accelerator } from './types';

const GB = 1024 ** 3;

export interface GpuInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'other';
  name: string;
  vramBytes: number | null;
  /** Currently free VRAM, when the driver reports it (nvidia-smi, amdgpu). */
  vramFreeBytes: number | null;
  integrated: boolean;
  /** Acceleration backends this GPU can offer to runtimes that support them. */
  backends: Accelerator[];
}

/**
 * Hardware facts relevant to running models. Deliberately excludes serial numbers, host and user
 * names, network addresses and storage contents.
 */
export interface DeviceProfile {
  source: 'native' | 'browser' | 'simulated';
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  arch: string;
  cpu: {
    vendor: string | null;
    model: string | null;
    logicalCores: number;
    physicalCores: number | null;
    features: string[];
  };
  memory: { totalBytes: number | null; availableBytes: number | null };
  gpus: GpuInfo[];
}

export type PerformanceClass = 'low' | 'mid' | 'high';
export type MemoryPressure = 'low' | 'moderate' | 'high' | 'unknown';

export interface DeviceAssessment {
  performanceClass: PerformanceClass;
  memoryPressure: MemoryPressure;
  totalRamGB: number | null;
  /** RAM a local model may use while leaving headroom for the system and TaskLens. */
  ramBudgetGB: number | null;
  bestGpu: GpuInfo | null;
  /** VRAM a GPU-capable runtime may use on the best GPU. */
  vramBudgetGB: number | null;
  accelerators: Accelerator[];
  /** "Ryzen 5 3600 • 32 GB RAM • GTX 1650". */
  summary: string;
}

/** Headroom kept free for the OS, the webview and OCR while a model runs. */
const RAM_HEADROOM_GB = 1.5;
const VRAM_HEADROOM_GB = 0.5;

function shortCpu(model: string | null): string | null {
  if (!model) return null;
  return model
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\b(CPU|Processor|with Radeon Graphics|\d+-Core)\b/gi, '')
    .replace(/@.*$/, '')
    .replace(/^(AMD|Intel|Apple)\s+/i, (vendor) => (/apple/i.test(vendor) ? vendor : ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function shortGpu(gpu: GpuInfo): string {
  const name = gpu.name
    .replace(/^(NVIDIA|AMD|Intel\(R\)|Intel)\s+/i, '')
    .replace(/^GeForce\s+/i, '');
  return gpu.vramBytes && !gpu.integrated ? `${name} (${formatGB(gpu.vramBytes / GB)})` : name;
}

export function assessDevice(profile: DeviceProfile): DeviceAssessment {
  const total = profile.memory.totalBytes;
  const available = profile.memory.availableBytes;
  const totalRamGB = total ? total / GB : null;
  const availableGB = available ? available / GB : null;
  const ramBudgetGB =
    availableGB !== null
      ? Math.max(0, availableGB - RAM_HEADROOM_GB)
      : totalRamGB !== null
        ? Math.max(0, totalRamGB * 0.5 - RAM_HEADROOM_GB)
        : null;
  const ratio = total && available ? available / total : null;
  const memoryPressure: MemoryPressure =
    ratio === null ? 'unknown' : ratio < 0.15 ? 'high' : ratio < 0.35 ? 'moderate' : 'low';

  const dedicated = profile.gpus.filter((g) => !g.integrated);
  const bestGpu =
    [...dedicated].sort((a, b) => (b.vramBytes ?? 0) - (a.vramBytes ?? 0))[0] ??
    profile.gpus.find((g) => g.vendor === 'apple') ??
    profile.gpus[0] ??
    null;
  // Apple Silicon shares system memory with the GPU.
  const vramBudgetGB = bestGpu
    ? bestGpu.vendor === 'apple'
      ? ramBudgetGB
      : bestGpu.vramFreeBytes !== null
        ? Math.max(0, bestGpu.vramFreeBytes / GB - VRAM_HEADROOM_GB)
        : bestGpu.vramBytes
          ? Math.max(0, bestGpu.vramBytes / GB - VRAM_HEADROOM_GB)
          : null
    : null;
  const accelerators: Accelerator[] = ['cpu', ...new Set(profile.gpus.flatMap((g) => g.backends))];

  // Heuristic classes for explanations; not a benchmark.
  const bigGpu = bestGpu && !bestGpu.integrated && (bestGpu.vramBytes ?? 0) >= 8 * GB;
  const appleBig = bestGpu?.vendor === 'apple' && (totalRamGB ?? 0) >= 32;
  const threads = profile.cpu.logicalCores;
  const performanceClass: PerformanceClass =
    (totalRamGB ?? 0) >= 32 && (bigGpu || appleBig)
      ? 'high'
      : (totalRamGB ?? 0) >= 16 || ((totalRamGB ?? 0) >= 12 && threads >= 8)
        ? 'mid'
        : 'low';

  const parts = [
    shortCpu(profile.cpu.model) ?? `${threads}-thread CPU`,
    totalRamGB ? `${Math.round(totalRamGB)} GB RAM` : 'RAM unknown',
    bestGpu ? shortGpu(bestGpu) : 'No GPU detected',
  ];
  return {
    performanceClass,
    memoryPressure,
    totalRamGB,
    ramBudgetGB,
    bestGpu,
    vramBudgetGB,
    accelerators,
    summary: parts.join(' • '),
  };
}

export interface DeviceProfiler {
  profile(): Promise<DeviceProfile>;
}

/** Coarse estimate from the web platform, for the browser preview only. */
export function browserDeviceProfile(): DeviceProfile {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const memoryGB = (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
  const platform = nav?.userAgent ?? '';
  return {
    source: 'browser',
    os: /Windows/i.test(platform)
      ? 'windows'
      : /Mac/i.test(platform)
        ? 'macos'
        : /Linux/i.test(platform)
          ? 'linux'
          : 'unknown',
    arch: 'unknown',
    cpu: {
      vendor: null,
      model: null,
      logicalCores: nav?.hardwareConcurrency ?? 4,
      physicalCores: null,
      features: [],
    },
    memory: { totalBytes: memoryGB ? memoryGB * GB : null, availableBytes: null },
    gpus: [],
  };
}

/** Native hardware detection through Rust, with a short cache so memory stays current. */
export class NativeDeviceProfiler implements DeviceProfiler {
  private cached?: { at: number; value: Promise<DeviceProfile> };
  constructor(private readonly maxAgeMs = 15_000) {}
  profile(): Promise<DeviceProfile> {
    if (!nativeAvailable()) return Promise.resolve(browserDeviceProfile());
    if (this.cached && Date.now() - this.cached.at < this.maxAgeMs) return this.cached.value;
    const value = nativeInvoke<DeviceProfile>('ai_device_profile').catch(() => {
      this.cached = undefined;
      return browserDeviceProfile();
    });
    this.cached = { at: Date.now(), value };
    return value;
  }
}
