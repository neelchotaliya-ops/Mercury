import React from 'react';
import { View, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/context/theme-context';

export interface TrendDatum {
  label: string;
  income: number;
  expense: number;
}

export interface TrendBarChartProps {
  data: TrendDatum[];
  height?: number;
}

const INCOME_COLOR = '#16A34A';
const EXPENSE_COLOR = '#DC2626';

export const TrendBarChart: React.FC<TrendBarChartProps> = ({ data, height = 140 }) => {
  const { colors } = useAppTheme();
  const max = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));

  return (
    <View style={styles.container}>
      <View style={[styles.chartArea, { height }]}>
        {data.map((d, index) => (
          <View key={index} style={styles.column}>
            <View style={styles.bars}>
              <View
                style={[
                  styles.bar,
                  { height: `${(d.income / max) * 100}%`, backgroundColor: INCOME_COLOR },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  { height: `${(d.expense / max) * 100}%`, backgroundColor: EXPENSE_COLOR },
                ]}
              />
            </View>
            <AppText variant="caption" style={{ color: colors.textMuted }}>
              {d.label}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: INCOME_COLOR }]} />
          <AppText variant="caption">Income</AppText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: EXPENSE_COLOR }]} />
          <AppText variant="caption">Expense</AppText>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    gap: 6,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: '85%',
  },
  bar: {
    width: 8,
    borderRadius: 4,
    minHeight: 3,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
