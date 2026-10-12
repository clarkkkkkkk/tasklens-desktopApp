import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { LoaderCircle, ShieldCheck, Sparkles } from '../../components/icons';
import { Button, ErrorState } from '../../components/ui';
import type { LocalAIStatus, RuntimeStatus } from '../../services/localai/LocalModelManager';
import type { Settings } from '../../types/action';
import '../extraction/local-ai.css';

type Headline = 'Not installed' | 'Ready' | 'Loading' | 'Processing' | 'Error' | 'Stopped';

/** One plain status word for the model, derived from file and runtime state. */
function headline(status: LocalAIStatus): Headline {
  const { model, runtime } = status;
  if (model.state === 'not_installed') return 'Not installed';
  if (runtime.state === 'loading') return 'Loading';
  if (runtime.state === 'processing') return 'Processing';
  if (model.state === 'corrupted' || runtime.state === 'failed' || !runtime.binaryFound)
    return 'Error';
  if (runtime.state === 'ready') return 'Ready';
  return 'Stopped';
}

const size = (bytes: number | null) =>
  bytes ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : 'Not available';
const fileState = {
  not_installed: 'Not installed',
  unverified: 'Installed · checksum not yet verified',
  verified: 'Installed · checksum verified',
  corrupted: 'Damaged or not the supported build',
};
const LANGUAGE_NAMES: Record<string, string> = { eng: 'English', ceb: 'Cebuano', tgl: 'Tagalog' };

export function LocalAISettings({
  settings,
  onUpdate,
  pending: savingSettings,
}: {
  settings: Settings;
  onUpdate: (next: Settings) => Promise<void>;
  pending: boolean;
}) {
  const { services } = useApp();
  const manager = services.localAI;
  const [status, setStatus] = useState<LocalAIStatus | null>(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setStatus(await manager.getModelStatus());
    } catch {
      setError('Could not read local AI status.');
    }
  }, [manager]);
  useEffect(() => {
    void refresh();
    let dispose: (() => void) | undefined;
    let alive = true;
    void manager
      .onRuntimeStatus((runtime: RuntimeStatus) => {
        setStatus((current) =>
          current ? { ...current, runtime: { ...current.runtime, ...runtime } } : current,
        );
      })
      .then((fn) => (alive ? (dispose = fn) : fn()));
    return () => {
      alive = false;
      dispose?.();
    };
  }, [manager, refresh]);
  async function act(label: string, operation: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Local AI could not complete that action.');
    } finally {
      setBusy('');
      await refresh();
    }
  }
  const local = settings.localAI;
  const updateLocal = (changes: Partial<Settings['localAI']>) =>
    void onUpdate({ ...settings, localAI: { ...local, ...changes } });

  return (
    <section className="settings-section" aria-labelledby="local-ai-heading">
      <h2 id="local-ai-heading">
        <Sparkles size={18} />
        Local AI
        <span className="badge">
          <ShieldCheck size={12} />
          On-device
        </span>
      </h2>
      <p>
        TaskLens reads screenshots with Tesseract OCR and understands them with Phi-4-mini-instruct,
        both running on this computer. Screenshots, text and results never leave this device, and
        extraction works offline.
      </p>
      {!manager.available ? (
        <p className="field-help">
          Open the TaskLens desktop app to use on-device AI. This preview uses sample extraction.
        </p>
      ) : !status ? (
        <p className="field-help" role="status">
          Checking local AI…
        </p>
      ) : (
        <>
          <div className="setting-row">
            <div>
              <h3>Model</h3>
              <p>
                {status.model.name} · {status.model.quantization} · {status.model.publisher},{' '}
                {status.model.license} license
              </p>
            </div>
            <span className="badge local-ai-status" role="status">
              {(busy || ['Loading', 'Processing'].includes(headline(status))) && (
                <LoaderCircle size={12} className="spin" />
              )}
              {headline(status)}
            </span>
          </div>
          <dl className="local-ai-facts">
            <dt>Model file</dt>
            <dd>{fileState[status.model.state]}</dd>
            <dt>Location</dt>
            <dd>{status.model.path ?? 'Not available'}</dd>
            <dt>Size</dt>
            <dd>
              {status.model.bytes
                ? size(status.model.bytes)
                : `Expected ${size(status.model.expectedBytes)}`}
            </dd>
            <dt>Runtime</dt>
            <dd>
              {status.runtime.binaryFound
                ? `llama.cpp · ${status.runtime.state}${status.runtime.message ? ` · ${status.runtime.message}` : ''}`
                : 'llama.cpp runtime is missing from this build'}
            </dd>
            <dt>Text recognition</dt>
            <dd>
              {status.ocr.available
                ? (status.ocr.version ?? 'Tesseract')
                : status.ocr.binaryFound
                  ? 'Tesseract found, but no language data'
                  : 'Tesseract is not installed'}
            </dd>
            <dt>OCR languages</dt>
            <dd>
              {status.ocr.languages
                .map(
                  (l) =>
                    `${LANGUAGE_NAMES[l.code] ?? l.code} ${l.installed ? 'installed' : 'missing'}`,
                )
                .join(' · ')}
            </dd>
          </dl>
          {status.runtime.state === 'failed' && status.runtime.message && (
            <ErrorState message={status.runtime.message.replace(/^[A-Z_]+: /, '')} />
          )}
          {error && <ErrorState message={error.replace(/^[A-Z_]+: /, '')} />}
          <div className="action-pair">
            <Button
              disabled={!!busy}
              onClick={() => void act('import', () => manager.importModel())}
            >
              Select / Import model
            </Button>
            <Button
              disabled={!!busy || status.model.state === 'not_installed'}
              onClick={() => void act('validate', () => manager.validateModel())}
            >
              Validate model
            </Button>
            <Button
              disabled={!!busy || status.model.state === 'not_installed'}
              onClick={() => void act('reload', () => manager.reloadModel())}
            >
              Reload model
            </Button>
            <Button
              disabled={!!busy}
              onClick={() => void act('languages', () => manager.importOcrLanguages())}
            >
              Import OCR languages
            </Button>
          </div>
          <p className="field-help">
            Installing the model is a one-time setup: import <strong>{status.model.file}</strong> (
            {size(status.model.expectedBytes)}). Its SHA-256 is checked before use. TaskLens never
            downloads models by itself. Source: {status.model.source}. OCR language files (eng, ceb,
            tgl .traineddata) come from the Tesseract project. See LOCAL_AI.md for setup and
            licenses.
          </p>
        </>
      )}
      <div className="setting-subsection">
        <div className="setting-row">
          <div>
            <h3>Developer mode</h3>
            <p>Show OCR text, regions and raw model output after processing.</p>
          </div>
          <input
            type="checkbox"
            aria-label="Developer mode"
            checked={local.developerMode}
            disabled={savingSettings}
            onChange={(e) => updateLocal({ developerMode: e.target.checked })}
          />
        </div>
        {local.developerMode && (
          <div className="developer-fields">
            <label>
              Context size (tokens)
              <select
                value={local.contextSize}
                disabled={savingSettings}
                onChange={(e) => updateLocal({ contextSize: Number(e.target.value) })}
              >
                {[4096, 8192, 12288, 16384].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              CPU threads
              <select
                value={local.threads ?? ''}
                disabled={savingSettings}
                onChange={(e) =>
                  updateLocal({ threads: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">Automatic</option>
                {[2, 4, 6, 8, 12, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-help">Changes apply the next time the model loads.</p>
          </div>
        )}
      </div>
    </section>
  );
}
