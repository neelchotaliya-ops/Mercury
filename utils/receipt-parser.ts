/**
 * Parses the raw text lines that on-device OCR pulls out of a payment
 * screenshot (Google Pay, PhonePe, Paytm, or any UPI receipt) into the fields
 * Mercury needs for a transaction.
 *
 * Everything here is plain string work — no network calls, no model inference.
 * The heuristics are deliberately conservative: when a field cannot be read
 * with reasonable certainty it is left undefined so the review screen can ask
 * the user instead of guessing wrong.
 */

export type ReceiptDirection = 'expense' | 'income';

export type ReceiptSource = 'gpay' | 'phonepe' | 'paytm' | 'upi' | 'unknown';

export interface ParsedReceipt {
  /** Transaction value in major units. Undefined when no amount was legible. */
  amount?: number;
  direction: ReceiptDirection;
  /** Payee for an expense, payer for income. */
  merchant?: string;
  date?: Date;
  /** UPI transaction / reference number, kept for the note. */
  refId?: string;
  /** Free text hinting at the funding account, e.g. "HDFC Bank 1234". */
  bankHint?: string;
  source: ReceiptSource;
  /** Rough 0–1 signal of how much of the receipt we understood. */
  confidence: number;
  lines: string[];
}

/** Words that mark a line as chrome rather than content. */
const STATUS_WORDS = [
  'completed',
  'successful',
  'success',
  'payment successful',
  'paid successfully',
  'transaction successful',
  'pending',
  'failed',
  'share',
  'done',
  'view details',
  'split expense',
  'contact support',
];

/** Markers that reveal the direction of money, name-bearing or not. */
const EXPENSE_MARKERS = [
  'paid to',
  'you paid',
  'money sent',
  'sent to',
  'payment to',
  'paying to',
  'debited',
  'you sent',
  'paid successfully',
];

const INCOME_MARKERS = [
  'received from',
  'you received',
  'money received',
  'credited',
  'request accepted',
  'refund from',
  'refunded',
];

/**
 * The subset of markers that introduce a counterparty name. "Paid successfully"
 * and friends are status banners, so they must never pull in the next line as
 * if it were a payee.
 */
const EXPENSE_NAME_MARKERS = ['paid to', 'you paid', 'sent to', 'payment to', 'paying to', 'to'];

const INCOME_NAME_MARKERS = ['received from', 'refund from', 'from'];

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const BANK_NAMES = [
  'hdfc', 'icici', 'sbi', 'state bank', 'axis', 'kotak', 'yes bank', 'pnb',
  'punjab national', 'bank of baroda', 'bob', 'idfc', 'indusind', 'canara',
  'union bank', 'federal', 'rbl', 'au small', 'idbi', 'indian bank',
  'paytm', 'airtel payments', 'jupiter', 'fi money', 'slice', 'amazon pay',
];

/** Currency markers OCR realistically produces on Indian receipts. */
const CURRENCY_TOKEN = String.raw`(?:₹|rs\.?|inr|\$|€|£)`;
const AMOUNT_BODY = String.raw`\d[\d,]*(?:\.\d{1,2})?`;

const CURRENCY_AMOUNT_RE = new RegExp(`${CURRENCY_TOKEN}\\s*(${AMOUNT_BODY})`, 'i');
const BARE_AMOUNT_RE = new RegExp(`^(${AMOUNT_BODY})$`);

const REF_RE =
  /(?:upi\s*(?:transaction|txn|ref(?:erence)?)?\s*(?:id|no\.?|number)|transaction\s*id|txn\s*id|order\s*id|utr(?:\s*(?:no\.?|number))?)\s*[:#-]?\s*([a-z0-9]{6,32})/i;

/**
 * OCR hands back blocks that can each hold several visual lines. Flatten to
 * trimmed single lines and drop the blanks.
 */
export function normalizeLines(blocks: string[]): string[] {
  return blocks
    .flatMap(block => block.split(/\r?\n/))
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0);
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''));
}

function isStatusLine(line: string): boolean {
  const lower = line.toLowerCase();
  return STATUS_WORDS.some(word => lower === word || lower.startsWith(word));
}

/**
 * Picks the headline amount. Payment apps render it large and alone near the
 * top, so we score candidates on currency marker, isolation and position, and
 * penalise anything that looks like an identifier.
 */
function extractAmount(lines: string[]): number | undefined {
  let best: { value: number; score: number } | undefined;

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    const withSymbol = line.match(CURRENCY_AMOUNT_RE);
    const bare = line.match(BARE_AMOUNT_RE);
    const match = withSymbol ?? bare;
    if (!match) return;

    const digits = match[1].replace(/[,.]/g, '');
    // Reference numbers, phone numbers and card tails are not amounts.
    if (digits.length > 9) return;
    if (/\b(id|utr|ref|txn|transaction|account|a\/c|xx|\*{2,})\b/i.test(lower)) return;

    const value = toNumber(match[1]);
    if (!Number.isFinite(value) || value <= 0) return;

    let score = 0;
    if (withSymbol) score += 3;
    // A line holding nothing but the amount is almost always the headline.
    if (line.replace(CURRENCY_AMOUNT_RE, '').replace(/[^\w]/g, '').length === 0) score += 2;
    if (index < 6) score += 2;
    if (!withSymbol) score -= 1;
    if (/\b(cashback|reward|scratch|saved|fee|charge|balance)\b/i.test(lower)) score -= 4;

    if (!best || score > best.score) best = { value, score };
  });

  return best && best.score > 0 ? best.value : undefined;
}

function extractDirection(lines: string[]): { direction: ReceiptDirection; matched: boolean } {
  const haystack = lines.join(' \n ').toLowerCase();
  const incomeHit = INCOME_MARKERS.find(marker => haystack.includes(marker));
  const expenseHit = EXPENSE_MARKERS.find(marker => haystack.includes(marker));

  if (incomeHit && !expenseHit) return { direction: 'income', matched: true };
  if (expenseHit && !incomeHit) return { direction: 'expense', matched: true };

  if (incomeHit && expenseHit) {
    // Both appear (e.g. "Paid to" plus a "credited to" footnote) — trust
    // whichever shows up first, since receipts lead with the headline.
    return {
      direction: haystack.indexOf(incomeHit) < haystack.indexOf(expenseHit) ? 'income' : 'expense',
      matched: true,
    };
  }

  return { direction: 'expense', matched: false };
}

function cleanName(raw: string): string | undefined {
  let name = raw
    .replace(/^[^\w₹]*/, '')
    .replace(/[,.;:]+$/, '')
    .trim();

  // Reject amounts and status banners before punctuation is rewritten below,
  // otherwise "3,200.00" survives as the harmless-looking "3,200 00".
  if (!name) return undefined;
  if (isStatusLine(name)) return undefined;
  if (CURRENCY_AMOUNT_RE.test(name) || BARE_AMOUNT_RE.test(name)) return undefined;

  // "swiggy@ybl" and "9876543210@paytm" read better as the handle's owner.
  if (name.includes('@')) name = name.split('@')[0];
  name = name.replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!name || name.length < 2 || name.length > 48) return undefined;
  // A bare phone number is not a useful merchant label.
  if (/^\+?\d[\d\s-]{6,}$/.test(name)) return undefined;

  return name
    .split(' ')
    .map(word => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Finds the counterparty. Receipts either put the name on the marker line
 * ("Paid to Swiggy") or on the line directly beneath it.
 */
function extractMerchant(lines: string[], direction: ReceiptDirection): string | undefined {
  const nameMarkers = direction === 'income' ? INCOME_NAME_MARKERS : EXPENSE_NAME_MARKERS;
  const allMarkers = [...EXPENSE_MARKERS, ...INCOME_MARKERS, ...nameMarkers];

  const matchMarker = (line: string, marker: string) =>
    line.match(new RegExp(`^${marker}\\b\\s*:?\\s*(.*)$`, 'i'));

  const startsWithAnyMarker = (line: string) =>
    allMarkers.some(marker => new RegExp(`^${marker}\\b`, 'i').test(line));

  // Pass 1 — the common case: "Paid to Swiggy" on a single line.
  for (const line of lines) {
    for (const marker of nameMarkers) {
      const match = matchMarker(line, marker);
      if (!match) continue;
      const inline = cleanName(match[1]);
      if (inline) return inline;
    }
  }

  // Pass 2 — the marker sits alone and the name follows on the next line.
  for (let i = 0; i < lines.length; i += 1) {
    const isMarkerLine = nameMarkers.some(marker => {
      const match = matchMarker(lines[i], marker);
      return match !== null && match[1].trim().length === 0;
    });
    if (!isMarkerLine) continue;

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j += 1) {
      // Never let a status banner or another marker row pose as the payee.
      if (startsWithAnyMarker(lines[j])) continue;
      const next = cleanName(lines[j]);
      if (next) return next;
    }
  }

  return undefined;
}

function buildDate(year: number, month: number, day: number, time?: RegExpMatchArray): Date | undefined {
  let hours = 0;
  let minutes = 0;

  if (time) {
    hours = parseInt(time[1], 10);
    minutes = parseInt(time[2], 10);
    const meridiem = time[3]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }

  const date = new Date(year, month, day, hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getMonth() !== month || date.getDate() !== day) return undefined;

  return date;
}

/** Reads the receipt timestamp, defaulting to today when nothing parses. */
function extractDate(lines: string[], now: Date): Date | undefined {
  const haystack = lines.join(' \n ');
  const time = haystack.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?/i) ?? undefined;

  // "15 Aug 2026" / "15 August 2026". Scan every candidate rather than only the
  // first: unrelated pairs like "50 Paid" match the shape but carry no month.
  for (const m of haystack.matchAll(/\b(\d{1,2})\s+([a-z]{3,9})\.?\s*,?\s*(\d{4})?/gi)) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month === undefined) continue;
    const year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    const built = buildDate(year, month, parseInt(m[1], 10), time);
    if (built) return built;
  }

  // "Aug 15, 2026"
  for (const m of haystack.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})?/gi)) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month === undefined) continue;
    const year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    const built = buildDate(year, month, parseInt(m[2], 10), time);
    if (built) return built;
  }

  // Numeric day-first, the Indian convention: 15/08/2026 or 15-08-26
  const numeric = haystack.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    const year = parseInt(numeric[3], 10);
    const built = buildDate(
      year < 100 ? 2000 + year : year,
      parseInt(numeric[2], 10) - 1,
      parseInt(numeric[1], 10),
      time
    );
    if (built) return built;
  }

  // ISO, occasionally present in detail rows: 2026-08-15
  const iso = haystack.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const built = buildDate(
      parseInt(iso[1], 10),
      parseInt(iso[2], 10) - 1,
      parseInt(iso[3], 10),
      time
    );
    if (built) return built;
  }

  if (/\byesterday\b/i.test(haystack)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return date;
  }
  if (/\btoday\b/i.test(haystack)) return new Date(now);

  return undefined;
}

function extractRefId(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(REF_RE);
    if (match) return match[1];
  }
  return undefined;
}

function extractBankHint(lines: string[]): string | undefined {
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!BANK_NAMES.some(bank => lower.includes(bank)) && !/\bbank\b/i.test(line)) continue;
    // Skip the payee row so we hint at the funding account, not the recipient.
    if (/^(paid to|received from|to\b|to:)/i.test(line)) continue;
    return line.replace(/^(from|debited from|using)\s*:?\s*/i, '').trim();
  }
  return undefined;
}

function detectSource(lines: string[]): ReceiptSource {
  const haystack = lines.join(' ').toLowerCase();
  if (haystack.includes('phonepe') || haystack.includes('phone pe')) return 'phonepe';
  if (haystack.includes('paytm')) return 'paytm';
  if (haystack.includes('google pay') || haystack.includes('gpay')) return 'gpay';
  if (haystack.includes('upi')) return 'upi';
  return 'unknown';
}

/**
 * Turns OCR output into a candidate transaction.
 *
 * @param blocks Raw strings from the text recogniser.
 * @param now Injectable clock so relative dates stay testable.
 */
export function parseReceipt(blocks: string[], now: Date = new Date()): ParsedReceipt {
  const lines = normalizeLines(blocks);

  const amount = extractAmount(lines);
  const { direction, matched } = extractDirection(lines);
  const merchant = extractMerchant(lines, direction);
  const date = extractDate(lines, now);
  const refId = extractRefId(lines);
  const bankHint = extractBankHint(lines);

  const confidence =
    (amount !== undefined ? 0.5 : 0) +
    (matched ? 0.2 : 0) +
    (merchant ? 0.2 : 0) +
    (date ? 0.1 : 0);

  return {
    amount,
    direction,
    merchant,
    date,
    refId,
    bankHint,
    source: detectSource(lines),
    confidence: Math.round(confidence * 100) / 100,
    lines,
  };
}

/** Human-readable note assembled from whatever the receipt gave us. */
export function buildNote(receipt: ParsedReceipt): string | undefined {
  const parts: string[] = [];
  if (receipt.merchant) {
    parts.push(receipt.direction === 'income' ? `From ${receipt.merchant}` : receipt.merchant);
  }
  if (receipt.refId) parts.push(`UPI ${receipt.refId}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
