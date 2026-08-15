import { Category, AccountType, IconName } from '@/types/finance';

export const DEFAULT_EXPENSE_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Food & Dining', icon: 'restaurant', color: '#F97316', kind: 'expense', isDefault: true },
  { name: 'Groceries', icon: 'cart', color: '#22C55E', kind: 'expense', isDefault: true },
  { name: 'Transport', icon: 'car', color: '#3B82F6', kind: 'expense', isDefault: true },
  { name: 'Shopping', icon: 'bag-handle', color: '#EC4899', kind: 'expense', isDefault: true },
  { name: 'Bills & Utilities', icon: 'receipt', color: '#EAB308', kind: 'expense', isDefault: true },
  { name: 'Entertainment', icon: 'film', color: '#A855F7', kind: 'expense', isDefault: true },
  { name: 'Health', icon: 'medkit', color: '#EF4444', kind: 'expense', isDefault: true },
  { name: 'Housing', icon: 'home', color: '#8B5CF6', kind: 'expense', isDefault: true },
  { name: 'Education', icon: 'school', color: '#06B6D4', kind: 'expense', isDefault: true },
  { name: 'Travel', icon: 'airplane', color: '#0EA5E9', kind: 'expense', isDefault: true },
  { name: 'Other', icon: 'ellipsis-horizontal-circle', color: '#64748B', kind: 'expense', isDefault: true },
];

export const DEFAULT_INCOME_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Salary', icon: 'cash', color: '#22C55E', kind: 'income', isDefault: true },
  { name: 'Business', icon: 'briefcase', color: '#3B82F6', kind: 'income', isDefault: true },
  { name: 'Investments', icon: 'trending-up', color: '#A855F7', kind: 'income', isDefault: true },
  { name: 'Gifts', icon: 'gift', color: '#EC4899', kind: 'income', isDefault: true },
  { name: 'Other Income', icon: 'ellipsis-horizontal-circle', color: '#64748B', kind: 'income', isDefault: true },
];

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: IconName; color: string }> = {
  cash: { label: 'Cash', icon: 'cash-outline', color: '#22C55E' },
  bank: { label: 'Bank', icon: 'business-outline', color: '#3B82F6' },
  card: { label: 'Card', icon: 'card-outline', color: '#A855F7' },
  wallet: { label: 'Wallet', icon: 'wallet-outline', color: '#F97316' },
  other: { label: 'Other', icon: 'ellipse-outline', color: '#64748B' },
};

export const CATEGORY_ICON_CHOICES: IconName[] = [
  'restaurant', 'cart', 'car', 'bag-handle', 'receipt', 'film', 'medkit', 'home',
  'school', 'airplane', 'cash', 'briefcase', 'trending-up', 'gift', 'paw',
  'fitness', 'gift-outline', 'game-controller', 'phone-portrait', 'construct',
  'ellipsis-horizontal-circle',
];

export const CATEGORY_COLOR_CHOICES: string[] = [
  '#F97316', '#22C55E', '#3B82F6', '#EC4899', '#EAB308', '#A855F7',
  '#EF4444', '#8B5CF6', '#06B6D4', '#0EA5E9', '#64748B', '#14B8A6',
];
