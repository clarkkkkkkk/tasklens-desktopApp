import type { ExtractionBundle } from '../../../src/services/extraction/ExtractionService';
import type { ExtractionCase } from './cases';

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const show = (v: unknown) => (v === undefined || v === '' ? 'empty' : JSON.stringify(v));

/** Scores one extraction against its expectations. Every check is independent. */
export function scoreCase(testCase: ExtractionCase, bundle: ExtractionBundle): Check[] {
  const checks: Check[] = [];
  const count = bundle.actions.length;
  const [min, max] = Array.isArray(testCase.expect.actionCount)
    ? testCase.expect.actionCount
    : [testCase.expect.actionCount, testCase.expect.actionCount];
  checks.push({
    name: 'action count',
    ok: count >= min && count <= max,
    detail: `${count} (expected ${min === max ? min : `${min}–${max}`})`,
  });
  const used = new Set<string>();
  for (const expected of testCase.expect.actions) {
    const action = bundle.actions.find((a) => !used.has(a.id) && expected.title.test(a.title));
    const label = expected.title.source;
    checks.push({ name: `${label}: found`, ok: !!action, detail: action?.title ?? 'missing' });
    if (!action) continue;
    used.add(action.id);
    const field = (name: string, actual: unknown, wanted: unknown) =>
      checks.push({
        name: `${label}: ${name}`,
        ok: wanted === null ? !actual : actual === wanted,
        detail: `${show(actual)} (expected ${wanted === null ? 'empty' : show(wanted)})`,
      });
    if (expected.type) field('type', action.type, expected.type);
    if (expected.date !== undefined) field('date', action.date, expected.date);
    if (expected.time !== undefined) field('time', action.time, expected.time);
    if (expected.endTime !== undefined) field('end time', action.endTime, expected.endTime);
    if (expected.arrivalTime !== undefined)
      field('arrival time', action.arrivalTime, expected.arrivalTime);
    if (expected.location !== undefined)
      checks.push({
        name: `${label}: location`,
        ok:
          expected.location === null
            ? !action.location
            : !!action.location && expected.location.test(action.location),
        detail: show(action.location),
      });
    for (const requirement of expected.requirements ?? [])
      checks.push({
        name: `${label}: requirement ${requirement.source}`,
        ok: action.requirements.some((r) => requirement.test(r)),
        detail: show(action.requirements),
      });
    for (const [key, level] of Object.entries(expected.confidence ?? {}))
      field(`confidence.${key}`, action.confidence[key as keyof typeof action.confidence], level);
  }
  if (testCase.expect.ambiguity) {
    const wanted = testCase.expect.ambiguity;
    checks.push({
      name: `ambiguity on ${wanted}`,
      ok: bundle.ambiguities.some((a) => a.field === wanted),
      detail: show(bundle.ambiguities.map((a) => `${a.field}: ${a.question}`)),
    });
  }
  for (const rule of testCase.forbidden)
    checks.push({ name: `no ${rule.description}`, ok: !rule.violated(bundle) });
  return checks;
}
