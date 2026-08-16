import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { Duration, Ease } from '@/constants/motion';
import { haptics } from '@/utils/haptics';
import { HeatmapWeek } from '@/utils/insights';
import { formatCurrency } from '@/utils/currency';
import { monthShortLabel } from '@/utils/date';

export interface CalendarHeatmapProps {
  weeks: HeatmapWeek[];
  currency: string;
  selectedKey?: string;
  onSelect?: (dateKey: string | undefined) => void;
}

/**
 * One hue, four steps light→dark plus a neutral "nothing happened" tone — the
 * validated ordinal ramp (see docs/insights.md for the numbers). Levels are
 * quartered against this range's own busiest day, so a light user's ledger
 * and a heavy one each light up their own top days rather than being judged
 * against a fixed currency scale.
 */
const LEVEL_COLORS = ['#C2A0F2', '#A578ED', '#8B5CF6', '#6D28D9'];
const EMPTY_COLOR = Colors.track;
const CELL = 12;
const GAP = 3;

function Cell({
  dateKey,
  amount,
  level,
  inRange,
  index,
  currency,
  selected,
  onPress,
}: {
  dateKey: string;
  amount: number;
  level: number;
  inRange: boolean;
  index: number;
  currency: string;
  selected: boolean;
  onPress: () => void;
}) {
  const reveal = useSharedValue(0);

  useEffect(() => {
    // Capped stagger, same rule as list rows: a wipe across dozens of cells
    // would take seconds, so only the leading edge staggers and the rest
    // settle together.
    reveal.value = withDelay(
      Math.min(index, 40) * 6,
      withTiming(1, { duration: Duration.quick, easing: Ease.out })
    );
  }, [index, reveal]);

  const style = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ scale: 0.6 + reveal.value * 0.4 }],
  }));

  const color = level > 0 ? LEVEL_COLORS[level - 1] : EMPTY_COLOR;

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        disabled={!inRange}
        hitSlop={2}
        accessibilityLabel={`${dateKey}, ${formatCurrency(amount, currency)}`}
        style={[
          styles.cell,
          {
            backgroundColor: inRange ? color : 'transparent',
            borderColor: selected ? Colors.primaryDeep : 'transparent',
            borderWidth: selected ? 1.5 : 0,
            opacity: inRange ? 1 : 0,
          },
        ]}
      />
    </Animated.View>
  );
}

/**
 * A GitHub-style contribution grid: every day in range as a cell, coloured by
 * how much moved that day. Weekday bars answer "which day of the week" —
 * this answers "which actual day," and the two together cover both the
 * recurring-habit question and the one-off-spike question.
 */
export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({
  weeks,
  currency,
  selectedKey,
  onSelect,
}) => {
  // Month labels sit above the first week that starts a new month.
  const monthLabels = weeks.map((week, i) => {
    const firstDay = week.days.find(d => d !== null);
    if (!firstDay) return null;
    const prevWeek = weeks[i - 1];
    const prevFirstDay = prevWeek?.days.find(d => d !== null);
    if (prevFirstDay && prevFirstDay.date.getMonth() === firstDay.date.getMonth()) return null;
    return monthShortLabel(
      `${firstDay.date.getFullYear()}-${String(firstDay.date.getMonth() + 1).padStart(2, '0')}`
    );
  });

  let cellIndex = 0;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View>
          <View style={styles.monthRow}>
            {monthLabels.map((label, i) => (
              <View key={i} style={{ width: CELL + GAP }}>
                {label ? (
                  <AppText variant="micro" numberOfLines={1} style={styles.monthLabel}>
                    {label}
                  </AppText>
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekColumn}>
                {week.days.map((day, di) => {
                  if (!day) return <View key={di} style={styles.cell} />;
                  const idx = cellIndex++;
                  return (
                    <Cell
                      key={day.dateKey}
                      dateKey={day.dateKey}
                      amount={day.amount}
                      level={day.level}
                      inRange={day.inRange}
                      index={idx}
                      currency={currency}
                      selected={selectedKey === day.dateKey}
                      onPress={() => {
                        haptics.selection();
                        onSelect?.(selectedKey === day.dateKey ? undefined : day.dateKey);
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.legend}>
        <AppText variant="micro" color={Colors.textMuted}>
          Less
        </AppText>
        <View style={[styles.legendCell, { backgroundColor: EMPTY_COLOR }]} />
        {LEVEL_COLORS.map(color => (
          <View key={color} style={[styles.legendCell, { backgroundColor: color }]} />
        ))}
        <AppText variant="micro" color={Colors.textMuted}>
          More
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingVertical: 2,
  },
  monthRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  monthLabel: {
    color: Colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  weekColumn: {
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2.5,
  },
});
