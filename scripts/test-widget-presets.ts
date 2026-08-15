/**
 * Checks the rules behind one-tap widget logging. A tap writes a real
 * transaction with no confirmation step, so these guards matter: a preset must
 * never produce a malformed entry, and it has to survive the account or
 * category it referenced being deleted.
 *
 * Run with: npm run test:widget
 */

import { buildPresetTransaction } from '../utils/widget-data';
import { Account, Category, FinanceState, QuickPreset } from '../types/finance';

const NOW = new Date(2026, 7, 15, 12, 0, 0);

const account = (id: string, archived = false): Account => ({
  id,
  name: `Account ${id}`,
  type: 'bank',
  icon: 'business-outline',
  color: '#3B82F6',
  initialBalance: 0,
  createdAt: NOW.toISOString(),
  archived,
});

const category = (id: string, kind: 'expense' | 'income'): Category => ({
  id,
  name: `Category ${id}`,
  icon: 'cart',
  color: '#5CB98F',
  kind,
});

function makeState(overrides: Partial<FinanceState> = {}): FinanceState {
  return {
    accounts: [account('acc1'), account('acc2')],
    categories: [category('cat1', 'expense'), category('cat2', 'income')],
    transactions: [],
    budgets: [],
    quickPresets: [],
    settings: { currency: 'INR', hasOnboarded: true },
    isLoaded: true,
    ...overrides,
  };
}

const preset = (overrides: Partial<QuickPreset> = {}): QuickPreset => ({
  id: 'p1',
  label: 'Coffee',
  emoji: '☕',
  amount: 50,
  type: 'expense',
  categoryId: 'cat1',
  accountId: 'acc1',
  ...overrides,
});

interface Case {
  name: string;
  run: () => string | null;
}

const expect = (label: string, actual: unknown, expected: unknown): string | null =>
  actual === expected ? null : `${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;

const CASES: Case[] = [
  {
    name: 'builds a complete transaction from a valid preset',
    run: () => {
      const t = buildPresetTransaction(makeState(), preset(), NOW);
      return (
        expect('amount', t?.amount, 50) ??
        expect('type', t?.type, 'expense') ??
        expect('accountId', t?.accountId, 'acc1') ??
        expect('categoryId', t?.categoryId, 'cat1') ??
        expect('note', t?.note, 'Coffee') ??
        expect('date', t?.date, NOW.toISOString())
      );
    },
  },
  {
    name: 'rejects a zero amount',
    run: () => expect('result', buildPresetTransaction(makeState(), preset({ amount: 0 }), NOW), null),
  },
  {
    name: 'rejects a negative amount',
    run: () => expect('result', buildPresetTransaction(makeState(), preset({ amount: -10 }), NOW), null),
  },
  {
    name: 'falls back to the first account when the preset account is gone',
    run: () => {
      const t = buildPresetTransaction(makeState(), preset({ accountId: 'deleted' }), NOW);
      return expect('accountId', t?.accountId, 'acc1');
    },
  },
  {
    name: 'skips archived accounts when falling back',
    run: () => {
      const state = makeState({ accounts: [account('old', true), account('live')] });
      const t = buildPresetTransaction(state, preset({ accountId: 'deleted' }), NOW);
      return expect('accountId', t?.accountId, 'live');
    },
  },
  {
    name: 'returns null when no usable account exists',
    run: () => {
      const state = makeState({ accounts: [account('old', true)] });
      return expect('result', buildPresetTransaction(state, preset(), NOW), null);
    },
  },
  {
    name: 'drops a category that no longer exists rather than writing a dangling id',
    run: () => {
      const t = buildPresetTransaction(makeState(), preset({ categoryId: 'gone' }), NOW);
      return expect('categoryId', t?.categoryId, undefined);
    },
  },
  {
    name: 'drops a category whose kind no longer matches the preset type',
    run: () => {
      // cat2 is an income category, so an expense preset must not keep it.
      const t = buildPresetTransaction(makeState(), preset({ categoryId: 'cat2' }), NOW);
      return expect('categoryId', t?.categoryId, undefined);
    },
  },
  {
    name: 'supports income presets',
    run: () => {
      const t = buildPresetTransaction(
        makeState(),
        preset({ type: 'income', categoryId: 'cat2' }),
        NOW
      );
      return expect('type', t?.type, 'income') ?? expect('categoryId', t?.categoryId, 'cat2');
    },
  },
];

let failures = 0;
for (const testCase of CASES) {
  const failure = testCase.run();
  if (failure) {
    failures += 1;
    console.log(`FAIL  ${testCase.name}\n        ${failure}`);
  } else {
    console.log(`ok    ${testCase.name}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${CASES.length} widget preset cases passed.`);
