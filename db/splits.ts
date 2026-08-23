/**
 * Split expense CRUD — tracking shared bills and their settlement.
 *
 * Data model:
 * - The original shared expense is a normal 'expense' transaction.
 * - `split_participants` tracks each person's share and their repayment status.
 * - Repayment transactions are regular 'income' entries with `split_expense_id`
 *   set to the original transaction's id, so they don't float as mystery income.
 *
 * The settlement status on a SplitParticipant is maintained explicitly so it
 * can be indexed and queried cheaply:
 *   pending  → paid_amount = 0
 *   partial  → 0 < paid_amount < share_amount
 *   paid     → paid_amount >= share_amount
 */

import { SplitParticipant, SplitStatus } from '@/types/finance';
import { generateId } from '@/utils/id';
import { dayKeyOf, monthKeyOf } from '@/utils/date';

import { Db, SplitParticipantRow } from './types';
import { applyRow } from './apply';
import { bumpDataVersion } from './version';

// ---- Row ↔ domain mapping --------------------------------------------------

function rowToParticipant(row: SplitParticipantRow): SplitParticipant {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    name: row.name,
    shareAmount: row.share_amount,
    paidAmount: row.paid_amount,
    status: row.status as SplitStatus,
    note: row.note ?? undefined,
    settledAt: row.settled_at ?? undefined,
    createdAt: row.created_at,
  };
}

// ---- Reads -----------------------------------------------------------------

export async function listSplitParticipants(
  db: Db,
  transactionId: string
): Promise<SplitParticipant[]> {
  const rows = await db.getAllAsync<SplitParticipantRow>(
    `SELECT * FROM split_participants WHERE transaction_id = ? ORDER BY created_at`,
    [transactionId]
  );
  return rows.map(rowToParticipant);
}

export async function getSplitSummary(db: Db): Promise<{
  totalOwed: number;
  totalSettled: number;
  pendingCount: number;
  partialCount: number;
}> {
  const row = await db.getFirstAsync<{
    total_owed: number;
    total_settled: number;
    pending_count: number;
    partial_count: number;
  }>(
    `SELECT
       COALESCE(SUM(share_amount), 0)                                    AS total_owed,
       COALESCE(SUM(paid_amount), 0)                                     AS total_settled,
       COUNT(*) FILTER (WHERE status = 'pending')                        AS pending_count,
       COUNT(*) FILTER (WHERE status = 'partial')                        AS partial_count
     FROM split_participants`
  );
  return {
    totalOwed: row?.total_owed ?? 0,
    totalSettled: row?.total_settled ?? 0,
    pendingCount: row?.pending_count ?? 0,
    partialCount: row?.partial_count ?? 0,
  };
}

/** Returns all split transactions that still have unpaid participants. */
export async function listUnsettledSplits(db: Db): Promise<Array<{
  transactionId: string;
  participants: SplitParticipant[];
  outstanding: number;
}>> {
  // Get distinct transaction IDs that have non-paid participants
  const txIds = await db.getAllAsync<{ transaction_id: string }>(
    `SELECT DISTINCT transaction_id
     FROM split_participants
     WHERE status != 'paid'
     ORDER BY created_at DESC`
  );

  return Promise.all(txIds.map(async ({ transaction_id }) => {
    const participants = await listSplitParticipants(db, transaction_id);
    const outstanding = participants.reduce(
      (sum, p) => sum + Math.max(0, p.shareAmount - p.paidAmount),
      0
    );
    return { transactionId: transaction_id, participants, outstanding };
  }));
}

// ---- Writes ----------------------------------------------------------------

export async function insertSplitParticipant(
  db: Db,
  participant: Omit<SplitParticipant, 'id' | 'paidAmount' | 'status' | 'createdAt'>
): Promise<SplitParticipant> {
  const now = new Date().toISOString();
  const full: SplitParticipant = {
    ...participant,
    id: generateId(),
    paidAmount: 0,
    status: 'pending',
    createdAt: now,
  };
  await db.runAsync(
    `INSERT INTO split_participants
       (id, transaction_id, name, share_amount, paid_amount, status, note, settled_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      full.id, full.transactionId, full.name,
      full.shareAmount, 0, 'pending',
      full.note ?? null, null, now,
    ]
  );
  return full;
}

export async function insertSplitParticipantsBatch(
  db: Db,
  participants: Omit<SplitParticipant, 'id' | 'paidAmount' | 'status' | 'createdAt'>[]
): Promise<SplitParticipant[]> {
  const now = new Date().toISOString();
  const result: SplitParticipant[] = [];
  await db.withTransaction(async txn => {
    for (const p of participants) {
      const full: SplitParticipant = {
        ...p,
        id: generateId(),
        paidAmount: 0,
        status: 'pending',
        createdAt: now,
      };
      await txn.runAsync(
        `INSERT INTO split_participants
           (id, transaction_id, name, share_amount, paid_amount, status, note, settled_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [full.id, full.transactionId, full.name, full.shareAmount, 0, 'pending', full.note ?? null, null, now]
      );
      result.push(full);
    }
  });
  return result;
}

/**
 * Records a (partial or full) repayment from a split participant.
 *
 * Creates a linked income transaction so the repayment shows up in the
 * transaction list but is visually tied to the original shared expense.
 * Updates the participant's paid_amount and status atomically.
 *
 * Returns the ID of the created income transaction.
 */
export async function recordRepayment(
  db: Db,
  opts: {
    participantId: string;
    amount: number;
    /** The account that receives the repayment (same as original expense account by default). */
    accountId: string;
    note?: string;
    /** ISO date string for the repayment. Defaults to today. */
    date?: string;
  }
): Promise<string> {
  const dateStr = opts.date ?? new Date().toISOString().slice(0, 10);

  // Read current participant state
  const row = await db.getFirstAsync<SplitParticipantRow>(
    'SELECT * FROM split_participants WHERE id = ?',
    [opts.participantId]
  );
  if (!row) throw new Error(`Split participant ${opts.participantId} not found`);

  const newPaid = Math.min(row.paid_amount + opts.amount, row.share_amount);
  const newStatus: SplitStatus =
    newPaid >= row.share_amount ? 'paid' :
    newPaid > 0 ? 'partial' :
    'pending';

  const incomeId = generateId();
  const now = new Date().toISOString();

  await db.withTransaction(async txn => {
    // 1. Create the linked income transaction
    await txn.runAsync(
      `INSERT INTO transactions
         (id, type, amount, account_id, to_account_id, category_id,
          note, date, date_ms, month_key, day_key, note_lc,
          created_at, split_expense_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        incomeId, 'income', opts.amount, opts.accountId, null, null,
        opts.note ?? `Repayment from ${row.name}`,
        dateStr, new Date(dateStr).getTime(),
        monthKeyOf(dateStr), dayKeyOf(dateStr),
        (opts.note ?? '').toLowerCase() || null,
        now, row.transaction_id,
      ]
    );

    // 2. Update rollup for the income
    await applyRow(txn, {
      type: 'income',
      amount: opts.amount,
      accountId: opts.accountId,
      toAccountId: null,
      categoryId: null,
      monthKey: monthKeyOf(dateStr),
      dayKey: dayKeyOf(dateStr),
    });

    // 3. Update participant status
    await txn.runAsync(
      `UPDATE split_participants
       SET paid_amount = ?, status = ?, settled_at = ?
       WHERE id = ?`,
      [
        newPaid,
        newStatus,
        newStatus === 'paid' ? now : null,
        opts.participantId,
      ]
    );
  });

  await bumpDataVersion();
  return incomeId;
}

export async function updateParticipantNote(
  db: Db,
  participantId: string,
  note: string
): Promise<void> {
  await db.runAsync(
    'UPDATE split_participants SET note = ? WHERE id = ?',
    [note, participantId]
  );
}

export async function deleteSplitParticipant(db: Db, participantId: string): Promise<void> {
  await db.runAsync('DELETE FROM split_participants WHERE id = ?', [participantId]);
}
