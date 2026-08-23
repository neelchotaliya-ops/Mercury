/**
 * Mercury Centralized Icon Library
 *
 * A single typed lookup table for all semantic icon names used across the app.
 * Every value is a valid Ionicons glyph — just a compile-time alias, zero
 * runtime cost.
 *
 * Usage:
 *   import { ICONS } from '@/constants/icons';
 *   <Ionicons name={ICONS.action.add} />
 *
 * Screens can adopt this gradually; existing raw string literals keep working.
 */

import { IconName } from '@/types/finance';

type IconMap = Record<string, IconName>;

// ---- Accounts ---------------------------------------------------------------

const accountIcons = {
  cash:   'cash-outline',
  bank:   'business-outline',
  card:   'card-outline',
  wallet: 'wallet-outline',
  other:  'ellipse-outline',
} as const satisfies IconMap;

// ---- Categories (default set) -----------------------------------------------

const categoryIcons = {
  // Expense
  foodDining:     'restaurant',
  groceries:      'cart',
  transport:      'car',
  shopping:       'bag-handle',
  billsUtilities: 'receipt',
  entertainment:  'film',
  health:         'medkit',
  housing:        'home',
  education:      'school',
  travel:         'airplane',
  subscription:   'repeat',
  insurance:      'shield-checkmark',
  loans:          'trending-down',
  pets:           'paw',
  fitness:        'fitness',
  gaming:         'game-controller',
  electronics:    'phone-portrait',
  repair:         'construct',
  // Income
  salary:         'cash',
  business:       'briefcase',
  investments:    'trending-up',
  gifts:          'gift',
  // Generic
  other:          'ellipsis-horizontal-circle',
} as const satisfies IconMap;

// ---- Navigation / Screens ---------------------------------------------------

const navIcons = {
  home:         'home',
  transactions: 'list',
  insights:     'analytics',
  budgets:      'pie-chart',
  settings:     'settings',
  accounts:     'wallet',
} as const satisfies IconMap;

// ---- Actions ----------------------------------------------------------------

const actionIcons = {
  add:       'add-circle',
  addFilled: 'add-circle',
  edit:      'pencil',
  delete:    'trash',
  close:     'close',
  back:      'chevron-back',
  forward:   'chevron-forward',
  import:    'download-outline',
  export:    'share-outline',
  bankImport:'document-text-outline',
  scan:      'sparkles',
  filter:    'filter',
  sort:      'swap-vertical',
  search:    'search',
  calendar:  'calendar',
  recurring: 'repeat',
  split:     'people',
  settle:    'checkmark-circle',
  remind:    'notifications',
  pause:     'pause-circle',
  resume:    'play-circle',
} as const satisfies IconMap;

// ---- Status -----------------------------------------------------------------

const statusIcons = {
  pending:     'time-outline',
  partialPaid: 'hourglass-outline',
  paid:        'checkmark-circle',
  cancelled:   'close-circle',
  overdue:     'warning',
  active:      'radio-button-on',
  inactive:    'radio-button-off',
  auto:        'flash',
  manual:      'hand-left',
} as const satisfies IconMap;

// ---- Features ---------------------------------------------------------------

const featureIcons = {
  recurring: 'repeat',
  split:     'people',
  budget:    'pie-chart',
  insights:  'analytics',
  import:    'cloud-download',
  export:    'cloud-upload',
  preset:    'flash',
} as const satisfies IconMap;

// ---- Frequencies (for recurring rules) --------------------------------------

const frequencyIcons = {
  daily:   'today',
  weekly:  'calendar',
  monthly: 'calendar-number',
  yearly:  'calendar-clear',
  custom:  'options',
} as const satisfies IconMap;

// ---- Root export ------------------------------------------------------------

export const ICONS = {
  account:   accountIcons,
  category:  categoryIcons,
  nav:       navIcons,
  action:    actionIcons,
  status:    statusIcons,
  feature:   featureIcons,
  frequency: frequencyIcons,
} as const;

export type IconsType = typeof ICONS;
