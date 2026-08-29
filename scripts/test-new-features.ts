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
import { insertRecurringRule, listRecurringRules, processDueRules } from '../db/recurring';
import { insertTransaction } from '../db/transactions';
import { insertSplitParticipantsBatch, listSplitParticipants, recordRepayment, getSplitSummary } from '../db/splits';
import { applyBankImport } from '../db/bank-import';
import { ParsedBankTransaction } from '../utils/bank-statement';
import { insertBudget, insertPreset, getAccountDeletionImpact, deleteAccount } from '../db/entities';

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

  await test('Split participant settlement and linked repayment income', async () => {
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

    // 4. Record Alice's full repayment
    const aliceIncomeId = await recordRepayment(db, {
      participantId: participants[0].id,
      amount: 1000,
      accountId: 'acc_main',
      note: 'Repayment from Alice',
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
