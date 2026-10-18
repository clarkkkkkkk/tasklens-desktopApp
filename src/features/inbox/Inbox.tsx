import { componentsReady, useLocalIntelligence } from '../../services/localai/useLocalIntelligence';
import { VoiceCapture } from '../voice/VoiceCapture';
import { MotionHeading } from '../../components/motion/MotionHeading';
import { createDemoScreenshot } from '../../services/extraction/demoSource';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  FileImage,
  Layers3,
  LoaderCircle,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from '../../components/icons';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { Dropzone } from './Dropzone';
import { readScreenshot } from '../../lib/images';
import type { ExtractedAction } from '../../types/action';
import {
  extractionSteps,
  type ExtractionDiagnostics,
} from '../../services/extraction/ExtractionService';
import { toLocalAIError, type LocalAIErrorCode } from '../../services/localai/native';
import { presets } from '../../services/reminders/ReminderScheduler';
import { ExtractionDebug } from '../extraction/ExtractionDebug';

type Origin = 'file' | 'paste' | 'sample';
/** After this long, on-device processing offers Keep waiting / Cancel. Nothing is saved. */
export const EXTRACTION_SAFETY_SECONDS = 60;
interface Job {
  source: ExtractedAction['source'];
  image: Blob;
  demo: boolean;
}
const SETUP_ERRORS = new Set<LocalAIErrorCode>([
  'OCR_NOT_INSTALLED',
  'RUNTIME_MISSING',
  'MODEL_NOT_INSTALLED',
  'MODEL_CORRUPTED',
  'MODEL_LOAD_FAILED',
]);

export function Inbox({
  active,
  suspendPaste = false,
  captureHint = false,
  onCaptureInteraction,
  locked,
  onResult,
  onRemove,
  onBundle,
  onVoiceGuard,
  onOpenSettings,
}: {
  active: boolean;
  suspendPaste?: boolean;
  captureHint?: boolean;
  onCaptureInteraction?: () => void;
  locked: boolean;
  onResult: (a: ExtractedAction) => void;
  onRemove: () => void;
  onBundle: (actions: ExtractedAction[]) => void;
  onVoiceGuard: (cancel: (() => Promise<void>) | null) => void;
  onOpenSettings: () => void;
}) {
  const { services, snapshot } = useApp();
  const { status: intelligence } = useLocalIntelligence();
  const [job, setJob] = useState<Job | null>(null),
    [step, setStep] = useState(-1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<{ message: string; code?: LocalAIErrorCode } | null>(null),
    [results, setResults] = useState<ExtractedAction[]>([]),
    [diagnostics, setDiagnostics] = useState<Partial<ExtractionDiagnostics> | null>(null);
  const source = job?.source ?? null;
  // Real elapsed seconds of the current run; drives the safety notice, never a fake percentage.
  const [elapsed, setElapsed] = useState(0),
    [notifyAfter, setNotifyAfter] = useState(EXTRACTION_SAFETY_SECONDS);
  useEffect(() => {
    setElapsed(0);
    setNotifyAfter(EXTRACTION_SAFETY_SECONDS);
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [busy]);
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    busyRef = useRef(false);
  const callback = useRef({ onResult, onBundle });
  callback.current = { onResult, onBundle };
  const developer = snapshot.settings.localAI.developerMode;
  useEffect(
    () => () => {
      controller.current?.abort();
      generation.current++;
    },
    [],
  );
  const defaults = snapshot.settings.defaultReminders;
  const process = useCallback(
    async (next: Job) => {
      if (
        !next.demo &&
        !componentsReady(intelligence, [
          'extraction',
          'llama-server',
          'tesseract',
          'eng.traineddata',
          'ceb.traineddata',
          'tgl.traineddata',
        ])
      ) {
        setError({ message: intelligence.message });
        return;
      }
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      // Each run gets a generation; results from any older run are ignored.
      const version = ++generation.current;
      const current = () => version === generation.current && !abort.signal.aborted;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setResults([]);
      setDiagnostics(null);
      setStep(-1);
      const service = next.demo ? services.demoExtraction : services.extraction;
      try {
        const bundle = await service.extract(
          { ...next.source, image: next.image },
          { signal: abort.signal, onProgress: (s) => current() && setStep(s) },
        );
        if (!current()) return;
        setDiagnostics(bundle.diagnostics ?? null);
        if (!bundle.actions.length) {
          setError({
            message: bundle.ambiguities.length
              ? `No action could be confirmed: ${bundle.ambiguities[0].question}`
              : 'No actionable details were found in this screenshot.',
          });
          return;
        }
        const actions = bundle.actions.map((action) => ({
          ...action,
          reminders: action.reminders.map((r) =>
            presets.some((p) => p.id === r.id)
              ? { ...r, enabled: defaults.some((p) => p === r.id) }
              : r,
          ),
        }));
        setResults(actions);
        setStep(extractionSteps.length);
        if (actions.length === 1) callback.current.onResult(actions[0]);
        else callback.current.onBundle(actions);
      } catch (e) {
        if (!current()) return;
        const failure = toLocalAIError(e);
        const extra = e as {
          ocr?: ExtractionDiagnostics['ocr'];
          diagnostics?: ExtractionDiagnostics;
        };
        setDiagnostics(extra.diagnostics ?? (extra.ocr ? { ocr: extra.ocr } : null));
        setError({ message: failure.message, code: failure.code });
      } finally {
        if (version === generation.current) {
          setBusy(false);
          busyRef.current = false;
        }
      }
    },
    [intelligence, services, defaults],
  );
  const accept = useCallback(
    async (file: File, origin: Origin) => {
      if (busyRef.current || locked) return;
      onCaptureInteraction?.();
      const version = ++generation.current;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setStep(-1);
      try {
        const previewUrl = await readScreenshot(file);
        if (version !== generation.current) return;
        const next: Job = {
          image: file,
          demo: origin === 'sample',
          source: {
            type: 'image',
            fileName: file.name,
            previewUrl,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            // A chosen file's modified time approximates when it was captured; pasted
            // images have none. Neither is treated as a message's sending date.
            ...(origin === 'file' && file.lastModified > 0
              ? { capturedAt: new Date(file.lastModified).toISOString() }
              : {}),
          },
        };
        setJob(next);
        await process(next);
      } catch (e) {
        if (version === generation.current) {
          setError({ message: e instanceof Error ? e.message : 'Unable to load image' });
          setBusy(false);
          busyRef.current = false;
        }
      }
    },
    [process, locked, onCaptureInteraction],
  );
  useEffect(() => {
    if (!active || suspendPaste) return;
    const paste = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest('input,textarea,[contenteditable="true"]')
      )
        return;
      const file = Array.from(e.clipboardData?.files || []).find((f) =>
        f.type.startsWith('image/'),
      );
      if (file) {
        e.preventDefault();
        void accept(file, 'paste');
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [active, suspendPaste, accept]);
  function cancel() {
    controller.current?.abort();
    generation.current++;
    busyRef.current = false;
    setBusy(false);
    setStep(-1);
    setError({ message: 'Processing was cancelled.', code: 'CANCELLED' });
  }
  function remove() {
    controller.current?.abort();
    generation.current++;
    busyRef.current = false;
    setBusy(false);
    setJob(null);
    setResults([]);
    setDiagnostics(null);
    setStep(-1);
    setError(null);
    onRemove();
  }
  async function sample() {
    try {
      await accept(await createDemoScreenshot(), 'sample');
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : 'The sample image could not be created.',
      });
    }
  }
  const demo = !!job?.demo || services.extraction.mode === 'mock';
  const latest = results.map((r) => snapshot.actions.find((a) => a.id === r.id) || r);
  return (
    <section
      hidden={!active}
      className={`inbox-view ${captureHint ? 'capture-emphasis' : ''}`}
      onClick={onCaptureInteraction}
      onKeyUp={onCaptureInteraction}
    >
      {captureHint && (
        <p className="first-capture-hint" role="status">
          Drop your first screenshot here
        </p>
      )}
      <div className="page-heading">
        <div className="eyebrow">YOUR SPACE TO START</div>
        <MotionHeading>Inbox</MotionHeading>
        <p>Turn screenshots and information into organized actions.</p>
      </div>
      <VoiceCapture locked={locked || busy} onResult={onBundle} onGuardChange={onVoiceGuard} />
      {error && (
        <ErrorState message={error.message}>
          <div className="action-pair">
            {job && (
              <Button onClick={() => void process(job)} disabled={busy || locked}>
                Try again
              </Button>
            )}
            {job && (
              <Button onClick={remove} disabled={locked}>
                Choose another image
              </Button>
            )}
            {error.code && SETUP_ERRORS.has(error.code) && (
              <Button onClick={onOpenSettings}>
                <Settings size={16} />
                Open AI Settings
              </Button>
            )}
          </div>
        </ErrorState>
      )}
      {!source ? (
        <Dropzone
          onFile={(file) => void accept(file, 'file')}
          disabled={busy || locked}
          onError={(message) => setError({ message })}
        />
      ) : (
        <div className="upload-card">
          <div className="upload-header">
            <FileImage size={17} />
            <span>{source.fileName}</span>
            <span className="badge">Local preview</span>
            <button
              className="icon-button"
              aria-label="Remove screenshot"
              disabled={locked}
              title={locked ? 'Save or close your edits before removing the screenshot' : undefined}
              onClick={remove}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="preview-image">
            <img src={source.previewUrl} alt={`Preview of ${source.fileName}`} />
          </div>
          <div
            key={busy ? 'processing' : 'result'}
            className="processing-area"
            role="status"
            aria-live="polite"
          >
            <div className="processing-title">
              {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
              <strong>
                {busy
                  ? extractionSteps[Math.max(0, Math.min(step, extractionSteps.length - 1))]
                  : results.length
                    ? 'Ready for review'
                    : 'Not processed'}
              </strong>
              <span className="badge">{demo ? 'Mock extraction' : 'On-device'}</span>
            </div>
            <div className="progress-track">
              {extractionSteps.map((label, index) => (
                <span key={label} className={step >= index ? 'done' : ''} />
              ))}
            </div>
            {busy ? (
              demo ? (
                <p>Running a sample workflow. No AI is analyzing this image.</p>
              ) : elapsed >= notifyAfter ? (
                <p>
                  Still working on this device ({elapsed}s). This is taking longer than usual. Keep
                  waiting or cancel; nothing is saved until you review it.
                </p>
              ) : (
                <p>Processing locally. Your screenshot stays on this device.</p>
              )
            ) : results.length ? (
              <p>
                {results.length > 1
                  ? `${results.length} items found. Review each one and save when you’re ready.`
                  : 'Review the result, make it yours, and save when you’re ready.'}
              </p>
            ) : null}
            {busy && (
              <div className="action-pair">
                {!demo && elapsed >= notifyAfter && (
                  <Button onClick={() => setNotifyAfter(elapsed + EXTRACTION_SAFETY_SECONDS)}>
                    Keep waiting
                  </Button>
                )}
                <Button onClick={cancel}>
                  <X size={15} />
                  Cancel processing
                </Button>
              </div>
            )}
            {results.length > 0 && !busy && (
              <Button
                variant="primary"
                data-open-result
                onClick={() =>
                  latest.length > 1
                    ? callback.current.onBundle(latest)
                    : callback.current.onResult(latest[0])
                }
              >
                {results.length > 1 ? `Review ${results.length} items` : 'Open result'}
                <ArrowRight size={15} />
              </Button>
            )}
          </div>
          {developer && diagnostics && <ExtractionDebug diagnostics={diagnostics} />}
        </div>
      )}
      {!source && (
        <div className="demo-invite">
          <span>
            <Sparkles size={16} /> Just looking around?
          </span>
          <button className="text-button" onClick={() => void sample()} disabled={busy || locked}>
            Try a sample screenshot
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="section-heading">
        <h2>A clearer path from here</h2>
        <span>THREE SIMPLE STEPS</span>
      </div>
      <div className="workflow-steps">
        {[
          {
            icon: FileImage,
            title: 'Capture the important',
            text: 'A screenshot, an announcement, a little less to remember.',
          },
          {
            icon: ScanLine,
            title: 'Review the details',
            text: 'Check dates, requirements, and what needs a second look.',
          },
          {
            icon: Layers3,
            title: 'Make room for action',
            text: 'Your plans, together in one quiet, organized place.',
          },
        ].map(({ icon: Icon, title, text }, i) => (
          <div className="workflow-step" key={title}>
            <div>
              <span className="step-icon">
                <Icon size={19} />
              </span>
              <span className="step-number">0{i + 1}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <div className="privacy-note">
        <ShieldCheck size={16} />
        <p>
          Your screenshots stay on this device. <span>Always yours, always private.</span>
        </p>
      </div>
      {services.extraction.mode === 'mock' && (
        <div className="phase-note">
          DEMO MODE{' '}
          <span>
            Extraction uses sample data here. The TaskLens desktop app reads screenshots on-device.
          </span>
        </div>
      )}
    </section>
  );
}
