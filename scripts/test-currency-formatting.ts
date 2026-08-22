import assert from 'node:assert/strict';
import {
  formatCurrency,
  formatIndianNumber,
  formatInternationalNumber,
  formatCompact,
  formatRawNumber,
  CURRENCIES,
} from '../utils/currency';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}`);
    throw e;
  }
}

// 1. INR in CURRENCIES
test('INR is available in supported CURRENCIES', () => {
  const inr = CURRENCIES.find(c => c.code === 'INR');
  assert.ok(inr, 'INR should exist');
  assert.equal(inr?.symbol, '₹');
});

// 2. formatIndianNumber
test('formatIndianNumber groups digits by Indian numbering system (Lakhs & Crores)', () => {
  assert.equal(formatIndianNumber(0), '0.00');
  assert.equal(formatIndianNumber(50), '50.00');
  assert.equal(formatIndianNumber(450), '450.00');
  assert.equal(formatIndianNumber(1299), '1,299.00');
  assert.equal(formatIndianNumber(10000), '10,000.00');
  assert.equal(formatIndianNumber(100000), '1,00,000.00'); // 1 Lakh
  assert.equal(formatIndianNumber(125000.5), '1,25,000.50');
  assert.equal(formatIndianNumber(1000000), '10,00,000.00'); // 10 Lakhs
  assert.equal(formatIndianNumber(10000000), '1,00,00,000.00'); // 1 Crore
  assert.equal(formatIndianNumber(100000000), '10,00,00,000.00'); // 10 Crores
});

// 3. formatInternationalNumber
test('formatInternationalNumber groups digits by standard 3-digit thousands', () => {
  assert.equal(formatInternationalNumber(0), '0.00');
  assert.equal(formatInternationalNumber(1299), '1,299.00');
  assert.equal(formatInternationalNumber(100000), '100,000.00');
  assert.equal(formatInternationalNumber(1000000), '1,000,000.00');
  assert.equal(formatInternationalNumber(100000000), '100,000,000.00');
});

// 4. formatCurrency defaults & overrides
test('formatCurrency defaults to Indian grouping for INR', () => {
  assert.equal(formatCurrency(10000000, 'INR'), '₹1,00,00,000.00');
  assert.equal(formatCurrency(125000.5, 'INR'), '₹1,25,000.50');
  assert.equal(formatCurrency(-450, 'INR'), '-₹450.00');
});

test('formatCurrency respects explicit numberFormat setting', () => {
  // International grouping for INR when chosen
  assert.equal(formatCurrency(10000000, 'INR', 'international'), '₹10,000,000.00');
  assert.equal(formatCurrency(100000000, 'INR', 'international'), '₹100,000,000.00');

  // Indian grouping for USD when chosen
  assert.equal(formatCurrency(10000000, 'USD', 'indian'), '$1,00,00,000.00');
  assert.equal(formatCurrency(100000000, 'USD', 'indian'), '$10,00,00,000.00');
});

// 5. formatCompact
test('formatCompact uses Cr and L for Indian format, and M and B for International', () => {
  assert.equal(formatCompact(15000000, 'INR', 'indian'), '₹1.5Cr');
  assert.equal(formatCompact(250000, 'INR', 'indian'), '₹2.5L');
  assert.equal(formatCompact(1500, 'INR', 'indian'), '₹1.5k');

  assert.equal(formatCompact(1500000000, 'USD', 'international'), '$1.5B');
  assert.equal(formatCompact(2500000, 'USD', 'international'), '$2.5M');
  assert.equal(formatCompact(1500, 'USD', 'international'), '$1.5k');
});

// 6. formatRawNumber
test('formatRawNumber correctly groups user input in Indian and International formats', () => {
  assert.equal(formatRawNumber('10000000', 'indian'), '1,00,00,000');
  assert.equal(formatRawNumber('10000000', 'international'), '10,000,000');
  assert.equal(formatRawNumber('125000.75', 'indian'), '1,25,000.75');
  assert.equal(formatRawNumber('125000.75', 'international'), '125,000.75');
  assert.equal(formatRawNumber('', 'indian'), '0');
  assert.equal(formatRawNumber('500', 'indian'), '500');
});

console.log('\nAll currency formatting cases passed.');
