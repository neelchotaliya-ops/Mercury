'use no memo';
// Must stay the file's literal first line — see quick-log-widget.tsx for why:
// render() below returns JSX that react-native-android-widget walks directly,
// outside a real React render, and the project's React Compiler otherwise
// instruments it anyway, which throws.

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { QuickLogWidget } from '@/widgets/quick-log-widget';
import { QuickActionsWidget } from '@/widgets/quick-actions-widget';
import { WidgetSummary, getWidgetSummary, logPreset } from '@/utils/widget-data';

/** Must match the `name` of each widget declared in app.json. */
const WIDGETS = {
  QuickLog: 'QuickLog',
  QuickActions: 'QuickActions',
} as const;

function render(
  widgetName: string,
  summary: WidgetSummary,
  justLogged?: string
): React.JSX.Element {
  'use no memo';
  if (widgetName === WIDGETS.QuickActions) {
    return (
      <QuickActionsWidget
        currency={summary.currency}
        balance={summary.balance}
        spentThisMonth={summary.spentThisMonth}
        ready={summary.ready}
      />
    );
  }

  return (
    <QuickLogWidget
      currency={summary.currency}
      spentThisMonth={summary.spentThisMonth}
      presets={summary.presets}
      ready={summary.ready}
      justLogged={justLogged}
    />
  );
}

/**
 * Renders a widget from current storage. Used when the app asks for a refresh
 * after data changes, rather than waiting for Android's own update tick.
 */
export async function renderWidgetByName(widgetName: string): Promise<React.JSX.Element> {
  return render(widgetName, await getWidgetSummary());
}

/**
 * Runs in a headless JS task whenever Android needs a widget drawn or a widget
 * is tapped. There is no React tree and no FinanceProvider here, so all data
 * goes through `utils/widget-data`, which reads and writes AsyncStorage
 * directly — that is what lets a tap record a transaction without launching
 * the app.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const widgetName = props.widgetInfo.widgetName;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      props.renderWidget(render(widgetName, await getWidgetSummary()));
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
        props.renderWidget(render(widgetName, result.summary, result.transaction.note));
      } else {
        props.renderWidget(render(widgetName, await getWidgetSummary()));
      }
      break;
    }

    case 'WIDGET_DELETED':
      break;

    default:
      break;
  }
}
