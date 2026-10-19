import type { ProviderMeta } from './scoring';
import type { AIModel, AIProvider, ProviderStatus } from './types';

export interface ProviderSnapshot {
  provider: ProviderMeta;
  status: ProviderStatus;
  models: AIModel[];
}

const DISCOVERY_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * Holds the provider adapters and discovers their models. Discovery runs in parallel, is
 * bounded by a timeout per provider and never sends source material anywhere.
 */
export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();
  private cache?: { at: number; value: Promise<ProviderSnapshot[]> };

  constructor(
    providers: AIProvider[] = [],
    private readonly maxAgeMs = 5000,
  ) {
    providers.forEach((p) => this.register(p));
  }

  register(provider: AIProvider) {
    this.providers.set(provider.id, provider);
    this.cache = undefined;
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }

  invalidate() {
    this.cache = undefined;
  }

  discover(refresh = false): Promise<ProviderSnapshot[]> {
    if (!refresh && this.cache && Date.now() - this.cache.at < this.maxAgeMs)
      return this.cache.value;
    const value = Promise.all(this.list().map((provider) => this.discoverOne(provider)));
    this.cache = { at: Date.now(), value };
    return value;
  }

  private async discoverOne(provider: AIProvider): Promise<ProviderSnapshot> {
    const meta: ProviderMeta = {
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      runtime: provider.runtime,
    };
    const status = await withTimeout(provider.isAvailable(), DISCOVERY_TIMEOUT_MS, {
      available: false,
      reason: `${provider.name} did not respond`,
    });
    // Unavailable providers still list their known models so the UI can explain why.
    const models = await withTimeout(provider.getModels(), DISCOVERY_TIMEOUT_MS, [] as AIModel[]);
    return { provider: meta, status, models };
  }
}
