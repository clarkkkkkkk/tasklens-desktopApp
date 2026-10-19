import type { Settings } from '../../types/action';
import type { DeviceProfile } from '../ai/device';
import { defaultPolicy } from '../ai/policy';
import { recommend, type RoutingSnapshot } from '../ai/router';
import type { AIModel, AIProvider } from '../ai/types';
import { LlamaCppProvider, bundledModel } from '../ai/providers/LlamaCppProvider';
import type { LocalModelManager } from '../localai/LocalModelManager';
import type { OcrService } from '../ocr/types';
import { RoutedExtractionService, type ExtractionRouting } from './RoutedExtractionService';

const unmeasuredDevice: DeviceProfile = {
  source: 'simulated',
  os: 'unknown',
  arch: 'unknown',
  cpu: { vendor: null, model: null, logicalCores: 4, physicalCores: null, features: [] },
  memory: { totalBytes: null, availableBytes: null },
  gpus: [],
};

/** Always routes to one provider and model; no discovery, no fallback. */
export function fixedRouting(provider: AIProvider, model: AIModel): ExtractionRouting {
  const snapshot: RoutingSnapshot = {
    device: unmeasuredDevice,
    network: { online: true, source: 'simulated', checkedAt: 0 },
    providers: [
      {
        provider: {
          id: provider.id,
          name: provider.name,
          kind: provider.kind,
          runtime: provider.runtime,
        },
        status: { available: true },
        models: [model],
      },
    ],
  };
  return {
    decide: async (requirements) =>
      recommend(requirements, snapshot, { ...defaultPolicy, allowMock: provider.kind === 'mock' }),
    fallbackFor: () => undefined,
    provider: (id) => (id === provider.id ? provider : undefined),
    recordFailure: () => {},
    recordSuccess: () => {},
  };
}

/**
 * Screenshot/voice/text → local OCR (screenshots) → the bundled model through the
 * TaskLens-managed llama.cpp runtime → validation → review. Everything runs on this device.
 * The routed pipeline with a fixed route; the app itself uses the full router.
 */
export class LocalAIExtractionService extends RoutedExtractionService {
  override readonly mode = 'local' as const;

  constructor(
    ocr: OcrService,
    model: LocalModelManager,
    settings: () => Pick<Settings, 'defaultReminders'>,
  ) {
    const provider = new LlamaCppProvider(model);
    super(ocr, fixedRouting(provider, { ...bundledModel(null, 32768), ready: true }), settings);
  }
}
