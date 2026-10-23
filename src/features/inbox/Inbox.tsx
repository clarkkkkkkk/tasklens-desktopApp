import { componentsReady, useLocalIntelligence } from '../../services/localai/useLocalIntelligence';
import { VoiceCapture } from '../voice/VoiceCapture';
import { MotionHeading } from '../../components/motion/MotionHeading';
import { createDemoScreenshot } from '../../services/extraction/demoSource';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
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
import { newAction } from '../../lib/actions';
import type { OcrCheckpoint } from '../../services/extraction/ExtractionService';
import { diagnosticStage } from '../../services/localai/diagnostics';
import { readScreenshot } from '../../lib/images';
import type { ExtractedAction } from '../../types/action';
import {
  extractionSteps,
  type ExtractionDiagnostics,
  type RouteNotice,
} from '../../services/extraction/ExtractionService';
import { toLocalAIError, type LocalAIErrorCode } from '../../services/localai/native';
import { presets } from '../../services/reminders/ReminderScheduler';
import { ExtractionDebug } from '../extraction/ExtractionDebug';
import { RouteWhy } from '../ai/RouteDecisionCard';
import { routeBadge } from '../ai/routeLabels';

type Origin = 'file' | 'paste' | 'sample';
/** After this long, on-device processing offers Keep waiting / Cancel. Nothing is saved. */
export const EXTRACTION_SAFETY_SECONDS = 60;
type ScreenshotPhase =
  | 'idle'
  | 'preparing'
  | 'ocr'
  | 'inference'
  | 'validation'
  | 'review-ready'
  | 'failed'
  | 'cancelled';
interface Job {
  id: string;
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
  'NO_AI_AVAILABLE',
  'GROQ_INVALID_KEY',
  'GROQ_CONSENT',
  'GROQ_DISABLED',
]);
/** Text recognition always runs locally; which model runs next is the router's decision. */
const OCR_COMPONENTS = ['tesseract', 'eng.traineddata', 'ceb.traineddata', 'tgl.traineddata'];

export function Inbox({
  active,
  suspendPaste = false,
  captureHint = false,
  onCaptureInteraction,
  locked,
  onResult,
  onManual,
  onRemove,
  onBundle,
  onVoiceGuard,
  onCaptureBusyChange,
  onOpenSettings,
}: {
  active: boolean;
  suspendPaste?: boolean;
  captureHint?: boolean;
  onCaptureInteraction?: () => void;
  locked: boolean;
  onResult: (a: ExtractedAction) => void;
  onManual?: (a: ExtractedAction) => void;
  onRemove: () => void;
  onBundle: (actions: ExtractedAction[]) => void;
  onVoiceGuard: (cancel: (() => Promise<void>) | null) => void;
  onCaptureBusyChange?: (busy: boolean) => void;
  onOpenSettings: () => void;
}) {
  const { services, snapshot, processing, ensureProcessing } = useApp();
  const { status: intelligence } = useLocalIntelligence();
  const intelligenceRef = useRef(intelligence);
  intelligenceRef.current = intelligence;
  const [job, setJob] = useState<Job | null>(null),
    [step, setStep] = useState(-1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<{ message: string; code?: LocalAIErrorCode } | null>(null),
    [results, setResults] = useState<ExtractedAction[]>([]),
    [diagnostics, setDiagnostics] = useState<Partial<ExtractionDiagnostics> | null>(null),
    [route, setRoute] = useState<RouteNotice | null>(null);
  const source = job?.source ?? null;
  useEffect(() => {
    onCaptureBusyChange?.(busy);
  }, [busy, onCaptureBusyChange]);
  const cloud =
    (route ? route.candidate.provider.kind === 'cloud' : processing.effectiveMode === 'groq') &&
    !job?.demo;
  const [onlineStatus, setOnlineStatus] = useState('');
  const [phase, setPhase] = useState<ScreenshotPhase>('idle');
  const [checkpoint, setCheckpoint] = useState<OcrCheckpoint | null>(null);
  const checkpointRef = useRef<OcrCheckpoint | null>(null);
  const preserveOcr = useCallback((next: OcrCheckpoint | null) => {
    checkpointRef.current = next;
    setCheckpoint(next);
  }, []);
  const owner = useRef<'voice' | 'image' | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [selectedName, setSelectedName] = useState('');
  const pendingImage = useRef<Promise<unknown> | null>(null);
  const acquireVoice = useCallback(() => {
    if (owner.current) return false;
    owner.current = 'voice';
    setVoiceActive(true);
    return true;
  }, []);
  const releaseVoice = useCallback(() => {
    if (owner.current === 'voice') owner.current = null;
    setVoiceActive(false);
  }, []);
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
    async (next: Job, prepared = false) => {
      if (locked || owner.current === 'voice' || (owner.current === 'image' && !prepared)) return;
      owner.current = 'image';
      setBusy(true);
      onCaptureBusyChange?.(true);
      if (!next.demo && !(await ensureProcessing())) {
        owner.current = null;
        busyRef.current = false;
        setBusy(false);
        setPhase('cancelled');
        setError({ message: 'Setup closed. Your screenshot is retained.', code: 'CANCELLED' });
        return;
      }
      if (!next.demo && !componentsReady(intelligenceRef.current, OCR_COMPONENTS)) {
        setError({ message: intelligence.message });
        setPhase('failed');
        setBusy(false);
        busyRef.current = false;
        owner.current = null;
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
      setDiagnostics(null);
      setRoute(null);
      setOnlineStatus('');
      setStep(checkpointRef.current?.image === next.image ? 1 : -1);
      setPhase(checkpointRef.current?.image === next.image ? 'inference' : 'preparing');
      const service = next.demo ? services.demoExtraction : services.extraction;
      try {
        const extraction = service.extract(
          { ...next.source, image: next.image },
          {
            traceId: next.id,
            signal: abort.signal,
            ocrCheckpoint:
              checkpointRef.current?.image === next.image ? checkpointRef.current : undefined,
            onOcr: (value) => {
              if (current()) preserveOcr(value);
            },
            onProgress: (s) => {
              if (current()) {
                setStep(s);
                if (s >= 3) setOnlineStatus('');
                setPhase(
                  (['preparing', 'ocr', 'inference', 'validation'] as const)[s] ?? 'validation',
                );
              }
            },
            onStatus: (state) => {
              if (current())
                setOnlineStatus(
                  state.stage === 'queued'
                    ? 'Waiting for the active Groq extraction…'
                    : state.stage === 'waiting'
                      ? `Waiting for rate-limit reset${state.retryAt ? ` at ${new Date(state.retryAt).toLocaleTimeString()}` : ''}…`
                      : state.stage === 'processing'
                        ? 'Processing online…'
                        : 'Sending securely…',
                );
            },
            onRoute: (r) => current() && setRoute(r),
          },
        );
        pendingImage.current = extraction;
        const bundle = await extraction;
        if (!current()) return;
        setDiagnostics(bundle.diagnostics ?? null);
        if (!bundle.actions.length) {
          setPhase('failed');
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
        setPhase('review-ready');
        setResults(actions);
        setStep(extractionSteps.length);
        if (actions.length === 1) callback.current.onResult(actions[0]);
        else callback.current.onBundle(actions);
      } catch (e) {
        if (!current()) return;
        const failure = toLocalAIError(e);
        setPhase(failure.code === 'CANCELLED' ? 'cancelled' : 'failed');
        const extra = e as {
          ocr?: ExtractionDiagnostics['ocr'];
          diagnostics?: ExtractionDiagnostics;
        };
        setDiagnostics(extra.diagnostics ?? (extra.ocr ? { ocr: extra.ocr } : null));
        setError({
          message:
            failure.message +
            (failure.retryAt ? ` Retry after ${new Date(failure.retryAt).toLocaleString()}.` : ''),
          code: failure.code,
        });
      } finally {
        if (version === generation.current) {
          setBusy(false);
          busyRef.current = false;
          owner.current = null;
        }
      }
    },
    [intelligence, services, defaults, locked, preserveOcr, ensureProcessing, onCaptureBusyChange],
  );
  const accept = useCallback(
    async (file: File, origin: Origin) => {
      if (
        owner.current ||
        busyRef.current ||
        locked ||
        document.querySelector('dialog[data-guided-tour][open]')
      )
        return;
      owner.current = 'image';
      onCaptureBusyChange?.(true);
      const captureId = crypto.randomUUID();
      diagnosticStage(captureId, 'selection', 'start');
      setSelectedName(file.name);
      preserveOcr(null);
      setPhase('preparing');
      pendingImage.current = null;
      setJob(null);
      setResults([]);
      onCaptureInteraction?.();
      const version = ++generation.current;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setStep(-1);
      try {
        const preparing = readScreenshot(file);
        pendingImage.current = preparing;
        const previewUrl = await preparing;
        if (version !== generation.current) return;
        const next: Job = {
          id: captureId,
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
        diagnosticStage(next.id, 'selection', 'end');
        setJob(next);
        await process(next, true);
      } catch (e) {
        if (version === generation.current) {
          setError({ message: e instanceof Error ? e.message : 'Unable to load image' });
          setPhase('failed');
          setBusy(false);
          busyRef.current = false;
          owner.current = null;
        }
      }
    },
    [process, locked, onCaptureInteraction, preserveOcr, onCaptureBusyChange],
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
  async function cancel() {
    controller.current?.abort();
    generation.current++;
    // Keep the cross-input gate until the extraction promise has actually stopped.
    await pendingImage.current?.catch(() => {});
    owner.current = null;
    busyRef.current = false;
    setBusy(false);
    setPhase('cancelled');
    setError({ message: 'Processing was cancelled.', code: 'CANCELLED' });
  }
  async function remove() {
    if (busyRef.current) await cancel();
    controller.current?.abort();
    generation.current++;
    owner.current = null;
    setBusy(false);
    setJob(null);
    setSelectedName('');
    setPhase('idle');
    preserveOcr(null);
    setResults([]);
    setDiagnostics(null);
    setRoute(null);
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
  const recovery = error && (
    <ErrorState message={`Screenshot: ${error.message}`}>
      <div className="action-pair">
        {job && (
          <Button onClick={() => void process(job)} disabled={busy || locked || voiceActive}>
            {processing.preferredMode === 'groq' && processing.effectiveMode === 'local'
              ? 'Retry locally'
              : checkpoint
                ? 'Retry understanding details'
                : 'Try again'}
          </Button>
        )}
        {job && (
          <Button onClick={() => void remove()} disabled={locked || voiceActive}>
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
  );
  const stageLabel = (index: number) =>
    cloud && index === 2
      ? onlineStatus || 'Preparing online extraction…'
      : cloud && index === 3
        ? 'Validating details…'
        : extractionSteps[index];
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
      <div className="page-heading" data-tour="inbox-heading">
        <div className="eyebrow">YOUR SPACE TO START</div>
        <MotionHeading>Inbox</MotionHeading>
        <p>Turn screenshots and information into organized actions.</p>
      </div>
      {processing.effectiveMode === 'local' &&
        (processing.connection.connectivity !== 'online' ||
          processing.connection.resumeRequired) && (
          <p className="field-help" role="status">
            {processing.connection.connectivity === 'offline'
              ? 'Offline — using Local AI.'
              : processing.connection.resumeRequired
                ? 'Groq unavailable — using Local AI. Select Groq Cloud to resume.'
                : 'Connectivity unavailable — using Local AI.'}
          </p>
        )}
      <VoiceCapture
        locked={locked || busy}
        onResult={onBundle}
        onGuardChange={onVoiceGuard}
        acquire={acquireVoice}
        release={releaseVoice}
        onOpenSettings={onOpenSettings}
      />
      {voiceActive && (
        <p className="field-help">Finish or cancel your current capture to add a screenshot.</p>
      )}
      {busy && !source && (
        <div className="capture-file-pending" role="status">
          <FileImage size={18} />
          <span>{selectedName}</span>
          <strong>Preparing image…</strong>
        </div>
      )}
      {!source && recovery}
      {!source ? (
        <Dropzone
          onFile={(file) => void accept(file, 'file')}
          disabled={busy || locked || voiceActive}
          onError={(message) => setError({ message })}
        />
      ) : (
        <div
          className="upload-card capture-region"
          aria-label="Screenshot capture"
          data-state={phase}
        >
          <div className="upload-header" data-tour="screenshot">
            <FileImage size={17} />
            <span>{source.fileName}</span>
            <span className="badge">Local preview</span>
            <button
              className="icon-button"
              aria-label="Remove screenshot"
              disabled={locked || voiceActive}
              title={locked ? 'Save or close your edits before removing the screenshot' : undefined}
              onClick={() => void remove()}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {recovery && <div className="processing-area">{recovery}</div>}
          <div className="preview-image">
            <img src={source.previewUrl} alt={`Preview of ${source.fileName}`} />
          </div>
          <div className="processing-area">
            <div className="processing-title">
              {busy ? (
                <LoaderCircle size={17} className="capture-spinner" />
              ) : phase === 'review-ready' ? (
                <Check size={17} />
              ) : phase === 'failed' ? (
                <AlertCircle size={17} />
              ) : (
                <FileImage size={17} />
              )}
              <strong role="status" className={busy ? 'capture-running' : undefined}>
                {busy
                  ? stageLabel(Math.max(0, Math.min(step, extractionSteps.length - 1)))
                  : phase === 'review-ready'
                    ? 'Ready for review'
                    : phase === 'failed'
                      ? 'Screenshot processing needs attention'
                      : phase === 'cancelled'
                        ? 'Screenshot processing cancelled'
                        : 'Not processed'}
              </strong>
              <span className="badge">
                {demo ? 'Mock extraction' : routeBadge(route?.candidate)}
              </span>
            </div>
            <div className="progress-track">
              {extractionSteps.map((label, index) => (
                <span
                  key={label}
                  className={phase === 'review-ready' || step > index ? 'done' : ''}
                />
              ))}
            </div>
            {busy ? (
              demo ? (
                <p>Running a sample workflow. No AI is analyzing this image.</p>
              ) : elapsed >= notifyAfter ? (
                <p>
                  {cloud ? 'Still processing' : 'Still working on this device'} ({elapsed}s). This
                  is taking longer than usual. Keep waiting or cancel; nothing is saved until you
                  review it.
                </p>
              ) : (
                <p>
                  {cloud
                    ? 'Reading text locally, then sending recognized text to Groq. Your screenshot stays on this device.'
                    : 'Processing locally. Your screenshot stays on this device.'}
                </p>
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
                <Button onClick={() => void cancel()}>
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
            {route && !demo && <RouteWhy route={route} />}
          </div>
          {checkpoint && (
            <details className="processing-area">
              <summary>Recognized text</summary>
              <div className="capture-source">
                <p style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                  {checkpoint.document.fullText}
                </p>
              </div>
            </details>
          )}
          {(phase === 'failed' || phase === 'cancelled') && onManual && (
            <div className="processing-area">
              <Button
                disabled={busy || locked || voiceActive}
                onClick={() => {
                  const manual = newAction();
                  manual.source = {
                    ...source,
                    ...(checkpoint ? { ocr: checkpoint.document } : {}),
                    extractionMode: undefined,
                    extractedBy: undefined,
                  };
                  onManual(manual);
                }}
              >
                Create task manually
              </Button>
            </div>
          )}
          {developer && diagnostics && <ExtractionDebug diagnostics={diagnostics} />}
        </div>
      )}
      {!source && (
        <div className="demo-invite">
          <span>
            <Sparkles size={16} /> Just looking around?
          </span>
          <button
            className="text-button"
            onClick={() => void sample()}
            disabled={busy || locked || voiceActive}
          >
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
          <div
            className="workflow-step"
            key={title}
            data-tour={i === 1 ? 'review-guidance' : undefined}
          >
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
          Your screenshots stay on this device.{' '}
          <span>
            {processing.effectiveMode === 'groq'
              ? 'Recognized text is sent to Groq.'
              : 'Local AI processes your text on this computer.'}
          </span>
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
