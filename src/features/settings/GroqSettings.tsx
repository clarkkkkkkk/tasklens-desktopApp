import { useLocalIntelligence } from '../../services/localai/useLocalIntelligence';
import { useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import { ShieldCheck } from '../../components/icons';
import { groqConnection } from '../../services/ai/providers/GroqProvider';
import { nativeAvailable, toLocalAIError } from '../../services/localai/native';

export function GroqSettings() {
  const { snapshot, processing, services, saveSettings, openAISetup } = useApp();
  const status = processing.connection;
  const { status: localStatus } = useLocalIntelligence();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const running = useRef(false);
  async function run(action: () => Promise<void>, success: string) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setMessage('');
    setError('');
    try {
      await action();
      await services.processing.refresh();
      setMessage(success);
      services.ai.registry.invalidate();
    } catch (e) {
      setError(toLocalAIError(e).message);
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  async function select(mode: 'local' | 'groq') {
    if (mode === 'groq' && (!status.connected || !status.verified || !status.consent)) {
      openAISetup();
      return;
    }
    await run(
      async () => {
        await services.processing.sync(mode, true);
        await saveSettings((current) => ({
          ...current,
          ai: { ...current.ai, executionMode: mode, modeChoiceCompleted: true },
        }));
      },
      mode === 'groq' ? 'Groq Cloud selected.' : 'Local AI selected.',
    );
  }
  return (
    <section className="settings-section" aria-labelledby="groq-heading">
      <h2 id="groq-heading">
        <ShieldCheck size={18} />
        AI Processing
      </h2>
      <div className="setting-row">
        <h3>Local AI</h3>
        <span role="status">
          {localStatus.state === 'ready'
            ? 'Ready'
            : localStatus.state === 'preparing'
              ? 'Preparing…'
              : 'Needs attention — see Advanced Settings'}
        </span>
      </div>
      <fieldset className="ai-mode">
        <legend className="sr-only">Where extraction runs</legend>
        <label>
          <input
            type="radio"
            name="execution-mode"
            checked={snapshot.settings.ai.executionMode === 'local'}
            disabled={pending}
            onChange={() => void select('local')}
          />
          <span>
            <strong>Local AI</strong>
            <small>Works offline on this device.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="execution-mode"
            checked={snapshot.settings.ai.executionMode === 'groq'}
            disabled={pending || !nativeAvailable()}
            onChange={() => void select('groq')}
          />
          <span>
            <strong>Groq Cloud</strong>
            <small>Online AI using your Groq API key.</small>
          </span>
        </label>
      </fieldset>
      {snapshot.settings.ai.executionMode === 'groq' && processing.effectiveMode === 'local' && (
        <p role="status">Groq is temporarily unavailable. Using Local AI.</p>
      )}
      <div className="setting-subsection">
        <div className="setting-row">
          <h3>Groq connection</h3>
          <span role="status">
            <span
              aria-hidden="true"
              className={`connection-indicator ${status.connected ? 'connected' : ''}`}
            />
            {status.connected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="groq-actions">
          <Button disabled={pending || !nativeAvailable()} onClick={openAISetup}>
            {status.connected ? 'Connection setup' : 'Connect API key'}
          </Button>
          <Button
            disabled={pending || !status.connected}
            onClick={() =>
              void run(async () => {
                await groqConnection.verify();
              }, 'Connection verified.')
            }
          >
            Verify connection
          </Button>
          <Button
            disabled={pending || (!status.connected && !status.removalIncomplete)}
            onClick={() =>
              void run(async () => {
                await services.processing.sync('local');
                await groqConnection.disconnect();
                await saveSettings((current) => ({
                  ...current,
                  ai: { ...current.ai, executionMode: 'local', modeChoiceCompleted: true },
                }));
              }, 'Disconnected. Privacy permission cleared.')
            }
          >
            Disconnect API key
          </Button>
          {processing.preferredMode === 'groq' &&
            processing.effectiveMode === 'local' &&
            status.connected && (
              <Button disabled={pending} onClick={() => void select('groq')}>
                Use Groq Cloud
              </Button>
            )}
        </div>
        {status.connected && (
          <p className="field-help">
            {status.storage === 'session'
              ? 'Session only — reconnect after restarting.'
              : 'Saved in operating-system credential storage.'}
          </p>
        )}
        <p className="field-help" role="status">
          {status.dailyUsed} of {status.dailyLimit} attempts used today.
          {status.retryAt ? ` Retry after ${new Date(status.retryAt).toLocaleString()}.` : ''}
        </p>
        <div className="groq-feedback" role="status">
          {pending ? 'Updating connection…' : message}
        </div>
        {status.removalIncomplete && (
          <ErrorState message="Credential use is disabled, but removal is incomplete. Unlock credential storage and retry Disconnect." />
        )}
        {error && <ErrorState message={error} />}
        {!nativeAvailable() && (
          <p className="field-help">Groq connections require the desktop app.</p>
        )}
      </div>
    </section>
  );
}
