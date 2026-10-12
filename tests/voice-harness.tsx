// Explicit test entrypoint. Never imported by the production application.
import ReactDOM from 'react-dom/client';
import App from '../src/App';
import { AppProvider } from '../src/app/AppProvider';
import { createServices } from '../src/app/services';
import { parseExtraction } from '../src/services/extraction/LocalExtractionService';
import { defaultSettings } from '../src/types/action';
import { transcript, rawAction } from './fixtures/voice';
import '../src/styles/app.css';
import '../src/components/motion/motion.css';
const query = new URLSearchParams(location.search);
if (!localStorage.getItem('tasklens:data:v1'))
  localStorage.setItem(
    'tasklens:data:v1',
    JSON.stringify({
      version: 1,
      actions: [],
      settings: { ...defaultSettings, onboardingCompletedVersion: 1 },
    }),
  );
const services = createServices();
let cancelled = 0,
  attempts = 0,
  closed = 0;
let closeRequest: ((close: () => Promise<void>) => void) | undefined;
Object.assign(window, {
  voiceTest: {
    requestClose() {
      closeRequest?.(async () => {
        closed++;
      });
    },
    get closed() {
      return closed;
    },
    get cancelled() {
      return cancelled;
    },
    get attempts() {
      return attempts;
    },
  },
});
services.voice = {
  available: true,
  async start(level) {
    if (query.has('denied'))
      throw new Error('TaskLens needs microphone access to record voice notes.');
    level(8000, 0.3);
    return { jobId: crypto.randomUUID(), capturedAt: '2026-10-11T04:00:00.000Z' };
  },
  async stop() {},
  async importFile(file) {
    return { jobId: crypto.randomUUID(), fileName: file.name };
  },
  async cancel() {
    cancelled++;
  },
  async guardClose(handler) {
    closeRequest = handler;
    return () => {
      if (closeRequest === handler) closeRequest = undefined;
    };
  },
};
services.speech = {
  async transcribe(_source, signal) {
    await new Promise((resolve) => setTimeout(resolve, query.has('slow') ? 1500 : 50));
    signal.throwIfAborted();
    if (query.has('silence')) throw new Error('No clear speech was detected.');
    return transcript();
  },
};
services.extraction = {
  mode: 'local',
  async extract(source, { signal }) {
    attempts++;
    signal.throwIfAborted();
    if (query.has('retry') && attempts === 1) throw new Error('Local extraction failed.');
    return parseExtraction(
      JSON.stringify({
        actions: [
          rawAction(),
          rawAction({ title: 'Consultation', requirements: ['Revised questionnaire'] }),
        ],
        ambiguities: [],
      }),
      source,
    );
  },
};
ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProvider services={services}>
    <App />
  </AppProvider>,
);
