import type { Services } from '../../app/services';
import type { AIMode } from '../../services/ai/policy';

/**
 * Whether any cloud provider is registered. TaskLens currently ships none, so cloud-only
 * controls stay hidden; the router still supports cloud adapters added later.
 */
export const cloudProvidersRegistered = (services: Services) =>
  services.ai.registry.list().some((provider) => provider.kind === 'cloud');

/** The mode that actually applies: without cloud providers every automatic mode is Local Only. */
export const effectiveMode = (mode: AIMode, cloud: boolean): AIMode =>
  cloud || mode === 'manual' ? mode : 'local-only';
