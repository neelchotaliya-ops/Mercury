import { NumberFormat } from '@/types/finance';

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
  { code: 'CAD', symbol: 'C$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc' },
  { code: 'NZD', symbol: 'NZ$', label: 'New Zealand Dollar' },
  { code: 'SAR', symbol: '﷼', label: 'Saudi Riyal' },
  { code: 'CNY', symbol: '¥', label: 'Chinese Yuan' },
];

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code;
}

/**
 * Formats a number according to the Indian numbering system:
 * e.g. 100000 -> "1,00,000.00", 10000000 -> "1,00,00,000.00"
 */
export function formatIndianNumber(amount: number): string {
  const parts = Math.abs(amount).toFixed(2).split('.');
  const intPart = parts[0];
  const decPart = parts[1];

  if (intPart.length <= 3) {
    return `${intPart}.${decPart}`;
  }

  const lastThree = intPart.slice(-3);
  const remaining = intPart.slice(0, -3);
  const formattedRemaining = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');

  return `${formattedRemaining},${lastThree}.${decPart}`;
}

/**
 * Formats a number according to the International 3-digit grouping system:
 * e.g. 1000000 -> "1,000,000.00", 100000000 -> "100,000,000.00"
 */
export function formatInternationalNumber(amount: number): string {
  const parts = Math.abs(amount).toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decPart = parts[1];
  return `${intPart}.${decPart}`;
}

/**
 * Formats a raw user-typed number string (e.g. from keypad or text input) with either
 * Indian (1,00,00,000) or International (100,000,000) digit grouping, preserving
 * any decimal part as-is.
 */
export function formatRawNumber(
  raw: string,
  numberFormat?: NumberFormat,
  currencyCode?: string
): string {
  if (!raw) return '0';
  const isIndian = numberFormat === 'indian' || (!numberFormat && currencyCode === 'INR');
  const [integerPart, decimalPart] = raw.split('.');

  let formattedInteger: string;
  if (isIndian) {
    if (integerPart.length <= 3) {
      formattedInteger = integerPart;
    } else {
      const lastThree = integerPart.slice(-3);
      const remaining = integerPart.slice(0, -3);
      const formattedRemaining = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      formattedInteger = `${formattedRemaining},${lastThree}`;
    }
  } else {
    formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  if (decimalPart !== undefined) {
    return `${formattedInteger}.${decimalPart}`;
  }
  return formattedInteger;
}

/**
 * Formats currency amount using either Indian (1,00,00,000) or
 * International (100,000,000) digit grouping.
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  numberFormat?: NumberFormat
): string {
  const symbol = getCurrencySymbol(currencyCode);
  const rounded = Math.round(amount * 100) / 100;
  const isIndian = numberFormat === 'indian' || (!numberFormat && currencyCode === 'INR');

  const formatted = isIndian
    ? formatIndianNumber(rounded)
    : formatInternationalNumber(rounded);

  return `${rounded < 0 ? '-' : ''}${symbol}${formatted}`;
}

/**
 * Short form for chart labels, where a full currency string would collide with
 * its neighbours:
 * - Indian mode: 125000 -> "₹1.3L", 15000000 -> "₹1.5Cr"
 * - International mode: 1500000 -> "$1.5M", 1500000000 -> "$1.5B"
 */
export function formatCompact(
  amount: number,
  currencyCode: string,
  numberFormat?: NumberFormat
): string {
  const symbol = getCurrencySymbol(currencyCode);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const isIndian = numberFormat === 'indian' || (!numberFormat && currencyCode === 'INR');

  if (isIndian) {
    if (abs >= 10_000_000) return `${sign}${symbol}${(abs / 10_000_000).toFixed(1)}Cr`;
    if (abs >= 100_000) return `${sign}${symbol}${(abs / 100_000).toFixed(1)}L`;
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
    return `${sign}${symbol}${Math.round(abs)}`;
  }

  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${symbol}${Math.round(abs)}`;
}
