import type { Settings } from '../../types/action';
/** Apply only fields changed from this render; concurrent saves retain unrelated preferences. */
export function rebaseSettings(base: Settings, next: Settings, current: Settings): Settings {
  function merge(before: unknown, after: unknown, latest: unknown): unknown {
    if (JSON.stringify(before) === JSON.stringify(after)) return latest;
    if (after && typeof after === 'object' && !Array.isArray(after)) {
      const a = after as Record<string, unknown>;
      const b = (before ?? {}) as Record<string, unknown>;
      const c = (latest ?? {}) as Record<string, unknown>;
      return Object.fromEntries(Object.keys(a).map((key) => [key, merge(b[key], a[key], c[key])]));
    }
    return after;
  }
  return merge(base, next, current) as Settings;
}
