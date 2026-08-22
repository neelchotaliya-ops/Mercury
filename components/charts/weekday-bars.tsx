import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { Duration, Ease, STAGGER_STEP } from '@/constants/motion';
import { NumberFormat } from '@/types/finance';
import { formatCompact } from '@/utils/currency';

export interface WeekdayBarsProps {
  /** Seven totals, index 0 = Sunday. */
  buckets: number[];
  currency: string;
  numberFormat?: NumberFormat;
  height?: number;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function Bar({
  value,
  max,
  isPeak,
  index,
}: {
  value: number;
  max: number;
  isPeak: boolean;
  index: number;
}) {
  const reveal = useSharedValue(0);

  useEffect(() => {
    reveal.value = withDelay(
      index * STAGGER_STEP,
      withTiming(1, { duration: Duration.emphasis, easing: Ease.out })
    );
  }, [reveal, value, index]);

  // Grown in via scale, anchored visually by the track's own bottom-aligned
  // layout rather than an animated height — height is a layout property and
  // would re-flow every frame of the animation, where transform stays on the
  // UI thread. Bounded to one pass on mount, so either would be cheap here,
  // but this keeps the same technique used everywhere else in the app.
  const style = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ scaleY: 0.2 + reveal.value * 0.8 }],
  }));

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.bar,
          {
            height: `${Math.max((value / max) * 100, value > 0 ? 4 : 0)}%`,
            backgroundColor: isPeak ? Colors.primaryDeep : Colors.primarySoft,
          },
          style,
        ]}
      />
    </View>
  );
}

/**
 * Spend by day of week.
 *
 * One measure, so one colour for every bar — shading each bar by its own value
 * would double-encode the height as hue and spend the only free channel on
 * information the bar length already carries. The busiest day is emphasised
 * instead, and only it is labelled, because that is the single thing this
 * chart exists to say.
 */
export const WeekdayBars: React.FC<WeekdayBarsProps> = ({ buckets, currency, numberFormat, height = 110 }) => {
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
                  {formatCompact(value, currency, numberFormat)}
                </AppText>
              ) : null}
              <Bar value={value} max={max} isPeak={isPeak} index={index} />
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
