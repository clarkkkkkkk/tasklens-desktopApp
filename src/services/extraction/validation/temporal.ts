/**
 * Deterministic date/time helpers used to check model output against source text.
 * They never translate: they only recognise date and time expressions in English, Cebuano
 * and Tagalog well enough to verify or downgrade what the model claims.
 */

const MONTHS: Record<string, number> = {};
[
  ['january', 'jan', 'enero'],
  ['february', 'feb', 'pebrero', 'febrero'],
  ['march', 'mar', 'marso'],
  ['april', 'apr', 'abril'],
  ['may', 'mayo'],
  ['june', 'jun', 'hunyo'],
  ['july', 'jul', 'hulyo'],
  ['august', 'aug', 'agosto'],
  ['september', 'sep', 'sept', 'setyembre', 'septiyembre', 'septyembre'],
  ['october', 'oct', 'oktubre'],
  ['november', 'nov', 'nobyembre'],
  ['december', 'dec', 'disyembre'],
].forEach((names, index) => names.forEach((name) => (MONTHS[name] = index + 1)));

const WEEKDAYS: Record<string, number> = {};
[
  ['sunday', 'sun', 'linggo', 'domingo', 'dominggo'],
  ['monday', 'mon', 'lunes'],
  ['tuesday', 'tue', 'tues', 'martes'],
  ['wednesday', 'wed', 'miyerkules', 'miyerkoles', 'myerkules'],
  ['thursday', 'thu', 'thurs', 'huwebes'],
  ['friday', 'fri', 'biyernes', 'byernes'],
  ['saturday', 'sat', 'sabado'],
].forEach((names, index) => names.forEach((name) => (WEEKDAYS[name] = index)));

const TODAY = [
  'today',
  'tonight',
  'karon',
  'karong adlawa',
  'ngayon',
  'ngayong araw',
  'mamaya',
  'unya',
];
const TOMORROW = ['tomorrow', 'tmrw', 'ugma', 'bukas'];
const OTHER_RELATIVE = [
  'yesterday',
  'kagahapon',
  'gahapon',
  'kahapon',
  'next week',
  'this week',
  'sunod semana',
  'sunod nga semana',
  'susunod na linggo',
  'sa susunod',
  'later',
];

export interface DateParts {
  year?: number;
  month: number;
  day: number;
}

const words = (text: string) => text.toLowerCase().normalize('NFKC');

/** Explicit calendar dates such as "October 11, 2026", "Oct 7", "11 Oktubre 2026", "10/11/2026". */
export function findExplicitDates(text: string): DateParts[] {
  const t = words(text);
  const found: DateParts[] = [];
  const month = Object.keys(MONTHS)
    .sort((a, b) => b.length - a.length)
    .join('|');
  const named = new RegExp(
    `\\b(${month})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`,
    'g',
  );
  for (const m of t.matchAll(named))
    found.push({ month: MONTHS[m[1]], day: Number(m[2]), year: m[3] ? Number(m[3]) : undefined });
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})\\s+(?:sa\\s+|ng\\s+)?(${month})\\.?(?:,?\\s*(\\d{4}))?`,
    'g',
  );
  for (const m of t.matchAll(dayFirst))
    found.push({ month: MONTHS[m[2]], day: Number(m[1]), year: m[3] ? Number(m[3]) : undefined });
  // Numeric dates follow the Philippine month/day/year convention.
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    found.push({ month: Number(m[1]), day: Number(m[2]), year });
  }
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g))
    found.push({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
  return found.filter((d) => d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= 31);
}

function hasWord(text: string, phrase: string) {
  return new RegExp(`(^|[^\\p{L}])${phrase.replace(/ /g, '\\s+')}($|[^\\p{L}])`, 'u').test(text);
}

export function weekdayIn(text: string): number | null {
  const t = words(text);
  let best: { at: number; day: number } | null = null;
  for (const [name, day] of Object.entries(WEEKDAYS)) {
    const match = new RegExp(`(^|[^\\p{L}])${name}($|[^\\p{L}])`, 'u').exec(t);
    if (match && (!best || match.index < best.at || (match.index === best.at && name.length > 3)))
      best = { at: match.index, day };
  }
  return best?.day ?? null;
}

const RELATIVE_PREFIX =
  '(?:(?:this|next|on|karong|karon|sa|sunod|ngayong|ngayon|sa darating na)\\s+)?';
/**
 * Relative date phrases in running text, in order ("Tomorrow", "karong Friday", "sa Lunes").
 * Only full weekday names are used here; abbreviations are too ambiguous in free text.
 */
export function relativeMentions(text: string): string[] {
  const t = words(text);
  const names = [
    ...TODAY,
    ...TOMORROW,
    ...OTHER_RELATIVE,
    ...Object.keys(WEEKDAYS).filter((n) => n.length > 3),
  ]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/ /g, '\\s+'))
    .join('|');
  const pattern = new RegExp(`(?<![\\p{L}])${RELATIVE_PREFIX}(?:${names})(?![\\p{L}])`, 'gu');
  return [...t.matchAll(pattern)].map((m) => m[0].trim());
}

/** True when the expression depends on when it was said rather than naming a calendar date. */
export function isRelativeExpression(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = words(text);
  if (findExplicitDates(t).some((d) => d.day)) return false;
  return (
    [...TODAY, ...TOMORROW, ...OTHER_RELATIVE].some((p) => hasWord(t, p)) || weekdayIn(t) !== null
  );
}

export function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves a relative expression against the date it was said. Returns null when the
 * expression is ambiguous ("next Friday", a weekday equal to the base day) or unknown.
 */
export function resolveRelative(expression: string, base: string): string | null {
  const t = words(expression);
  if (TOMORROW.some((p) => hasWord(t, p))) return addDays(base, 1);
  const day = weekdayIn(t);
  if (day !== null) {
    if (/\b(next|sunod|susunod)\b/.test(t)) return null;
    const current = new Date(`${base}T00:00:00Z`).getUTCDay();
    const delta = (day - current + 7) % 7;
    return delta === 0 ? null : addDays(base, delta);
  }
  if (TODAY.some((p) => hasWord(t, p))) return base;
  return null;
}

export interface TimeMention {
  minutes: number;
  /** AM/PM or 24-hour form was written; a bare "5" is not explicit. */
  explicit: boolean;
}

/** Clock times mentioned in text: "1:30PM", "8:00 AM", "13:30", "before 5", "alas 3". */
export function findTimes(text: string): TimeMention[] {
  const t = words(text);
  const out: TimeMention[] = [];
  const meridiem = (h: number, m?: string) => {
    if (!m) return h;
    const pm = m.startsWith('p');
    return (h % 12) + (pm ? 12 : 0);
  };
  for (const m of t.matchAll(/\b(\d{1,2})[:.](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/g)) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) continue;
    const explicit = !!m[3] || h >= 13 || h === 0;
    out.push({ minutes: meridiem(h, m[3]) * 60 + min, explicit });
  }
  // Do not read the minutes in "8:05 AM" as a second, unrelated "5 AM".
  for (const m of t.matchAll(/(?:^|[^\d:.])\b(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/g)) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) out.push({ minutes: meridiem(h, m[2]) * 60, explicit: true });
  }
  for (const m of t.matchAll(
    /\b(?:at|before|by|until|til|mga|alas|around)\s+(\d{1,2})\b(?![:.]\d)(?!\s*(?:a\.?m|p\.?m))/g,
  )) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) {
      out.push({ minutes: (h % 12) * 60, explicit: false });
      out.push({ minutes: ((h % 12) + 12) * 60, explicit: false });
    }
  }
  const numbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const spoken = new RegExp(
    `\\b(?:at|before|by|until|around|alas)?\\s*(${Object.keys(numbers).join('|')})(?:\\s+(thirty|fifteen|forty[- ]five|o'?clock))?\\s*(a\\.?m\\.?|p\\.?m\\.?|in the morning|in the afternoon|in the evening|tonight)?\\b`,
    'g',
  );
  for (const m of t.matchAll(spoken)) {
    if (!/\b(at|before|by|until|around|alas)\b/.test(m[0]) && !m[2] && !m[3]) continue;
    const h = numbers[m[1]];
    const min = m[2]?.startsWith('thirty')
      ? 30
      : m[2]?.startsWith('fifteen')
        ? 15
        : m[2]?.startsWith('forty')
          ? 45
          : 0;
    const marker = m[3] ?? '';
    if (/^p|afternoon|evening|tonight/.test(marker))
      out.push({ minutes: ((h % 12) + 12) * 60 + min, explicit: true });
    else if (/^a|morning/.test(marker)) out.push({ minutes: (h % 12) * 60 + min, explicit: true });
    else {
      out.push({ minutes: (h % 12) * 60 + min, explicit: false });
      out.push({ minutes: ((h % 12) + 12) * 60 + min, explicit: false });
    }
  }
  if (/\b(noon|udto|tanghali|tanghaling tapat)\b/.test(t))
    out.push({ minutes: 720, explicit: true });
  return out;
}

export function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** 'exact' when the text states this time explicitly, 'partial' for a bare hour, else 'none'. */
export function timeSupport(value: string, text: string): 'exact' | 'partial' | 'none' {
  const target = toMinutes(value);
  const matches = findTimes(text).filter((t) => t.minutes === target);
  if (matches.some((m) => m.explicit)) return 'exact';
  return matches.length ? 'partial' : 'none';
}

/** 'exact' when a cited unit names this calendar date (with year), 'partial' without year. */
export function dateSupport(value: string, text: string): 'exact' | 'partial' | 'none' {
  const [y, m, d] = value.split('-').map(Number);
  const matches = findExplicitDates(text).filter((p) => p.month === m && p.day === d);
  if (matches.some((p) => p.year === y)) return 'exact';
  if (matches.some((p) => p.year === undefined)) return 'partial';
  return 'none';
}
