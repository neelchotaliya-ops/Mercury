/**
 * Month/day keys for a stored timestamp, in the user's LOCAL timezone.
 *
 * Timestamps are persisted as UTC ISO strings, so the calendar month cannot be
 * read off the string directly: east of UTC, a transaction logged just after
 * local midnight carries the previous UTC day and would land in the wrong month.
 * We therefore still go through Date, but memoize per timestamp — the same
 * strings get re-keyed constantly across renders and across selectors, and the
 * cache turns all of those into a hash lookup.
 */
const monthKeyCache = new Map<string, string>();
const dayKeyCache = new Map<string, string>();

/** Keeps the caches from growing without bound over a long-lived session. */
const KEY_CACHE_LIMIT = 5000;

function cached(cache: Map<string, string>, key: string, compute: () => string): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = compute();
  if (cache.size >= KEY_CACHE_LIMIT) cache.clear();
  cache.set(key, value);
  return value;
}

export function monthKeyOf(isoDate: string): string {
  return cached(monthKeyCache, isoDate, () => {
    const d = new Date(isoDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function dayKeyOf(isoDate: string): string {
  return cached(dayKeyCache, isoDate, () => {
    const d = new Date(isoDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  });
}

export function toMonthKey(date: Date | string): string {
  if (typeof date === 'string') return monthKeyOf(date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return toMonthKey(d);
}

export function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';

  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function lastNMonthKeys(n: number, from: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    keys.push(toMonthKey(d));
  }
  return keys;
}

export function monthShortLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short' });
}
