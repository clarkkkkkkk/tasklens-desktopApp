import type { ExtractionInput } from './ExtractionService';
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function temporalContext(input: ExtractionInput) {
  const timezone = input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const captureTime = input.capturedAt ? new Date(input.capturedAt) : null;
  const referenceDate =
    input.recordingDate ||
    (captureTime ? captureTime.toLocaleDateString('en-CA', { timeZone: timezone }) : null);
  const relativeDates: Record<string, string> = {};
  if (referenceDate) {
    const base = new Date(`${referenceDate}T12:00:00Z`);
    const offset = (days: number) =>
      new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
    for (const word of ['today', 'ngayon', 'karon']) relativeDates[word] = offset(0);
    for (const word of ['tomorrow', 'bukas', 'ugma']) relativeDates[word] = offset(1);
    for (const [index, day] of weekdays.entries())
      relativeDates[day.toLowerCase()] = offset((index - base.getUTCDay() + 7) % 7);
  }
  return {
    referenceDate,
    timezone,
    captureTimestamp: input.capturedAt || null,
    referenceTime: captureTime
      ? captureTime.toLocaleTimeString('en-GB', { timeZone: timezone, hour12: false })
      : null,
    relativeDates,
  };
}
export function resolveRelativeDate(expression: string, dates: Record<string, string>) {
  if (/\b(last|previous|ago)\b/i.test(expression)) return undefined;
  const word = expression
    .match(
      /\b(today|tomorrow|ngayon|karon|bukas|ugma|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
    )?.[0]
    .toLowerCase();
  if (!word || !dates[word]) return undefined;
  if (
    /\bnext\b/i.test(expression) &&
    weekdays.some((day) => day.toLowerCase() === word) &&
    dates[word] === dates.today
  )
    return new Date(new Date(`${dates[word]}T12:00:00Z`).getTime() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
  return dates[word];
}
