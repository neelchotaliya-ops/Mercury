/**
 * Checks the pure layout helpers that make the widgets resizable.
 * RemoteViews has no flex-wrap, so column/row counts and which extra detail
 * (account lines, account breakdown rows) fits at a given size are decided in
 * plain JS ahead of render. These rules are what "resizable" actually means
 * here, so they're worth guarding directly rather than only eyeballing a
 * device.
 *
 * Run with: npm run test:layout
 */

import {
  accountRowCapacity,
  chunk,
  quickLogSizeClass,
  resolvePresetAccount,
  shortAccountName,
} from '../widgets/widget-format';
import { WidgetAccountBalance } from '../utils/widget-data';

interface Case {
  name: string;
  run: () => string | null;
}

const expect = (label: string, actual: unknown, expected: unknown): string | null =>
  actual === expected ? null : `${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;

const account = (id: string, balance: number): WidgetAccountBalance => ({
  id,
  name: `Account ${id}`,
  color: '#8B5CF6',
  balance,
});

const CASES: Case[] = [
  {
    name: 'minimum widget size gives the original 1-row, 2-column layout',
    run: () => {
      const c = quickLogSizeClass(250, 110);
      return (
        expect('columns', c.columns, 2) ??
        expect('rows', c.rows, 1) ??
        expect('showAccountLine', c.showAccountLine, false)
      );
    },
  },
  {
    name: 'a wide but short widget gets more columns without a second row',
    run: () => {
      const c = quickLogSizeClass(420, 110);
      return expect('columns', c.columns, 4) ?? expect('rows', c.rows, 1);
    },
  },
  {
    name: 'resizing taller adds a second row',
    run: () => {
      const c = quickLogSizeClass(250, 180);
      return expect('rows', c.rows, 2);
    },
  },
  {
    name: 'enough height per row reveals the account line',
    run: () => {
      // Two rows over 200dp gives 100dp per row, clearing the 95dp bar.
      const c = quickLogSizeClass(250, 200);
      return expect('showAccountLine', c.showAccountLine, true);
    },
  },
  {
    name: 'chunk splits a preset list into fixed-size rows',
    run: () => {
      const rows = chunk([1, 2, 3, 4, 5], 2);
      return expect('rows', JSON.stringify(rows), JSON.stringify([[1, 2], [3, 4], [5]]));
    },
  },
  {
    name: 'chunk returns nothing for an empty list',
    run: () => expect('rows', chunk([], 3).length, 0),
  },
  {
    name: 'minimum QuickActions height fits no account rows',
    run: () => expect('capacity', accountRowCapacity(140), 0),
  },
  {
    name: 'a taller QuickActions widget fits a growing number of account rows',
    run: () => {
      const at220 = accountRowCapacity(220);
      const at320 = accountRowCapacity(320);
      return (
        expect('capacity@220', at220, 0) ??
        (at320 > at220 ? null : `capacity should grow with height: ${at220} -> ${at320}`)
      );
    },
  },
  {
    name: 'account row capacity is capped at 4 regardless of extra height',
    run: () => expect('capacity', accountRowCapacity(1000), 4),
  },
  {
    name: "resolvePresetAccount finds the preset's own account",
    run: () => {
      const accounts = [account('a', 100), account('b', 200)];
      return expect('id', resolvePresetAccount(accounts, 'b')?.id, 'b');
    },
  },
  {
    name: 'resolvePresetAccount falls back to the first account when unset',
    run: () => {
      const accounts = [account('a', 100), account('b', 200)];
      return expect('id', resolvePresetAccount(accounts, undefined)?.id, 'a');
    },
  },
  {
    name: 'resolvePresetAccount falls back when the referenced account is gone',
    run: () => {
      const accounts = [account('a', 100), account('b', 200)];
      return expect('id', resolvePresetAccount(accounts, 'deleted')?.id, 'a');
    },
  },
  {
    name: 'shortAccountName leaves short names untouched',
    run: () => expect('name', shortAccountName('Cash'), 'Cash'),
  },
  {
    name: 'shortAccountName truncates long names with an ellipsis, honoring maxLen',
    run: () => expect('name', shortAccountName('International Savings Account'), 'Internatio…'),
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

console.log(`\nAll ${CASES.length} widget layout cases passed.`);
