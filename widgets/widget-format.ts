/**
 * Pure presentation helpers shared by the widget components. Plain functions,
 * not components, so none of this needs the 'use no memo' directive that the
 * JSX-returning files carry — the React Compiler only instruments components
 * and hooks.
 */

import { WidgetAccountBalance } from '@/utils/widget-data';

/** Truncates a long account name so it survives a tile's tight width. */
export function shortAccountName(name: string, maxLen = 11): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

/**
 * Resolves a preset's funding account exactly the way `buildPresetTransaction`
 * does — falling back to the highest-balance account — so what the widget
 * displays always matches what a tap will actually record.
 */
export function resolvePresetAccount(
  accounts: WidgetAccountBalance[],
  accountId: string | undefined
): WidgetAccountBalance | undefined {
  return accounts.find(a => a.id === accountId) ?? accounts[0];
}

export type WidgetSizeClass = {
  columns: number;
  rows: number;
  showAccountLine: boolean;
};

/**
 * Chooses a layout for the Quick Log grid from the widget's current size.
 * RemoteViews has no flex-wrap, so row/column counts are decided up front in
 * JS and the tiles are chunked into explicit row containers.
 */
export function quickLogSizeClass(width: number, height: number): WidgetSizeClass {
  const rows = height >= 175 ? 2 : 1;
  const columns = width >= 380 ? 4 : width >= 300 ? 3 : 2;

  // `height` is the whole widget, not the tile area — the outer vertical
  // padding, the header row, and the header-to-body gap all come out of it
  // first (~46dp in the current layout), plus a 6dp gap between each row.
  const chromeHeight = 46;
  const rowGaps = (rows - 1) * 6;
  const bodyHeight = Math.max(0, height - chromeHeight - rowGaps);
  const perRowHeight = bodyHeight / rows;

  return { columns, rows, showAccountLine: perRowHeight >= 72 };
}

/** How many of the user's accounts fit in the Balance widget's current height. */
export function accountRowCapacity(height: number): number {
  // ~190dp covers the balance block and action row before any list starts.
  const available = height - 190;
  if (available < 30) return 0;
  return Math.min(4, Math.floor(available / 32));
}

/** Splits a flat list into fixed-size chunks, dropping a trailing empty one. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
