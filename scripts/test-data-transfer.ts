/**
 * Guards the import validator. A bad import writes straight over someone's
 * ledger, so every one of these is a case where the wrong behaviour would be
 * silent data loss or silently wrong balances.
 *
 * Run with: npm run test:transfer
 */

import { EXPORT_FORMAT_VERSION, mergeData, parseExport, summarize } from '../utils/data-transfer';
import { PersistedFinanceState } from '../storage/storage';

const baseData: PersistedFinanceState = {
  accounts: [
    {
      id: 'a1',
      name: 'Main',
      type: 'bank',
      icon: 'business-outline',
      color: '#3B82F6',
      initialBalance: 1000,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  categories: [
    { id: 'c1', name: 'Food', icon: 'restaurant', color: '#EE8A5B', kind: 'expense' },
  ],
  transactions: [
    {
      id: 't1',
      type: 'expense',
      amount: 50,
      accountId: 'a1',
      categoryId: 'c1',
      date: '2026-08-01T10:00:00.000Z',
      createdAt: '2026-08-01T10:00:00.000Z',
    },
  ],
  budgets: [{ id: 'b1', categoryId: 'c1', monthlyLimit: 500, createdAt: '2026-01-01T00:00:00.000Z' }],
  quickPresets: [
    { id: 'p1', label: 'Coffee', emoji: '☕', amount: 50, type: 'expense', categoryId: 'c1' },
  ],
  settings: { currency: 'INR', hasOnboarded: true },
};

const wrap = (data: unknown, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'mercury-finance-export',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: '2026-08-16T00:00:00.000Z',
    data,
    ...overrides,
  });

interface Case {
  name: string;
  run: () => string | null;
}

const eq = (label: string, a: unknown, b: unknown): string | null =>
  a === b ? null : `${label}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`;

const CASES: Case[] = [
  {
    name: 'accepts a well-formed export and round-trips every record',
    run: () => {
      const r = parseExport(wrap(baseData));
      if (!r.ok) return `rejected: ${r.reason}`;
      return (
        eq('accounts', r.summary.accounts, 1) ??
        eq('transactions', r.summary.transactions, 1) ??
        eq('budgets', r.summary.budgets, 1) ??
        eq('presets', r.summary.presets, 1) ??
        eq('currency', r.data.settings.currency, 'INR')
      );
    },
  },
  {
    name: 'rejects malformed JSON',
    run: () => {
      const r = parseExport('{not json');
      return r.ok ? 'accepted invalid JSON' : null;
    },
  },
  {
    name: 'rejects a file that is not a Mercury export',
    run: () => {
      const r = parseExport(JSON.stringify({ some: 'other app' }));
      return r.ok ? 'accepted a foreign file' : null;
    },
  },
  {
    name: 'rejects a backup from a newer format version',
    run: () => {
      const r = parseExport(wrap(baseData, { version: EXPORT_FORMAT_VERSION + 1 }));
      if (r.ok) return 'accepted a future version';
      return r.reason.includes('newer version') ? null : `unhelpful reason: ${r.reason}`;
    },
  },
  {
    name: 'rejects a backup with no usable accounts',
    run: () => {
      const r = parseExport(wrap({ ...baseData, accounts: [] }));
      return r.ok ? 'accepted an accountless backup' : null;
    },
  },
  {
    name: 'drops a transaction whose account is missing rather than mis-attributing it',
    run: () => {
      const r = parseExport(
        wrap({
          ...baseData,
          transactions: [
            ...baseData.transactions,
            { ...baseData.transactions[0], id: 't2', accountId: 'ghost' },
          ],
        })
      );
      if (!r.ok) return `rejected: ${r.reason}`;
      return eq('transactions kept', r.summary.transactions, 1);
    },
  },
  {
    name: 'drops a transfer that has no valid destination account',
    run: () => {
      const r = parseExport(
        wrap({
          ...baseData,
          transactions: [
            { ...baseData.transactions[0], id: 't3', type: 'transfer', toAccountId: 'ghost' },
          ],
        })
      );
      if (!r.ok) return `rejected: ${r.reason}`;
      return eq('transactions kept', r.summary.transactions, 0);
    },
  },
  {
    name: 'drops records with a non-numeric amount',
    run: () => {
      const r = parseExport(
        wrap({
          ...baseData,
          transactions: [{ ...baseData.transactions[0], id: 't4', amount: 'lots' }],
        })
      );
      if (!r.ok) return `rejected: ${r.reason}`;
      return eq('transactions kept', r.summary.transactions, 0);
    },
  },
  {
    name: 'drops a transaction with an unparseable date',
    run: () => {
      const r = parseExport(
        wrap({
          ...baseData,
          transactions: [{ ...baseData.transactions[0], id: 't5', date: 'sometime' }],
        })
      );
      if (!r.ok) return `rejected: ${r.reason}`;
      return eq('transactions kept', r.summary.transactions, 0);
    },
  },
  {
    name: 'tolerates an older export with no quickPresets field',
    run: () => {
      const { quickPresets, ...withoutPresets } = baseData;
      const r = parseExport(wrap(withoutPresets));
      if (!r.ok) return `rejected: ${r.reason}`;
      return eq('presets', r.summary.presets, 0);
    },
  },
  {
    name: 'merging the same backup twice does not duplicate anything',
    run: () => {
      const once = mergeData(baseData, baseData);
      const twice = mergeData(once, baseData);
      return (
        eq('accounts', summarize(twice).accounts, 1) ??
        eq('transactions', summarize(twice).transactions, 1) ??
        eq('budgets', summarize(twice).budgets, 1)
      );
    },
  },
  {
    name: 'merge keeps both sides when ids differ',
    run: () => {
      const incoming: PersistedFinanceState = {
        ...baseData,
        accounts: [{ ...baseData.accounts[0], id: 'a2', name: 'Second' }],
        transactions: [{ ...baseData.transactions[0], id: 't9', accountId: 'a2' }],
      };
      const merged = mergeData(baseData, incoming);
      return (
        eq('accounts', summarize(merged).accounts, 2) ??
        eq('transactions', summarize(merged).transactions, 2)
      );
    },
  },
  {
    name: 'merge drops incoming transactions whose account survived on neither side',
    run: () => {
      const incoming: PersistedFinanceState = {
        ...baseData,
        accounts: [],
        transactions: [{ ...baseData.transactions[0], id: 't10', accountId: 'ghost' }],
      };
      const merged = mergeData(baseData, incoming);
      return eq('transactions', summarize(merged).transactions, 1);
    },
  },
  {
    name: 'merge preserves the current settings rather than overwriting them',
    run: () => {
      const incoming: PersistedFinanceState = {
        ...baseData,
        settings: { currency: 'USD', hasOnboarded: true },
      };
      const merged = mergeData(baseData, incoming);
      return eq('currency', merged.settings.currency, 'INR');
    },
  },
  {
    name: 'import preserves numberFormat instead of silently dropping it',
    run: () => {
      // Regression: parseExport used to rebuild settings as
      // `{ currency, hasOnboarded: true }`, so every backup round-trip reset
      // the user's digit grouping back to the default.
      const file = {
        format: 'mercury-finance-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: { ...baseData, settings: { currency: 'USD', numberFormat: 'indian', hasOnboarded: true } },
      };
      const parsed = parseExport(JSON.stringify(file));
      if (!parsed.ok) return `expected ok, got ${parsed.reason}`;
      return (
        eq('currency', parsed.data.settings.currency, 'USD') ??
        eq('numberFormat', parsed.data.settings.numberFormat, 'indian')
      );
    },
  },
  {
    name: 'import ignores a numberFormat value outside the allowed union',
    run: () => {
      const file = {
        format: 'mercury-finance-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: { ...baseData, settings: { currency: 'USD', numberFormat: 'martian', hasOnboarded: true } },
      };
      const parsed = parseExport(JSON.stringify(file));
      if (!parsed.ok) return `expected ok, got ${parsed.reason}`;
      return eq('numberFormat', parsed.data.settings.numberFormat, undefined);
    },
  },
  {
    name: 'import respects an explicit hasOnboarded false rather than hardcoding true',
    run: () => {
      const file = {
        format: 'mercury-finance-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: { ...baseData, settings: { currency: 'USD', hasOnboarded: false } },
      };
      const parsed = parseExport(JSON.stringify(file));
      if (!parsed.ok) return `expected ok, got ${parsed.reason}`;
      return eq('hasOnboarded', parsed.data.settings.hasOnboarded, false);
    },
  },
];

let failures = 0;
for (const c of CASES) {
  const failure = c.run();
  if (failure) {
    failures += 1;
    console.log(`FAIL  ${c.name}\n        ${failure}`);
  } else {
    console.log(`ok    ${c.name}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} data-transfer cases passed.`);
