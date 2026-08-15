'use no memo';
// Must stay the file's literal first line — see quick-log-widget.tsx for why:
// react-native-android-widget calls these components directly, outside a real
// React render, and the project's React Compiler otherwise instruments them
// anyway, which throws. This opts the whole file out, per the library's own
// error-message guidance.

import React from 'react';
import { FlexWidget, TextWidget, type HexColor } from 'react-native-android-widget';

import { formatCurrency } from '@/utils/currency';

const WIDGET_COLORS = {
  gradientFrom: '#EDE3FB',
  gradientTo: '#FBDDE6',
  surface: '#FFFFFF',
  cta: '#17131F',
  ctaText: '#FFFFFF',
  textPrimary: '#191527',
  textSecondary: '#6B6480',
  textMuted: '#A29BB4',
  income: '#2EA97C',
  expense: '#E05C7E',
} as const;

export interface QuickActionsWidgetProps {
  currency: string;
  balance: number;
  spentThisMonth: number;
  ready: boolean;
}

interface ActionProps {
  label: string;
  emoji: string;
  uri: string;
  tint: HexColor;
  filled?: boolean;
}

/** Each action deep-links into the app, landing on the right screen directly. */
function Action({ label, emoji, uri, tint, filled = false }: ActionProps) {
  'use no memo';
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 38,
        marginHorizontal: 3,
        borderRadius: 19,
        backgroundColor: filled ? WIDGET_COLORS.cta : WIDGET_COLORS.surface,
      }}
    >
      <TextWidget text={emoji} style={{ fontSize: 13 }} />
      <TextWidget
        text={label}
        maxLines={1}
        style={{
          fontSize: 11,
          fontWeight: '600',
          marginLeft: 5,
          color: filled ? WIDGET_COLORS.ctaText : tint,
        }}
      />
    </FlexWidget>
  );
}

/**
 * Balance at a glance plus shortcuts into the add flows. Unlike the quick-log
 * widget these open the app, because each one needs input to finish.
 */
export function QuickActionsWidget({
  currency,
  balance,
  spentThisMonth,
  ready,
}: QuickActionsWidgetProps) {
  'use no memo';
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
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
        style={{ width: 'match_parent', flexDirection: 'column' }}
      >
        <TextWidget
          text="Total balance"
          style={{ fontSize: 10, color: WIDGET_COLORS.textSecondary }}
        />
        <TextWidget
          text={ready ? formatCurrency(balance, currency) : 'Open Mercury'}
          maxLines={1}
          style={{
            fontSize: 22,
            fontWeight: '700',
            color: WIDGET_COLORS.textPrimary,
            marginTop: 1,
          }}
        />
        <TextWidget
          text={ready ? `${formatCurrency(spentThisMonth, currency)} spent this month` : 'to get started'}
          maxLines={1}
          style={{ fontSize: 10, color: WIDGET_COLORS.textMuted, marginTop: 2 }}
        />
      </FlexWidget>

      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 10,
        }}
      >
        <Action
          label="Expense"
          emoji="➖"
          uri="mercury://add-transaction?type=expense"
          tint={WIDGET_COLORS.expense}
          filled
        />
        <Action
          label="Income"
          emoji="➕"
          uri="mercury://add-transaction?type=income"
          tint={WIDGET_COLORS.income}
        />
        <Action
          label="Scan"
          emoji="✨"
          uri="mercury://add-transaction?scan=1"
          tint={WIDGET_COLORS.textPrimary}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
