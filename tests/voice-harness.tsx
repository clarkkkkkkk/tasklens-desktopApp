// Explicit test entrypoint. Never imported by the production application.
// Match production stylesheet order so CSS layers and fonts render accurately.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '../src/styles/app.css';
import '../src/components/motion/motion.css';
import ReactDOM from 'react-dom/client';
import App from '../src/App';
import { AppProvider } from '../src/app/AppProvider';
import { newAction } from '../src/lib/actions';
import midtermOcr from './fixtures/screenshots/ocr/midterm.json';
import { createServices } from '../src/app/services';
import {
  unitsFromText,
  unitsFromTranscript,
} from '../src/services/extraction/prompts/build-prompt';
import { validateExtraction } from '../src/services/extraction/validation/validate-extraction';
import { rawBundle, rawItem } from './fixtures/extraction/raw';
import { defaultSettings } from '../src/types/action';
import { phrases, transcript } from './fixtures/voice';
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
let ocrReads = 0;
let recordingTimer: ReturnType<typeof setInterval> | undefined;
const amplitudeSamples = [0, 0.02, 0.12, 0.32, 0.55, 0.2, 0.04, 0];
let starts = 0,
  imports = 0;
let cancelled = 0,
  attempts = 0,
  closed = 0,
  extractionAborted = 0;
let closeRequest: ((close: () => Promise<void>) => void) | undefined;
Object.assign(window, {
  voiceTest: {
    requestClose() {
      closeRequest?.(async () => {
        closed++;
      });
    },
    get ocrReads() {
      return ocrReads;
    },
    get starts() {
      return starts;
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
    get extractionAborted() {
      return extractionAborted;
    },
  },
});
services.voice = {
  available: true,
  async start(level) {
    starts++;
    if (query.has('denied'))
      throw new Error('TaskLens needs microphone access to record voice notes.');
    let tick = 0;
    level(0, 0);
    recordingTimer = setInterval(() => {
      tick++;
      level(tick * 100, query.has('quiet') ? 0 : amplitudeSamples[tick % amplitudeSamples.length]);
    }, 100);
    return { jobId: crypto.randomUUID(), capturedAt: '2026-10-11T04:00:00.000Z' };
  },
  async stop() {
    clearInterval(recordingTimer);
    if (query.has('staged')) await new Promise((resolve) => setTimeout(resolve, 500));
  },
  async importFile(file, signal) {
    imports++;
    if (query.has('import-fails-once') && imports === 1)
      throw new Error('Audio import interrupted.');
    if (query.has('staged')) await new Promise((resolve) => setTimeout(resolve, 500));
    signal.throwIfAborted();
    return { jobId: crypto.randomUUID(), fileName: file.name };
  },
  async cancel() {
    cancelled++;
    clearInterval(recordingTimer);
    if (query.has('cleanup-fails')) throw new Error('Fixture cleanup failed');
  },
  async guardClose(handler) {
    closeRequest = handler;
    return () => {
      if (closeRequest === handler) closeRequest = undefined;
    };
  },
};
services.speech = {
  async transcribe(_source, signal, progress) {
    progress('preprocessing');
    if (query.has('staged')) await new Promise((resolve) => setTimeout(resolve, 500));
    progress('transcribing');
    await new Promise((resolve) =>
      setTimeout(resolve, query.has('slow') || query.has('staged') ? 1500 : 50),
    );
    signal.throwIfAborted();
    if (query.has('silence')) throw new Error('No clear speech was detected.');
    return transcript(`${phrases[0]} ${phrases[2]}`);
  },
};
services.extraction = {
  mode: 'local',
  async extract(input, { signal, onProgress, ocrCheckpoint, onOcr }) {
    if (input.type === 'image' && input.image && query.has('screenshot-recovery')) {
      attempts++;
      const doc = ocrCheckpoint?.document ?? midtermOcr;
      if (!ocrCheckpoint) ocrReads++;
      onOcr?.({ image: input.image, document: doc });
      onProgress(2);
      if (attempts === 1) throw new Error('The local model did not respond.');
      onProgress(3);
      const source = { ...input, ocr: doc };
      delete source.image;
      return {
        actions: [{ ...newAction(), title: 'Midterm examination', status: 'needs_review', source }],
        ambiguities: [],
      };
    }
    attempts++;
    onProgress(2);
    if (query.has('staged')) await new Promise((resolve) => setTimeout(resolve, 1500));
    signal.throwIfAborted();
    onProgress(3);
    if (query.has('staged')) await new Promise((resolve) => setTimeout(resolve, 500));
    signal.throwIfAborted();
    // Slow on-device run: never finishes on its own, only on cancellation.
    if (query.has('hang'))
      await new Promise((_, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            extractionAborted++;
            reject(signal.reason);
          },
          { once: true },
        ),
      );
    if (query.has('retry') && attempts === 1) throw new Error('Local extraction failed.');
    const source = { ...input };
    delete source.image;
    const units = source.transcript
      ? unitsFromTranscript(source.transcript)
      : unitsFromText(source.text ?? '');
    const cite = [units[0].id];
    // Model-shaped output run through the production validator.
    const result = validateExtraction(
      rawBundle([
        rawItem({
          title: { evidence: cite, value: 'Midterm exam', confidence: 'confirmed' },
          date: {
            evidence: cite,
            expression: 'tomorrow',
            basis: 'capture_time',
            value: null,
            confidence: 'inferred',
          },
          time: { evidence: cite, text: 'starts at nine', value: '09:00', confidence: 'confirmed' },
          requirements: [
            { evidence: cite, text: 'Bring calculator' },
            { evidence: cite, text: 'Bring ID' },
          ],
          reminders: [{ evidence: cite, time: '08:00' }],
        }),
        rawItem({
          title: { evidence: cite, value: 'Consultation', confidence: 'inferred' },
          requirements: [{ evidence: cite, text: 'Revised questionnaire' }],
        }),
      ]),
      {
        kind: source.type === 'voice' ? 'voice' : 'text',
        units,
        now: new Date(),
        timezone: 'Asia/Manila',
        capturedAt: source.capturedAt ?? null,
        recordingDate: source.recordingDate ?? null,
        source,
        defaultReminders: [],
      },
    );
    if (!result.ok) throw new Error(result.error);
    return { actions: result.actions, ambiguities: result.ambiguities };
  },
};
ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProvider services={services}>
    <App />
  </AppProvider>,
);
