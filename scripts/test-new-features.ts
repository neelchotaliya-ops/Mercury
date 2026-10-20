/**
 * Comprehensive test suite for Mercury's new features:
 * - Recurring engine (computeNextDue, generateOccurrences, describeFrequency, isDue)
 * - Bank statement parser (detectBankFormat, parseBankRow, parseBankDate, parseBankAmount)
 * - Split expense calculator (calculateSplitShares for equal, percentage, custom)
 * - Subcategories, Recurring rules, and Splits SQLite DB lifecycle
 *
 * Runs under Node.js with built-in node:sqlite — fast, zero device/emulator required.
 * Run with: npx tsx scripts/test-new-features.ts
 */

import assert from 'node:assert/strict';

import {
  computeNextDue,
  generateOccurrences,
  describeFrequency,
  formatDateIso,
  isDue,
} from '../utils/recurring-engine';
import { buildRecurringScheduleFields } from '../hooks/use-recurring-schedule-form';
import {
  detectBankFormat,
  parseBankRow,
  parseBankDate,
  parseBankAmount,
  calculateSplitShares,
} from '../utils/bank-statement';
import { RecurringRule, SplitParticipant, Subcategory } from '../types/finance';
import { Db } from '../db/types';
import { applyMigrations } from '../db/schema';
import { openTestDb } from './support/node-db';
import { insertSubcategory, listSubcategories, updateSubcategory, deleteSubcategory } from '../db/subcategories';
import { insertRecurringRule, listRecurringRules, processDueRules, logRecurringOccurrence, getRecurringRule } from '../db/recurring';
import { projectRecurringFlow, projectRecurringWindows } from '../utils/recurring-engine';
import { insertTransaction } from '../db/transactions';
import { insertSplitParticipantsBatch, listSplitParticipants, markParticipantPaid, getSplitSummary } from '../db/splits';
import { applyBankImport } from '../db/bank-import';
import { ParsedBankTransaction } from '../utils/bank-statement';
import { insertBudget, insertPreset, getAccountDeletionImpact, deleteAccount } from '../db/entities';
import { computeSubcategoryBreakdown, computeTagBreakdown, computeAllInsights, DEFAULT_INSIGHT_FILTER } from '../db/insights';
import { getOrCreateTag, listTags, normalizeTagName } from '../db/tags';
import { getTransactionById, updateTransaction, deleteTransaction } from '../db/transactions';

async function createInMemoryDb(): Promise<Db> {
  const db = openTestDb();
  await applyMigrations(db);
  return db;
}

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        console.log(`ok    ${name}`);
        passed++;
      });
    }
    console.log(`ok    ${name}`);
    passed++;
  } catch (e) {
    console.error(`FAIL  ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('--- Recurring Engine Tests ---');

  test('computeNextDue: daily advances by 1 day', () => {
    const rule: RecurringRule = {
      id: 'r1', type: 'expense', amount: 100, accountId: 'a1', frequency: 'daily',
      startDate: '2026-08-01', nextDue: '2026-08-01', autoCreate: true, reminderDays: 1,
      active: true, createdAt: '2026-08-01',
    };
    const next = computeNextDue(rule, new Date(2026, 7, 15));
    assert.equal(formatDateIso(next), '2026-08-16');
  });

  test('computeNextDue: weekly on Monday lands on next Monday', () => {
    const rule: RecurringRule = {
      id: 'r2', type: 'expense', amount: 500, accountId: 'a1', frequency: 'weekly',
      dayOfWeek: 1, // Monday
      startDate: '2026-08-01', nextDue: '2026-08-03', autoCreate: true, reminderDays: 1,
      active: true, createdAt: '2026-08-01',
    };
    // 2026-08-23 is Sunday. Next Monday is 2026-08-24.
    const next = computeNextDue(rule, new Date(2026, 7, 23));
    assert.equal(next.getDay(), 1);
    assert.equal(formatDateIso(next), '2026-08-24');
  });

  test('computeNextDue: monthly clamps 31st to 28/29 in February', () => {
    const rule: RecurringRule = {
      id: 'r3', type: 'expense', amount: 1000, accountId: 'a1', frequency: 'monthly',
      dayOfMonth: 31,
      startDate: '2026-01-31', nextDue: '2026-01-31', autoCreate: true, reminderDays: 1,
      active: true, createdAt: '2026-01-31',
    };
    const nextInFeb = computeNextDue(rule, new Date(2026, 0, 31, 12, 0, 0));
    // February 2026 has 28 days (not a leap year)
    assert.equal(nextInFeb.getMonth(), 1); // Feb (0-indexed)
    assert.equal(nextInFeb.getDate(), 28);
  });

  test('computeNextDue: monthly with -1 targets last day of month', () => {
    const rule: RecurringRule = {
      id: 'r4', type: 'expense', amount: 2000, accountId: 'a1', frequency: 'monthly',
      dayOfMonth: -1,
      startDate: '2026-03-01', nextDue: '2026-03-31', autoCreate: true, reminderDays: 1,
      active: true, createdAt: '2026-03-01',
    };
    // From March 31, next is April 30
    const next = computeNextDue(rule, new Date(2026, 2, 31));
    assert.equal(formatDateIso(next), '2026-04-30');
  });

  test('computeNextDue: custom monthly interval clamps month-end instead of drifting', () => {
    const rule: RecurringRule = {
      id: 'r-custom-1', type: 'expense', amount: 500, accountId: 'a1', frequency: 'custom',
      intervalUnit: 'month', intervalValue: 1,
      startDate: '2026-01-31', nextDue: '2026-01-31', autoCreate: true, reminderDays: 1,
      active: true, createdAt: '2026-01-31',
    };
    // From Jan 31, +1 month should land on Feb 28 (2026 is not a leap year),
    // not roll over into March like `Date.setMonth` would.
    const next = computeNextDue(rule, new Date(2026, 0, 31, 12, 0, 0));
    assert.equal(formatDateIso(next), '2026-02-28');

    // Advancing again from that Feb 28 result should return to the 31st
    // once a month with 31 days comes around, not stay pinned at 28 (the
    // anchor day is always re-derived from the rule's original start date,
    // never from the previous, possibly-clamped occurrence).
    const followUp = computeNextDue(rule, next);
    assert.equal(formatDateIso(followUp), '2026-03-31');
  });

  test('computeNextDue: custom yearly interval on a leap day clamps correctly', () => {
    const rule: RecurringRule = {
      id: 'r-custom-2', type: 'expense', amount: 700, accountId: 'a1', frequency: 'custom',
      intervalUnit: 'year', intervalValue: 1,
      startDate: '2024-02-29', nextDue: '2024-02-29', autoCreate: true, reminderDays: 1,
      active: true, createdAt: '2024-02-29',
    };
    // 2025 is not a leap year, so Feb 29 clamps to Feb 28.
    const next = computeNextDue(rule, new Date(2024, 1, 29, 12, 0, 0));
    assert.equal(formatDateIso(next), '2025-02-28');
  });

  test('generateOccurrences generates bounded list respecting end_date', () => {
    const rule: RecurringRule = {
      id: 'r5', type: 'expense', amount: 50, accountId: 'a1', frequency: 'weekly',
      dayOfWeek: 1, // Monday
      startDate: '2026-08-01', endDate: '2026-08-20', nextDue: '2026-08-03', autoCreate: true,
      reminderDays: 1, active: true, createdAt: '2026-08-01',
    };
    const occs = generateOccurrences(rule, new Date(2026, 7, 1), new Date(2026, 7, 31));
    // Mondays in Aug 2026 before Aug 20: Aug 3, Aug 10, Aug 17
    assert.equal(occs.length, 3);
    assert.equal(formatDateIso(occs[0]), '2026-08-03');
    assert.equal(formatDateIso(occs[2]), '2026-08-17');
  });

  test('describeFrequency produces human-readable text', () => {
    assert.equal(describeFrequency({ frequency: 'daily' } as any), 'Every day');
    assert.equal(describeFrequency({ frequency: 'weekly', dayOfWeek: 1 } as any), 'Every week on Monday');
    assert.equal(describeFrequency({ frequency: 'monthly', dayOfMonth: 15 } as any), 'Every month on the 15th');
    assert.equal(describeFrequency({ frequency: 'monthly', dayOfMonth: -1 } as any), 'Every month on the last day');
    assert.equal(describeFrequency({ frequency: 'custom', intervalValue: 3, intervalUnit: 'month' } as any), 'Every 3 months');
  });

  test('buildRecurringScheduleFields: add-recurring.tsx and repeat-sheet.tsx derive identical fields from the same schedule state', () => {
    // Both app/add-recurring.tsx and components/finance/repeat-sheet.tsx
    // call this same pure function through useRecurringScheduleForm — this
    // is the regression test for the actual bug class that motivated
    // extracting it: two hand-rolled copies of this derivation drifting
    // out of sync (one calling setDayOfWeek/setDayOfMonth after they'd
    // been removed from the other).
    const monthlyState = {
      frequency: 'monthly' as const,
      useCustomInterval: false,
      intervalUnit: 'month' as const,
      intervalValue: 1,
      startDate: new Date(2026, 7, 15), // Aug 15, 2026
      hasEndDate: false,
      endDate: null,
      autoCreate: true,
      reminderDays: 1,
      note: '',
    };
    const fields = buildRecurringScheduleFields(monthlyState);
    assert.equal(fields.frequency, 'monthly');
    assert.equal(fields.dayOfMonth, 15);
    assert.equal(fields.dayOfWeek, undefined);
    assert.equal(fields.startDate, '2026-08-15');
    assert.equal(fields.intervalUnit, undefined);
    assert.equal(fields.endDate, undefined);

    // A custom interval flips the effective frequency and carries the unit/value.
    const customState = { ...monthlyState, useCustomInterval: true, intervalUnit: 'week' as const, intervalValue: 2 };
    const customFields = buildRecurringScheduleFields(customState);
    assert.equal(customFields.frequency, 'custom');
    assert.equal(customFields.intervalUnit, 'week');
    assert.equal(customFields.intervalValue, 2);
    assert.equal(customFields.dayOfMonth, undefined);

    // A weekly rule derives dayOfWeek from startDate, never dayOfMonth.
    const weeklyState = { ...monthlyState, frequency: 'weekly' as const };
    const weeklyFields = buildRecurringScheduleFields(weeklyState);
    assert.equal(weeklyFields.dayOfWeek, monthlyState.startDate.getDay());
    assert.equal(weeklyFields.dayOfMonth, undefined);

    // An end date and note only appear when actually set.
    const withEnd = buildRecurringScheduleFields({
      ...monthlyState,
      hasEndDate: true,
      endDate: new Date(2027, 0, 1),
      note: '  shared with family  ',
    });
    assert.equal(withEnd.endDate, '2027-01-01');
    assert.equal(withEnd.note, 'shared with family');
  });

  console.log('\n--- Bank Statement Parser Tests ---');

  test('parseBankDate handles DD/MM/YYYY, MM/DD/YYYY, ISO, and DD-Mon-YY', () => {
    assert.equal(parseBankDate('15/08/2026'), '2026-08-15');
    assert.equal(parseBankDate('2026-08-15'), '2026-08-15');
    assert.equal(parseBankDate('15-Jan-24'), '2024-01-15');
    assert.equal(parseBankDate('05-12-2025'), '2025-12-05');
  });

  test('parseBankAmount strips currency symbols, commas, and whitespace', () => {
    assert.equal(parseBankAmount('₹ 1,500.50'), 1500.5);
    assert.equal(parseBankAmount('$25,000.00'), 25000);
    assert.equal(parseBankAmount('(350.00)'), -350);
    assert.equal(parseBankAmount(''), null);
  });

  test('detectBankFormat identifies split debit/credit columns', () => {
    const headers = ['Txn Date', 'Narration', 'Withdrawal (Dr)', 'Deposit (Cr)', 'Closing Balance'];
    const format = detectBankFormat(headers);
    assert.ok(format);
    assert.equal(format.amountLayout.kind, 'split');
    assert.equal(format.dateCol, 'Txn Date');
    assert.equal(format.descriptionCol, 'Narration');
  });

  test('parseBankRow parses debit as expense and credit as income', () => {
    const format = {
      bankName: 'HDFC',
      dateCol: 'Date',
      descriptionCol: 'Narration',
      amountLayout: { kind: 'split' as const, debitCol: 'Debit', creditCol: 'Credit' },
    };

    const debitRow = parseBankRow({ Date: '15/08/2026', Narration: 'Swiggy Order', Debit: '450.00', Credit: '' }, format);
    assert.ok(debitRow);
    assert.equal(debitRow.amount, 450);
    assert.equal(debitRow.direction, 'expense');
    assert.equal(debitRow.date, '2026-08-15');

    const creditRow = parseBankRow({ Date: '16/08/2026', Narration: 'Salary Credit', Debit: '', Credit: '75,000.00' }, format);
    assert.ok(creditRow);
    assert.equal(creditRow.amount, 75000);
    assert.equal(creditRow.direction, 'income');
  });

  console.log('\n--- Split Calculator Tests ---');

  test('calculateSplitShares: equal division handles remainder correctly', () => {
    // 100 split among 3 people = 33.33 + 33.33 + 33.34 = 100.00
    const shares = calculateSplitShares(100, 'equal', 3);
    assert.equal(shares.length, 3);
    assert.equal(shares[0], 33.33);
    assert.equal(shares[1], 33.33);
    assert.equal(shares[2], 33.34);
    assert.equal(Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100, 100);
  });

  test('calculateSplitShares: percentage division computes accurately', () => {
    const shares = calculateSplitShares(500, 'percentage', 3, [50, 30, 20]);
    assert.deepEqual(shares, [250, 150, 100]);
  });

  console.log('\n--- SQLite Integration Tests ---');

  await test('Subcategory CRUD lifecycle', async () => {
    const db = await createInMemoryDb();

    // Create a parent category first
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
       VALUES ('cat_sub', 'Subscriptions', 'tv', '#8B5CF6', 'expense', 1, 0)`
    );

    const sub: Subcategory = {
      id: 'sub_netflix',
      categoryId: 'cat_sub',
      name: 'Netflix',
      icon: 'tv-outline' as any,
      color: '#E50914',
    };

    await insertSubcategory(db, sub, 0);
    const listed = await listSubcategories(db);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'Netflix');

    await updateSubcategory(db, { ...sub, name: 'Netflix Premium' });
    const updated = await listSubcategories(db);
    assert.equal(updated[0].name, 'Netflix Premium');

    await deleteSubcategory(db, sub.id);
    const afterDelete = await listSubcategories(db);
    assert.equal(afterDelete.length, 0);
  });

  await test('computeSubcategoryBreakdown groups by subcategory with a "no subcategory" bucket', async () => {
    const db = await createInMemoryDb();

    await db.runAsync(
      `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
       VALUES ('cat_sub', 'Subscriptions', 'tv', '#8B5CF6', 'expense', 1, 0)`
    );
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
       VALUES ('cat_other', 'Other', 'ellipsis-horizontal', '#999999', 'expense', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_sub', 'Bank', 'bank', 'card', '#3B82F6', 10000, '2026-08-01', 0, 0)`
    );

    const mobile: Subcategory = { id: 'sub_mobile', categoryId: 'cat_sub', name: 'Mobile', icon: 'call-outline' as any, color: '#3B82F6' };
    const tv: Subcategory = { id: 'sub_tv', categoryId: 'cat_sub', name: 'TV', icon: 'tv-outline' as any, color: '#EF4444' };
    await insertSubcategory(db, mobile, 0);
    await insertSubcategory(db, tv, 1);

    // Two mobile recharges, one TV subscription, one untagged Subscriptions
    // spend, and one transaction in a different category entirely — the
    // breakdown must scope to cat_sub only and bucket the untagged one under
    // "no subcategory" rather than dropping it.
    await insertTransaction(db, { id: 'tx1', type: 'expense', amount: 300, accountId: 'acc_sub', categoryId: 'cat_sub', subcategoryId: 'sub_mobile', date: '2026-08-05' });
    await insertTransaction(db, { id: 'tx2', type: 'expense', amount: 250, accountId: 'acc_sub', categoryId: 'cat_sub', subcategoryId: 'sub_mobile', date: '2026-08-12' });
    await insertTransaction(db, { id: 'tx3', type: 'expense', amount: 500, accountId: 'acc_sub', categoryId: 'cat_sub', subcategoryId: 'sub_tv', date: '2026-08-10' });
    await insertTransaction(db, { id: 'tx4', type: 'expense', amount: 150, accountId: 'acc_sub', categoryId: 'cat_sub', date: '2026-08-15' });
    await insertTransaction(db, { id: 'tx5', type: 'expense', amount: 9999, accountId: 'acc_sub', categoryId: 'cat_other', date: '2026-08-15' });

    const slices = await computeSubcategoryBreakdown(
      db,
      { ...DEFAULT_INSIGHT_FILTER, range: 'all' },
      'cat_sub',
      [mobile, tv]
    );

    assert.equal(slices.length, 3);
    const bySubName = new Map(slices.map(s => [s.subcategory?.name ?? 'none', s]));
    assert.equal(bySubName.get('Mobile')?.amount, 550);
    assert.equal(bySubName.get('Mobile')?.count, 2);
    assert.equal(bySubName.get('TV')?.amount, 500);
    assert.equal(bySubName.get('none')?.amount, 150);

    const total = 550 + 500 + 150;
    assert.ok(Math.abs((bySubName.get('Mobile')?.share ?? 0) - 550 / total) < 1e-9);
    // Sorted descending by amount.
    assert.equal(slices[0].subcategory?.name, 'Mobile');
  });

  await test('Tags are reusable (case-insensitive) and round-trip through transactions', async () => {
    const db = await createInMemoryDb();
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_t', 'Bank', 'bank', 'card', '#3B82F6', 0, '2026-08-01', 0, 0)`
    );

    assert.equal(normalizeTagName('  #  Work   trip '), 'Work trip');
    assert.equal(await getOrCreateTag(db, '   '), null);

    const work = await getOrCreateTag(db, 'Work');
    const again = await getOrCreateTag(db, ' work ');
    assert.ok(work && again);
    assert.equal(again.id, work.id, 'same name in a different case must reuse the tag');
    assert.equal((await listTags(db)).length, 1);

    const trip = await getOrCreateTag(db, 'trip');
    assert.ok(trip);

    await insertTransaction(db, { id: 'tg1', type: 'expense', amount: 10, accountId: 'acc_t', date: '2026-08-05', tagIds: [work.id, trip.id, work.id] });
    const loaded = await getTransactionById(db, 'tg1');
    assert.deepEqual([...(loaded?.tagIds ?? [])].sort(), [trip.id, work.id].sort());

    // undefined leaves links alone; an array replaces them.
    await updateTransaction(db, { ...loaded!, note: 'edited' });
    assert.equal((await getTransactionById(db, 'tg1'))?.tagIds?.length, 2);
    await updateTransaction(db, { ...loaded!, tagIds: [trip.id] });
    assert.deepEqual((await getTransactionById(db, 'tg1'))?.tagIds, [trip.id]);
    await updateTransaction(db, { ...loaded!, tagIds: [] });
    assert.equal((await getTransactionById(db, 'tg1'))?.tagIds, undefined);

    // Links go with the transaction; the reusable tag itself stays.
    await updateTransaction(db, { ...loaded!, tagIds: [work.id] });
    await deleteTransaction(db, 'tg1');
    const links = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transaction_tags');
    assert.equal(links?.n, 0);
    assert.equal((await listTags(db)).length, 2);
  });

  await test('computeTagBreakdown scopes to the category and counts multi-tag spend under each tag', async () => {
    const db = await createInMemoryDb();
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
       VALUES ('cat_f', 'Food', 'restaurant', '#F97316', 'expense', 1, 0), ('cat_o', 'Other', 'ellipsis-horizontal', '#999999', 'expense', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_f', 'Bank', 'bank', 'card', '#3B82F6', 0, '2026-08-01', 0, 0)`
    );
    const work = (await getOrCreateTag(db, 'work'))!;
    const trip = (await getOrCreateTag(db, 'trip'))!;
    const tags = await listTags(db);

    await insertTransaction(db, { id: 'a', type: 'expense', amount: 100, accountId: 'acc_f', categoryId: 'cat_f', date: '2026-08-05', tagIds: [work.id] });
    await insertTransaction(db, { id: 'b', type: 'expense', amount: 300, accountId: 'acc_f', categoryId: 'cat_f', date: '2026-08-06', tagIds: [work.id, trip.id] });
    await insertTransaction(db, { id: 'c', type: 'expense', amount: 100, accountId: 'acc_f', categoryId: 'cat_f', date: '2026-08-07' });
    await insertTransaction(db, { id: 'd', type: 'expense', amount: 9999, accountId: 'acc_f', categoryId: 'cat_o', date: '2026-08-07', tagIds: [work.id] });

    const slices = await computeTagBreakdown(db, { ...DEFAULT_INSIGHT_FILTER, range: 'all' }, 'cat_f', tags);
    assert.deepEqual(
      slices.map(s => [s.tag?.name ?? null, s.amount, s.count]),
      [['work', 400, 2], ['trip', 300, 1], [null, 100, 1]],
      'sorted by amount, "No tag" last, other categories excluded'
    );
    assert.ok(Math.abs(slices[0].share - 0.8) < 1e-9, 'share is of the category total (500)');
  });

  await test('Recurring rule execution writes transaction and advances next_due', async () => {
    const db = await createInMemoryDb();

    // Create prerequisite account
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc1', 'Bank', 'bank', 'card', '#3B82F6', 10000, '2026-08-01', 0, 0)`
    );

    const rule: RecurringRule = {
      id: 'rec_rent',
      type: 'expense',
      amount: 15000,
      accountId: 'acc1',
      payee: 'Landlord',
      note: 'Monthly Rent',
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2026-08-01',
      nextDue: '2026-08-01', // Due today/past
      autoCreate: true,
      reminderDays: 1,
      active: true,
      createdAt: '2026-08-01',
    };

    await insertRecurringRule(db, rule);
    const rules = await listRecurringRules(db);
    assert.equal(rules.length, 1);

    // Run processing on 2026-08-02
    const result = await processDueRules(db, new Date('2026-08-02T12:00:00Z'));
    assert.equal(result.created, 1);

    // Verify transaction was written
    const tx = await db.getFirstAsync<{ amount: number; payee: string; recurring_rule_id: string }>(
      'SELECT * FROM transactions WHERE recurring_rule_id = ?',
      ['rec_rent']
    );
    assert.ok(tx);
    assert.equal(tx.amount, 15000);
    assert.equal(tx.payee, 'Landlord');

    // Verify rule's next_due was advanced to 2026-09-01
    const updatedRule = await db.getFirstAsync<{ next_due: string }>(
      'SELECT next_due FROM recurring_rules WHERE id = ?',
      ['rec_rent']
    );
    assert.ok(updatedRule);
    assert.equal(updatedRule.next_due, '2026-09-01');
  });

  await test('logRecurringOccurrence logs the next cycle today and advances next_due by exactly one', async () => {
    const db = await createInMemoryDb();
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_r', 'Bank', 'bank', 'card', '#3B82F6', 1000, '2026-01-01', 0, 0)`
    );
    await insertRecurringRule(db, {
      id: 'rent', type: 'expense', amount: 300, accountId: 'acc_r', payee: 'Rent',
      frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-05',
      nextDue: '2026-11-05', autoCreate: false, reminderDays: 1, active: true, createdAt: '2026-01-01',
    });

    // Paying the 5 Nov rent early, on 28 Oct.
    const result = await logRecurringOccurrence(db, 'rent', new Date(2026, 9, 28, 12));
    assert.equal(result.nextDue, '2026-12-05');
    assert.equal((await getRecurringRule(db, 'rent'))?.nextDue, '2026-12-05');

    const tx = await db.getFirstAsync<{ amount: number; payee: string; recurring_rule_id: string; month_key: string }>(
      'SELECT amount, payee, recurring_rule_id, month_key FROM transactions WHERE id = ?',
      [result.transactionId]
    );
    assert.equal(tx?.amount, 300);
    assert.equal(tx?.payee, 'Rent');
    assert.equal(tx?.recurring_rule_id, 'rent');
    assert.equal(tx?.month_key, '2026-10', 'dated when it was paid, not the due date');

    // Rollup/balance are updated like any other write.
    const bal = await db.getFirstAsync<{ delta: number }>('SELECT delta FROM account_balance WHERE account_id = ?', ['acc_r']);
    assert.equal(bal?.delta, -30000);

    // The foreground processor must not log the same cycle again.
    const processed = await processDueRules(db, new Date(2026, 10, 6));
    assert.equal(processed.created, 0);
    await assert.rejects(() => logRecurringOccurrence(db, 'nope'));
  });

  await test('projectRecurringFlow walks real schedules for month, 6 months and year windows', () => {
    const base = { accountId: 'a', reminderDays: 0, active: true, createdAt: '2026-01-01', autoCreate: true } as const;
    const rules: RecurringRule[] = [
      { ...base, id: 'sal', type: 'income', amount: 1000, frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01', nextDue: '2026-11-01' },
      { ...base, id: 'rent', type: 'expense', amount: 400, frequency: 'monthly', dayOfMonth: -1, startDate: '2026-01-31', nextDue: '2026-10-31' },
      { ...base, id: 'gym', type: 'expense', amount: 10, frequency: 'weekly', dayOfWeek: 1, startDate: '2026-01-05', nextDue: '2026-10-26' },
      { ...base, id: 'paused', type: 'expense', amount: 9999, frequency: 'daily', startDate: '2026-01-01', nextDue: '2026-10-21', active: false },
      { ...base, id: 'ended', type: 'expense', amount: 50, frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-15', nextDue: '2026-11-15', endDate: '2026-12-31' },
    ];
    const now = new Date(2026, 9, 21); // 21 Oct 2026

    const w = projectRecurringWindows(rules, now);
    // Rest of October: rent on the 31st + gym Mondays 26 Oct = 410. No income.
    assert.equal(w.thisMonth.income, 0);
    assert.equal(w.thisMonth.expense, 410);
    assert.equal(w.thisMonth.net, -410);

    // Salary: 1 Nov..1 Apr = 6. Rent: 31 Oct,30 Nov,31 Dec,31 Jan,28 Feb,31 Mar = 6.
    assert.equal(w.next6Months.income, 6000);
    assert.equal(w.next6Months.incomeCount, 6);
    assert.equal(w.next6Months.expenseCount > 6 + 25, true);

    // Rest of year: salary 1 Nov & 1 Dec; ended rule stops at its endDate; paused rule never counts.
    assert.equal(w.thisYear.income, 2000);
    assert.equal(w.thisYear.expense, 400 * 3 + 10 * 10 + 50 * 2);
    assert.equal(projectRecurringFlow([], now, new Date(2026, 11, 31)).net, 0);
  });

  await test('computeAllInsights trend carries both income and expense per month, whichever kind is selected', async () => {
    const db = await createInMemoryDb();
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
       VALUES ('c_e', 'Food', 'restaurant', '#F97316', 'expense', 1, 0), ('c_i', 'Pay', 'cash', '#22C55E', 'income', 1, 1)`
    );
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_x', 'Bank', 'bank', 'card', '#3B82F6', 0, '2026-01-01', 0, 0)`
    );
    await insertTransaction(db, { id: 'i1', type: 'income', amount: 1000, accountId: 'acc_x', categoryId: 'c_i', date: '2026-09-02T10:00:00' });
    await insertTransaction(db, { id: 'e1', type: 'expense', amount: 200, accountId: 'acc_x', categoryId: 'c_e', date: '2026-09-10T10:00:00' });
    await insertTransaction(db, { id: 'e2', type: 'expense', amount: 300, accountId: 'acc_x', categoryId: 'c_e', date: '2026-10-03T10:00:00' });

    const now = new Date(2026, 9, 20);
    const cats = [
      { id: 'c_e', name: 'Food', icon: 'restaurant' as any, color: '#F97316', kind: 'expense' as const },
      { id: 'c_i', name: 'Pay', icon: 'cash' as any, color: '#22C55E', kind: 'income' as const },
    ];
    const expected = [
      { monthKey: '2026-09', income: 1000, expense: 200 },
      { monthKey: '2026-10', income: 0, expense: 300 },
    ];
    for (const kind of ['expense', 'income'] as const) {
      const res = await computeAllInsights(db, { ...DEFAULT_INSIGHT_FILTER, range: '3m', kind }, cats, now);
      assert.deepEqual(res.trend.filter(p => p.monthKey >= '2026-09'), expected, `kind=${kind}`);
    }

    // A category filter belongs to the selected kind and must not blank the other line.
    const filtered = await computeAllInsights(db, { ...DEFAULT_INSIGHT_FILTER, range: '3m', kind: 'expense', categoryIds: ['c_e'] }, cats, now);
    assert.deepEqual(filtered.trend.filter(p => p.monthKey >= '2026-09'), expected);
  });

  await test('Recurring rule catches up on multiple missed periods, not just one', async () => {
    const db = await createInMemoryDb();

    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc2', 'Bank', 'bank', 'card', '#3B82F6', 10000, '2026-01-01', 0, 0)`
    );

    // A monthly rule that hasn't been processed since March — as if the app
    // was closed for several months. Before the fix, opening the app would
    // only create/advance a single occurrence (June) and silently skip
    // April and May.
    const rule: RecurringRule = {
      id: 'rec_missed',
      type: 'expense',
      amount: 1000,
      accountId: 'acc2',
      payee: 'Gym',
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
      nextDue: '2026-03-01',
      autoCreate: true,
      reminderDays: 1,
      active: true,
      createdAt: '2026-01-01',
    };
    await insertRecurringRule(db, rule);

    // Opened on 2026-06-15 — March, April, May, and June 1st have all elapsed.
    const result = await processDueRules(db, new Date('2026-06-15T12:00:00Z'));
    assert.equal(result.created, 4);

    const txs = await db.getAllAsync<{ date: string }>(
      'SELECT date FROM transactions WHERE recurring_rule_id = ? ORDER BY date',
      ['rec_missed']
    );
    assert.deepEqual(
      txs.map(t => t.date),
      ['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']
    );

    const updatedRule = await db.getFirstAsync<{ next_due: string }>(
      'SELECT next_due FROM recurring_rules WHERE id = ?',
      ['rec_missed']
    );
    assert.equal(updatedRule?.next_due, '2026-07-01');

    // The balance/rollup side must reflect all 4 occurrences, not just one.
    const balance = await db.getFirstAsync<{ delta: number }>(
      'SELECT delta FROM account_balance WHERE account_id = ?',
      ['acc2']
    );
    assert.equal(balance?.delta, -4000 * 100);
  });

  await test('Manual (non-auto-create) recurring rule catches up next_due without spamming notifications', async () => {
    const db = await createInMemoryDb();

    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc3', 'Bank', 'bank', 'card', '#3B82F6', 10000, '2026-01-01', 0, 0)`
    );

    const rule: RecurringRule = {
      id: 'rec_manual',
      type: 'expense',
      amount: 500,
      accountId: 'acc3',
      payee: 'Electricity',
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: '2026-01-01',
      nextDue: '2026-03-01',
      autoCreate: false,
      reminderDays: 1,
      active: true,
      createdAt: '2026-01-01',
    };
    await insertRecurringRule(db, rule);

    const notifications: Array<{ title: string; body: string }> = [];
    const result = await processDueRules(
      db,
      new Date('2026-06-15T12:00:00Z'),
      async (title, body) => {
        notifications.push({ title, body });
      }
    );

    // No transactions are ever written for manual rules — only next_due
    // moves, and exactly one notification fires (not one per missed month).
    assert.equal(result.reminded, 1);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].body, /4 missed/);

    const txCount = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) as n FROM transactions WHERE recurring_rule_id = ?',
      ['rec_manual']
    );
    assert.equal(txCount?.n, 0);

    const updatedRule = await db.getFirstAsync<{ next_due: string }>(
      'SELECT next_due FROM recurring_rules WHERE id = ?',
      ['rec_manual']
    );
    assert.equal(updatedRule?.next_due, '2026-07-01');
  });

  await test('markParticipantPaid: logs full share as linked income, updates rollup, and rejects double-marking', async () => {
    const db = await createInMemoryDb();

    // Prerequisite account
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_main', 'Cash', 'cash', 'cash', '#22C55E', 5000, '2026-08-01', 0, 0)`
    );

    // 1. Create main shared bill
    await insertTransaction(db, {
      id: 'tx_dinner',
      type: 'expense',
      amount: 3000,
      accountId: 'acc_main',
      note: 'Team Dinner',
      date: '2026-08-20',
    });

    // 2. Add participants
    const participants = await insertSplitParticipantsBatch(db, [
      { transactionId: 'tx_dinner', name: 'Alice', shareAmount: 1000 },
      { transactionId: 'tx_dinner', name: 'Bob', shareAmount: 1000 },
    ]);
    assert.equal(participants.length, 2);

    // 3. Check initial summary
    let summary = await getSplitSummary(db);
    assert.equal(summary.totalOwed, 2000);
    assert.equal(summary.totalSettled, 0);
    assert.equal(summary.pendingCount, 2);

    // 4. Mark Alice as paid — no amount is passed in; the full share_amount
    // is always what gets logged.
    const aliceIncomeId = await markParticipantPaid(db, {
      participantId: participants[0].id,
      accountId: 'acc_main',
    });
    assert.ok(aliceIncomeId);

    // 5. Verify Alice is paid and summary is updated
    const aliceList = await listSplitParticipants(db, 'tx_dinner');
    const alice = aliceList.find(p => p.name === 'Alice');
    assert.ok(alice);
    assert.equal(alice.status, 'paid');
    assert.equal(alice.paidAmount, 1000);

    summary = await getSplitSummary(db);
    assert.equal(summary.totalSettled, 1000);
    assert.equal(summary.pendingCount, 1);

    // 6. Verify linked repayment transaction has split_expense_id
    const repaymentTx = await db.getFirstAsync<{ type: string; split_expense_id: string; amount: number }>(
      'SELECT * FROM transactions WHERE id = ?',
      [aliceIncomeId]
    );
    assert.ok(repaymentTx);
    assert.equal(repaymentTx.type, 'income');
    assert.equal(repaymentTx.amount, 1000);
    assert.equal(repaymentTx.split_expense_id, 'tx_dinner');

    // 7. The rollup/account_balance side must reflect the repayment income too.
    const balance = await db.getFirstAsync<{ delta: number }>(
      'SELECT delta FROM account_balance WHERE account_id = ?',
      ['acc_main']
    );
    // -3000 (dinner expense) + 1000 (Alice's repayment income), in minor units.
    assert.equal(balance?.delta, -2000 * 100);

    // 8. Marking an already-paid participant again must throw rather than
    // silently double-log the income — the guard against a duplicate tap.
    await assert.rejects(() =>
      markParticipantPaid(db, { participantId: participants[0].id, accountId: 'acc_main' })
    );
  });

  await test('Bank import correctly maintains rollup/account_balance/ledger_stat', async () => {
    const db = await createInMemoryDb();

    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_bank', 'Bank', 'bank', 'card', '#3B82F6', 0, '2026-08-01', 0, 0)`
    );
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
       VALUES ('cat_general', 'General', 'card', '#8B5CF6', 'expense', 1, 0)`
    );

    const rows: ParsedBankTransaction[] = [
      { date: '2026-08-05', amount: 1200, direction: 'expense', description: 'Grocery Store', fingerprint: 'f1' },
      { date: '2026-08-06', amount: 500, direction: 'expense', description: 'Coffee Shop', fingerprint: 'f2' },
      { date: '2026-08-07', amount: 50000, direction: 'income', description: 'Salary', fingerprint: 'f3' },
    ];

    const result = await applyBankImport(db, rows, {
      accountId: 'acc_bank',
      defaultCategoryId: 'cat_general',
    });

    // The whole point of this test: every row must actually land in the
    // ledger's aggregates, not just the transactions table (this regresses
    // the bug where applyBankImport wrote raw SQL against columns that
    // don't exist in `rollup`, silently failing every row).
    assert.equal(result.imported, 3);
    assert.equal(result.errors, 0);

    const txCount = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) as n FROM transactions WHERE account_id = ?',
      ['acc_bank']
    );
    assert.equal(txCount?.n, 3);

    const monthRollup = await db.getFirstAsync<{ expense: number; income: number; expense_count: number; income_count: number }>(
      `SELECT expense, income, expense_count, income_count FROM rollup
       WHERE grain = 'M' AND account_id = ? AND category_id = ?`,
      ['acc_bank', 'cat_general']
    );
    assert.ok(monthRollup);
    assert.equal(monthRollup.expense, 1700 * 100); // 1200 + 500, minor units
    assert.equal(monthRollup.income, 50000 * 100);
    assert.equal(monthRollup.expense_count, 2);
    assert.equal(monthRollup.income_count, 1);

    const balance = await db.getFirstAsync<{ delta: number }>(
      'SELECT delta FROM account_balance WHERE account_id = ?',
      ['acc_bank']
    );
    assert.ok(balance);
    assert.equal(balance.delta, (50000 - 1200 - 500) * 100);

    const stat = await db.getFirstAsync<{ n: number; net: number }>(
      "SELECT n, net FROM ledger_stat WHERE key = 'all'"
    );
    assert.ok(stat);
    assert.equal(stat.n, 3);
  });

  await test('getAccountDeletionImpact counts cascaded rows before deleteAccount runs', async () => {
    const db = await createInMemoryDb();

    await db.runAsync(
      `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
       VALUES ('acc_target', 'Wallet', 'cash', 'cash', '#22C55E', 1000, '2026-08-01', 0, 0)`
    );
    await db.runAsync(
      `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
       VALUES ('cat_x', 'Misc', 'card', '#8B5CF6', 'expense', 1, 0)`
    );

    await insertTransaction(db, {
      id: 'tx_a', type: 'expense', amount: 100, accountId: 'acc_target',
      categoryId: 'cat_x', date: '2026-08-05',
    });

    await insertRecurringRule(db, {
      id: 'rec_a', type: 'expense', amount: 500, accountId: 'acc_target',
      frequency: 'monthly', dayOfMonth: 1, startDate: '2026-08-01',
      nextDue: '2026-09-01', autoCreate: true, reminderDays: 1,
      active: true, createdAt: '2026-08-01',
    });

    await insertBudget(db, {
      id: 'bud_a', categoryId: 'cat_x', accountId: 'acc_target',
      monthlyLimit: 2000, createdAt: '2026-08-01',
    }, 0);

    await insertPreset(db, {
      id: 'preset_a', label: 'Coffee', emoji: '☕', amount: 150,
      type: 'expense', accountId: 'acc_target',
    }, 0);

    // Impact is purely a read — nothing should have changed yet.
    const impact = await getAccountDeletionImpact(db, 'acc_target');
    assert.equal(impact.transactionCount, 1);
    assert.equal(impact.recurringRuleCount, 1);
    assert.equal(impact.budgetCount, 1);
    assert.equal(impact.danglingPresetCount, 1);

    const stillThere = await db.getFirstAsync('SELECT id FROM accounts WHERE id = ?', ['acc_target']);
    assert.ok(stillThere);

    await deleteAccount(db, 'acc_target');

    const txAfter = await db.getFirstAsync('SELECT id FROM transactions WHERE id = ?', ['tx_a']);
    assert.equal(txAfter, null);
    const ruleAfter = await db.getFirstAsync('SELECT id FROM recurring_rules WHERE id = ?', ['rec_a']);
    assert.equal(ruleAfter, null);
    const budgetAfter = await db.getFirstAsync('SELECT id FROM budgets WHERE id = ?', ['bud_a']);
    assert.equal(budgetAfter, null);
    // Presets are NOT cascaded (no FK) — left dangling, matching the impact count above.
    const presetAfter = await db.getFirstAsync<{ account_id: string }>(
      'SELECT account_id FROM quick_presets WHERE id = ?',
      ['preset_a']
    );
    assert.ok(presetAfter);
    assert.equal(presetAfter.account_id, 'acc_target');
  });

  console.log(`\nAll ${passed} new feature test cases passed!`);
}

run();
