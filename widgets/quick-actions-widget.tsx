'use no memo';
// Must stay the file's literal first line — see quick-log-widget.tsx for why:
// react-native-android-widget calls these components directly, outside a real
// React render, and the project's React Compiler otherwise instruments them
// anyway, which throws. This opts the whole file out, per the library's own
// error-message guidance.

import React from 'react';
import { FlexWidget, TextWidget, type HexColor } from 'react-native-android-widget';

import { formatCurrency } from '@/utils/currency';
import { WidgetAccountBalance } from '@/utils/widget-data';
import { WidgetGlyph, type WidgetGlyphProps } from '@/widgets/widget-icon';
import { accountRowCapacity, resolveWidgetSize } from '@/widgets/widget-format';

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
  divider: 'rgba(25, 21, 39, 0.08)',
} as const;

export interface QuickActionsWidgetProps {
  currency: string;
  balance: number;
  spentThisMonth: number;
  accounts: WidgetAccountBalance[];
  ready: boolean;
  /** Current widget size in dp; layout adapts across small / medium / large. */
  width: number;
  height: number;
}

interface ActionProps {
  label: string;
  glyph: WidgetGlyphProps['name'];
  uri: string;
  tint: HexColor;
  filled?: boolean;
}

/** Each action deep-links into the app, landing on the right screen directly. */
function Action({ label, glyph, uri, tint, filled = false }: ActionProps) {
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
        borderRadius: 19,
        backgroundColor: filled ? WIDGET_COLORS.cta : WIDGET_COLORS.surface,
      }}
    >
      <WidgetGlyph name={glyph} size={14} color={filled ? WIDGET_COLORS.ctaText : tint} />
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

/** One row of the account breakdown. Taps open the Accounts screen. */
function AccountRow({ account, currency }: { account: WidgetAccountBalance; currency: string }) {
  'use no memo';
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'mercury://accounts' }}
      accessibilityLabel={`${account.name}, ${formatCurrency(account.balance, currency)}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 'match_parent',
        paddingVertical: 3,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <FlexWidget
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: account.color as HexColor }}
        />
        <TextWidget
          text={account.name}
          maxLines={1}
          style={{ fontSize: 11, color: WIDGET_COLORS.textPrimary, marginLeft: 6 }}
        />
      </FlexWidget>
      <TextWidget
        text={formatCurrency(account.balance, currency)}
        maxLines={1}
        style={{ fontSize: 11, fontWeight: '700', color: WIDGET_COLORS.textPrimary }}
      />
    </FlexWidget>
  );
}

// ---- Small layout -----------------------------------------------------------

/**
 * Small (≤250dp wide or ≤130dp tall): balance headline + a single CTA button.
 * No subtitle, no breakdown — fits in a 2×2 home-screen cell.
 */
function SmallLayout({
  currency,
  balance,
  ready,
}: Pick<QuickActionsWidgetProps, 'currency' | 'balance' | 'ready'>) {
  'use no memo';
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
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
      <FlexWidget clickAction="OPEN_APP" style={{ flexDirection: 'column' }}>
        <TextWidget
          text="Balance"
          style={{ fontSize: 9, color: WIDGET_COLORS.textSecondary }}
        />
        <TextWidget
          text={ready ? formatCurrency(balance, currency) : '—'}
          maxLines={1}
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: WIDGET_COLORS.textPrimary,
            marginTop: 1,
          }}
        />
      </FlexWidget>

      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'mercury://add-transaction?type=expense' }}
        accessibilityLabel="Add expense"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          height: 32,
          borderRadius: 16,
          backgroundColor: WIDGET_COLORS.cta,
        }}
      >
        <WidgetGlyph name="add-circle" size={12} color={WIDGET_COLORS.ctaText} />
        <TextWidget
          text="Add"
          maxLines={1}
          style={{ fontSize: 10, fontWeight: '600', marginLeft: 4, color: WIDGET_COLORS.ctaText }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// ---- Medium layout ----------------------------------------------------------

/**
 * Medium (default): balance + subtitle + 3 action buttons.
 * Fits the standard 4×2 or 4×3 home-screen cell.
 */
function MediumLayout({
  currency,
  balance,
  spentThisMonth,
  ready,
}: Omit<QuickActionsWidgetProps, 'accounts' | 'width' | 'height'>) {
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
      <FlexWidget clickAction="OPEN_APP" style={{ width: 'match_parent', flexDirection: 'column' }}>
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
          text={
            ready
              ? `${formatCurrency(spentThisMonth, currency)} spent this month`
              : 'to get started'
          }
          maxLines={1}
          style={{ fontSize: 10, color: WIDGET_COLORS.textMuted, marginTop: 2 }}
        />
      </FlexWidget>

      <FlexWidget
        style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 6 }}
      >
        <Action
          label="Expense"
          glyph="remove-circle"
          uri="mercury://add-transaction?type=expense"
          tint={WIDGET_COLORS.expense}
          filled
        />
        <Action
          label="Income"
          glyph="add-circle"
          uri="mercury://add-transaction?type=income"
          tint={WIDGET_COLORS.income}
        />
        <Action
          label="Scan"
          glyph="sparkles"
          uri="mercury://add-transaction?scan=1"
          tint={WIDGET_COLORS.textPrimary}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

// ---- Large layout -----------------------------------------------------------

/**
 * Large (≥380dp wide AND ≥250dp tall): balance + actions + full account
 * breakdown. Fills a 4×4 or bigger cell.
 */
function LargeLayout({
  currency,
  balance,
  spentThisMonth,
  accounts,
  ready,
  height,
}: Omit<QuickActionsWidgetProps, 'width'>) {
  'use no memo';
  const accountRows = ready ? accounts.slice(0, accountRowCapacity(height)) : [];
  const hasAccountRows = accountRows.length > 0;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: hasAccountRows ? 'flex-start' : 'space-between',
        flexGap: hasAccountRows ? 8 : 0,
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
      <FlexWidget clickAction="OPEN_APP" style={{ width: 'match_parent', flexDirection: 'column' }}>
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
          text={
            ready
              ? `${formatCurrency(spentThisMonth, currency)} spent this month`
              : 'to get started'
          }
          maxLines={1}
          style={{ fontSize: 10, color: WIDGET_COLORS.textMuted, marginTop: 2 }}
        />
      </FlexWidget>

      <FlexWidget
        style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 6 }}
      >
        <Action
          label="Expense"
          glyph="remove-circle"
          uri="mercury://add-transaction?type=expense"
          tint={WIDGET_COLORS.expense}
          filled
        />
        <Action
          label="Income"
          glyph="add-circle"
          uri="mercury://add-transaction?type=income"
          tint={WIDGET_COLORS.income}
        />
        <Action
          label="Scan"
          glyph="sparkles"
          uri="mercury://add-transaction?scan=1"
          tint={WIDGET_COLORS.textPrimary}
        />
      </FlexWidget>

      {hasAccountRows ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'column',
            borderTopWidth: 1,
            borderTopColor: WIDGET_COLORS.divider,
            paddingTop: 6,
            flexGap: 2,
          }}
        >
          {accountRows.map(account => (
            <AccountRow key={account.id} account={account} currency={currency} />
          ))}
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

// ---- Root component ---------------------------------------------------------

/**
 * Balance at a glance plus shortcuts into the add flows. Adapts between three
 * named layouts (small / medium / large) based on the widget's current dp
 * dimensions, so content density always matches the available space.
 *
 * Resizing is handled natively — the OS calls WIDGET_RESIZED which re-invokes
 * widgetTaskHandler with the new dimensions, and this component picks the
 * correct layout automatically.
 */
export function QuickActionsWidget(props: QuickActionsWidgetProps) {
  'use no memo';
  const size = resolveWidgetSize(props.width, props.height);

  if (size === 'small') {
    return (
      <SmallLayout
        currency={props.currency}
        balance={props.balance}
        ready={props.ready}
      />
    );
  }
  if (size === 'large') {
    return <LargeLayout {...props} />;
  }
  return <MediumLayout {...props} />;
}
