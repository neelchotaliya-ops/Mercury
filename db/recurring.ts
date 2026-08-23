/**
 * Recurring rule CRUD and the background processing loop.
 *
 * Processing runs on every app foreground via finance-context.tsx's
 * AppState listener. It:
 *   1. Finds all active rules where next_due ≤ today (or ≤ today + reminder_days)
 *   2. For auto_create=1 rules: writes the transaction and advances next_due
 *   3. For auto_create=0 rules: fires a local notification as a reminder
 *
 * The pure date logic lives in utils/recurring-engine.ts so it can be
 * tested under Node without a device.
 */

import { RecurringRule } from '@/types/finance';
import { dayKeyOf, monthKeyOf } from '@/utils/date';
import { generateId } from '@/utils/id';

import { Db, RecurringRuleRow } from './types';
import { bumpDataVersion } from './version';
import { applyRow } from './apply';
import { computeNextDue, isDue, formatDateIso } from '@/utils/recurring-engine';

// ---- Row ↔ domain mapping --------------------------------------------------

function rowToRule(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    accountId: row.account_id,
    categoryId: row.category_id ?? undefined,
    subcategoryId: row.subcategory_id ?? undefined,
    payee: row.payee ?? undefined,
    note: row.note ?? undefined,
    frequency: row.frequency,
    intervalUnit: (row.interval_unit as RecurringRule['intervalUnit']) ?? undefined,
    intervalValue: row.interval_value ?? undefined,
    dayOfWeek: row.day_of_week ?? undefined,
    dayOfMonth: row.day_of_month ?? undefined,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    nextDue: row.next_due,
    autoCreate: row.auto_create === 1,
    reminderDays: row.reminder_days,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

const RULE_COLUMNS = `
  id, type, amount, account_id, category_id, subcategory_id, payee, note,
  frequency, interval_unit, interval_value, day_of_week, day_of_month,
  start_date, end_date, next_due, auto_create, reminder_days, active, created_at
`.trim();

// ---- CRUD ------------------------------------------------------------------

export async function listRecurringRules(db: Db): Promise<RecurringRule[]> {
  const rows = await db.getAllAsync<RecurringRuleRow>(
    `SELECT ${RULE_COLUMNS} FROM recurring_rules ORDER BY created_at`
  );
  return rows.map(rowToRule);
}

export async function listActiveRecurringRules(db: Db): Promise<RecurringRule[]> {
  const rows = await db.getAllAsync<RecurringRuleRow>(
    `SELECT ${RULE_COLUMNS} FROM recurring_rules WHERE active = 1 ORDER BY next_due`
  );
  return rows.map(rowToRule);
}

export async function getRecurringRule(db: Db, id: string): Promise<RecurringRule | null> {
  const row = await db.getFirstAsync<RecurringRuleRow>(
    `SELECT ${RULE_COLUMNS} FROM recurring_rules WHERE id = ?`,
    [id]
  );
  return row ? rowToRule(row) : null;
}

export async function insertRecurringRule(db: Db, rule: RecurringRule): Promise<void> {
  await db.runAsync(
    `INSERT INTO recurring_rules
       (id, type, amount, account_id, category_id, subcategory_id, payee, note,
        frequency, interval_unit, interval_value, day_of_week, day_of_month,
        start_date, end_date, next_due, auto_create, reminder_days, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      rule.id, rule.type, rule.amount, rule.accountId,
      rule.categoryId ?? null, rule.subcategoryId ?? null,
      rule.payee ?? null, rule.note ?? null,
      rule.frequency,
      rule.intervalUnit ?? null, rule.intervalValue ?? null,
      rule.dayOfWeek ?? null, rule.dayOfMonth ?? null,
      rule.startDate, rule.endDate ?? null, rule.nextDue,
      rule.autoCreate ? 1 : 0, rule.reminderDays,
      rule.active ? 1 : 0, rule.createdAt,
    ]
  );
}

export async function updateRecurringRule(db: Db, rule: RecurringRule): Promise<void> {
  await db.runAsync(
    `UPDATE recurring_rules SET
       type = ?, amount = ?, account_id = ?, category_id = ?, subcategory_id = ?,
       payee = ?, note = ?, frequency = ?, interval_unit = ?, interval_value = ?,
       day_of_week = ?, day_of_month = ?, start_date = ?, end_date = ?,
       next_due = ?, auto_create = ?, reminder_days = ?, active = ?
     WHERE id = ?`,
    [
      rule.type, rule.amount, rule.accountId,
      rule.categoryId ?? null, rule.subcategoryId ?? null,
      rule.payee ?? null, rule.note ?? null,
      rule.frequency,
      rule.intervalUnit ?? null, rule.intervalValue ?? null,
      rule.dayOfWeek ?? null, rule.dayOfMonth ?? null,
      rule.startDate, rule.endDate ?? null, rule.nextDue,
      rule.autoCreate ? 1 : 0, rule.reminderDays, rule.active ? 1 : 0,
      rule.id,
    ]
  );
}

export async function deleteRecurringRule(db: Db, id: string): Promise<void> {
  // ON DELETE SET NULL on transactions.recurring_rule_id handles the cascade.
  await db.runAsync('DELETE FROM recurring_rules WHERE id = ?', [id]);
}

export async function pauseRecurringRule(db: Db, id: string): Promise<void> {
  await db.runAsync('UPDATE recurring_rules SET active = 0 WHERE id = ?', [id]);
}

export async function resumeRecurringRule(db: Db, id: string): Promise<void> {
  await db.runAsync('UPDATE recurring_rules SET active = 1 WHERE id = ?', [id]);
}

// ---- Processing engine -----------------------------------------------------

export interface ProcessingResult {
  created: number;
  reminded: number;
  skipped: number;
}

/**
 * Called on every app foreground. Processes all active recurring rules that
 * are due or due within their reminder window.
 *
 * For auto_create rules: writes a real transaction (updating the rollup) and
 * advances next_due.
 * For manual rules: fires a notification and advances next_due only if
 * already past due (not just in the reminder window).
 *
 * Returns counts for diagnostic logging; callers are not required to act on
 * the result.
 */
export async function processDueRules(
  db: Db,
  now: Date = new Date(),
  notify?: (title: string, body: string) => Promise<void>
): Promise<ProcessingResult> {
  const rules = await listActiveRecurringRules(db);
  let created = 0;
  let reminded = 0;
  let skipped = 0;

  for (const rule of rules) {
    // Skip rules that haven't started yet
    if (now < new Date(rule.startDate)) { skipped++; continue; }
    // Skip if past end date
    if (rule.endDate && now > new Date(rule.endDate)) {
      await pauseRecurringRule(db, rule.id);
      skipped++;
      continue;
    }

    const pastDue = isDue(rule, now, 0);
    const inReminderWindow = !pastDue && isDue(rule, now, rule.reminderDays);

    if (!pastDue && !inReminderWindow) { skipped++; continue; }

    if (rule.autoCreate && pastDue) {
      // Write the transaction and advance next_due
      const txId = generateId();
      const dateStr = rule.nextDue; // use the scheduled date, not "today"
      await db.withTransaction(async txn => {
        await txn.runAsync(
          `INSERT INTO transactions
             (id, type, amount, account_id, category_id, subcategory_id,
              payee, note, date, date_ms, month_key, day_key, note_lc,
              created_at, recurring_rule_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            txId, rule.type, rule.amount, rule.accountId,
            rule.categoryId ?? null, rule.subcategoryId ?? null,
            rule.payee ?? null, rule.note ?? null,
            dateStr, new Date(dateStr).getTime(),
            monthKeyOf(dateStr), dayKeyOf(dateStr),
            rule.note ? rule.note.toLowerCase() : null,
            new Date().toISOString(), rule.id,
          ]
        );

        // Apply to rollup (same pattern as insertTransaction in db/transactions.ts)
        await applyRow(txn, {
          type: rule.type,
          amount: rule.amount,
          accountId: rule.accountId,
          toAccountId: null,
          categoryId: rule.categoryId ?? null,
          monthKey: monthKeyOf(dateStr),
          dayKey: dayKeyOf(dateStr),
        });

        // Advance next_due
        const [y, m, d] = dateStr.split('-').map(Number);
        const nextDate = computeNextDue(rule, new Date(y, m - 1, d));
        await txn.runAsync(
          'UPDATE recurring_rules SET next_due = ? WHERE id = ?',
          [formatDateIso(nextDate), rule.id]
        );
      });
      await bumpDataVersion();
      created++;

    } else if (!rule.autoCreate && (pastDue || inReminderWindow)) {
      // Fire reminder; advance next_due only if past due
      const label = rule.payee ?? rule.note ?? 'Recurring payment';
      const daysText = inReminderWindow && !pastDue
        ? `due in ${rule.reminderDays} day${rule.reminderDays === 1 ? '' : 's'}`
        : 'due today';
      await notify?.(
        `⏰ ${label}`,
        `₹${rule.amount.toLocaleString()} ${daysText} — tap to review.`
      );

      if (pastDue) {
        const [y, m, d] = rule.nextDue.split('-').map(Number);
        const nextDate = computeNextDue(rule, new Date(y, m - 1, d));
        await db.runAsync(
          'UPDATE recurring_rules SET next_due = ? WHERE id = ?',
          [formatDateIso(nextDate), rule.id]
        );
        await bumpDataVersion();
      }
      reminded++;
    }
  }

  return { created, reminded, skipped };
}

// ---- Upcoming query (for home screen) --------------------------------------

export interface UpcomingPayment {
  rule: RecurringRule;
  dueDate: Date;
  daysUntil: number;
}

/**
 * Returns the next N due payments across all active rules, sorted by
 * due date. Used by the "Upcoming" card on the home/reports screen.
 */
export function getUpcomingPayments(
  rules: RecurringRule[],
  now: Date = new Date(),
  count = 5,
  horizonDays = 30
): UpcomingPayment[] {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + horizonDays);

  const upcoming: UpcomingPayment[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.endDate && now > new Date(rule.endDate)) continue;

    const dueDate = new Date(rule.nextDue);
    if (dueDate <= now || dueDate > horizon) continue;

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / msPerDay);
    upcoming.push({ rule, dueDate, daysUntil });
  }

  return upcoming
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, count);
}
