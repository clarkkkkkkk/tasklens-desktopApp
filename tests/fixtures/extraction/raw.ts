import type { RawItem } from '../../../src/services/extraction/prompts/extraction-schema';

type Field = {
  evidence: string[];
  text?: string | null;
  value: string | null;
  confidence: RawItem['time']['confidence'];
};
const empty = (): RawItem['time'] => ({
  evidence: [],
  text: null,
  value: null,
  confidence: 'needs_review',
});

/** A model-shaped raw item with every field empty unless overridden. */
export function rawItem(
  overrides: Partial<Omit<RawItem, 'time' | 'end_time' | 'arrival_time'>> & {
    time?: Partial<Field>;
    end_time?: Partial<Field>;
    arrival_time?: Partial<Field>;
  } = {},
): RawItem {
  const { time, end_time, arrival_time, ...rest } = overrides;
  return {
    type: 'event',
    title: { evidence: [], value: 'Untitled', confidence: 'inferred' },
    date: {
      evidence: [],
      expression: null,
      basis: 'unknown',
      value: null,
      confidence: 'needs_review',
    },
    location: { evidence: [], value: null, confidence: 'needs_review' },
    requirements: [],
    notes: [],
    reminders: [],
    ...rest,
    time: { ...empty(), ...time },
    end_time: { ...empty(), ...end_time },
    arrival_time: { ...empty(), ...arrival_time },
  };
}

export const rawBundle = (items: RawItem[], ambiguities: unknown[] = []) =>
  JSON.stringify({ items, ambiguities });
