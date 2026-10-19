import { AlertCircle, Check, CircleHelp, ShieldCheck, Sparkles } from '../../components/icons';
import { memoryLine } from '../../services/ai/explain';
import type { Reason, RouteDecision, ScoredCandidate } from '../../services/ai/router';
import { dimensionLabels, dimensions } from '../../services/ai/scoring';
import type { RouteNotice } from '../../services/extraction/ExtractionService';
import type { ReactNode } from 'react';
import './ai.css';

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ReasonList({ reasons, limit }: { reasons: Reason[]; limit?: number }) {
  return (
    <ul className="route-reasons">
      {reasons.slice(0, limit).map((reason) => (
        <li key={reason.text} className={`reason-${reason.tone}`}>
          {reason.tone === 'pro' ? (
            <Check size={14} />
          ) : reason.tone === 'con' ? (
            <AlertCircle size={14} />
          ) : (
            <CircleHelp size={14} />
          )}
          <span>
            <span className="visually-hidden">
              {reason.tone === 'pro'
                ? 'Advantage: '
                : reason.tone === 'con'
                  ? 'Caution: '
                  : 'Note: '}
            </span>
            {reason.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Compact "Why this AI?" disclosure for the processing card. */
export function RouteWhy({ route }: { route: RouteNotice }) {
  const { decision, candidate, fallbackFrom } = route;
  const reasons =
    decision.selected?.key === candidate.key
      ? decision.reasons
      : [{ tone: 'info' as const, text: 'You chose this alternative' }];
  return (
    <details className="route-why">
      <summary>Why this AI?</summary>
      {fallbackFrom && (
        <p className="field-help">
          {fallbackFrom.model.name} was unavailable, so you chose {candidate.model.name} instead.
        </p>
      )}
      <ReasonList reasons={reasons} limit={6} />
      <p className="field-help">
        {candidate.dataFlow.leavesDevice
          ? `Sent to ${candidate.provider.name}: ${candidate.dataFlow.sends.join('; ').toLowerCase()}.`
          : 'Processed on this device. No source material leaves it.'}
      </p>
    </details>
  );
}

function Facts({ candidate, decision }: { candidate: ScoredCandidate; decision: RouteDecision }) {
  const vision = candidate.model.capabilities.includes('image-understanding');
  const memory = memoryLine(candidate);
  return (
    <dl className="route-facts">
      {decision.requirements.hasImage && (
        <>
          <dt>Image understanding</dt>
          <dd>
            {vision
              ? candidate.qualityClass === 'excellent'
                ? 'Excellent'
                : 'Yes'
              : 'No · reads the recognized text'}
          </dd>
        </>
      )}
      <dt>Expected quality</dt>
      <dd>{capitalize(candidate.qualityClass)}</dd>
      <dt>Expected speed</dt>
      <dd>{capitalize(candidate.speedClass)}</dd>
      <dt>Privacy</dt>
      <dd>{candidate.model.privacy === 'cloud' ? 'Cloud' : 'On this device'}</dd>
      <dt>Internet required</dt>
      <dd>{candidate.model.supportsOffline ? 'No' : 'Yes'}</dd>
      {memory && (
        <>
          <dt>Memory</dt>
          <dd>{memory}</dd>
        </>
      )}
      <dt>Runtime</dt>
      <dd>{candidate.provider.runtime}</dd>
    </dl>
  );
}

function ScoreBreakdown({ candidate }: { candidate: ScoredCandidate }) {
  return (
    <details className="route-score">
      <summary>How TaskLens scored it · {Math.round(candidate.total)} / 100</summary>
      <p className="field-help">
        Weighted routing heuristics, not benchmark results. Weights follow your priority and the
        kind of job.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Factor</th>
            <th scope="col">Weight</th>
            <th scope="col">Fit</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map((d) => {
            const s = candidate.breakdown[d];
            return (
              <tr key={d}>
                <th scope="row">{dimensionLabels[d]}</th>
                <td>{Math.round(s.weight)}%</td>
                <td>
                  <span className="score-bar" aria-label={`${Math.round(s.score * 100)} percent`}>
                    <span style={{ width: `${Math.round(s.score * 100)}%` }} />
                  </span>
                </td>
                <td>{s.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

/** The router's recommendation with its reasons, privacy, alternatives and exclusions. */
export function RouteDecisionCard({
  decision,
  action,
  compact = false,
}: {
  decision: RouteDecision;
  action?: ReactNode;
  compact?: boolean;
}) {
  const selected = decision.selected;
  const mock = selected?.provider.kind === 'mock';
  return (
    <div className="route-card">
      <p className="route-eyebrow">Recommended</p>
      {selected ? (
        <>
          <div className="route-title">
            <h3>{selected.model.name}</h3>
            <span className={`badge ${mock ? 'badge-mock' : 'badge-route'}`}>
              <Sparkles size={12} />
              {mock ? 'No real AI available here' : decision.headline}
            </span>
          </div>
          <p className="route-provider">
            {mock ? selected.provider.runtime : selected.provider.name}
            {selected.model.specSource === 'example' && ' · example'}
          </p>
          {!mock && <Facts candidate={selected} decision={decision} />}
          <h4>{mock ? 'What this means' : 'Why this model?'}</h4>
          <ReasonList reasons={decision.reasons} limit={compact ? 5 : undefined} />
          <p className={`route-privacy ${selected.dataFlow.leavesDevice ? 'leaves' : ''}`}>
            <ShieldCheck size={16} />
            <span>{decision.privacy}</span>
          </p>
          {action}
          {!compact && !mock && <ScoreBreakdown candidate={selected} />}
        </>
      ) : (
        <>
          <div className="route-title">
            <h3>{decision.headline}</h3>
          </div>
          <ReasonList reasons={decision.reasons} />
          <p className="field-help">
            You can still create items manually or try the sample screenshot.
          </p>
        </>
      )}
      {decision.alternatives.length > 0 && (
        <div className="route-alternatives">
          <h4>Alternatives</h4>
          <ul>
            {decision.alternatives.map((alt) => (
              <li key={alt.key}>
                <div>
                  <strong>{alt.model.name}</strong>
                  <span className="field-help"> · {alt.tradeoff}</span>
                </div>
                <div className="route-chips">
                  {alt.highlights.map((chip) => (
                    <span className="badge" key={chip}>
                      {chip}
                    </span>
                  ))}
                  <span className="badge">Quality: {capitalize(alt.qualityClass)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!compact && decision.excluded.length > 0 && (
        <details className="route-excluded">
          <summary>Not used ({decision.excluded.length})</summary>
          <ul>
            {decision.excluded.map((e) => (
              <li key={e.key}>
                <strong>{e.model.id === '*' ? e.provider.name : e.model.name}</strong>
                <span className="field-help"> · {e.reasons.join('; ')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
