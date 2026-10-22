import { componentsReady, useLocalIntelligence } from '../../services/localai/useLocalIntelligence';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { Microphone, FileImage, Pencil, ShieldCheck } from '../../components/icons';
import type { ExtractedAction } from '../../types/action';
import type { AudioSource, CaptureStatus } from '../../services/voice/types';
import { CaptureProgress, type CaptureMode } from '../capture/CaptureProgress';
import { VoiceWaveform, type WaveformHandle } from '../capture/VoiceWaveform';
import { useCaptureMotion } from '../capture/useCaptureMotion';
import { downloadText } from '../../lib/images';
import './voice.css';
const working = new Set<CaptureStatus>([
  'requesting_permission',
  'recording',
  'finalizing',
  'preprocessing',
  'transcribing',
  'extracting',
]);
export function VoiceCapture({
  locked,
  onResult,
  onGuardChange,
  acquire,
  release,
  onOpenSettings,
}: {
  locked: boolean;
  acquire: () => boolean;
  release: () => void;
  onOpenSettings: () => void;
  onResult: (actions: ExtractedAction[]) => void;
  onGuardChange: (cancel: (() => Promise<void>) | null) => void;
}) {
  const { status: intelligence } = useLocalIntelligence();
  const { services, snapshot } = useApp();
  const cloud = snapshot.settings.ai.executionMode === 'groq';
  const textReady = cloud || componentsReady(intelligence, ['extraction', 'llama-server']);
  const speechReady = componentsReady(
    intelligence,
    cloud ? ['whisper', 'whisper-cli'] : ['extraction', 'llama-server', 'whisper', 'whisper-cli'],
  );
  const [onlineStatus, setOnlineStatus] = useState('');
  const [status, setStatus] = useState<CaptureStatus>('idle'),
    [error, setError] = useState(''),
    [elapsed, setElapsed] = useState(0),
    [mode, setMode] = useState<CaptureMode>('voice'),
    [pendingMode, setPendingMode] = useState<CaptureMode | null>(null),
    [extractionStep, setExtractionStep] = useState(2),
    [results, setResults] = useState<ExtractedAction[]>([]),
    [fileName, setFileName] = useState(''),
    [cleaning, setCleaning] = useState(false),
    [cleanupFailed, setCleanupFailed] = useState(false),
    [text, setText] = useState(''),
    [recordingDate, setRecordingDate] = useState(''),
    [source, setSource] = useState<ExtractedAction['source']>(),
    [warnings, setWarnings] = useState<string[]>([]),
    [stopRequested, setStopRequested] = useState(false),
    [waitSeconds, setWaitSeconds] = useState(0),
    [notifyAfter, setNotifyAfter] = useState(60);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusState = useRef({ status, mode });
  const waveform = useRef<WaveformHandle>(null);
  const importedFile = useRef<File | null>(null);
  const cleanup = useRef<Promise<void> | null>(null);
  const poisoned = useRef(false);
  const processing =
    working.has(status) && status !== 'recording' && status !== 'requesting_permission';
  useCaptureMotion(content, status, mode);
  useEffect(() => {
    if (!processing) return;
    setWaitSeconds(0);
    setNotifyAfter(60);
    const started = Date.now();
    const timer = window.setInterval(
      () => setWaitSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [processing]);
  const file = useRef<HTMLInputElement>(null),
    audio = useRef<AudioSource | null>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    busy = useRef(false),
    currentStatus = useRef(status);
  const closeAfterDiscard = useRef<(() => Promise<void>) | null>(null);
  const pendingStart = useRef<Promise<AudioSource> | null>(null);
  const pendingExtraction = useRef<Promise<unknown> | null>(null);
  const pendingSpeech = useRef<Promise<unknown> | null>(null);
  const pendingStop = useRef<Promise<void> | null>(null);
  currentStatus.current = status;
  const cancel = useCallback((): Promise<void> => {
    if (cleanup.current) return cleanup.current;
    generation.current++;
    controller.current?.abort();
    const previous = audio.current;
    audio.current = null;
    busy.current = true;
    setCleaning(true);
    setStatus('finalizing');
    const work = (async () => {
      try {
        if (previous) await services.voice.cancel(previous);
        if (pendingStart.current) {
          const starting = await pendingStart.current.catch(() => null);
          if (starting) await services.voice.cancel(starting);
        }
        await pendingStop.current?.catch(() => {});
        await pendingSpeech.current?.catch(() => {});
        await pendingExtraction.current?.catch(() => {});
        busy.current = false;
        currentStatus.current = 'cancelled';
        setStatus('cancelled');
        release();
      } catch {
        poisoned.current = true;
        setCleanupFailed(true);
        closeAfterDiscard.current = null;
        setError('Could not finish cleanup. Restart TaskLens before capturing again.');
        throw new Error('Capture cleanup failed');
      } finally {
        setCleaning(false);
        setStopRequested(false);
        cleanup.current = null;
      }
    })();
    cleanup.current = work;
    return work;
  }, [services, release]);
  useEffect(() => {
    onGuardChange(working.has(status) ? cancel : null);
    return () => onGuardChange(null);
  }, [status, cancel, onGuardChange]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      if (audio.current) void services.voice.cancel(audio.current).catch(() => {});
    },
    [services],
  );
  useEffect(() => {
    if (!working.has(status)) return;
    const unload = (e: BeforeUnloadEvent) => {
      if (!working.has(currentStatus.current)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    let dispose: (() => void) | undefined,
      alive = true;
    void services.voice
      .guardClose((close) => {
        closeAfterDiscard.current = close;
        setStopRequested(true);
      })
      .then((fn) => {
        if (alive) dispose = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      alive = false;
      dispose?.();
      window.removeEventListener('beforeunload', unload);
    };
  }, [status, services]);
  function begin(keepResults = false) {
    if (busy.current || locked || poisoned.current || !acquire()) return null;
    busy.current = true;
    generation.current++;
    controller.current = new AbortController();
    setError('');
    setWarnings([]);
    if (!keepResults) setResults([]);
    pendingExtraction.current = null;
    pendingSpeech.current = null;
    pendingStop.current = null;
    return { version: generation.current, signal: controller.current.signal };
  }
  async function extract(input: ExtractedAction['source'], version: number, signal: AbortSignal) {
    setStatus('extracting');
    setExtractionStep(2);
    setOnlineStatus('');
    const extraction = services.extraction.extract(input, {
      signal,
      onStatus: (state) => {
        if (version !== generation.current) return;
        setOnlineStatus(
          state.stage === 'queued'
            ? 'Waiting for the active Groq extraction…'
            : state.stage === 'waiting'
              ? `Waiting for rate-limit reset${state.retryAt ? ` at ${new Date(state.retryAt).toLocaleTimeString()}` : ''}…`
              : 'Sending for online extraction…',
        );
      },
      onProgress: (step) => {
        if (version === generation.current) {
          setExtractionStep(step);
          if (step >= 3) setOnlineStatus('');
        }
      },
    });
    pendingExtraction.current = extraction;
    const bundle = await extraction;
    if (version !== generation.current || signal.aborted) return;
    setWarnings(
      bundle.ambiguities.length
        ? bundle.ambiguities.map((a) => a.question)
        : bundle.actions.length
          ? []
          : ['No clear action was found. Inspect your transcript or capture more context.'],
    );
    if (!bundle.actions.length)
      throw new Error(
        'No actionable details could be validated. Your source is retained; retry or create a task manually.',
      );
    setStatus('ready_for_review');
    busy.current = false;
    release();
    setResults(bundle.actions);
    if (bundle.actions.length) onResult(bundle.actions);
  }
  function failed(e: unknown, version: number) {
    if (version !== generation.current) return;
    setError(e instanceof Error ? e.message : 'Local processing failed.');
    setStatus('error');
    busy.current = false;
    release();
  }
  async function transcribe(input: AudioSource, version: number, signal: AbortSignal) {
    setStatus('preprocessing');
    try {
      const transcription = services.speech.transcribe(input, signal, (stage) => {
        if (version === generation.current) setStatus(stage);
      });
      pendingSpeech.current = transcription;
      const transcript = await transcription;
      if (version !== generation.current || signal.aborted) return;
      audio.current = null;
      const next: ExtractedAction['source'] = {
        type: 'voice',
        transcript,
        fileName: input.fileName,
        capturedAt: input.capturedAt,
        recordingDate: !input.capturedAt ? recordingDate || undefined : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      setSource(next);
      await extract(next, version, signal);
    } catch (e) {
      await services.voice.cancel(input).catch(() => {});
      if (audio.current?.jobId === input.jobId) audio.current = null;
      failed(e, version);
    }
  }
  async function record() {
    if (!speechReady) {
      setError(intelligence.message);
      return;
    }
    const job = begin();
    if (!job) return;
    setSource(undefined);
    setStatus('requesting_permission');
    importedFile.current = null;
    setFileName('Voice recording');
    setMode('voice');
    setElapsed(0);
    try {
      const starting = services.voice.start((ms, value) => {
        if (job.version === generation.current) {
          setElapsed(Math.floor(ms / 1000));
          waveform.current?.push(value);
        }
      });
      pendingStart.current = starting;
      const input = await starting;
      pendingStart.current = null;
      if (job.version !== generation.current) {
        await services.voice.cancel(input);
        return;
      }
      audio.current = input;
      setStatus('recording');
    } catch (e) {
      pendingStart.current = null;
      failed(e, job.version);
    }
  }
  const dropTarget = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = focusState.current;
    focusState.current = { status, mode };
    if (previous.status === status && previous.mode === mode) return;
    // A removed mic/Done/switch button must not strand keyboard focus on the document.
    // Never take focus from a surviving control or an open review dialog.
    if (
      document.activeElement !== document.body &&
      document.activeElement?.isConnected &&
      !(status === 'recording' && document.activeElement === heading.current)
    )
      return;
    const target =
      status === 'recording'
        ? dropTarget.current?.querySelector<HTMLElement>('[data-recording-done]')
        : mode === 'text' && !working.has(status)
          ? dropTarget.current?.querySelector<HTMLElement>('textarea')
          : heading.current;
    target?.focus({ preventScroll: true });
  }, [status, mode]);
  const importRef = useRef<(file: File) => void>(() => {});
  importRef.current = (file) => {
    void importAudio(file);
  };
  useEffect(() => {
    const inbox = dropTarget.current?.closest('.inbox-view');
    if (!inbox) return;
    const drop = (event: Event) => {
      const e = event as DragEvent;
      const file = e.dataTransfer?.files[0];
      if (!file || !/\.(wav|mp3|m4a|ogg|webm)$/i.test(file.name)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer!.files.length !== 1) setError('Choose one audio file at a time.');
      else importRef.current(file);
    };
    inbox.addEventListener('drop', drop, true);
    return () => inbox.removeEventListener('drop', drop, true);
  }, []);
  const doneRef = useRef<() => void>(() => {});
  async function done() {
    if (currentStatus.current !== 'recording' || !audio.current) return;
    currentStatus.current = 'finalizing';
    setStatus('finalizing');
    const input = audio.current,
      version = generation.current;
    try {
      const stopping = services.voice.stop(input);
      pendingStop.current = stopping;
      await stopping;
      if (version !== generation.current) return;
      await transcribe(input, version, controller.current!.signal);
    } catch (e) {
      await services.voice.cancel(input).catch(() => {});
      if (audio.current?.jobId === input.jobId) audio.current = null;
      failed(e, version);
    }
  }
  doneRef.current = () => void done();
  useEffect(() => {
    if (elapsed >= 300 && status === 'recording') doneRef.current();
  }, [elapsed, status]);
  async function importAudio(selected: File) {
    if (!speechReady) {
      setError(intelligence.message);
      return;
    }
    const job = begin();
    if (!job) return;
    setSource(undefined);
    setMode('audio');
    importedFile.current = selected;
    setFileName(selected.name);
    setElapsed(0);
    setStatus('preprocessing');
    try {
      services.audioPreprocessor.validateFile(selected);
      const importing = services.voice.importFile(selected, job.signal);
      pendingStart.current = importing;
      const input = await importing;
      pendingStart.current = null;
      if (job.version !== generation.current) {
        await services.voice.cancel(input);
        return;
      }
      audio.current = input;
      await transcribe(input, job.version, job.signal);
    } catch (e) {
      pendingStart.current = null;
      failed(e, job.version);
    }
  }
  async function fromText() {
    if (!textReady) {
      setError(intelligence.message);
      return;
    }
    const job = begin();
    if (!job) return;
    const input: ExtractedAction['source'] = {
      type: 'text',
      text,
      capturedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    importedFile.current = null;
    setFileName('Text capture');
    setSource(input);
    try {
      await extract(input, job.version, job.signal);
    } catch (e) {
      failed(e, job.version);
    }
  }
  async function retry() {
    if (!source) return;
    const job = begin(true);
    if (!job) return;
    const next = { ...source, recordingDate: recordingDate || undefined };
    setSource(next);
    try {
      await extract(next, job.version, job.signal);
    } catch (e) {
      failed(e, job.version);
    }
  }
  const isWorking = working.has(status);
  const labels: Record<CaptureStatus, string> = {
    idle: '',
    requesting_permission: 'Waiting for microphone access…',
    recording: 'Recording',
    finalizing: cleaning ? 'Cancelling capture…' : 'Preparing audio…',
    preprocessing: 'Preparing audio…',
    transcribing: 'Transcribing locally…',
    extracting:
      extractionStep >= 3
        ? 'Validating details…'
        : cloud
          ? onlineStatus || 'Preparing online extraction…'
          : 'Understanding details…',
    ready_for_review: 'Review ready',
    cancelled: 'Capture cancelled',
    error: 'Capture needs attention',
  };
  const title =
    mode === 'voice'
      ? 'Speak a reminder or task'
      : mode === 'audio'
        ? 'Import an audio note'
        : 'Capture a little context';
  const steps =
    source?.type === 'text'
      ? [
          cloud ? 'Online extraction' : 'Understanding details',
          'Checking information',
          'Review ready',
        ]
      : [
          'Preparing audio',
          'Transcribing locally',
          cloud ? 'Online extraction' : 'Understanding details',
          'Checking information',
          'Review ready',
        ];
  const stage =
    status === 'ready_for_review'
      ? steps.length - 1
      : status === 'extracting'
        ? (source?.type === 'text' ? 0 : 2) + (extractionStep >= 3 ? 1 : 0)
        : status === 'transcribing'
          ? 1
          : 0;
  const disabled = locked || cleanupFailed;
  const latest = results.map(
    (item) => snapshot.actions.find((saved) => saved.id === item.id) || item,
  );
  function chooseMode(next: CaptureMode) {
    if (next === mode || disabled) return;
    if (busy.current) {
      setPendingMode(next);
      return;
    }
    setMode(next);
  }
  const formatDuration = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div
      ref={dropTarget}
      className="voice-capture capture-region"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.items).some((item) => item.type.startsWith('audio/')))
          e.preventDefault();
      }}
    >
      <input
        className="sr-only"
        type="file"
        ref={file}
        aria-label="Import audio file"
        accept=".wav,.mp3,.m4a,.ogg"
        disabled={!speechReady || disabled || isWorking}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (selected) void importAudio(selected);
        }}
      />
      <section className="capture-card" aria-label="Capture input">
        <div className="capture-card-header">
          <span className="eyebrow">VOICE & TEXT</span>
          <div className="capture-input-tools" role="group" aria-label="Other capture methods">
            <Button
              variant="ghost"
              aria-pressed={mode === 'audio'}
              disabled={disabled}
              onClick={() => chooseMode(mode === 'audio' && !isWorking ? 'voice' : 'audio')}
            >
              <FileImage size={16} />
              Import audio
            </Button>
            <Button
              variant="ghost"
              aria-pressed={mode === 'text'}
              disabled={disabled}
              onClick={() => chooseMode(mode === 'text' && !isWorking ? 'voice' : 'text')}
            >
              <Pencil size={16} />
              Capture text
            </Button>
          </div>
        </div>
        <div ref={content} className="capture-card-content">
          <div className="capture-primary">
            <h2 ref={heading} tabIndex={-1}>
              {isWorking || status === 'error' || status === 'cancelled' ? labels[status] : title}
            </h2>
            <p className="capture-live sr-only" role="status">
              {labels[status]}
            </p>
            {(status === 'recording' || status === 'requesting_permission') && (
              <>
                <span className="recording-time" aria-label="Recording duration">
                  {formatDuration(elapsed)}
                </span>
              </>
            )}
            <div hidden={status !== 'recording' && status !== 'requesting_permission'}>
              <VoiceWaveform
                ref={waveform}
                active={status === 'recording' || status === 'requesting_permission'}
              />
            </div>
            {!isWorking && mode === 'voice' && (
              <p>Speak a reminder, a task, or what’s on your mind.</p>
            )}
            {!isWorking && mode === 'audio' && (
              <>
                <p>Bring a recording into your local workspace.</p>
                <Button
                  variant="primary"
                  disabled={!speechReady || disabled}
                  onClick={() => file.current?.click()}
                >
                  Choose audio file
                </Button>
                <span className="field-help">WAV, MP3, M4A, OGG · Up to 100 MB</span>
              </>
            )}
            {isWorking && status !== 'recording' && status !== 'requesting_permission' && (
              <>
                <p className="capture-input-summary">
                  {fileName}
                  {source?.transcript
                    ? ` · ${formatDuration(Math.floor(source.transcript.durationMs / 1000))}`
                    : elapsed
                      ? ` · ${formatDuration(elapsed)}`
                      : ''}
                </p>
                <CaptureProgress steps={steps} current={stage} />
                <p className="field-help">
                  {status === 'extracting'
                    ? 'Next: review the details before saving.'
                    : status === 'transcribing'
                      ? 'Next: find the actionable details in your words.'
                      : 'Next: transcribe your audio locally.'}
                </p>
              </>
            )}
          </div>
          {mode === 'text' && (
            <div className="voice-text">
              <label>
                Information to capture
                <textarea
                  value={text}
                  maxLength={20000}
                  disabled={isWorking || disabled}
                  placeholder="Paste an announcement or write something to remember…"
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <Button
                variant="primary"
                disabled={!textReady || disabled || isWorking || text.trim().length < 3}
                onClick={() => void fromText()}
              >
                Extract actions
              </Button>
            </div>
          )}
          {!isWorking && !(mode === 'text' ? textReady : speechReady) && (
            <p className="field-help" role="status">
              {intelligence.message || 'Local processing is available in the TaskLens desktop app.'}
            </p>
          )}
          {source && (
            <section className="capture-source" aria-label="Captured input">
              <p className="field-help">
                {fileName}
                {source.transcript
                  ? ` · ${formatDuration(Math.floor(source.transcript.durationMs / 1000))}`
                  : ''}
              </p>
              <div className="capture-source-heading">
                <h3>{source.transcript ? 'Original transcript' : 'Submitted text'}</h3>
                <span className="badge">
                  {source.transcript ? 'Original source' : 'Text capture'}
                </span>
              </div>
              <div
                className="capture-transcript"
                tabIndex={0}
                role="region"
                aria-label={source.transcript ? 'Original transcript' : 'Submitted text'}
              >
                {source.transcript?.fullText || source.text}
              </div>
              {source.transcript && (
                <details>
                  <summary>Transcript timestamps</summary>
                  {source.transcript.segments.map((segment) => (
                    <p key={segment.id}>
                      <small>
                        {(segment.startMs / 1000).toFixed(1)}–{(segment.endMs / 1000).toFixed(1)}s
                      </small>{' '}
                      {segment.text}
                    </p>
                  ))}
                  <Button
                    onClick={() =>
                      downloadText(source.transcript!.fullText, 'tasklens-transcript.txt')
                    }
                  >
                    Export transcript
                  </Button>
                </details>
              )}
            </section>
          )}
          {error && (
            <ErrorState message={error}>
              <div className="capture-actions">
                {!source && !importedFile.current && (
                  <Button
                    disabled={!speechReady || disabled || isWorking}
                    onClick={() => void record()}
                  >
                    Try recording again
                  </Button>
                )}
                {!source && importedFile.current && (
                  <Button
                    disabled={!speechReady || disabled || isWorking}
                    onClick={() => {
                      if (importedFile.current) void importAudio(importedFile.current);
                    }}
                  >
                    Retry audio import
                  </Button>
                )}
                <Button
                  disabled={!speechReady || disabled || isWorking}
                  onClick={() => file.current?.click()}
                >
                  Use audio file instead
                </Button>
                <Button disabled={isWorking} onClick={onOpenSettings}>
                  Open AI Settings
                </Button>
              </div>
            </ErrorState>
          )}
          {results.length > 0 && !isWorking && (
            <p className="capture-ready">
              Review ready · {results.length} {results.length === 1 ? 'action' : 'actions'} found.
              Nothing is saved until you confirm.
            </p>
          )}
          {warnings.map((warning, index) => (
            <p className="mock-notice" key={index}>
              {warning}
            </p>
          ))}
          {source?.type === 'voice' && !source.capturedAt && (
            <label>
              Recording date (optional)
              <input
                type="date"
                value={recordingDate}
                onChange={(e) => setRecordingDate(e.target.value)}
                disabled={isWorking || disabled}
              />
              <small>
                Use the actual recording date to resolve “tomorrow” and other relative dates.
              </small>
            </label>
          )}
          {processing && !cleaning && waitSeconds >= notifyAfter && (
            <p role="status">
              {cloud ? 'Still processing' : 'Still working on this device'} ({waitSeconds}s). This
              is taking longer than usual. Nothing is saved until you review it.
            </p>
          )}
        </div>
        <div className="capture-actions capture-card-footer">
          <p className="capture-privacy">
            <ShieldCheck size={14} />
            {cloud
              ? 'Transcription stays local. Source text is sent to Groq.'
              : 'Processed locally on this device'}
          </p>
          {status === 'recording' && (
            <Button variant="primary" data-recording-done onClick={() => void done()}>
              Done recording
            </Button>
          )}
          {processing && !cleaning && waitSeconds >= notifyAfter && (
            <Button onClick={() => setNotifyAfter(waitSeconds + 60)}>Keep waiting</Button>
          )}
          {isWorking && (
            <Button
              disabled={cleaning || cleanupFailed}
              onClick={() => void cancel().catch(() => {})}
            >
              Cancel capture
            </Button>
          )}
          {latest.length > 0 && !isWorking && (
            <Button
              variant="primary"
              disabled={disabled}
              data-open-result
              onClick={() => onResult(latest)}
            >
              Review actions
            </Button>
          )}
          {source && !isWorking && (
            <Button disabled={disabled || !textReady} onClick={() => void retry()}>
              Retry extraction
            </Button>
          )}
          {!isWorking && (source || importedFile.current || results.length > 0) && (
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                importedFile.current = null;
                setSource(undefined);
                setResults([]);
                setError('');
                setWarnings([]);
                setFileName('');
                setStatus('idle');
              }}
            >
              Discard capture
            </Button>
          )}
          {!isWorking && (
            <Button
              className="capture-mic"
              data-voice-open
              aria-label="Record a voice note"
              title="Record a voice note"
              variant="primary"
              disabled={!speechReady || disabled}
              onClick={() => void record()}
            >
              <Microphone size={22} />
            </Button>
          )}
        </div>
        {pendingMode && (
          <div className="inline-confirm capture-confirm" role="alert">
            <p>Cancel this capture and switch input?</p>
            <div className="capture-actions">
              <Button
                disabled={cleaning || cleanupFailed}
                onClick={() => {
                  const next = pendingMode;
                  void cancel()
                    .then(() => {
                      setMode(next);
                      setPendingMode(null);
                    })
                    .catch(() => {});
                }}
              >
                Cancel and switch
              </Button>
              <Button disabled={cleaning} onClick={() => setPendingMode(null)}>
                Keep capturing
              </Button>
            </div>
          </div>
        )}
        {stopRequested && (
          <div role="alert" className="inline-confirm capture-confirm">
            <p>Stop and discard this capture before closing?</p>
            <div className="capture-actions">
              <Button
                disabled={cleaning || cleanupFailed}
                onClick={() =>
                  void cancel()
                    .then(() => closeAfterDiscard.current?.())
                    .catch(() =>
                      setError('The window could not close safely. Retry after cleanup.'),
                    )
                }
              >
                Stop and discard
              </Button>
              <Button
                onClick={() => {
                  closeAfterDiscard.current = null;
                  setStopRequested(false);
                }}
              >
                Keep capturing
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
