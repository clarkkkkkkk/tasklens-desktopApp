// Explicit browser fixture: mocks native storage/transport, exercises real routing/validation/UI.
import '../src/styles/app.css';
import '../src/components/motion/motion.css';
import ReactDOM from 'react-dom/client';
import App from '../src/App';
import { AppProvider } from '../src/app/AppProvider';
import { createServices, withProcessingMode } from '../src/app/services';
import { ProviderRegistry } from '../src/services/ai/registry';
import { AIRouter } from '../src/services/ai/router';
import {
  GroqProvider,
  groqConnection,
  disconnectedGroq,
  type GroqStatus,
} from '../src/services/ai/providers/GroqProvider';
import { RoutedExtractionService } from '../src/services/extraction/RoutedExtractionService';
import { LocalAIError } from '../src/services/localai/native';
import { lowEnd } from '../src/services/ai/testing';
import { ocrDocumentSchema } from '../src/services/ocr/types';
import { defaultSettings } from '../src/types/action';
import { rawBundle, rawItem } from './fixtures/extraction/raw';
import pictorial from './fixtures/screenshots/ocr/pictorial.json';

const query = new URLSearchParams(location.search);
if (!localStorage.getItem('tasklens:data:v1'))
  localStorage.setItem(
    'tasklens:data:v1',
    JSON.stringify({
      version: 1,
      actions: [],
      settings: {
        ...defaultSettings,
        onboardingCompletedVersion: 1,
        ai: { ...defaultSettings.ai, modeChoiceCompleted: !query.has('fresh') },
      },
    }),
  );
const services = createServices();
const counts = { generated: 0, ocr: 0, local: 0, transcribed: 0, connected: 0 };
let connection: GroqStatus = {
  ...disconnectedGroq,
  connectivity: query.has('offline') ? 'offline' : query.has('unknown') ? 'unknown' : 'online',
};
Object.assign(groqConnection, {
  status: async () => ({ ...connection }),
  connect: async (key: string) => {
    if (key === 'invalid')
      throw new LocalAIError('GROQ_INVALID_KEY', 'Groq rejected this API key.');
    if (query.has('connect-network'))
      throw new LocalAIError('GROQ_NETWORK', 'Could not reach Groq. Retry connection.');
    counts.connected++;
    connection = {
      ...connection,
      connected: true,
      verified: true,
      providerReachable: true,
      storage: 'session',
    };
    return { ...connection };
  },
  verify: async () => {
    connection = { ...connection, verified: true, providerReachable: true };
    return { ...connection };
  },
  disconnect: async () => {
    connection = { ...disconnectedGroq, connectivity: connection.connectivity };
    return { ...connection };
  },
  configure: async (enabled: boolean, consent = false, resume = false) => {
    connection = {
      ...connection,
      enabled: enabled && (!connection.resumeRequired || resume),
      resumeRequired: resume ? false : connection.resumeRequired,
      consent: connection.consent || consent,
    };
    return { ...connection };
  },
});
const components = Object.fromEntries(
  [
    'tesseract',
    'eng.traineddata',
    'ceb.traineddata',
    'tgl.traineddata',
    'whisper',
    'whisper-cli',
  ].map((id) => [id, { state: 'ready', message: null }]),
);
// The flag is scoped to this fixture. Qwen intentionally remains unavailable.
Reflect.set(globalThis, 'isTauri', true);
let callbackId = 0;
Reflect.set(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', { unregisterListener: () => {} });
Reflect.set(window, '__TAURI_INTERNALS__', {
  metadata: {
    currentWindow: { label: 'main' },
    currentWebview: { label: 'main', windowLabel: 'main' },
  },
  transformCallback: () => ++callbackId,
  unregisterCallback: () => {},
  invoke: async (name: string) => {
    if (name.startsWith('plugin:event|')) return ++callbackId;
    if (name === 'local_intelligence_status')
      return { state: 'error', message: 'Qwen is not installed', components };
    if (name === 'local_diagnostics_session') return { enabled: false };
    return null;
  },
});
Reflect.set(window, 'groqTest', {
  counts,
  async network(online: boolean) {
    connection = {
      ...connection,
      connectivity: online ? 'online' : 'offline',
      providerReachable: false,
      enabled: false,
      resumeRequired: true,
    };
    await services.processing.refresh();
  },
  async preferenceSave() {
    await services.repository.saveSettings(services.settings.current);
  },
  get connection() {
    return connection;
  },
});
const provider = new GroqProvider({
  status: groqConnection.status,
  async begin(_id, _fingerprint, signal, onStatus) {
    signal.throwIfAborted();
    if (!connection.enabled || !connection.consent)
      throw new LocalAIError('GROQ_CONSENT', 'Privacy consent required.');
    if (!connection.connected) throw new LocalAIError('GROQ_INVALID_KEY', 'Connect your key.');
    onStatus?.({ stage: 'sending' });
  },
  async finish() {},
  async generate(_id, request, signal) {
    counts.generated++;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, query.has('slow') ? 5000 : 300);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
    signal.throwIfAborted();
    if (query.has('fail-once') && counts.generated === 1)
      throw new LocalAIError(
        'GROQ_RATE_LIMIT',
        'Rate limit reached. Source retained.',
        undefined,
        undefined,
        Date.now() + 1000,
      );
    const user = Reflect.get(request, 'user') as string;
    const id = user.includes('[r3]') ? 'r3' : (/\[([ts]\d+)\]/.exec(user)?.[1] ?? 't1');
    return {
      content: rawBundle([
        rawItem({ title: { evidence: [id], value: 'Pictorial', confidence: 'confirmed' } }),
      ]),
      truncated: false,
      elapsedMs: 300,
    };
  },
});
const registry = new ProviderRegistry([provider]);
const router = new AIRouter(registry, { profile: async () => lowEnd }, () => ({
  ...services.settings.current.ai,
  executionMode: services.processing.getSnapshot().effectiveMode,
  allowMock: false,
}));
services.ai = { registry, router, device: { profile: async () => lowEnd } };
services.extraction = withProcessingMode(
  new RoutedExtractionService(
    {
      recognize: async () => {
        counts.ocr++;
        return ocrDocumentSchema.parse(pictorial);
      },
    },
    router,
    () => services.settings.current,
  ),
  services.processing,
);
services.models.list = async () => [];
services.voice = {
  ...services.voice,
  available: true,
  start: async () => ({ jobId: crypto.randomUUID(), capturedAt: new Date().toISOString() }),
  stop: async () => {},
  cancel: async () => {},
  guardClose: async () => () => {},
};
services.speech = {
  transcribe: async (_source, signal, progress) => {
    signal.throwIfAborted();
    counts.transcribed++;
    progress('transcribing');
    if (query.has('slow-transcription')) await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      fullText: 'Pictorial at campus.',
      segments: [{ id: 's1', text: 'Pictorial at campus.', startMs: 0, endMs: 1000 }],
      durationMs: 1000,
      language: 'en',
      model: 'whisper-small',
    };
  },
};
if (query.has('reminder-warning'))
  Object.defineProperty(services.repository, 'reminderWarning', {
    get: () => 'Your task data was saved. Reminder delivery is paused because registration failed.',
  });
if (query.has('settings-fail'))
  services.repository.saveSettings = async () => {
    throw new Error('Fixture preference storage failure.');
  };
let writes = 0;
const realSave = services.repository.saveAction.bind(services.repository);
services.repository.saveAction = async (action) => {
  writes++;
  if (query.has('save-slow')) await new Promise((resolve) => setTimeout(resolve, 700));
  if (query.has('save-fail-once') && writes === 1)
    throw new Error('Fixture storage failure. Edits retained.');
  return realSave(action);
};
Reflect.set(window, 'reviewWrites', () => writes);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProvider services={services}>
    <App />
  </AppProvider>,
);
