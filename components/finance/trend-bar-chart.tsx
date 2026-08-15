import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';

export interface TrendDatum {
  label: string;
  income: number;
  expense: number;
}

export interface TrendBarChartProps {
  data: TrendDatum[];
  height?: number;
  /** Highlight the final column (usually the current month). */
  highlightLast?: boolean;
}

export const TrendBarChart: React.FC<TrendBarChartProps> = ({
  data,
  height = 132,
  highlightLast = true,
}) => {
  const max = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));

  return (
    <View style={styles.container}>
      <View style={[styles.plot, { height }]}>
        {data.map((d, index) => {
          const isLast = highlightLast && index === data.length - 1;
          return (
            <View key={index} style={styles.column}>
              <View style={styles.bars}>
                <Animated.View
                  entering={FadeInDown.delay(index * 60).duration(420)}
                  style={[styles.barWrap, { height: `${(d.income / max) * 100}%` }]}
                >
                  <LinearGradient
                    colors={['#4FCB97', Colors.income]}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <Animated.View
                  entering={FadeInDown.delay(index * 60 + 40).duration(420)}
                  style={[styles.barWrap, { height: `${(d.expense / max) * 100}%` }]}
                >
                  <LinearGradient
                    colors={[Colors.accent, Colors.expense]}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
              <AppText variant="micro" color={isLast ? Colors.textPrimary : Colors.textMuted}>
                {d.label}
              </AppText>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.income }]} />
          <AppText variant="micro">Income</AppText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.expense }]} />
          <AppText variant="micro">Expense</AppText>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    gap: 8,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: '82%',
  },
  barWrap: {
    width: 9,
    minHeight: 4,
    borderRadius: 5,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});
