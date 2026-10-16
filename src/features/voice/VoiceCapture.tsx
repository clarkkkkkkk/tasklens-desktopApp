import { componentsReady, useLocalIntelligence } from '../../services/localai/useLocalIntelligence';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { Microphone, FileImage, Pencil } from '../../components/icons';
import type { ExtractedAction } from '../../types/action';
import type { AudioSource, CaptureStatus } from '../../services/voice/types';
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
}: {
  locked: boolean;
  onResult: (actions: ExtractedAction[]) => void;
  onGuardChange: (cancel: (() => Promise<void>) | null) => void;
}) {
  const { status: intelligence } = useLocalIntelligence();
  const textReady = componentsReady(intelligence, ['extraction', 'llama-server']);
  const speechReady = componentsReady(intelligence, [
    'extraction',
    'llama-server',
    'whisper',
    'whisper-cli',
  ]);
  const { services } = useApp();
  const [status, setStatus] = useState<CaptureStatus>('idle'),
    [error, setError] = useState(''),
    [elapsed, setElapsed] = useState(0),
    [level, setLevel] = useState(0),
    [textOpen, setTextOpen] = useState(false),
    [text, setText] = useState(''),
    [recordingDate, setRecordingDate] = useState(''),
    [source, setSource] = useState<ExtractedAction['source']>(),
    [warnings, setWarnings] = useState<string[]>([]),
    [stopRequested, setStopRequested] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    audio = useRef<AudioSource | null>(null),
    controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    busy = useRef(false),
    currentStatus = useRef(status);
  const closeAfterDiscard = useRef<(() => Promise<void>) | null>(null);
  const pendingStart = useRef<Promise<AudioSource> | null>(null);
  const pendingExtraction = useRef<Promise<unknown> | null>(null);
  currentStatus.current = status;
  const cancel = useCallback(async () => {
    generation.current++;
    controller.current?.abort();
    const previous = audio.current;
    audio.current = null;
    setStatus('finalizing');
    setSource(undefined);
    setWarnings([]);
    try {
      if (previous) await services.voice.cancel(previous);
      if (pendingStart.current) {
        const starting = await pendingStart.current.catch(() => null);
        if (starting) await services.voice.cancel(starting);
      }
      await pendingExtraction.current?.catch(() => {});
    } catch {
      closeAfterDiscard.current = null;
      setError('Could not finish cleanup. Restart TaskLens before recording again.');
    } finally {
      busy.current = false;
      currentStatus.current = 'cancelled';
      setStatus('cancelled');
      setStopRequested(false);
    }
  }, [services]);
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
  function begin() {
    if (busy.current || locked) return null;
    busy.current = true;
    generation.current++;
    controller.current = new AbortController();
    setError('');
    setWarnings([]);
    return { version: generation.current, signal: controller.current.signal };
  }
  async function extract(input: ExtractedAction['source'], version: number, signal: AbortSignal) {
    setStatus('extracting');
    const extraction = services.extraction.extract(input, { signal, onProgress: () => {} });
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
    setStatus('ready_for_review');
    busy.current = false;
    if (bundle.actions.length) onResult(bundle.actions);
  }
  function failed(e: unknown, version: number) {
    if (version !== generation.current) return;
    setError(e instanceof Error ? e.message : 'Local processing failed.');
    setStatus('error');
    busy.current = false;
  }
  async function transcribe(input: AudioSource, version: number, signal: AbortSignal) {
    setStatus('transcribing');
    try {
      const transcript = await services.speech.transcribe(input, signal, (stage) => {
        if (version === generation.current) setStatus(stage);
      });
      if (version !== generation.current) return;
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
    setElapsed(0);
    try {
      const starting = services.voice.start((ms, value) => {
        if (job.version === generation.current) {
          setElapsed(ms);
          setLevel(value);
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
      await services.voice.stop(input);
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
    if (elapsed >= 300000 && status === 'recording') doneRef.current();
  }, [elapsed, status]);
  async function importAudio(selected: File) {
    if (!speechReady) {
      setError(intelligence.message);
      return;
    }
    const job = begin();
    if (!job) return;
    setSource(undefined);
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
    setSource(input);
    try {
      await extract(input, job.version, job.signal);
    } catch (e) {
      failed(e, job.version);
    }
  }
  async function retry() {
    if (!source) return;
    const job = begin();
    if (!job) return;
    const next = { ...source, recordingDate: recordingDate || undefined };
    setSource(next);
    try {
      await extract(next, job.version, job.signal);
    } catch (e) {
      failed(e, job.version);
    }
  }
  const labels: Record<CaptureStatus, string> = {
    idle: '',
    requesting_permission: 'Waiting for microphone access…',
    recording: 'Recording',
    finalizing: 'Finishing audio…',
    preprocessing: 'Preparing audio…',
    transcribing: 'Transcribing on this device…',
    extracting: 'Finding actionable details locally…',
    ready_for_review: 'Ready for review',
    cancelled: 'Capture cancelled',
    error: 'Capture needs attention',
  };
  return (
    <div
      ref={dropTarget}
      className="voice-capture"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.items).some((i) => i.type.startsWith('audio/')))
          e.preventDefault();
      }}
      onDrop={(e) => {
        const audioFile = e.dataTransfer.files[0];
        if (audioFile && /\.(wav|mp3|m4a|ogg|webm)$/i.test(audioFile.name)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files.length !== 1) setError('Choose one audio file at a time.');
          else void importAudio(audioFile);
        }
      }}
    >
      <div className="action-pair">
        <Button
          data-voice-open
          disabled={!speechReady || locked || working.has(status)}
          onClick={() => void record()}
        >
          <Microphone size={18} />
          Voice
        </Button>
        <Button
          disabled={!speechReady || locked || working.has(status)}
          onClick={() => file.current?.click()}
        >
          <FileImage size={18} />
          Import audio
        </Button>
        <Button
          disabled={!textReady || locked || working.has(status)}
          onClick={() => setTextOpen((v) => !v)}
        >
          <Pencil size={18} />
          Capture text
        </Button>
      </div>
      <input
        className="sr-only"
        type="file"
        ref={file}
        aria-label="Import audio file"
        accept=".wav,.mp3,.m4a,.ogg"
        disabled={!speechReady || locked || working.has(status)}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          e.target.value = '';
          if (selected) void importAudio(selected);
        }}
      />
      {textOpen && (
        <div className="voice-text">
          <label>
            Information to capture
            <textarea
              value={text}
              maxLength={20000}
              disabled={!textReady || working.has(status)}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <Button
            disabled={!textReady || locked || working.has(status) || text.trim().length < 3}
            onClick={() => void fromText()}
          >
            Extract actions
          </Button>
        </div>
      )}
      {status !== 'idle' && (
        <div className="voice-recorder">
          <div className="voice-status">
            <h2 aria-live="polite">{labels[status]}</h2>
            {status === 'recording' && (
              <>
                <span aria-label="Recording duration">
                  {Math.floor(elapsed / 60000)}:
                  {String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}
                </span>
                <span className="voice-level" aria-hidden="true">
                  <span style={{ transform: `scaleX(${Math.max(0.05, level)})` }} />
                </span>
              </>
            )}
          </div>
          {working.has(status) && (
            <p className="field-help">Your recording does not leave this computer.</p>
          )}
          {status === 'recording' && (
            <Button variant="primary" onClick={() => void done()}>
              Done recording
            </Button>
          )}
          {working.has(status) && <Button onClick={() => void cancel()}>Cancel capture</Button>}
          {stopRequested && (
            <div role="alert" className="inline-confirm">
              <p>Stop and discard this capture before closing?</p>
              <Button
                onClick={() =>
                  void (async () => {
                    if (currentStatus.current === 'finalizing') return;
                    currentStatus.current = 'finalizing';
                    await cancel();
                    try {
                      await closeAfterDiscard.current?.();
                    } catch {
                      setError('The window could not close. You can close it again after cleanup.');
                    }
                  })()
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
          )}
          {error && (
            <ErrorState message={error}>
              {!source && (
                <Button
                  onClick={() => void record()}
                  disabled={!speechReady || working.has(status)}
                >
                  Try recording again
                </Button>
              )}
              <Button
                onClick={() => file.current?.click()}
                disabled={!speechReady || working.has(status)}
              >
                Use audio file instead
              </Button>
            </ErrorState>
          )}
          {source?.transcript && (
            <>
              <details>
                <summary>Source Transcript</summary>
                {source.transcript.segments.map((s) => (
                  <p key={s.id}>
                    <small>
                      {(s.startMs / 1000).toFixed(1)}–{(s.endMs / 1000).toFixed(1)}s
                    </small>{' '}
                    {s.text}
                  </p>
                ))}
              </details>
              <Button
                onClick={() => downloadText(source.transcript!.fullText, 'tasklens-transcript.txt')}
              >
                Export transcript
              </Button>
            </>
          )}
          {warnings.map((warning, i) => (
            <p className="mock-notice" key={i}>
              {warning}
            </p>
          ))}
          {source && !source.capturedAt && (
            <label>
              Recording date (optional)
              <input
                type="date"
                value={recordingDate}
                onChange={(e) => setRecordingDate(e.target.value)}
                disabled={!speechReady || working.has(status)}
              />
              <small>
                Use the actual recording date to resolve “tomorrow” and other relative dates.
              </small>
            </label>
          )}
          {source && !working.has(status) && (
            <Button onClick={() => void retry()}>Retry extraction</Button>
          )}
        </div>
      )}
      <p className="field-help">
        Voice and text use built-in local models. Drop audio into Inbox to import it.
      </p>
    </div>
  );
}
