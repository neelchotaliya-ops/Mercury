import { Category, AccountType, IconName } from '@/types/finance';

/**
 * Category colours are deliberately desaturated jewel tones so they sit
 * inside the app's lavender/blush surfaces without shouting.
 */
export const DEFAULT_EXPENSE_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Food & Dining',    icon: 'restaurant',                  color: '#EE8A5B', kind: 'expense', isDefault: true },
  { name: 'Groceries',        icon: 'cart',                        color: '#5CB98F', kind: 'expense', isDefault: true },
  { name: 'Transport',        icon: 'car',                         color: '#6C8FE8', kind: 'expense', isDefault: true },
  { name: 'Shopping',         icon: 'bag-handle',                  color: '#E67FAF', kind: 'expense', isDefault: true },
  { name: 'Bills & Utilities',icon: 'receipt',                     color: '#DFAE5D', kind: 'expense', isDefault: true },
  { name: 'Entertainment',    icon: 'film',                        color: '#A783E3', kind: 'expense', isDefault: true },
  { name: 'Health',           icon: 'medkit',                      color: '#E07C84', kind: 'expense', isDefault: true },
  { name: 'Housing',          icon: 'home',                        color: '#8B7FE0', kind: 'expense', isDefault: true },
  { name: 'Education',        icon: 'school',                      color: '#5FB6C4', kind: 'expense', isDefault: true },
  { name: 'Travel',           icon: 'airplane',                    color: '#6BADDB', kind: 'expense', isDefault: true },
  { name: 'Subscriptions',    icon: 'repeat',                      color: '#9B72E8', kind: 'expense', isDefault: true },
  { name: 'Insurance',        icon: 'shield-checkmark',            color: '#60A5AD', kind: 'expense', isDefault: true },
  { name: 'Loans & EMI',      icon: 'trending-down',               color: '#D97E6A', kind: 'expense', isDefault: true },
  { name: 'Other',            icon: 'ellipsis-horizontal-circle',  color: '#9A93AC', kind: 'expense', isDefault: true },
];

export const DEFAULT_INCOME_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Salary',       icon: 'cash',                        color: '#5CB98F', kind: 'income', isDefault: true },
  { name: 'Business',     icon: 'briefcase',                   color: '#6C8FE8', kind: 'income', isDefault: true },
  { name: 'Investments',  icon: 'trending-up',                 color: '#A783E3', kind: 'income', isDefault: true },
  { name: 'Gifts',        icon: 'gift',                        color: '#E67FAF', kind: 'income', isDefault: true },
  { name: 'Other Income', icon: 'ellipsis-horizontal-circle',  color: '#9A93AC', kind: 'income', isDefault: true },
];

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: IconName; color: string }> = {
  cash:   { label: 'Cash',   icon: 'cash-outline',      color: '#22C55E' },
  bank:   { label: 'Bank',   icon: 'business-outline',  color: '#3B82F6' },
  card:   { label: 'Card',   icon: 'card-outline',      color: '#A855F7' },
  wallet: { label: 'Wallet', icon: 'wallet-outline',    color: '#F97316' },
  other:  { label: 'Other',  icon: 'ellipse-outline',   color: '#64748B' },
};

export const CATEGORY_ICON_CHOICES: IconName[] = [
  'restaurant', 'cart', 'car', 'bag-handle', 'receipt', 'film', 'medkit', 'home',
  'school', 'airplane', 'cash', 'briefcase', 'trending-up', 'gift', 'paw',
  'fitness', 'gift-outline', 'game-controller', 'phone-portrait', 'construct',
  'repeat', 'shield-checkmark', 'trending-down', 'people', 'flash',
  'notifications', 'calendar', 'card', 'wallet', 'business',
  'ellipsis-horizontal-circle',
];

export const CATEGORY_COLOR_CHOICES: string[] = [
  '#EE8A5B', '#5CB98F', '#6C8FE8', '#E67FAF', '#DFAE5D', '#A783E3',
  '#E07C84', '#8B7FE0', '#5FB6C4', '#6BADDB', '#9A93AC', '#4FB3A5',
  '#9B72E8', '#60A5AD', '#D97E6A', '#7EC8A4',
];

