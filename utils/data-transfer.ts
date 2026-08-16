/**
 * Export and import of everything Mercury stores.
 *
 * This half is pure: format, validation and merge rules, with no file or
 * native imports, so it can be exercised directly by `npm run test:transfer`.
 * The file and share-sheet plumbing lives in `data-transfer-io.ts`.
 *
 * Import is deliberately strict. A malformed or hand-edited file must be
 * rejected with a reason rather than half-applied, because the alternative is
 * a corrupted ledger, so every record is validated before anything is written.
 */

import {
  Account,
  AccountType,
  Budget,
  Category,
  CategoryKind,
  QuickPreset,
  Transaction,
  TransactionType,
} from '@/types/finance';
import { PersistedFinanceState } from '@/storage/storage';

/**
 * Bumped only for a breaking shape change. Import accepts any version it knows
 * how to read, so older exports keep working.
 */
export const EXPORT_FORMAT_VERSION = 1;

export interface MercuryExport {
  format: 'mercury-finance-export';
  version: number;
  exportedAt: string;
  appVersion?: string;
  data: PersistedFinanceState;
}

export interface ExportSummary {
  accounts: number;
  transactions: number;
  budgets: number;
  categories: number;
  presets: number;
}

export function summarize(data: PersistedFinanceState): ExportSummary {
  return {
    accounts: data.accounts.length,
    transactions: data.transactions.length,
    budgets: data.budgets.length,
    categories: data.categories.length,
    presets: data.quickPresets?.length ?? 0,
  };
}

/* ------------------------------------------------------------------ import */

export type ImportResult =
  | { ok: true; data: PersistedFinanceState; summary: ExportSummary }
  | { ok: false; reason: string }
  | { ok: false; cancelled: true; reason: string };

const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'card', 'wallet', 'other'];
const TRANSACTION_TYPES: TransactionType[] = ['income', 'expense', 'transfer'];
const CATEGORY_KINDS: CategoryKind[] = ['income', 'expense'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Anything that fails validation is dropped rather than guessed at. */
function parseAccounts(raw: unknown): Account[] {
  if (!Array.isArray(raw)) return [];
  const out: Account[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = str(item.id);
    const name = str(item.name);
    const initialBalance = num(item.initialBalance);
    if (!id || !name || initialBalance === undefined) continue;
    out.push({
      id,
      name,
      type: ACCOUNT_TYPES.includes(item.type as AccountType) ? (item.type as AccountType) : 'other',
      icon: (str(item.icon) ?? 'ellipse-outline') as Account['icon'],
      color: str(item.color) ?? '#64748B',
      initialBalance,
      createdAt: str(item.createdAt) ?? new Date().toISOString(),
      archived: item.archived === true ? true : undefined,
    });
  }
  return out;
}

function parseCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const out: Category[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = str(item.id);
    const name = str(item.name);
    if (!id || !name) continue;
    out.push({
      id,
      name,
      icon: (str(item.icon) ?? 'ellipsis-horizontal-circle') as Category['icon'],
      color: str(item.color) ?? '#9A93AC',
      kind: CATEGORY_KINDS.includes(item.kind as CategoryKind)
        ? (item.kind as CategoryKind)
        : 'expense',
      isDefault: item.isDefault === true ? true : undefined,
    });
  }
  return out;
}

function parseTransactions(raw: unknown, accountIds: Set<string>): Transaction[] {
  if (!Array.isArray(raw)) return [];
  const out: Transaction[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = str(item.id);
    const amount = num(item.amount);
    const accountId = str(item.accountId);
    const date = str(item.date);
    const type = item.type as TransactionType;
    if (!id || amount === undefined || !accountId || !date) continue;
    if (!TRANSACTION_TYPES.includes(type)) continue;
    // A transaction pointing at an account that is not in the file would make
    // every balance wrong, so it is dropped rather than silently mis-attributed.
    if (!accountIds.has(accountId)) continue;
    if (Number.isNaN(Date.parse(date))) continue;

    const toAccountId = str(item.toAccountId);
    if (type === 'transfer' && (!toAccountId || !accountIds.has(toAccountId))) continue;

    out.push({
      id,
      type,
      amount,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId: type === 'transfer' ? undefined : str(item.categoryId),
      date,
      note: str(item.note),
      createdAt: str(item.createdAt) ?? date,
    });
  }
  return out;
}

function parseBudgets(raw: unknown): Budget[] {
  if (!Array.isArray(raw)) return [];
  const out: Budget[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = str(item.id);
    const categoryId = str(item.categoryId);
    const monthlyLimit = num(item.monthlyLimit);
    if (!id || !categoryId || monthlyLimit === undefined) continue;
    out.push({ id, categoryId, monthlyLimit, createdAt: str(item.createdAt) ?? new Date().toISOString() });
  }
  return out;
}

function parsePresets(raw: unknown): QuickPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickPreset[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = str(item.id);
    const label = str(item.label);
    const amount = num(item.amount);
    if (!id || !label || amount === undefined) continue;
    out.push({
      id,
      label,
      emoji: str(item.emoji) ?? '✨',
      amount,
      type: item.type === 'income' ? 'income' : 'expense',
      categoryId: str(item.categoryId),
      accountId: str(item.accountId),
    });
  }
  return out;
}

/**
 * Validates a decoded export. Exported separately from the file picker so the
 * rules can be tested without a device.
 */
export function parseExport(rawText: string): ImportResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawText);
  } catch {
    return { ok: false, reason: "That file isn't valid JSON." };
  }

  if (!isRecord(decoded)) {
    return { ok: false, reason: 'That file does not contain Mercury data.' };
  }

  if (decoded.format !== 'mercury-finance-export') {
    return { ok: false, reason: 'That file was not exported from Mercury.' };
  }

  const version = num(decoded.version) ?? 0;
  if (version > EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      reason: 'That backup was made by a newer version of Mercury. Update the app and try again.',
    };
  }

  if (!isRecord(decoded.data)) {
    return { ok: false, reason: 'That backup is missing its data section.' };
  }

  const raw = decoded.data;
  const accounts = parseAccounts(raw.accounts);
  if (accounts.length === 0) {
    return { ok: false, reason: 'That backup contains no usable accounts.' };
  }

  const accountIds = new Set(accounts.map(a => a.id));
  const categories = parseCategories(raw.categories);
  const transactions = parseTransactions(raw.transactions, accountIds);
  const budgets = parseBudgets(raw.budgets);
  const quickPresets = parsePresets(raw.quickPresets);

  const settings = isRecord(raw.settings) ? raw.settings : {};

  const data: PersistedFinanceState = {
    accounts,
    categories,
    transactions,
    budgets,
    quickPresets,
    settings: {
      currency: str(settings.currency) ?? 'INR',
      hasOnboarded: true,
    },
  };

  return { ok: true, data, summary: summarize(data) };
}

/**
 * Merges an imported ledger into what is already stored.
 *
 * Records are matched by id: anything already present is left alone, so
 * importing the same backup twice is a no-op rather than a way to double every
 * balance. Transactions referencing accounts that survive neither side are
 * dropped for the same reason as during parsing.
 */
export function mergeData(
  current: PersistedFinanceState,
  incoming: PersistedFinanceState
): PersistedFinanceState {
  const mergeById = <T extends { id: string }>(existing: T[], added: T[]): T[] => {
    const seen = new Set(existing.map(item => item.id));
    return [...existing, ...added.filter(item => !seen.has(item.id))];
  };

  const accounts = mergeById(current.accounts, incoming.accounts);
  const accountIds = new Set(accounts.map(a => a.id));

  return {
    accounts,
    categories: mergeById(current.categories, incoming.categories),
    transactions: mergeById(current.transactions, incoming.transactions).filter(t =>
      accountIds.has(t.accountId)
    ),
    budgets: mergeById(current.budgets, incoming.budgets),
    quickPresets: mergeById(current.quickPresets ?? [], incoming.quickPresets ?? []),
    settings: current.settings,
  };
}
