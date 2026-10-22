import type { ScoredCandidate } from '../../services/ai/router';

/** Badge text for where a job runs. */
export function routeBadge(candidate?: ScoredCandidate): string {
  if (!candidate) return 'On-device';
  if (candidate.provider.kind === 'mock') return 'Demo / Mock AI';
  if (candidate.provider.kind === 'cloud') return `Groq Cloud · ${candidate.model.name}`;
  return `On-device · ${candidate.model.name}`;
}
