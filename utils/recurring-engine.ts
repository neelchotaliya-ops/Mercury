/**
 * Pure recurring-rule date logic — no DB, no React Native, no side effects.
 *
 * This is deliberately framework-free so it can be:
 *   1. Imported by db/recurring.ts (which runs in both app and headless widget)
 *   2. Tested directly with `tsx scripts/test-recurring-engine.ts` (Node, no device)
 *
 * All date math uses plain `Date` arithmetic; no third-party date library is
 * added so the bundle stays small and the logic stays auditable.
 */

import type { RecurringRule, RecurringFrequency, IntervalUnit } from '@/types/finance';

// ---- Internal helpers -------------------------------------------------------

/** Formats a Date object to YYYY-MM-DD using local time (prevents UTC timezone shift). */
export function formatDateIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns midnight on the given date in local time — used for day-level comparisons. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Last day of a given month (handles February and month-end correctly). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Clamps `day` to the actual last day of the month, e.g. 31 in February
 * becomes 28 or 29.
 */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, lastDayOfMonth(year, month));
}

// ---- Core date calculation --------------------------------------------------

/**
 * Computes the next occurrence date that is strictly after `after`.
 *
 * This is the single source of truth for "when does rule X next fire?".
 * `db/recurring.ts` calls this after creating each occurrence to advance the
 * rule's `next_due` field.
 *
 * Edge cases handled:
 * - day_of_month = -1 → last day of each month
 * - Months with fewer days than day_of_month (e.g. Feb 31 → Feb 28/29)
 * - Leap years
 * - Yearly rules correctly advance the year even when start_date is Feb 29
 */
export function computeNextDue(rule: RecurringRule, after: Date = new Date()): Date {
  const base = startOfDay(after);

  switch (rule.frequency) {
    case 'daily': {
      const next = new Date(base);
      next.setDate(next.getDate() + 1);
      return next;
    }

    case 'weekly': {
      const targetDow = rule.dayOfWeek ?? new Date(rule.startDate).getDay();
      const next = new Date(base);
      next.setDate(next.getDate() + 1); // must be strictly after
      while (next.getDay() !== targetDow) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    case 'monthly': {
      // day_of_month: 1–31 (clamped), or -1 for last day of month
      let { year, month } = { year: base.getFullYear(), month: base.getMonth() };

      // Try current month first, then advance
      for (let attempt = 0; attempt < 13; attempt++) {
        const targetDay =
          rule.dayOfMonth === -1
            ? lastDayOfMonth(year, month)
            : clampDay(year, month, rule.dayOfMonth ?? 1);
        const candidate = new Date(year, month, targetDay, 0, 0, 0, 0);
        if (candidate > base) return candidate;
        // Advance to next month
        month++;
        if (month > 11) { month = 0; year++; }
      }
      // Fallback (should never reach here)
      return new Date(base.getFullYear(), base.getMonth() + 1, 1);
    }

    case 'yearly': {
      const startDate = new Date(rule.startDate);
      let targetYear = base.getFullYear();
      for (let attempt = 0; attempt < 5; attempt++) {
        const targetDay =
          startDate.getMonth() === 1 && startDate.getDate() === 29
            ? clampDay(targetYear, 1, 29) // Feb 29 in leap / non-leap
            : startDate.getDate();
        const candidate = new Date(targetYear, startDate.getMonth(), targetDay, 0, 0, 0, 0);
        if (candidate > base) return candidate;
        targetYear++;
      }
      return new Date(base.getFullYear() + 1, new Date(rule.startDate).getMonth(), 1);
    }

    case 'custom': {
      const unit: IntervalUnit = rule.intervalUnit ?? 'month';
      const value = rule.intervalValue ?? 1;

      if (unit === 'day') {
        const next = new Date(base);
        next.setDate(next.getDate() + value);
        return next;
      }
      if (unit === 'week') {
        const next = new Date(base);
        next.setDate(next.getDate() + value * 7);
        return next;
      }

      // month/year: anchor the day-of-month to the rule's start date and
      // clamp it per target month, rather than letting `Date.setMonth`
      // roll a short month's overflow into the following month (e.g. Jan
      // 31 + 1 month silently landing on Mar 3 instead of Feb 28/29).
      const startDate = new Date(rule.startDate);
      const anchorDay = startDate.getDate();
      let year = base.getFullYear();
      let month = base.getMonth();

      if (unit === 'month') {
        month += value;
        while (month > 11) { month -= 12; year++; }
        while (month < 0) { month += 12; year--; }
      } else {
        year += value;
        month = startDate.getMonth();
      }
      const targetDay = clampDay(year, month, anchorDay);
      return new Date(year, month, targetDay, 0, 0, 0, 0);
    }
  }
}

/**
 * Returns true when `rule` is due to be processed on or before `now`,
 * optionally within a look-ahead buffer of `bufferDays` days.
 *
 * Used by the background processor to fire reminders N days early.
 */
export function isDue(rule: RecurringRule, now: Date = new Date(), bufferDays = 0): boolean {
  if (!rule.active) return false;
  if (rule.endDate && now > new Date(rule.endDate)) return false;

  const triggerDate = new Date(rule.nextDue);
  if (bufferDays > 0) {
    triggerDate.setDate(triggerDate.getDate() - bufferDays);
  }
  return startOfDay(now) >= startOfDay(triggerDate);
}

/**
 * Generates a list of occurrence dates between `from` (inclusive) and `to`
 * (inclusive), useful for preview UI ("next 3 payments") and for the
 * "upcoming" section on the home screen.
 *
 * Capped at 60 occurrences to prevent runaway loops on daily rules over
 * large date ranges.
 */
export function generateOccurrences(
  rule: RecurringRule,
  from: Date,
  to: Date,
  maxCount = 60
): Date[] {
  const results: Date[] = [];
  let cursor = startOfDay(new Date(rule.nextDue));

  // Fast-forward to `from` if nextDue is in the past relative to `from`
  while (cursor < from && results.length === 0) {
    cursor = computeNextDue(rule, cursor);
  }

  while (cursor <= to && results.length < maxCount) {
    if (cursor >= from) {
      // Respect end_date
      if (rule.endDate && cursor > new Date(rule.endDate)) break;
      results.push(new Date(cursor));
    }
    cursor = computeNextDue(rule, cursor);
  }

  return results;
}

/**
 * Human-readable description of a rule's frequency.
 * e.g. "Every month on the 15th", "Every 2 weeks on Monday"
 */
export function describeFrequency(rule: RecurringRule): string {
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ordinal = (n: number) => {
    if (n === -1) return 'last day';
    const abs = Math.abs(n);
    const suffix = abs === 1 ? 'st' : abs === 2 ? 'nd' : abs === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
  };

  switch (rule.frequency) {
    case 'daily': return 'Every day';
    case 'weekly':
      return rule.dayOfWeek != null
        ? `Every week on ${DOW[rule.dayOfWeek]}`
        : 'Every week';
    case 'monthly':
      return rule.dayOfMonth != null
        ? `Every month on the ${ordinal(rule.dayOfMonth)}`
        : 'Every month';
    case 'yearly': {
      const start = new Date(rule.startDate);
      return `Every year on ${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }
    case 'custom': {
      const unit = rule.intervalUnit ?? 'month';
      const value = rule.intervalValue ?? 1;
      const unitLabel = value === 1 ? unit : `${unit}s`;
      return `Every ${value === 1 ? '' : value + ' '}${unitLabel}`.trim();
    }
  }
}
