'use no memo';
// Directive above must stay the file's literal first line — react-native-android-widget
// calls these components directly and walks the returned JSX to build native views;
// there is no real React render happening. The project's React Compiler
// (app.json experiments.reactCompiler) instruments components with a memoization
// hook regardless, which throws "Invalid Hook Call" outside a real render. This
// opts the whole file out of that instrumentation, per the library's own guidance.

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { QuickPreset } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';

/**
 * Widget colours are literal rather than imported from the theme: widget
 * styles only accept solid hex/rgba values, so the translucent glass tokens the
 * app uses cannot be reused directly. These are their flattened equivalents.
 */
const WIDGET_COLORS = {
  gradientFrom: '#EDE3FB',
  gradientTo: '#FBDDE6',
  surface: '#FFFFFF',
  textPrimary: '#191527',
  textSecondary: '#6B6480',
  textMuted: '#A29BB4',
  expense: '#E05C7E',
  primaryDeep: '#6D28D9',
} as const;

export interface QuickLogWidgetProps {
  currency: string;
  spentThisMonth: number;
  presets: QuickPreset[];
  ready: boolean;
  /** Label of whatever was logged last, shown briefly as confirmation. */
  justLogged?: string;
}

/** Fills the tile evenly regardless of how many presets the user kept. */
function PresetTile({ preset, currency }: { preset: QuickPreset; currency: string }) {
  return (
    <FlexWidget
      clickAction="QUICK_LOG"
      clickActionData={{ presetId: preset.id }}
      accessibilityLabel={`Log ${preset.label}, ${formatCurrency(preset.amount, currency)}`}
      style={{
        flex: 1,
        height: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        marginHorizontal: 3,
        borderRadius: 18,
        backgroundColor: WIDGET_COLORS.surface,
      }}
    >
      <TextWidget text={preset.emoji} style={{ fontSize: 20 }} />
      <TextWidget
        text={formatCurrency(preset.amount, currency)}
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: WIDGET_COLORS.textPrimary,
          marginTop: 3,
        }}
      />
      <TextWidget
        text={preset.label}
        maxLines={1}
        style={{ fontSize: 9, color: WIDGET_COLORS.textMuted, marginTop: 1 }}
      />
    </FlexWidget>
  );
}

function EmptyState() {
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
      <TextWidget
        text="Set up one-tap presets"
        style={{ fontSize: 13, fontWeight: '700', color: WIDGET_COLORS.textPrimary }}
      />
      <TextWidget
        text="Tap to add them in Mercury"
        style={{ fontSize: 10, color: WIDGET_COLORS.textSecondary, marginTop: 3 }}
      />
    </FlexWidget>
  );
}

/**
 * One-tap expense logging. Each tile emits a QUICK_LOG action handled in the
 * background task, so tapping records the transaction without opening the app.
 */
export function QuickLogWidget({
  currency,
  spentThisMonth,
  presets,
  ready,
  justLogged,
}: QuickLogWidgetProps) {
  const visible = presets.slice(0, 4);

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 24,
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
          marginBottom: 8,
        }}
      >
        <TextWidget
          text={justLogged ? `Added ${justLogged}` : 'Quick log'}
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: justLogged ? WIDGET_COLORS.primaryDeep : WIDGET_COLORS.textSecondary,
          }}
        />
        <TextWidget
          text={ready ? `${formatCurrency(spentThisMonth, currency)} this month` : 'Mercury'}
          style={{ fontSize: 10, color: WIDGET_COLORS.textMuted }}
        />
      </FlexWidget>

      {visible.length === 0 ? (
        <EmptyState />
      ) : (
        <FlexWidget
          style={{
            flex: 1,
            width: 'match_parent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {visible.map(preset => (
            <PresetTile key={preset.id} preset={preset} currency={currency} />
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
