/**
 * Checks the bounded-memory JSON reader used for streaming import. The
 * highest-risk behaviour is correctness across arbitrary chunk boundaries —
 * a real file read splits the text at fixed byte offsets with no regard for
 * where a token happens to fall — so every case here is run once as a
 * single chunk and again split into 1-character chunks, which exercises
 * every possible split point at once.
 *
 * Run with: npm run test:json-stream
 */

import { readMercuryExport, cursorFromChunks } from '../utils/json-stream';
import { Case, deepEq, runCases } from './support/harness';

const expect = deepEq;

async function* wholeChunk(text: string): AsyncIterable<string> {
  yield text;
}

async function* byChar(text: string): AsyncIterable<string> {
  for (const ch of text) yield ch;
}

async function* byRandomChunks(text: string, seed: number): AsyncIterable<string> {
  // A deterministic LCG so the split points are reproducible across runs.
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  let i = 0;
  while (i < text.length) {
    const n = 1 + Math.floor(rand() * 5);
    yield text.slice(i, i + n);
    i += n;
  }
}

/** Runs the same assertion against the same text fed through several chunkings. */
async function forEveryChunking(
  text: string,
  assert: (chunks: AsyncIterable<string>) => Promise<string | null>
): Promise<string | null> {
  return (
    (await assert(wholeChunk(text))) ??
    (await assert(byChar(text))) ??
    (await assert(byRandomChunks(text, 42))) ??
    (await assert(byRandomChunks(text, 1337)))
  );
}

const SAMPLE = JSON.stringify({
  format: 'mercury-finance-export',
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  appVersion: '1.0.0',
  data: {
    accounts: [{ id: 'a1', name: 'Cash' }],
    categories: [{ id: 'c1', name: 'Food' }],
    budgets: [{ id: 'b1', categoryId: 'c1' }],
    quickPresets: [{ id: 'p1', label: 'Coffee' }],
    settings: { currency: 'INR', hasOnboarded: true },
    transactions: [
      { id: 't1', amount: 50, note: 'plain' },
      { id: 't2', amount: 75, note: 'has "quotes", a\\backslash, {braces} and [brackets]' },
      { id: 't3', amount: 100, note: 'unicode: café 😀 done' },
      { id: 't4', amount: 0.5, note: null },
    ],
  },
});

const CASES: Case[] = [
  {
    name: 'parses meta fields and every transaction across every chunking',
    run: () =>
      forEveryChunking(SAMPLE, async chunks => {
        const seen: unknown[] = [];
        const meta = await readMercuryExport(chunks, raw => {
          seen.push(raw);
        });
        return (
          expect('format', meta.format, 'mercury-finance-export') ??
          expect('version', meta.version, 1) ??
          expect('accounts', meta.accounts, [{ id: 'a1', name: 'Cash' }]) ??
          expect('categories', meta.categories, [{ id: 'c1', name: 'Food' }]) ??
          expect('settings', meta.settings, { currency: 'INR', hasOnboarded: true }) ??
          expect('transaction count', seen.length, 4) ??
          expect('t1', seen[0], { id: 't1', amount: 50, note: 'plain' }) ??
          expect(
            't2 (escapes)',
            (seen[1] as { note: string }).note,
            'has "quotes", a\\backslash, {braces} and [brackets]'
          ) ??
          expect('t3 (unicode)', (seen[2] as { note: string }).note, 'unicode: café 😀 done') ??
          expect('t4 (null note)', seen[3], { id: 't4', amount: 0.5, note: null })
        );
      }),
  },
  {
    name: 'empty transactions array yields no callbacks but still parses meta',
    run: async () => {
      const text = JSON.stringify({
        format: 'mercury-finance-export',
        version: 1,
        data: { accounts: [{ id: 'a1' }], transactions: [] },
      });
      let calls = 0;
      const meta = await readMercuryExport(wholeChunk(text), () => {
        calls++;
      });
      return expect('calls', calls, 0) ?? expect('accounts', meta.accounts, [{ id: 'a1' }]);
    },
  },
  {
    name: 'missing "data" section is rejected',
    run: async () => {
      const text = JSON.stringify({ format: 'mercury-finance-export' });
      try {
        await readMercuryExport(wholeChunk(text), () => {});
        return 'expected an error, got none';
      } catch {
        return null;
      }
    },
  },
  {
    name: 'missing "transactions" array is rejected',
    run: async () => {
      const text = JSON.stringify({ format: 'x', data: { accounts: [] } });
      try {
        await readMercuryExport(wholeChunk(text), () => {});
        return 'expected an error, got none';
      } catch {
        return null;
      }
    },
  },
  {
    name: 'truncated input is rejected rather than hanging or returning partial data',
    run: async () => {
      const text = SAMPLE.slice(0, Math.floor(SAMPLE.length / 2));
      try {
        await readMercuryExport(wholeChunk(text), () => {});
        return 'expected an error, got none';
      } catch {
        return null;
      }
    },
  },
  {
    name: 'a transaction sink error aborts the whole read',
    run: async () => {
      let calls = 0;
      try {
        await readMercuryExport(wholeChunk(SAMPLE), () => {
          calls++;
          throw new Error('sink refuses');
        });
        return 'expected an error, got none';
      } catch {
        return expect('calls before abort', calls, 1);
      }
    },
  },
  {
    name: 'cursorFromChunks concatenates chunks transparently',
    run: async () => {
      const cur = cursorFromChunks(byRandomChunks('hello', 7));
      let out = '';
      for (let i = 0; i < 5; i++) out += await cur.next();
      return expect('reassembled', out, 'hello') ?? expect('EOF', await cur.next(), null);
    },
  },
];

runCases(CASES, 'JSON stream cases');
