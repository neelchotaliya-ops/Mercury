/**
 * The rollup's correctness, proven two ways:
 *
 *  1. A seeded ledger's rollup-derived totals match a plain JS reduce over
 *     the same transactions — the rollup answers the same questions the old
 *     full-scan code did, just faster.
 *  2. The property test: apply a long sequence of pseudo-random mutations
 *     (insert, delete, edit-in-place, edit-across-bucket, type changes)
 *     through the incremental delta path, and after every mutation assert the
 *     rollup, account_balance and ledger_stat tables are byte-identical to
 *     what `rebuildRollups` computes from a scratch scan. This is the test
 *     that makes the whole reverse-then-apply design trustworthy — a rollup
 *     that silently drifts shows the user wrong totals, which is worse than
 *     being slow.
 */
import { applyMigrations } from '../db/schema';
import { Db } from '../db/types';
import { Account, Category, Transaction } from '@/types/finance';
import {
  insertTransaction,
  updateTransaction,
  deleteTransaction,
} from '../db/transactions';
import { insertAccount, insertCategory, listAccountBalances, getNetWorth } from '../db/entities';
import { rebuildRollups } from '../db/rebuild';
import { openTestDb } from './support/node-db';
import { buildLedger } from './support/ledger';
import { Case, eq, close, runCases } from './support/harness';

const ACCOUNT_IDS = ['a1', 'a2', 'a3'];
const CATEGORY_IDS = ['c1', 'c2', 'c3'];

async function freshWithEntities(): Promise<Db> {
  const db = openTestDb();
  await applyMigrations(db);
  for (const id of ACCOUNT_IDS) {
    const account: Account = {
      id, name: id, type: 'bank', icon: 'business', color: '#000', initialBalance: 1000,
      createdAt: new Date(0).toISOString(),
    };
    await insertAccount(db, account, 0);
  }
  for (const id of CATEGORY_IDS) {
    const category: Category = { id, name: id, icon: 'pricetag', color: '#000', kind: 'expense' };
    await insertCategory(db, category, 0);
  }
  return db;
}

/** Snapshot of every table the property test compares. */
interface Snapshot {
  rollup: string;
  balances: string;
  stats: string;
}

async function snapshot(db: Db): Promise<Snapshot> {
  const rollup = await db.getAllAsync(
    'SELECT * FROM rollup ORDER BY grain, bucket, account_id, category_id'
  );
  const balances = await db.getAllAsync('SELECT * FROM account_balance ORDER BY account_id');
  const stats = await db.getAllAsync('SELECT * FROM ledger_stat ORDER BY key');
  return {
    rollup: JSON.stringify(rollup),
    balances: JSON.stringify(balances),
    stats: JSON.stringify(stats),
  };
}

async function assertMatchesRebuild(db: Db): Promise<string | null> {
  const before = await snapshot(db);
  await rebuildRollups(db);
  const after = await snapshot(db);
  if (before.rollup !== after.rollup) return `rollup drifted from a full rebuild:\n  incremental: ${before.rollup}\n  rebuilt:     ${after.rollup}`;
  if (before.balances !== after.balances) return `account_balance drifted:\n  incremental: ${before.balances}\n  rebuilt:     ${after.balances}`;
  if (before.stats !== after.stats) return `ledger_stat drifted:\n  incremental: ${before.stats}\n  rebuilt:     ${after.stats}`;
  return null;
}

/** A deterministic PRNG-driven random transaction, for the mutation sequence. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function randomTx(rand: () => number, id: string): Transaction {
  const type: Transaction['type'] = rand() < 0.5 ? 'expense' : rand() < 0.7 ? 'income' : 'transfer';
  const accountId = ACCOUNT_IDS[Math.floor(rand() * ACCOUNT_IDS.length)];
  let toAccountId = ACCOUNT_IDS[Math.floor(rand() * ACCOUNT_IDS.length)];
  if (toAccountId === accountId) toAccountId = ACCOUNT_IDS[(ACCOUNT_IDS.indexOf(accountId) + 1) % ACCOUNT_IDS.length];
  const year = 2024 + Math.floor(rand() * 3);
  const month = Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 27);
  const date = new Date(year, month, day, Math.floor(rand() * 24), Math.floor(rand() * 60)).toISOString();

  return {
    id,
    type,
    amount: Math.round(rand() * 100000) / 100,
    accountId,
    toAccountId: type === 'transfer' ? toAccountId : undefined,
    categoryId: type === 'transfer' ? undefined : CATEGORY_IDS[Math.floor(rand() * CATEGORY_IDS.length)],
    date,
    createdAt: date,
  };
}

const CASES: Case[] = [
  {
    name: 'rollup totals match a plain JS reduce over the same ledger',
    run: async () => {
      const db = await freshWithEntities();
      const ledger = buildLedger(2000, { years: 3, accountIds: ACCOUNT_IDS, categoryIds: CATEGORY_IDS });
      for (const tx of ledger) await insertTransaction(db, tx);

      const refExpense = ledger.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const row = await db.getFirstAsync<{ total: number }>(
        "SELECT SUM(expense) AS total FROM rollup WHERE grain = 'M'"
      );
      const gotExpense = (row?.total ?? 0) / 100;
      return close('all-time expense total', gotExpense, refExpense, 0.5);
    },
  },
  {
    name: 'account balances from the rollup path match a plain JS reduce',
    run: async () => {
      const db = await freshWithEntities();
      const ledger = buildLedger(1500, { years: 2, accountIds: ACCOUNT_IDS, categoryIds: CATEGORY_IDS });
      for (const tx of ledger) await insertTransaction(db, tx);

      const ref = new Map(ACCOUNT_IDS.map(id => [id, 1000]));
      for (const t of ledger) {
        if (t.type === 'income') ref.set(t.accountId, (ref.get(t.accountId) ?? 0) + t.amount);
        else if (t.type === 'expense') ref.set(t.accountId, (ref.get(t.accountId) ?? 0) - t.amount);
        else {
          ref.set(t.accountId, (ref.get(t.accountId) ?? 0) - t.amount);
          if (t.toAccountId) ref.set(t.toAccountId, (ref.get(t.toAccountId) ?? 0) + t.amount);
        }
      }

      const got = await listAccountBalances(db);
      for (const id of ACCOUNT_IDS) {
        const err = close(`balance ${id}`, got.get(id) ?? 0, ref.get(id) ?? 0, 0.5);
        if (err) return err;
      }
      const refNet = [...ref.values()].reduce((s, v) => s + v, 0);
      const gotNet = await getNetWorth(db);
      return close('net worth', gotNet, refNet, 0.5);
    },
  },
  {
    name: 'PROPERTY: incremental rollup equals a full rebuild after every mutation in a long random sequence',
    run: async () => {
      const db = await freshWithEntities();
      const rand = makeRng(7);
      const liveIds: string[] = [];
      let nextId = 0;

      for (let step = 0; step < 400; step++) {
        const r = rand();

        if (liveIds.length === 0 || r < 0.5) {
          // insert
          const id = `p${nextId++}`;
          await insertTransaction(db, randomTx(rand, id));
          liveIds.push(id);
        } else if (r < 0.7) {
          // delete a random live transaction
          const idx = Math.floor(rand() * liveIds.length);
          const id = liveIds[idx];
          await deleteTransaction(db, id);
          liveIds.splice(idx, 1);
        } else {
          // edit a random live transaction — this is the case that most often
          // breaks hand-rolled aggregate maintenance: it can move the row
          // across month, category, account and even type all at once.
          const idx = Math.floor(rand() * liveIds.length);
          const id = liveIds[idx];
          await updateTransaction(db, randomTx(rand, id));
        }

        // Checking after every single step (rather than every N) is
        // deliberately expensive here: it means the failure message names
        // the exact mutation that broke invariants, not a window of 20.
        const drift = await assertMatchesRebuild(db);
        if (drift) return `at step ${step} (${liveIds.length} live rows): ${drift}`;
      }

      return null;
    },
  },
  {
    name: 'deleting all transactions returns every table to empty',
    run: async () => {
      const db = await freshWithEntities();
      const ledger = buildLedger(200, { years: 1, accountIds: ACCOUNT_IDS, categoryIds: CATEGORY_IDS });
      for (const tx of ledger) await insertTransaction(db, tx);
      for (const tx of ledger) await deleteTransaction(db, tx.id);

      const rollupRows = await db.getAllAsync('SELECT * FROM rollup');
      const balances = await db.getAllAsync<{ delta: number }>('SELECT delta FROM account_balance');
      const stat = await db.getFirstAsync<{ n: number; net: number }>(
        "SELECT n, net FROM ledger_stat WHERE key = 'all'"
      );
      const nonZeroBalance = balances.find(b => b.delta !== 0);
      return (
        eq('rollup rows gc-ed away', rollupRows.length, 0) ??
        (nonZeroBalance ? `a balance delta survived: ${JSON.stringify(nonZeroBalance)}` : null) ??
        eq('stat n', stat?.n, 0) ??
        eq('stat net', stat?.net, 0)
      );
    },
  },
];

runCases(CASES, 'rollup cases');
