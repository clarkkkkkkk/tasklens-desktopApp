import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { ShieldCheck } from '../../components/icons';
import {
  disconnectedGroq,
  groqConnection,
  type GroqStatus,
} from '../../services/ai/providers/GroqProvider';
import { nativeAvailable, toLocalAIError } from '../../services/localai/native';

export function GroqSettings() {
  const { snapshot, services, saveSettings } = useApp();
  const [status, setStatus] = useState<GroqStatus>(disconnectedGroq);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [disclosure, setDisclosure] = useState(false);
  const mode = snapshot.settings.ai.executionMode;
  useEffect(() => {
    let active = true;
    void groqConnection
      .status()
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((e: unknown) => {
        if (active) setError(toLocalAIError(e).message);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  async function run(action: () => Promise<GroqStatus>, success: string) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const next = await action();
      setStatus(next);
      setMessage(success);
      services.ai.registry.invalidate();
      window.dispatchEvent(new Event('tasklens-groq-change'));
    } catch (e) {
      setError(toLocalAIError(e).message);
    } finally {
      setPending(false);
    }
  }
  async function select(next: 'local' | 'groq', consent = false) {
    if (next === 'groq' && !status.consent && !consent) {
      setDisclosure(true);
      return;
    }
    await run(
      async () => {
        if (consent) await groqConnection.configure(false, true);
        await saveSettings({
          ...snapshot.settings,
          ai: { ...snapshot.settings.ai, executionMode: next },
        });
        setDisclosure(false);
        return groqConnection.status();
      },
      next === 'groq' ? 'Groq Cloud selected.' : 'Local AI selected.',
    );
  }
  return (
    <section className="settings-section" aria-labelledby="groq-heading">
      <h2 id="groq-heading">
        <ShieldCheck size={18} /> AI processing
      </h2>
      <fieldset className="setting-subsection ai-mode">
        <legend>Where extraction runs</legend>
        <label>
          <input
            type="radio"
            name="execution-mode"
            checked={mode === 'local'}
            disabled={pending}
            onChange={() => void select('local')}
          />
          <span>
            <strong>Local AI</strong>
            <small>Works offline, runs on this computer.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="execution-mode"
            checked={mode === 'groq'}
            disabled={pending || !nativeAvailable()}
            onChange={() => void select('groq')}
          />
          <span>
            <strong>Groq Cloud</strong>
            <small>Requires internet and your Groq API key.</small>
          </span>
        </label>
      </fieldset>
      {disclosure && (
        <div className="setting-subsection" role="region" aria-label="Groq privacy disclosure">
          <h3>Send source text to Groq?</h3>
          <p>
            Recognized screenshot text, typed text, or locally generated voice transcripts will be
            sent to Groq for processing. Original screenshots and audio stay on this device. Only
            the source text, source identifiers and necessary date/time context are sent. Review
            Groq’s data policies before continuing.
          </p>
          <p>
            <a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer">
              Groq data policies
            </a>
          </p>
          <p>
            Your consent is remembered on this device until you disconnect or this disclosure
            changes. Every extracted task still needs your review.
          </p>
          <Button variant="primary" disabled={pending} onClick={() => void select('groq', true)}>
            Agree and select Groq Cloud
          </Button>{' '}
          <Button disabled={pending} onClick={() => setDisclosure(false)}>
            Keep current mode
          </Button>
        </div>
      )}
      <div className="setting-subsection">
        <h3>Groq connection</h3>
        <p>
          Use your own Groq Free API key. Create one in the{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
            Groq console
          </a>
          . TaskLens does not manage your Groq billing or account plan.
        </p>
        <p role="status">
          {status.connected
            ? `Connected · ${status.storage === 'persistent' ? 'Saved in operating-system credential storage' : 'Session only — reconnect after restarting TaskLens'}`
            : 'Not connected'}
        </p>
        {status.removalIncomplete && (
          <ErrorState message="Credential use is disabled, but operating-system removal is incomplete. Unlock your credential storage and retry Disconnect." />
        )}
        <label>
          Groq API key
          <input
            type="password"
            aria-label="Groq API key"
            autoComplete="off"
            spellCheck={false}
            value={key}
            disabled={pending || !nativeAvailable()}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <div className="setting-row">
          <Button
            disabled={pending || !key.trim() || !nativeAvailable()}
            onClick={() => {
              const submitted = key.trim();
              setKey('');
              void run(
                () => groqConnection.connect(submitted),
                'Key verified and connected. Selecting Cloud mode requires your privacy consent.',
              );
            }}
          >
            Connect API key
          </Button>
          <Button
            disabled={pending || !status.connected}
            onClick={() => void run(groqConnection.verify, 'Connection verified.')}
          >
            Verify connection
          </Button>
          <Button
            disabled={pending || (!status.connected && !status.removalIncomplete)}
            onClick={() =>
              void run(async () => {
                const next = await groqConnection.disconnect();
                await saveSettings({
                  ...snapshot.settings,
                  ai: { ...snapshot.settings.ai, executionMode: 'local' },
                });
                return next;
              }, 'Disconnected. Privacy consent cleared.')
            }
          >
            Disconnect API key
          </Button>
        </div>
        <p className="field-help">
          Your key is submitted to the native app and never returned to the interface or included in
          task backups. If secure storage is unavailable, the connection lasts only for this
          session.
        </p>
        <p className="field-help">
          TaskLens allows one active extraction, two waiting, two request attempts per minute and
          ten per local day. Retries and repairs count. Groq account limits also apply.
        </p>
        <p role="status">
          Today: {status.dailyUsed}/{status.dailyLimit} attempts
          {status.retryAt ? ` · Retry after ${new Date(status.retryAt).toLocaleString()}` : ''}.
        </p>
        {!nativeAvailable() && (
          <p className="field-help">Groq connections require the TaskLens desktop app.</p>
        )}
        {pending && <p role="status">Updating Groq connection…</p>}
        {message && <p role="status">{message}</p>}
        {error && <ErrorState message={error} />}
      </div>
    </section>
  );
}
