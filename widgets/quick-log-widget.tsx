'use no memo';
// Must stay the file's literal first line — react-native-android-widget calls
// these components directly and walks the returned JSX to build native views;
// there is no real React render happening. The project's React Compiler
// (app.json experiments.reactCompiler) instruments components with a memoization
// hook regardless, which throws "Invalid Hook Call" outside a real render. This
// opts the whole file out of that instrumentation, per the library's own guidance.

import React from 'react';
import { FlexWidget, TextWidget, type HexColor } from 'react-native-android-widget';

import { QuickPreset } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { WidgetAccountBalance } from '@/utils/widget-data';
import { WidgetGlyph } from '@/widgets/widget-icon';
import { chunk, quickLogSizeClass, resolvePresetAccount, shortAccountName } from '@/widgets/widget-format';

const WIDGET_COLORS = {
  gradientFrom: '#EDE3FB',
  gradientTo: '#FBDDE6',
  surface: '#FFFFFF',
  textPrimary: '#191527',
  textSecondary: '#6B6480',
  textMuted: '#A29BB4',
  primaryDeep: '#6D28D9',
} as const;

export interface QuickLogWidgetProps {
  currency: string;
  spentThisMonth: number;
  presets: QuickPreset[];
  accounts: WidgetAccountBalance[];
  ready: boolean;
  /** Label of whatever was logged last, shown briefly as confirmation. */
  justLogged?: string;
  /** Current widget size in dp, used to pick columns/rows/detail level. */
  width: number;
  height: number;
}

interface TileProps {
  preset: QuickPreset;
  currency: string;
  account?: WidgetAccountBalance;
  showAccountLine: boolean;
  compact: boolean;
}

function PresetTile({ preset, currency, account, showAccountLine, compact }: TileProps) {
  'use no memo';
  const accent = (account?.color as HexColor | undefined) ?? WIDGET_COLORS.primaryDeep;

  return (
    <FlexWidget
      clickAction="QUICK_LOG"
      clickActionData={{ presetId: preset.id }}
      accessibilityLabel={`Log ${preset.label}, ${formatCurrency(preset.amount, currency)}${
        account ? ` from ${account.name}` : ''
      }`}
      style={{
        flex: 1,
        height: 'match_parent',
        flexDirection: 'row',
        borderRadius: 16,
        backgroundColor: WIDGET_COLORS.surface,
        overflow: 'hidden',
      }}
    >
      <FlexWidget style={{ width: 3, height: 'match_parent', backgroundColor: accent }} />
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: compact ? 5 : 8,
          paddingHorizontal: 3,
        }}
      >
        <TextWidget text={preset.emoji} style={{ fontSize: compact ? 16 : 20 }} />
        <TextWidget
          text={formatCurrency(preset.amount, currency)}
          maxLines={1}
          style={{
            fontSize: compact ? 11 : 12,
            fontWeight: '700',
            color: WIDGET_COLORS.textPrimary,
            marginTop: 2,
          }}
        />
        <TextWidget
          text={preset.label}
          maxLines={1}
          style={{ fontSize: 9, color: WIDGET_COLORS.textMuted, marginTop: 1 }}
        />
        {showAccountLine && account ? (
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <FlexWidget style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
            <TextWidget
              text={shortAccountName(account.name)}
              maxLines={1}
              style={{ fontSize: 8, color: WIDGET_COLORS.textSecondary, marginLeft: 3 }}
            />
          </FlexWidget>
        ) : null}
      </FlexWidget>
    </FlexWidget>
  );
}

function TileRow({
  presets,
  currency,
  accounts,
  showAccountLine,
  compact,
}: {
  presets: QuickPreset[];
  currency: string;
  accounts: WidgetAccountBalance[];
  showAccountLine: boolean;
  compact: boolean;
}) {
  'use no memo';
  return (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flex: 1, flexGap: 6 }}>
      {presets.map(preset => (
        <PresetTile
          key={preset.id}
          preset={preset}
          currency={currency}
          account={resolvePresetAccount(accounts, preset.accountId)}
          showAccountLine={showAccountLine}
          compact={compact}
        />
      ))}
    </FlexWidget>
  );
}

function EmptyState() {
  'use no memo';
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'mercury://quick-presets' }}
      style={{
        flex: 1,
        width: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <WidgetGlyph name="add-circle-outline" size={22} color={WIDGET_COLORS.primaryDeep} />
      <TextWidget
        text="Set up one-tap presets"
        style={{ fontSize: 13, fontWeight: '700', color: WIDGET_COLORS.textPrimary, marginTop: 6 }}
      />
      <TextWidget
        text="Tap to add them in Mercury"
        style={{ fontSize: 10, color: WIDGET_COLORS.textSecondary, marginTop: 2 }}
      />
    </FlexWidget>
  );
}

/**
 * One-tap expense logging. Each tile emits a QUICK_LOG action handled in the
 * background task, so tapping records the transaction without opening the
 * app. Resizing taller reveals a second row and, with enough room per tile,
 * which account each preset draws from.
 */
export function QuickLogWidget({
  currency,
  spentThisMonth,
  presets,
  accounts,
  ready,
  justLogged,
  width,
  height,
}: QuickLogWidgetProps) {
  'use no memo';
  const { columns, rows, showAccountLine } = quickLogSizeClass(width, height);
  const visible = presets.slice(0, columns * rows);
  const tileRows = chunk(visible, columns);
  const compact = rows === 2;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 24,
        flexGap: 6,
        backgroundGradient: {
          from: WIDGET_COLORS.gradientFrom,
          to: WIDGET_COLORS.gradientTo,
          orientation: 'TL_BR',
        },
      }}
    >
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <WidgetGlyph name="flash" size={13} color={WIDGET_COLORS.primaryDeep} />
          <TextWidget
            text={justLogged ? `Added ${justLogged}` : 'Quick log'}
            maxLines={1}
            style={{
              fontSize: 11,
              fontWeight: '700',
              marginLeft: 5,
              color: justLogged ? WIDGET_COLORS.primaryDeep : WIDGET_COLORS.textSecondary,
            }}
          />
        </FlexWidget>
        <TextWidget
          text={ready ? `${formatCurrency(spentThisMonth, currency)} this mo` : 'Mercury'}
          maxLines={1}
          style={{ fontSize: 10, color: WIDGET_COLORS.textMuted }}
        />
      </FlexWidget>

      {visible.length === 0 ? (
        <EmptyState />
      ) : (
        <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'column', flexGap: 6 }}>
          {tileRows.map((rowPresets, index) => (
            <TileRow
              key={index}
              presets={rowPresets}
              currency={currency}
              accounts={accounts}
              showAccountLine={showAccountLine}
              compact={compact}
            />
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
