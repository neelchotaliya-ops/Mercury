'use no memo';
// Must stay the file's literal first line — see quick-log-widget.tsx for why:
// render() below returns JSX that react-native-android-widget walks directly,
// outside a real React render, and the project's React Compiler otherwise
// instruments it anyway, which throws.

import React from 'react';
import type { WidgetInfo, WidgetTaskHandlerProps } from 'react-native-android-widget';

import { QuickLogWidget } from '@/widgets/quick-log-widget';
import { QuickActionsWidget } from '@/widgets/quick-actions-widget';
import { WidgetSummary, getWidgetSummary, logPreset } from '@/utils/widget-data';

/** Must match the `name` of each widget declared in app.json. */
const WIDGETS = {
  QuickLog: 'QuickLog',
  QuickActions: 'QuickActions',
} as const;

function render(
  widgetInfo: WidgetInfo,
  summary: WidgetSummary,
  justLogged?: string
): React.JSX.Element {
  if (widgetInfo.widgetName === WIDGETS.QuickActions) {
    return (
      <QuickActionsWidget
        currency={summary.currency}
        balance={summary.balance}
        spentThisMonth={summary.spentThisMonth}
        accounts={summary.accounts}
        ready={summary.ready}
        width={widgetInfo.width}
        height={widgetInfo.height}
      />
    );
  }

  return (
    <QuickLogWidget
      currency={summary.currency}
      spentThisMonth={summary.spentThisMonth}
      presets={summary.presets}
      accounts={summary.accounts}
      ready={summary.ready}
      justLogged={justLogged}
      width={widgetInfo.width}
      height={widgetInfo.height}
    />
  );
}

/**
 * Renders a widget from current storage at its current size. Used both by the
 * app's own refresh-after-change call and by the headless task below.
 */
export async function renderWidgetByInfo(
  widgetInfo: WidgetInfo,
  summaryOverride?: WidgetSummary,
  justLogged?: string
): Promise<React.JSX.Element> {
  const summary = summaryOverride ?? (await getWidgetSummary());
  return render(widgetInfo, summary, justLogged);
}

/**
 * Runs in a headless JS task whenever Android needs a widget drawn or a widget
 * is tapped. There is no React tree and no FinanceProvider here, so all data
 * goes through `utils/widget-data`, which reads and writes AsyncStorage
 * directly — that is what lets a tap record a transaction without launching
 * the app.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      props.renderWidget(await renderWidgetByInfo(props.widgetInfo));
      break;
    }

    case 'WIDGET_CLICK': {
      // OPEN_APP and OPEN_URI are handled natively and never reach here.
      if (props.clickAction !== 'QUICK_LOG') break;

      const presetId = props.clickActionData?.presetId;
      if (typeof presetId !== 'string') break;

      const result = await logPreset(presetId);

      if (result.ok) {
        // Redraw straight from the write's own result so the widget reflects
        // the new total immediately.
        props.renderWidget(
          await renderWidgetByInfo(props.widgetInfo, result.summary, result.transaction.note)
        );
      } else {
        props.renderWidget(await renderWidgetByInfo(props.widgetInfo));
      }
      break;
    }

    case 'WIDGET_DELETED':
      break;

    default:
      break;
  }
}
