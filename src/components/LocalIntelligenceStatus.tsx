import { useState } from 'react';
import { useLocalIntelligence } from '../services/localai/useLocalIntelligence';
import { Button, ErrorState } from './ui';
export function LocalIntelligenceStatus() {
  const { available, status, retry } = useLocalIntelligence();
  const [error, setError] = useState('');
  const failed = Object.entries(status.components).filter(
    ([, component]) => component.state === 'error',
  );
  if (!available) return null;
  return (
    <div className="local-intelligence-notice" aria-live="polite">
      <p role="status">{status.message}</p>
      {status.state === 'error' && (
        <Button
          onClick={() => {
            setError('');
            void retry().catch(() =>
              setError(
                'Validation could not start. Restart TaskLens or reinstall it to repair bundled resources.',
              ),
            );
          }}
        >
          Retry validation
        </Button>
      )}
      {status.state === 'error' && failed.length > 0 && (
        <details>
          <summary>Repair details</summary>
          {failed.map(([name, component]) => (
            <p key={name}>
              {name}: {component.message?.replace(/^[A-Z_]+: /, '')}
            </p>
          ))}
        </details>
      )}
      {error && <ErrorState message={error} />}
    </div>
  );
}
