import { createDemoScreenshot } from '../../services/extraction/demoSource';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  FileImage,
  Layers3,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { Dropzone } from './Dropzone';
import { readScreenshot } from '../../lib/images';
import type { ExtractedAction } from '../../types/action';
import { extractionSteps } from '../../services/extraction/ExtractionService';
export function Inbox({
  active,
  locked,
  onResult,
  onRemove,
}: {
  active: boolean;
  locked: boolean;
  onResult: (a: ExtractedAction) => void;
  onRemove: () => void;
}) {
  const { services, snapshot } = useApp();
  const [source, setSource] = useState<ExtractedAction['source'] | null>(null),
    [step, setStep] = useState(-1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<ExtractedAction | null>(null);
  const controller = useRef<AbortController | null>(null),
    inputVersion = useRef(0),
    busyRef = useRef(false);
  const callback = useRef(onResult);
  callback.current = onResult;
  useEffect(
    () => () => {
      controller.current?.abort();
      inputVersion.current++;
    },
    [],
  );
  const process = useCallback(
    async (input: ExtractedAction['source']) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      busyRef.current = true;
      setBusy(true);
      setError('');
      setResult(null);
      try {
        const results = await services.extraction.extract(input, {
          signal: abort.signal,
          onProgress: setStep,
        });
        if (abort.signal.aborted) return;
        if (!results.length) throw new Error('No actions were returned. Try processing again.');
        const first = {
          ...results[0],
          reminders: results[0].reminders.map((r) => ({
            ...r,
            enabled: snapshot.settings.defaultReminders.some((p) => p === r.id),
          })),
        };
        setResult(first);
        callback.current(first);
        setStep(3);
      } catch (e) {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Could not process this screenshot. Please try again.',
          );
      } finally {
        if (!abort.signal.aborted) {
          setBusy(false);
          busyRef.current = false;
        }
      }
    },
    [services, snapshot.settings.defaultReminders],
  );
  const accept = useCallback(
    async (file: File) => {
      if (busyRef.current || locked) return;
      const version = ++inputVersion.current;
      busyRef.current = true;
      setBusy(true);
      setError('');
      setStep(-1);
      try {
        const previewUrl = await readScreenshot(file);
        if (version !== inputVersion.current) return;
        const input = { type: 'image' as const, fileName: file.name, previewUrl };
        setSource(input);
        await process(input);
      } catch (e) {
        if (version === inputVersion.current) {
          setError(e instanceof Error ? e.message : 'Unable to load image');
          setBusy(false);
          busyRef.current = false;
        }
      }
    },
    [process, locked],
  );
  useEffect(() => {
    if (!active) return;
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
        void accept(file);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [active, accept]);
  function remove() {
    controller.current?.abort();
    inputVersion.current++;
    busyRef.current = false;
    setBusy(false);
    setSource(null);
    setResult(null);
    setStep(-1);
    setError('');
    onRemove();
  }
  async function sample() {
    try {
      await accept(await createDemoScreenshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The sample image could not be created.');
    }
  }
  return (
    <section hidden={!active} className="inbox-view">
      <div className="page-heading">
        <div className="eyebrow">YOUR SPACE TO START</div>
        <h1>Inbox</h1>
        <p>Turn screenshots and information into organized actions.</p>
      </div>
      {error && (
        <ErrorState message={error}>
          {source && (
            <Button onClick={() => void process(source)} disabled={busy || locked}>
              Try again
            </Button>
          )}
        </ErrorState>
      )}
      {!source ? (
        <Dropzone
          onFile={(file) => void accept(file)}
          disabled={busy || locked}
          onError={setError}
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
          <div className="processing-area" role="status" aria-live="polite">
            <div className="processing-title">
              {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
              <strong>{busy ? extractionSteps[Math.max(0, step)] : 'Ready for your review'}</strong>
              <span className="badge">
                {services.extraction.mode === 'mock' ? 'Mock extraction' : 'Local extraction'}
              </span>
            </div>
            <div className="progress-track">
              {extractionSteps.map((label, index) => (
                <span key={label} className={step >= index ? 'done' : ''} />
              ))}
            </div>
            <p>
              {busy
                ? services.extraction.mode === 'mock'
                  ? 'Running a sample workflow. No AI is analyzing this image.'
                  : 'Processing on this device.'
                : 'Review the result, make it yours, and save when you’re ready.'}
            </p>
            {result && !busy && (
              <Button
                variant="primary"
                onClick={() =>
                  callback.current(snapshot.actions.find((a) => a.id === result.id) || result)
                }
              >
                Open result
                <ArrowRight size={15} />
              </Button>
            )}
          </div>
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
      <div className="phase-note">
        PHASE 1 PREVIEW <span>Extraction uses sample data. On-device AI is coming in Phase 2.</span>
      </div>
    </section>
  );
}
