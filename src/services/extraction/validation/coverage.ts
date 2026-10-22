import type { ExtractedAction } from '../../../types/action';
import type { PromptContext } from '../prompts/build-prompt';
import { findExplicitDates, findTimes } from './temporal';

/** Conservative omission checks. They request the existing bounded repair, never fill fields. */
export function coverageIssue(context: PromptContext, actions: ExtractedAction[]): string | null {
  const cited = new Set(actions.flatMap((a) => (a.evidence ?? []).flatMap((e) => e.segmentIds)));
  for (const unit of context.units) {
    if (unit.messageTimestamp) continue;
    const members = unit.members ?? [unit.id];
    const scheduled =
      /\b(lunch|paniudto|tanghalian|meeting|consultation|mass|misa|exam|quiz|seminar)\b/i.test(
        unit.text,
      ) &&
      findTimes(unit.text).some((t) => t.explicit) &&
      !/\b(cancelled|canceled|gikansela|kinansela|hindi tuloy)\b/i.test(unit.text);
    const mealHeading = /^\s*(lunch|paniudto|tanghalian)\b/i.test(unit.text);
    const ownMeal = actions.some((a) => /\b(lunch|paniudto|tanghalian)\b/i.test(a.title));
    if (scheduled && mealHeading && !ownMeal)
      return `The separately scheduled meal in [${unit.id}] was omitted or placed only in another activity's notes. Keep it as its own activity with the stated time and venue.`;
    if (scheduled && !members.some((id) => cited.has(id)))
      return `A separately scheduled activity in [${unit.id}] was omitted. Include every distinct activity with its own supported times and venue.`;
    const scheduledActions = actions.filter((a) =>
      a.evidence?.some((e) => e.segmentIds.some((id) => members.includes(id))),
    );
    if (
      scheduled &&
      findTimes(unit.text).filter((t) => t.explicit).length === 1 &&
      scheduledActions.length === 1 &&
      scheduledActions[0].type === 'event' &&
      !scheduledActions[0].time &&
      !scheduledActions[0].arrivalTime
    )
      return `The explicit clock time in [${unit.id}] was omitted. A missing date does not make a directly stated clock time unknown; keep the time and ask for the date.`;
    const titled = scheduledActions.filter((a) =>
      a.evidence?.some(
        (e) => e.field === 'title' && e.segmentIds.some((id) => members.includes(id)),
      ),
    );
    const cancelled = /\b(cancelled|canceled|gikansela|kinansela|hindi tuloy)\b/i.test(unit.text);
    if (cancelled && !/[;!?]|\.\s/.test(unit.text) && titled.some((a) => a.type === 'event'))
      return `The activity in [${unit.id}] is explicitly cancelled. Do not schedule it as an active event; preserve the cancellation as context.`;
    if (
      /\b(submit|ipasa|pasa)\b/i.test(unit.text) &&
      /\b(before|due|deadline|by|Friday|Monday|Biyernes|Lunes)\b/i.test(unit.text) &&
      !/\b(meeting|consultation|seminar|exam|quiz)\b/i.test(unit.text) &&
      titled.some((a) => a.type === 'task')
    )
      return `The submission in [${unit.id}] has a due time. Use a deadline with its stated due date/time, not an unscheduled task.`;
    if (
      /\b(exam|quiz|meeting|consultation)\b/i.test(unit.text) &&
      /\b(starts?|begins?)\s+at\b/i.test(unit.text) &&
      titled.length === 1 &&
      titled[0].type !== 'event'
    )
      return `The attendance in [${unit.id}] has an explicit start. Keep it as an event; a request for an earlier reminder does not turn it into a task. Distinguish the event start from the reminder time.`;
    if (
      titled.length === 1 &&
      titled[0].type === 'event' &&
      !titled[0].time &&
      /\binig\s+udto\b/i.test(unit.text) &&
      !/\b(naa na|be there|arrive|arrival|dapat nandoon)\b/i.test(unit.text)
    )
      return `The activity in [${unit.id}] occurs inig udto (12:00). This wording states when it occurs, not an earlier arrival instruction. Keep the event start with source evidence.`;
    const dates = findExplicitDates(unit.text).filter((d) => d.year && d.month && d.day);
    const linked = actions.filter((a) =>
      a.evidence?.some(
        (e) => e.field === 'title' && e.segmentIds.some((id) => members.includes(id)),
      ),
    );
    if (dates.length === 1 && linked.length === 1 && !linked[0].date)
      return `The explicit calendar date in [${unit.id}] was omitted. Preserve the written date; capture metadata does not make an explicit date ambiguous.`;
    const supplies =
      /\bbring\s+(?:a\s+|an\s+|the\s+)?([\p{L}-]+)\s+and\s+(?:a\s+|an\s+|the\s+)?([\p{L}-]+)\b/iu.exec(
        unit.text,
      );
    if (supplies && !/\b(unless|if|optional|or)\b/i.test(unit.text)) {
      const requirements = actions
        .flatMap((a) => [...a.requirements, ...(a.type === 'task' ? [a.title] : [])])
        .join(' ')
        .toLowerCase();
      if (![supplies[1], supplies[2]].every((word) => requirements.includes(word.toLowerCase())))
        return `The simple bring-list in [${unit.id}] is incomplete. Preserve both stated supplies, with evidence.`;
    }
  }
  return null;
}

/** One bounded repair. Clock readings are source-backed hints, never assigned action fields. */
export function repairInstruction(
  context: PromptContext,
  error: string,
  truncated = false,
): string {
  if (truncated)
    return 'Your previous answer was cut off. Return fewer, shorter items and keep notes brief.';
  const readings =
    context.units.reduce((n, u) => n + u.text.length, 0) < 12000
      ? context.units
          .filter((u) => !u.messageTimestamp)
          .flatMap((u) => {
            const times = [
              ...new Set(
                findTimes(u.text)
                  .filter((t) => t.explicit)
                  .map(
                    (t) =>
                      `${String(Math.floor(t.minutes / 60)).padStart(2, '0')}:${String(t.minutes % 60).padStart(2, '0')}`,
                  ),
              ),
            ].slice(0, 4);
            return times.length ? [`[${u.id}] ${times.join(', ')}`] : [];
          })
          .slice(0, 8)
      : [];
  const dates = context.units
    .filter((u) => !u.messageTimestamp)
    .flatMap((u) =>
      findExplicitDates(u.text)
        .filter((d) => d.year)
        .map(
          (d) =>
            `[${u.id}] ${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
        ),
    )
    .slice(0, 8);
  return (
    `Your previous answer was invalid (${error}). Return a complete valid JSON bundle. Preserve all supported activities and fields, not only the corrected item. If date words are absent, use date:null; never invent a date expression.` +
    (dates.length
      ? ` Preserve written calendar dates: ${dates.join('; ')}. Correcting a requirement must not erase a supported date.`
      : '') +
    (readings.length
      ? ` Source clock readings: ${readings.join('; ')}. Keep those clocks in the appropriate time/end_time/arrival_time fields, citing their source IDs and copying their original written text. Choose roles from the source; a missing date does not erase a clock.`
      : '')
  );
}
