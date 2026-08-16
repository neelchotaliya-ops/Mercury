import React from 'react';
import { View, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { formatCompact } from '@/utils/currency';

export interface WeekdayBarsProps {
  /** Seven totals, index 0 = Sunday. */
  buckets: number[];
  currency: string;
  height?: number;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Spend by day of week.
 *
 * One measure, so one colour for every bar — shading each bar by its own value
 * would double-encode the height as hue and spend the only free channel on
 * information the bar length already carries. The busiest day is emphasised
 * instead, and only it is labelled, because that is the single thing this
 * chart exists to say.
 */
export const WeekdayBars: React.FC<WeekdayBarsProps> = ({ buckets, currency, height = 110 }) => {
  const max = Math.max(...buckets, 1);
  const peak = buckets.indexOf(Math.max(...buckets));
  const hasData = buckets.some(v => v > 0);

  return (
    <View>
      <View style={[styles.row, { height }]}>
        {buckets.map((value, index) => {
          const isPeak = hasData && index === peak;
          return (
            <View key={index} style={styles.column}>
              {isPeak ? (
                <AppText variant="micro" style={styles.peakValue}>
                  {formatCompact(value, currency)}
                </AppText>
              ) : null}
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max((value / max) * 100, value > 0 ? 4 : 0)}%`,
                      backgroundColor: isPeak ? Colors.primaryDeep : Colors.primarySoft,
                    },
                  ]}
                />
              </View>
              <AppText
                variant="micro"
                align="center"
                color={isPeak ? Colors.textPrimary : Colors.textMuted}
              >
                {DAYS[index]}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  column: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    gap: 5,
  },
  track: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    // Rounded only at the data end; the base stays anchored to the axis.
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 2,
  },
  peakValue: {
    textAlign: 'center',
    color: Colors.primaryDeep,
  },
});
