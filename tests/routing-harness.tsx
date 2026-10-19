// Explicit test entrypoint for routing, consent and fallback. Never imported by the application.
// The real router, consent broker, pipeline and UI run against test providers and recorded OCR.
// Global styles first, as in main.tsx, so component layers keep their order.
import '../src/styles/app.css';
import '../src/components/motion/motion.css';
import ReactDOM from 'react-dom/client';
import App from '../src/App';
import { AppProvider } from '../src/app/AppProvider';
import { createServices } from '../src/app/services';
import { ProviderRegistry } from '../src/services/ai/registry';
import { AIRouter } from '../src/services/ai/router';
import { cloudModel, localModel, midRange } from '../src/services/ai/testing';
import { AIProviderError, type AIModel, type AIProvider } from '../src/services/ai/types';
import type { NetworkMonitor } from '../src/services/ai/network';
import { RoutedExtractionService } from '../src/services/extraction/RoutedExtractionService';
import { defaultSettings, type Settings } from '../src/types/action';
import { ocrDocumentSchema } from '../src/services/ocr/types';
import pictorialOcr from './fixtures/screenshots/ocr/pictorial.json';
import { rawBundle, rawItem } from './fixtures/extraction/raw';

const query = new URLSearchParams(location.search);
const mode = (query.get('mode') ?? 'ask-before-cloud') as Settings['ai']['mode'];
localStorage.setItem(
  'tasklens:data:v1',
  JSON.stringify({
    version: 1,
    actions: [],
    settings: {
      ...defaultSettings,
      onboardingCompletedVersion: 1,
      ai: { ...defaultSettings.ai, mode },
    },
  }),
);

const output = rawBundle([
  rawItem({ title: { evidence: ['r3'], value: 'Pictorial', confidence: 'confirmed' } }),
]);
const calls: Record<string, number> = {};
function testProvider(
  id: string,
  name: string,
  kind: 'local' | 'cloud',
  model: AIModel,
  fail = false,
): AIProvider {
  return {
    id,
    name,
    kind,
    runtime: `${name} (test)`,
    isAvailable: async () => ({ available: true }),
    getModels: async () => [{ ...model, providerId: id }],
    async generate(request) {
      calls[id] = (calls[id] ?? 0) + 1;
      request.signal.throwIfAborted();
      if (fail) throw new AIProviderError('network', 'The provider could not be reached.', id);
      return { content: output, truncated: false, elapsedMs: 5 };
    },
  };
}

const services = createServices();
const registry = new ProviderRegistry([
  testProvider('local-test', 'Local test runtime', 'local', {
    ...localModel('Local Test 4B', { params: 4, gpu: false }),
  }),
  testProvider(
    'cloud-test',
    'Test Cloud',
    'cloud',
    cloudModel('Test Cloud Vision'),
    query.has('cloud-fails'),
  ),
]);
const network = {
  current: () => ({ online: true, source: 'simulated', checkedAt: 0 }),
  subscribe: () => () => {},
} as unknown as NetworkMonitor;
const router = new AIRouter(registry, { profile: async () => midRange }, network, () => ({
  mode: services.settings.current.ai.mode,
  priority: services.settings.current.ai.priority,
  manualModel: services.settings.current.ai.manualModel,
  shareImages: services.settings.current.ai.shareImages,
  allowMock: false,
}));
services.ai = { ...services.ai, router, registry, network };
services.extraction = new RoutedExtractionService(
  { recognize: async () => ocrDocumentSchema.parse(pictorialOcr) },
  router,
  () => services.settings.current,
  {
    consent: services.ai.consent,
    encodeImage: async () => ({ mimeType: 'image/jpeg', base64: 'AAAA' }),
  },
);
Object.assign(window, { routingTest: { calls } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProvider services={services}>
    <App />
  </AppProvider>,
);
