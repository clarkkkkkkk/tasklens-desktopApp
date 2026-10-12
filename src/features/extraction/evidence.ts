import type { ExtractedAction } from '../../types/action';

/** Evidence IDs for a field, or every requirement's evidence for the requirements list. */
export function evidenceFor(action: ExtractedAction, field: string): string[] {
  return [
    ...new Set(
      (action.evidence ?? []).filter((e) => e.field === field).flatMap((e) => e.segmentIds),
    ),
  ];
}
