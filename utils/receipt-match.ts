/**
 * Maps a parsed receipt onto the user's own accounts and categories.
 *
 * The merchant table below is a plain keyword index — it never leaves the
 * device and never calls out to anything. Unknown merchants simply return
 * undefined so the review screen leaves the field for the user to pick.
 */

import { Account, Category, CategoryKind } from '@/types/finance';
import { ParsedReceipt } from '@/utils/receipt-parser';

/**
 * Merchant keywords grouped by the default category they belong to. Keys match
 * the seed category names in `constants/categories.ts`; if the user renamed or
 * deleted a category the lookup just misses and nothing is pre-selected.
 */
const MERCHANT_KEYWORDS: Record<string, string[]> = {
  'Food & Dining': [
    'swiggy', 'zomato', 'dominos', "domino's", 'pizza', 'mcdonald', 'kfc', 'burger',
    'starbucks', 'cafe', 'coffee', 'restaurant', 'subway', 'biryani', 'faasos',
    'behrouz', 'chaayos', 'barbeque', 'dineout', 'magicpin', 'eatfit', 'wow momo',
    'haldiram', 'bakery', 'dhaba', 'kitchen', 'foods', 'eatery',
  ],
  Groceries: [
    'bigbasket', 'big basket', 'blinkit', 'zepto', 'dmart', 'd-mart', 'dmart ready',
    'grofers', 'jiomart', 'jio mart', 'instamart', 'reliance fresh', 'spencer',
    'natures basket', 'licious', 'country delight', 'milkbasket', 'kirana',
    'supermarket', 'provision', 'grocery',
  ],
  Transport: [
    'uber', 'ola', 'rapido', 'namma yatri', 'blusmart', 'redbus', 'metro', 'dmrc',
    'bmtc', 'msrtc', 'fastag', 'petrol', 'diesel', 'fuel', 'indian oil', 'indianoil',
    'hp petrol', 'bharat petroleum', 'shell', 'parking', 'toll', 'auto',
  ],
  Shopping: [
    'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'tata cliq', 'tatacliq',
    'snapdeal', 'decathlon', 'ikea', 'croma', 'reliance digital', 'lifestyle',
    'westside', 'zara', 'uniqlo', 'pantaloons', 'shoppers stop', 'store',
  ],
  'Bills & Utilities': [
    'airtel', 'jio', 'vodafone', 'bsnl', 'electricity', 'mseb', 'bescom', 'tneb',
    'adani electricity', 'tata power', 'torrent power', 'indane', 'gas', 'water bill',
    'broadband', 'act fibernet', 'hathway', 'recharge', 'postpaid', 'prepaid',
    'tata sky', 'dish tv', 'dth', 'municipal', 'bill payment',
  ],
  Entertainment: [
    'netflix', 'spotify', 'prime video', 'hotstar', 'disney', 'sony liv', 'sonyliv',
    'zee5', 'bookmyshow', 'book my show', 'pvr', 'inox', 'cinepolis', 'youtube',
    'gaana', 'jiosaavn', 'saavn', 'steam', 'playstation', 'xbox', 'nintendo',
  ],
  Health: [
    'apollo', 'pharmeasy', '1mg', 'tata 1mg', 'netmeds', 'medplus', 'practo',
    'cult.fit', 'cultfit', 'cure.fit', 'hospital', 'clinic', 'diagnostic', 'pathology',
    'dental', 'pharmacy', 'medical', 'wellness forever', 'gym', 'fitness',
  ],
  Housing: ['rent', 'landlord', 'maintenance', 'society', 'nobroker', 'housing', 'pg '],
  Education: [
    'udemy', 'coursera', 'byju', 'unacademy', 'vedantu', 'upgrad', 'skillshare',
    'school', 'college', 'university', 'tuition', 'classes', 'academy', 'institute',
  ],
  Travel: [
    'makemytrip', 'make my trip', 'goibibo', 'ixigo', 'cleartrip', 'yatra', 'oyo',
    'airbnb', 'indigo', 'vistara', 'air india', 'spicejet', 'akasa', 'irctc',
    'booking.com', 'agoda', 'easemytrip', 'hotel', 'resort', 'travels',
  ],
};

/** Keywords that suggest which income bucket a credit belongs to. */
const INCOME_KEYWORDS: Record<string, string[]> = {
  Salary: ['salary', 'payroll', 'wages', 'stipend', 'ctc', 'hr '],
  Business: ['invoice', 'client', 'consulting', 'freelance', 'services', 'enterprises'],
  Investments: ['dividend', 'interest', 'mutual fund', 'zerodha', 'groww', 'upstox', 'redemption'],
  Gifts: ['gift', 'birthday', 'shagun'],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Picks the best category for a receipt by keyword-matching the merchant.
 * Longer keywords win so "big basket" beats a stray "basket".
 */
export function guessCategory(
  receipt: ParsedReceipt,
  categories: Category[],
  kind: CategoryKind
): Category | undefined {
  const haystack = normalize([receipt.merchant, ...receipt.lines].filter(Boolean).join(' '));
  if (!haystack) return undefined;

  const table = kind === 'income' ? INCOME_KEYWORDS : MERCHANT_KEYWORDS;

  let bestName: string | undefined;
  let bestLength = 0;

  for (const [categoryName, keywords] of Object.entries(table)) {
    for (const keyword of keywords) {
      if (haystack.includes(keyword) && keyword.length > bestLength) {
        bestName = categoryName;
        bestLength = keyword.length;
      }
    }
  }

  if (!bestName) return undefined;

  return categories.find(c => c.kind === kind && normalize(c.name) === normalize(bestName));
}

/**
 * Matches the receipt's funding line ("Debited from ICICI Bank XX4521") to one
 * of the user's accounts, comparing on the distinctive words of each name.
 */
export function guessAccount(receipt: ParsedReceipt, accounts: Account[]): Account | undefined {
  if (!receipt.bankHint) return undefined;

  const hint = normalize(receipt.bankHint);
  const live = accounts.filter(a => !a.archived);

  let best: { account: Account; score: number } | undefined;

  for (const account of live) {
    const words = normalize(account.name)
      .split(' ')
      .filter(word => word.length >= 3);

    let score = 0;
    for (const word of words) {
      if (hint.includes(word)) score += word.length;
    }

    // A matching card/account tail is a much stronger signal than a name word.
    const tail = account.name.match(/(\d{4})\s*$/);
    if (tail && hint.includes(tail[1])) score += 10;

    if (score > 0 && (!best || score > best.score)) best = { account, score };
  }

  return best?.account;
}
