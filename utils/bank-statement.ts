/**
 * Bank statement CSV parser — pure logic, no DB, no React Native imports.
 *
 * Supports auto-detecting common Indian bank CSV formats (SBI, HDFC, ICICI,
 * Axis, Kotak, IndusInd) and generic international formats. Falls back to
 * manual column mapping when detection fails.
 *
 * Usage:
 *   1. Read CSV rows via utils/csv-stream.ts
 *   2. Call detectBankFormat(headers) → BankFormat | null
 *   3. Call parseBankRow(row, format) for each data row → ParsedBankTransaction | null
 *   4. Pass parsed rows to db/bank-import.ts for dedup + bulk insert
 */

// ---- Types -----------------------------------------------------------------

export type AmountLayout =
  /** Separate debit and credit columns (most Indian banks) */
  | { kind: 'split'; debitCol: string; creditCol: string }
  /** Single amount column; sign determines direction (positive = credit/income) */
  | { kind: 'signed'; amountCol: string; positiveIsCredit: boolean }
  /** Single amount column + a separate Dr/Cr column */
  | { kind: 'withIndicator'; amountCol: string; indicatorCol: string };

export interface BankFormat {
  /** How this format was identified (for display in the mapping UI). */
  bankName: string;
  /** Column name in the CSV that contains the transaction date. */
  dateCol: string;
  /** Column name in the CSV that contains the description/narration. */
  descriptionCol: string;
  amountLayout: AmountLayout;
  /** Optional balance column (informational only, not imported). */
  balanceCol?: string;
  /** Date format hint — auto-detected from the first data row if not set. */
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-Mon-YY' | 'DD-MM-YYYY';
}

export interface ParsedBankTransaction {
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Amount in smallest unit (stored as float, same as transactions.amount) */
  amount: number;
  /** 'income' when money came in, 'expense' when money went out */
  direction: 'income' | 'expense';
  /** Raw description from the bank — becomes the transaction note */
  description: string;
  /** A fingerprint used for duplicate detection: `${date}|${amount}|${direction}` */
  fingerprint: string;
}

// ---- Date parsing ----------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses a bank date string into an ISO YYYY-MM-DD string.
 * Tries multiple formats in order of likelihood for Indian bank exports.
 */
export function parseBankDate(raw: string): string | null {
  const s = raw.trim().replace(/\./g, '/');

  // YYYY-MM-DD (ISO, trivial)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const mm = m.padStart(2, '0');
    const dd = d.padStart(2, '0');
    // Heuristic: if month > 12, it's actually day/month swapped → treat as MM/DD
    if (parseInt(m) > 12) {
      return `${y}-${dd}-${mm}`;
    }
    return `${y}-${mm}-${dd}`;
  }

  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-Mon-YY or DD-Mon-YYYY (e.g. "15-Jan-24" or "15-Jan-2024")
  const monYear = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/);
  if (monYear) {
    const [, d, mon, y] = monYear;
    const month = MONTHS[mon.toLowerCase()];
    if (month !== undefined) {
      const year = y.length === 2 ? (parseInt(y) < 50 ? `20${y}` : `19${y}`) : y;
      return `${year}-${String(month + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Parses an amount string, stripping currency symbols, commas, and spaces.
 * Returns null if the value is empty, non-numeric, or zero.
 */
export function parseBankAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[₹$€£,\s]/g, '').replace(/\(([^)]+)\)/, '-$1');
  if (!cleaned || cleaned === '-') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) || n === 0 ? null : n;
}

// ---- Format detection ------------------------------------------------------

/** Normalizes a column header for comparison (lowercase, trimmed, no punctuation). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type ColMatcher = (h: string) => boolean;

const is: Record<string, ColMatcher> = {
  date: h => /date|dt/.test(norm(h)),
  desc: h => /narration|description|particulars|remarks|details|payee|beneficiary/.test(norm(h)),
  debit: h => /debit|dr|withdrawal|withdrawalamount/.test(norm(h)) && !/credit/.test(norm(h)),
  credit: h => /credit|cr|deposit|depositamount/.test(norm(h)) && !/debit/.test(norm(h)),
  amount: h => norm(h) === 'amount' || norm(h) === 'transactionamount',
  drcrIndicator: h => /drcr|type|indicator/.test(norm(h)),
  balance: h => /balance|closing/.test(norm(h)),
};

function findCol(headers: string[], matcher: ColMatcher): string | undefined {
  return headers.find(matcher);
}

/**
 * Attempts to auto-detect the bank CSV format from the header row.
 *
 * Returns a `BankFormat` for known layouts, or `null` if the headers don't
 * match any known pattern — in that case the UI will prompt manual mapping.
 */
export function detectBankFormat(headers: string[]): BankFormat | null {
  const h = headers;

  const dateCol = findCol(h, is.date);
  const descriptionCol = findCol(h, is.desc);

  if (!dateCol || !descriptionCol) return null;

  const debitCol = findCol(h, is.debit);
  const creditCol = findCol(h, is.credit);
  const amountCol = findCol(h, is.amount);
  const indicatorCol = findCol(h, is.drcrIndicator);
  const balanceCol = findCol(h, is.balance);

  // Split debit/credit columns (SBI, HDFC, Axis, Kotak style)
  if (debitCol && creditCol) {
    return {
      bankName: 'Auto-detected (Debit/Credit columns)',
      dateCol,
      descriptionCol,
      amountLayout: { kind: 'split', debitCol, creditCol },
      balanceCol,
    };
  }

  // Single amount + Dr/Cr indicator (ICICI style)
  if (amountCol && indicatorCol) {
    return {
      bankName: 'Auto-detected (Amount + Dr/Cr indicator)',
      dateCol,
      descriptionCol,
      amountLayout: { kind: 'withIndicator', amountCol, indicatorCol },
      balanceCol,
    };
  }

  // Single signed amount column
  if (amountCol) {
    return {
      bankName: 'Auto-detected (Signed amount)',
      dateCol,
      descriptionCol,
      amountLayout: { kind: 'signed', amountCol, positiveIsCredit: true },
      balanceCol,
    };
  }

  return null;
}

/**
 * Returns a list of known column-name variants for the mapping UI, grouped
 * by field. Helps users pick the right column when auto-detection fails.
 */
export const COMMON_COLUMN_PATTERNS = {
  date: ['Date', 'Transaction Date', 'Value Date', 'Txn Date', 'Dt'],
  description: ['Narration', 'Description', 'Particulars', 'Remarks', 'Details', 'Beneficiary'],
  debit: ['Debit', 'Dr', 'Withdrawal Amount', 'Debit Amount'],
  credit: ['Credit', 'Cr', 'Deposit Amount', 'Credit Amount'],
  amount: ['Amount', 'Transaction Amount'],
  drCr: ['Dr/Cr', 'Type', 'Indicator'],
} as const;

// ---- Row parsing ------------------------------------------------------------

/**
 * Parses a single CSV data row into a `ParsedBankTransaction` using a
 * detected or manually-specified format.
 *
 * Returns null for rows that are empty, header-like, or represent a
 * zero-amount / balance-only entry.
 */
export function parseBankRow(
  row: Record<string, string>,
  format: BankFormat
): ParsedBankTransaction | null {
  const dateStr = parseBankDate(row[format.dateCol] ?? '');
  if (!dateStr) return null;

  const description = (row[format.descriptionCol] ?? '').trim();
  if (!description) return null;

  // Skip rows that look like running-balance or opening-balance summaries
  if (/opening balance|closing balance|brought forward/i.test(description)) return null;

  let amount: number | null = null;
  let direction: 'income' | 'expense' = 'expense';

  const layout = format.amountLayout;

  if (layout.kind === 'split') {
    const debitAmt = parseBankAmount(row[layout.debitCol] ?? '');
    const creditAmt = parseBankAmount(row[layout.creditCol] ?? '');
    if (debitAmt != null && debitAmt > 0) {
      amount = debitAmt;
      direction = 'expense';
    } else if (creditAmt != null && creditAmt > 0) {
      amount = creditAmt;
      direction = 'income';
    }
  } else if (layout.kind === 'withIndicator') {
    amount = parseBankAmount(row[layout.amountCol] ?? '');
    if (amount == null) return null;
    amount = Math.abs(amount);
    const indicator = (row[layout.indicatorCol] ?? '').trim().toLowerCase();
    direction = indicator === 'cr' || indicator === 'credit' ? 'income' : 'expense';
  } else if (layout.kind === 'signed') {
    const raw = parseBankAmount(row[layout.amountCol] ?? '');
    if (raw == null) return null;
    amount = Math.abs(raw);
    const isPositive = raw > 0;
    direction = (isPositive === layout.positiveIsCredit) ? 'income' : 'expense';
  }

  if (amount == null || amount <= 0) return null;

  const fingerprint = `${dateStr}|${amount.toFixed(2)}|${direction}`;

  return { date: dateStr, amount, direction, description, fingerprint };
}

// ---- Split method helpers --------------------------------------------------

export type SplitMethod = 'equal' | 'custom' | 'percentage';

/**
 * Splits a total amount among N participants using the chosen method.
 * Returns an array of per-participant amounts (in the same currency unit).
 *
 * equal: distributes evenly; any rounding remainder goes to the last participant
 * percentage: [values] are interpreted as percentages (must sum ≤ 100)
 * custom: [values] are the exact amounts (must sum ≤ total)
 */
export function calculateSplitShares(
  total: number,
  method: SplitMethod,
  participantCount: number,
  values?: number[]
): number[] {
  if (method === 'equal') {
    const base = Math.floor((total / participantCount) * 100) / 100;
    const shares = Array(participantCount).fill(base);
    const remainder = parseFloat((total - base * participantCount).toFixed(2));
    shares[shares.length - 1] = parseFloat((shares[shares.length - 1] + remainder).toFixed(2));
    return shares;
  }

  if (!values || values.length !== participantCount) {
    throw new Error(`Expected ${participantCount} values for ${method} split`);
  }

  if (method === 'percentage') {
    return values.map(pct => parseFloat(((pct / 100) * total).toFixed(2)));
  }

  // custom
  return values.map(v => parseFloat(v.toFixed(2)));
}
