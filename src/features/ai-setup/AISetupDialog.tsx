import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { groqConnection } from '../../services/ai/providers/GroqProvider';
import { nativeAvailable, toLocalAIError } from '../../services/localai/native';

export function GroqLink({
  destination,
  children,
}: {
  destination: 'keys' | 'data-policy';
  children: React.ReactNode;
}) {
  const [error, setError] = useState('');
  return (
    <>
      <a
        href={
          destination === 'keys'
            ? 'https://console.groq.com/keys'
            : 'https://console.groq.com/docs/your-data'
        }
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (!nativeAvailable()) return;
          event.preventDefault();
          void groqConnection
            .openLink(destination)
            .catch(() => setError('Could not open your browser. Open the link manually.'));
        }}
      >
        {children}
      </a>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
export function GroqDisclosure() {
  return (
    <div className="groq-disclosure">
      <p>
        Source text and locally generated transcripts are sent to Groq. Original screenshots and
        audio stay on this device.
      </p>
      <details>
        <summary>Full privacy disclosure</summary>
        <p>
          Only recognized screenshot text, typed text, or local transcripts, source identifiers, and
          necessary date/time context are sent. Your API key is used by the native app and is never
          included in task backups. Groq processes this information under its own data policies.
          Every extracted task still needs your review.
        </p>
        <p>
          Permission is remembered on this device until you disconnect or the disclosure changes.
          Requests already transmitted may consume provider quota even if cancelled.
        </p>
        <GroqLink destination="data-policy">Groq data policy</GroqLink>
      </details>
    </div>
  );
}
export function AISetupDialog({
  initial,
  onFinish,
}: {
  initial: 'choice' | 'groq';
  onFinish: (resume: boolean, choiceComplete?: boolean) => void;
}) {
  const { processing, services, saveSettings, announce } = useApp();
  const [step, setStep] = useState(initial === 'choice' ? 0 : 1);
  const [key, setKey] = useState('');
  const [replaceKey, setReplaceKey] = useState(false);
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    const generationState = generation;
    const opener = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      generationState.current++;
      element?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (
      step === 0 &&
      processing.connection.connectivity !== 'online' &&
      !processing.connection.providerReachable
    ) {
      generation.current++;
      void services.processing.sync('local').catch(() => {});
      onFinish(false, false);
    }
  }, [step, processing.connection, services.processing, onFinish]);
  async function selectLocal(resumeCapture = false) {
    generation.current++;
    setKey('');
    setError('');
    try {
      await services.processing.sync('local');
      await saveSettings((current) => ({
        ...current,
        ai: { ...current.ai, executionMode: 'local', modeChoiceCompleted: true },
      }));
      onFinish(resumeCapture);
    } catch {
      // Escape must still work when preferences cannot be written. Do not resume content.
      await services.processing.sync('local').catch(() => {});
      announce('Using Local AI for this session. The preference could not be saved.');
      onFinish(false);
    }
  }
  async function run(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    const version = generation.current;
    try {
      await operation();
    } catch (e) {
      if (version === generation.current) {
        const failure = toLocalAIError(e);
        setError(failure.message);
        if (failure.code === 'GROQ_INVALID_KEY') setReplaceKey(true);
      }
    } finally {
      running.current = false;
      if (version === generation.current) setPending(false);
    }
  }
  async function verify() {
    const version = generation.current;
    const submitted = key.trim();
    setKey('');
    if (processing.connection.connected && !replaceKey && !submitted) await groqConnection.verify();
    else await groqConnection.connect(submitted);
    await services.processing.refresh();
    if (version === generation.current) setStep(4);
  }
  async function permit() {
    const version = generation.current;
    await groqConnection.configure(false, true);
    if (version !== generation.current) return;
    await saveSettings((current) => ({
      ...current,
      ai: { ...current.ai, executionMode: 'groq', modeChoiceCompleted: true },
    }));
    if (version !== generation.current) return;
    await services.processing.sync('groq', true);
    if (version === generation.current) setStep(5);
  }
  return (
    <dialog
      ref={dialog}
      className="ai-setup-dialog"
      aria-labelledby="ai-setup-heading"
      onCancel={(event) => {
        event.preventDefault();
        void selectLocal();
      }}
    >
      <div className="ai-setup-body">
        {step > 0 && <p className="eyebrow">STEP {step} OF 5</p>}
        <h2 id="ai-setup-heading" tabIndex={-1}>
          {step === 0
            ? 'How would you like TaskLens to process your information?'
            : step === 2
              ? 'Create an API key'
              : step === 3
                ? 'Connect your key'
                : step === 4
                  ? 'Privacy permission'
                  : step === 5
                    ? 'Groq Cloud is ready.'
                    : 'Connect Groq Cloud'}
        </h2>
        {step === 0 && (
          <div className="ai-choice-options">
            <Button onClick={() => setStep(1)}>
              <strong>Online AI</strong>
              <span>
                Fast extraction using Groq Cloud.
                <br />
                Requires internet and a Groq API key.
              </span>
            </Button>
            <Button onClick={() => void selectLocal(true)}>
              <strong>Offline AI</strong>
              <span>
                Runs locally on your computer.
                <br />
                Works without internet.
              </span>
            </Button>
          </div>
        )}
        {step === 1 && (
          <>
            <p>Use a free Groq API key to process tasks online.</p>
            <Button
              variant="primary"
              onClick={() =>
                setStep(
                  processing.connection.connected && processing.connection.verified
                    ? 4
                    : processing.connection.connected
                      ? 3
                      : 2,
                )
              }
            >
              Continue
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <ol className="setup-instructions">
              <li>
                Open the <GroqLink destination="keys">Groq Console</GroqLink>.
              </li>
              <li>Sign in or create an account.</li>
              <li>Create an API key.</li>
              <li>Copy the key.</li>
            </ol>
            <Button variant="primary" onClick={() => setStep(3)}>
              I have my key
            </Button>
          </>
        )}
        {step === 3 && (
          <>
            {processing.connection.connected && !replaceKey ? (
              <>
                <p>A key is saved. Verify it to continue.</p>
                <Button variant="ghost" disabled={pending} onClick={() => setReplaceKey(true)}>
                  Use another key
                </Button>
              </>
            ) : (
              <label>
                Groq API key
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  disabled={pending}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
            )}
            <Button
              variant="primary"
              disabled={
                pending ||
                ((!processing.connection.connected || replaceKey) && !key.trim()) ||
                !nativeAvailable()
              }
              onClick={() => void run(verify)}
            >
              {pending ? 'Verifying…' : error ? 'Retry connection' : 'Connect & verify'}
            </Button>
            {processing.connection.storage === 'session' && (
              <p className="field-help">
                Secure storage is unavailable. This connection lasts for this session only.
              </p>
            )}
          </>
        )}
        {step === 4 && (
          <>
            <GroqDisclosure />
            <label className="consent-check">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                disabled={pending}
              />
              I agree to send source text to Groq for processing.
            </label>
            <Button variant="primary" disabled={!agree || pending} onClick={() => void run(permit)}>
              {pending ? 'Saving permission…' : 'Agree & continue'}
            </Button>
          </>
        )}
        {step === 5 && (
          <>
            <p>
              {processing.connection.storage === 'session'
                ? 'Session only — reconnect after restarting TaskLens.'
                : 'Your connection is saved securely on this device.'}
            </p>
            <Button variant="primary" onClick={() => onFinish(true)}>
              Start using TaskLens
            </Button>
          </>
        )}
        {error && <ErrorState message={error} />}
        {step > 0 && step < 5 && (
          <Button variant="ghost" onClick={() => void selectLocal()}>
            Cancel & use Offline AI
          </Button>
        )}
      </div>
    </dialog>
  );
}
