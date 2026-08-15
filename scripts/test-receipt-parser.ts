/**
 * Checks the receipt parser against realistic OCR output from the payment apps
 * Mercury is expected to handle. The parser drives what lands in the user's
 * ledger, so these cases guard the heuristics whenever they get tuned.
 *
 * Run with: npm run test:parser
 */

import { buildNote, parseReceipt } from '../utils/receipt-parser';

/** Fixed clock so cases with a year-less or relative date stay stable. */
const NOW = new Date(2026, 7, 15, 12, 0, 0);

interface Expectation {
  amount?: number;
  direction?: 'expense' | 'income';
  merchant?: string;
  day?: number;
  refId?: string;
}

interface Case {
  name: string;
  blocks: string[];
  expect: Expectation;
}

const CASES: Case[] = [
  {
    name: 'Google Pay — paid to a merchant',
    blocks: [
      '₹450',
      'Paid to Swiggy',
      'Completed',
      '15 Aug 2026, 4:32 pm',
      'UPI transaction ID 462938475632',
      'From: HDFC Bank 1234',
      'To: swiggy@ybl',
    ],
    expect: {
      amount: 450,
      direction: 'expense',
      merchant: 'Swiggy',
      day: 15,
      refId: '462938475632',
    },
  },
  {
    name: 'Google Pay — name on its own line, lakh formatting',
    blocks: [
      '₹1,25,000.50\nPaid to\nRahul Sharma',
      'Completed',
      '12 August 2026, 9:05 am',
      'UPI transaction ID 998877665544',
    ],
    expect: { amount: 125000.5, direction: 'expense', merchant: 'Rahul Sharma', day: 12 },
  },
  {
    name: 'Google Pay — money received',
    blocks: [
      '₹2,500',
      'Received from Anjali Verma',
      'Completed',
      '14 Aug 2026, 7:15 pm',
      'UPI transaction ID 123456789012',
    ],
    expect: { amount: 2500, direction: 'income', merchant: 'Anjali Verma', day: 14 },
  },
  {
    name: 'PhonePe — "Rs." prefix and a status banner first',
    blocks: [
      'Payment Successful',
      'Rs.1,299.00',
      'Paid to BigBasket',
      'Transaction ID T2608151632456789',
      '15/08/2026 04:32 PM',
      'Debited from ICICI Bank XX4521',
    ],
    expect: { amount: 1299, direction: 'expense', merchant: 'BigBasket', day: 15 },
  },
  {
    name: 'Paytm — INR prefix, cashback line must not win the amount',
    blocks: [
      'Paid Successfully',
      'INR 780',
      'Paid to Uber India',
      'Cashback ₹15 credited',
      'Aug 13, 2026, 11:20 am',
      'Order ID PTM99231144',
    ],
    expect: { amount: 780, direction: 'expense', merchant: 'Uber India', day: 13 },
  },
  {
    name: 'Amount alone on a line with no currency symbol',
    blocks: ['Money sent', '3,200.00', 'To: Zomato', '15 Aug 2026'],
    expect: { amount: 3200, direction: 'expense', merchant: 'Zomato', day: 15 },
  },
  {
    name: 'Long digit runs are identifiers, not amounts',
    blocks: ['Payment Successful', 'UPI transaction ID 462938475632', 'A/C XXXXXX8891'],
    expect: { amount: undefined },
  },
  {
    name: 'Unreadable image yields nothing to prefill',
    blocks: ['Hello world', 'nothing here'],
    expect: { amount: undefined, direction: 'expense' },
  },
];

let failures = 0;

for (const testCase of CASES) {
  const result = parseReceipt(testCase.blocks, NOW);
  const lines: string[] = [];

  const check = (label: string, actual: unknown, expected: unknown) => {
    if (expected === undefined && !(label in testCase.expect)) return;
    if (actual === expected) {
      lines.push(`  ok   ${label} = ${JSON.stringify(actual)}`);
    } else {
      failures += 1;
      lines.push(`  FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  };

  if ('amount' in testCase.expect) check('amount', result.amount, testCase.expect.amount);
  if (testCase.expect.direction) check('direction', result.direction, testCase.expect.direction);
  if (testCase.expect.merchant) check('merchant', result.merchant, testCase.expect.merchant);
  if (testCase.expect.refId) check('refId', result.refId, testCase.expect.refId);
  if (testCase.expect.day !== undefined) check('date.day', result.date?.getDate(), testCase.expect.day);

  console.log(`\n${testCase.name}`);
  console.log(lines.join('\n'));
  console.log(`  → confidence ${result.confidence}, note ${JSON.stringify(buildNote(result))}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${CASES.length} receipt cases passed.`);
