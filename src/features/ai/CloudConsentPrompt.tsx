import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/context';
import { ShieldCheck } from '../../components/icons';
import { Button } from '../../components/ui';
import type { ConsentAnswer, PendingConsent } from '../../services/ai/consent';
import type { ScoredCandidate } from '../../services/ai/router';
import { ReasonList } from './RouteDecisionCard';
import './ai.css';

function DataFlowList({ candidate }: { candidate: ScoredCandidate }) {
  return (
    <div className="consent-flow">
      <div>
        <h3>What will be sent to {candidate.provider.name}</h3>
        <ul>
          {candidate.dataFlow.sends.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      {candidate.dataFlow.staysLocal.length > 0 && (
        <div>
          <h3>Stays on this device</h3>
          <ul>
            {candidate.dataFlow.staysLocal.map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li>Your saved tasks and settings</li>
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Asks before source material leaves the device, and before any fallback to another provider.
 * Mounted once at app level; every extraction (screenshot, voice, text) goes through it.
 */
export function CloudConsentPrompt() {
  const { services } = useApp();
  const consent = services.ai.consent;
  const [pending, setPending] = useState<PendingConsent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => consent.subscribe(setPending), [consent]);
  useEffect(() => {
    const element = dialog.current;
    if (!pending || !element) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!element.open) element.showModal();
    return () => {
      element.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [pending]);
  if (!pending) return null;
  const answer = (value: ConsentAnswer) => consent.respond(pending.id, value);
  const { request } = pending;
  const title =
    request.kind === 'cloud'
      ? `Send this to ${request.candidate.provider.name}?`
      : `${request.failed.model.name} was unavailable`;
  return (
    <dialog
      ref={dialog}
      className="consent-dialog"
      aria-labelledby="consent-title"
      onCancel={(e) => {
        e.preventDefault();
        answer('cancel');
      }}
    >
      <div className="consent-body">
        <h2 id="consent-title">{title}</h2>
        {request.kind === 'cloud' ? (
          <>
            <p>
              TaskLens recommends <strong>{request.candidate.model.name}</strong> for this{' '}
              {request.decision.requirements.label}. Your AI mode asks before anything leaves this
              device.
            </p>
            <h3>Why</h3>
            <ReasonList reasons={request.decision.reasons} limit={5} />
            <DataFlowList candidate={request.candidate} />
          </>
        ) : (
          <>
            <p>{request.error}</p>
            <p>
              TaskLens found{' '}
              {request.alternative.model.privacy === 'local'
                ? 'a local model capable of completing this task'
                : 'another AI provider capable of completing this task'}
              : <strong>{request.alternative.model.name}</strong> (
              {request.alternative.tradeoff ?? request.alternative.provider.runtime}
              ).
            </p>
            {request.alternative.dataFlow.leavesDevice && (
              <DataFlowList candidate={request.alternative} />
            )}
          </>
        )}
        <p className="route-privacy">
          <ShieldCheck size={16} />
          <span>Nothing is sent or saved until you choose.</span>
        </p>
        <div className="action-pair">
          {request.kind === 'cloud' ? (
            <>
              <Button variant="primary" onClick={() => answer('approve')}>
                Send to {request.candidate.model.name}
              </Button>
              {request.alternative && (
                <Button onClick={() => answer('alternative')}>
                  Use {request.alternative.model.name} on this device
                </Button>
              )}
            </>
          ) : (
            <Button variant="primary" onClick={() => answer('approve')}>
              {request.alternative.model.privacy === 'local'
                ? 'Use Local AI'
                : `Send to ${request.alternative.provider.name}`}
            </Button>
          )}
          <Button variant="ghost" onClick={() => answer('cancel')}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  );
}
