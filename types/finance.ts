import { Ionicons } from '@expo/vector-icons';

export type IconName = keyof typeof Ionicons.glyphMap;

export type AccountType = 'cash' | 'bank' | 'card' | 'wallet' | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  icon: IconName;
  color: string;
  initialBalance: number;
  createdAt: string;
  archived?: boolean;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  icon: IconName;
  color: string;
  kind: CategoryKind;
  isDefault?: boolean;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  date: string;
  note?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  monthlyLimit: number;
  createdAt: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface AppSettings {
  currency: string;
  hasOnboarded: boolean;
  themePreference: ThemePreference;
}

export interface FinanceState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  settings: AppSettings;
  isLoaded: boolean;
}
