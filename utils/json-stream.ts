/**
 * A minimal, bounded-memory JSON reader for one shape: an object whose
 * `data.transactions` field can hold millions of entries.
 *
 * This is not a general JSON parser — it exists to answer exactly one
 * question ("what's in this file") without ever holding the whole
 * `transactions` array in memory at once, the way `JSON.parse` on the whole
 * file necessarily would. Every value is still parsed correctly (strings,
 * escapes, nested objects/arrays), but everything outside `transactions` is
 * small — accounts, categories, budgets, presets, settings stay in the tens
 * of rows even for a ledger with millions of transactions — so those are
 * captured as raw text and handed to `JSON.parse` normally. Only
 * `transactions` gets the streaming treatment: each element is captured,
 * parsed and handed to a callback one at a time, then discarded.
 *
 * Pure and dependency-free so it can be tested with plain strings/async
 * generators in Node, with no expo-file-system or device involved — see
 * `scripts/test-json-stream.ts`.
 */

export interface CharCursor {
  /** Returns the next char and advances, or null at end of input. */
  next(): Promise<string | null>;
  /** Returns the next char without advancing, or null at end of input. */
  peek(): Promise<string | null>;
}

/** Wraps chunks of text (as produced by a decoded file stream) as a char-at-a-time cursor. */
export function cursorFromChunks(chunks: AsyncIterable<string>): CharCursor {
  const it = chunks[Symbol.asyncIterator]();
  let buf = '';
  let i = 0;
  let ended = false;

  async function fill(): Promise<boolean> {
    while (i >= buf.length && !ended) {
      const { value, done } = await it.next();
      if (done) {
        ended = true;
        break;
      }
      buf = value;
      i = 0;
    }
    return i < buf.length;
  }

  return {
    async peek() {
      if (!(await fill())) return null;
      return buf[i];
    },
    async next() {
      if (!(await fill())) return null;
      return buf[i++];
    },
  };
}

/** Same cursor over a single in-memory string — convenient for tests and small files alike. */
export function cursorFromString(text: string): CharCursor {
  return cursorFromChunks(
    (async function* () {
      yield text;
    })()
  );
}

class JsonStreamError extends Error {}

async function skipWs(cur: CharCursor): Promise<void> {
  while (true) {
    const c = await cur.peek();
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      await cur.next();
    } else {
      break;
    }
  }
}

/** Consumes a JSON string token (including its quotes), respecting `\"` and other escapes. */
async function captureString(cur: CharCursor): Promise<string> {
  const open = await cur.next();
  if (open !== '"') throw new JsonStreamError(`Expected a string, got ${open === null ? 'end of input' : `'${open}'`}`);
  let out = '"';
  while (true) {
    const c = await cur.next();
    if (c === null) throw new JsonStreamError('Unterminated string');
    out += c;
    if (c === '\\') {
      const escaped = await cur.next();
      if (escaped === null) throw new JsonStreamError('Unterminated escape sequence');
      out += escaped;
      continue;
    }
    if (c === '"') break;
  }
  return out;
}

/** Consumes one JSON value (string, number, literal, object or array) and returns its exact text. */
async function captureValue(cur: CharCursor): Promise<string> {
  await skipWs(cur);
  const c = await cur.peek();
  if (c === '"') return captureString(cur);
  if (c === '{') return captureContainer(cur, '{', '}', true);
  if (c === '[') return captureContainer(cur, '[', ']', false);
  if (c === null) throw new JsonStreamError('Unexpected end of input');

  // number, true, false or null: read until a structural delimiter.
  let out = '';
  while (true) {
    const ch = await cur.peek();
    if (ch === null || ',]} \t\n\r'.includes(ch)) break;
    out += await cur.next();
  }
  if (out.length === 0) throw new JsonStreamError(`Unexpected character '${c}'`);
  return out;
}

async function captureContainer(
  cur: CharCursor,
  open: '{' | '[',
  close: '}' | ']',
  isObject: boolean
): Promise<string> {
  const opened = await cur.next(); // the opening bracket
  if (opened !== open) throw new JsonStreamError(`Expected '${open}', got '${opened}'`);
  let out: string = opened;
  await skipWs(cur);
  if ((await cur.peek()) === close) {
    out += await cur.next();
    return out;
  }
  while (true) {
    await skipWs(cur);
    if (isObject) {
      out += await captureString(cur); // key
      await skipWs(cur);
      const colon = await cur.next();
      if (colon !== ':') throw new JsonStreamError(`Expected ':' after object key, got '${colon}'`);
      out += colon;
    }
    out += await captureValue(cur);
    await skipWs(cur);
    const c = await cur.next();
    if (c === null) throw new JsonStreamError(`Unterminated ${isObject ? 'object' : 'array'}`);
    out += c;
    if (c === close) break;
    if (c !== ',') throw new JsonStreamError(`Expected ',' or '${close}', got '${c}'`);
  }
  return out;
}

/** Reads one `"key":` token, returning the decoded key name. */
async function readKey(cur: CharCursor): Promise<string> {
  await skipWs(cur);
  const raw = await captureString(cur);
  await skipWs(cur);
  const colon = await cur.next();
  if (colon !== ':') throw new JsonStreamError(`Expected ':' after key, got '${colon}'`);
  return JSON.parse(raw) as string;
}

export interface MercuryExportMeta {
  [key: string]: unknown;
}

/**
 * Walks a Mercury export's top-level object. Every key other than
 * `data.transactions` is captured and JSON.parsed into `meta` under its own
 * name (`data`'s own non-transaction keys are spread directly onto `meta`
 * for convenience — e.g. `meta.accounts`). Each element of
 * `data.transactions` is parsed individually and passed to `onTransaction`
 * as it's read, then discarded — `onTransaction` also receives the `meta`
 * object being built, so it can be inspected mid-parse for fields already
 * seen (see the ordering note below).
 *
 * Requires `data.accounts` to appear before `data.transactions` in the file
 * — true of every export Mercury itself has ever written (the field order is
 * fixed in `data-transfer-io.ts`) — since `onTransaction` typically needs
 * the account list to validate against. A file that violates this doesn't
 * error here (this module has no idea what "accounts" means); the caller is
 * responsible for checking `metaSoFar.accounts` is populated before relying
 * on it.
 */
export async function readMercuryExport(
  chunks: AsyncIterable<string>,
  onTransaction: (raw: unknown, metaSoFar: MercuryExportMeta) => Promise<void> | void
): Promise<MercuryExportMeta> {
  const cur = cursorFromChunks(chunks);
  await skipWs(cur);
  if ((await cur.next()) !== '{') throw new JsonStreamError('Expected the file to start with an object');

  const meta: MercuryExportMeta = {};
  let sawData = false;

  await skipWs(cur);
  if ((await cur.peek()) === '}') {
    await cur.next();
  } else {
    while (true) {
      const key = await readKey(cur);
      await skipWs(cur);

      if (key === 'data') {
        sawData = true;
        await readDataObject(cur, meta, onTransaction);
      } else {
        meta[key] = JSON.parse(await captureValue(cur));
      }

      await skipWs(cur);
      const c = await cur.next();
      if (c === '}') break;
      if (c !== ',') throw new JsonStreamError(`Expected ',' or '}', got '${c}'`);
    }
  }

  if (!sawData) throw new JsonStreamError('Missing "data" section');
  return meta;
}

async function readDataObject(
  cur: CharCursor,
  meta: MercuryExportMeta,
  onTransaction: (raw: unknown, metaSoFar: MercuryExportMeta) => Promise<void> | void
): Promise<void> {
  await skipWs(cur);
  if ((await cur.next()) !== '{') throw new JsonStreamError('"data" must be an object');

  await skipWs(cur);
  if ((await cur.peek()) === '}') {
    await cur.next();
    return;
  }

  let sawTransactions = false;
  while (true) {
    const key = await readKey(cur);
    await skipWs(cur);

    if (key === 'transactions') {
      sawTransactions = true;
      await readTransactionsArray(cur, meta, onTransaction);
    } else {
      meta[key] = JSON.parse(await captureValue(cur));
    }

    await skipWs(cur);
    const c = await cur.next();
    if (c === '}') break;
    if (c !== ',') throw new JsonStreamError(`Expected ',' or '}', got '${c}'`);
  }

  if (!sawTransactions) throw new JsonStreamError('Missing "data.transactions" array');
}

async function readTransactionsArray(
  cur: CharCursor,
  meta: MercuryExportMeta,
  onTransaction: (raw: unknown, metaSoFar: MercuryExportMeta) => Promise<void> | void
): Promise<void> {
  await skipWs(cur);
  if ((await cur.next()) !== '[') throw new JsonStreamError('"data.transactions" must be an array');

  await skipWs(cur);
  if ((await cur.peek()) === ']') {
    await cur.next();
    return;
  }

  while (true) {
    const raw = await captureValue(cur);
    await onTransaction(JSON.parse(raw), meta);
    await skipWs(cur);
    const c = await cur.next();
    if (c === null) throw new JsonStreamError('Unterminated transactions array');
    if (c === ']') break;
    if (c !== ',') throw new JsonStreamError(`Expected ',' or ']' in transactions array, got '${c}'`);
  }
}
