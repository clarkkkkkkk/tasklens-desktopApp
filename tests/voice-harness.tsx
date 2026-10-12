// Explicit test entrypoint. Never imported by the production application.
import ReactDOM from 'react-dom/client';
import App from '../src/App';
import { AppProvider } from '../src/app/AppProvider';
import { createServices } from '../src/app/services';
import {
  unitsFromText,
  unitsFromTranscript,
} from '../src/services/extraction/prompts/build-prompt';
import { validateExtraction } from '../src/services/extraction/validation/validate-extraction';
import { rawBundle, rawItem } from './fixtures/extraction/raw';
import { defaultSettings } from '../src/types/action';
import { phrases, transcript } from './fixtures/voice';
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
  attempts = 0;
Object.assign(window, {
  voiceTest: {
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
  async guardClose() {
    return () => {};
  },
};
services.speech = {
  async transcribe(_source, signal) {
    await new Promise((resolve) => setTimeout(resolve, query.has('slow') ? 1500 : 50));
    signal.throwIfAborted();
    if (query.has('silence')) throw new Error('No clear speech was detected.');
    return transcript(`${phrases[0]} ${phrases[2]}`);
  },
};
services.extraction = {
  mode: 'local',
  async extract(input, { signal }) {
    attempts++;
    signal.throwIfAborted();
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
