import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path, Line, Circle } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { Duration, Ease } from '@/constants/motion';
import { NumberFormat } from '@/types/finance';
import { IncomeExpensePoint } from '@/db/insights';
import { monthShortLabel } from '@/utils/date';
import { formatCompact } from '@/utils/currency';

export interface TrendLineChartProps {
  points: IncomeExpensePoint[];
  currency: string;
  numberFormat?: NumberFormat;
  /** Index of the selected month, if any. */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  height?: number;
}

const PAD_X = 18;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

type SeriesKey = 'income' | 'expense';

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'income', label: 'Income', color: Colors.income },
  { key: 'expense', label: 'Spending', color: Colors.expense },
];

/**
 * Income and spending per month as two lines on one shared scale.
 *
 * A shared y-scale is the point: the gap between the lines is the month's
 * surplus or shortfall, which two independently scaled charts would hide. Two
 * series means a legend is needed, but it doubles as the key for the selected
 * month's values (rendered by the caller). The baseline is the only gridline,
 * kept recessive so the lines sit in front of it.
 */
export const TrendLineChart: React.FC<TrendLineChartProps> = ({
  points,
  currency,
  numberFormat,
  selectedIndex,
  onSelect,
  height = 160,
}) => {
  const [width, setWidth] = React.useState(0);
  // Wipes left to right on mount and when the data changes, so a redrawn chart
  // reads as "new numbers" rather than the old picture silently swapped.
  const reveal = useSharedValue(0);

  const geometry = useMemo(() => {
    if (points.length === 0 || width === 0) return null;

    const max = Math.max(...points.flatMap(p => [p.income, p.expense]), 1);
    const plotW = width - PAD_X * 2;
    const plotH = height - PAD_TOP - PAD_BOTTOM;
    const step = points.length > 1 ? plotW / (points.length - 1) : 0;

    // A lone month has no line to draw; centre it so its markers still show.
    const xAt = (i: number) => (points.length > 1 ? PAD_X + step * i : width / 2);

    const lines = SERIES.map(series => {
      const coords = points.map((p, i) => ({
        x: xAt(i),
        y: PAD_TOP + plotH - (p[series.key] / max) * plotH,
        value: p[series.key],
        index: i,
      }));

      // Smoothed with horizontal control points: no overshoot, so the curve
      // never dips below zero or invents a peak between months.
      let path = `M${coords[0].x} ${coords[0].y}`;
      for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1];
        const curr = coords[i];
        const cx = (prev.x + curr.x) / 2;
        path += ` C${cx} ${prev.y} ${cx} ${curr.y} ${curr.x} ${curr.y}`;
      }
      return { ...series, coords, path };
    });

    return { lines, plotH, xAt };
  }, [points, width, height]);

  useEffect(() => {
    if (!geometry) return;
    reveal.value = 0;
    reveal.value = withTiming(1, { duration: Duration.emphasis + 220, easing: Ease.out });
  }, [points, geometry, reveal]);

  const wipeStyle = useAnimatedStyle(() => ({ width: reveal.value * width }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: Math.max((reveal.value - 0.65) / 0.35, 0),
  }));

  return (
    <View>
      <View style={styles.legend}>
        {SERIES.map(s => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <AppText variant="micro" color={Colors.textSecondary}>
              {s.label}
            </AppText>
          </View>
        ))}
      </View>

      <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {geometry ? (
          <>
            <Animated.View style={[styles.wipeMask, wipeStyle]}>
              <Svg width={width} height={height}>
                <Line
                  x1={PAD_X}
                  y1={PAD_TOP + geometry.plotH}
                  x2={width - PAD_X}
                  y2={PAD_TOP + geometry.plotH}
                  stroke={Colors.divider}
                  strokeWidth={1}
                />

                {selectedIndex !== undefined && points[selectedIndex] ? (
                  <Line
                    x1={geometry.xAt(selectedIndex)}
                    y1={PAD_TOP}
                    x2={geometry.xAt(selectedIndex)}
                    y2={PAD_TOP + geometry.plotH}
                    stroke={Colors.divider}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                ) : null}

                {geometry.lines.map(line => (
                  <React.Fragment key={line.key}>
                    {points.length > 1 ? (
                      <Path
                        d={line.path}
                        stroke={line.color}
                        strokeWidth={2.25}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {line.coords.map(c => {
                      // Mark the selected and latest month only; a dot on every
                      // point is noise on a 12-month line.
                      const emphasised = c.index === selectedIndex || c.index === line.coords.length - 1;
                      if (!emphasised) return null;
                      return (
                        <Circle
                          key={c.index}
                          cx={c.x}
                          cy={c.y}
                          r={c.index === selectedIndex ? 5 : 4}
                          fill={line.color}
                          // A surface ring keeps the marker legible where it sits on the line.
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </Svg>
            </Animated.View>

            {/* Touch targets are separate from the marks so they can be finger-sized. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <View style={styles.hitRow} pointerEvents="box-none">
                {points.map((_, i) => (
                  <Pressable key={i} onPress={() => onSelect?.(i)} style={styles.hit} hitSlop={6} />
                ))}
              </View>
            </View>

            <Animated.View style={[styles.axis, chromeStyle]} pointerEvents="none">
              {points.map((p, i) => {
                // Thin the axis labels rather than let them collide.
                const stride = Math.ceil(points.length / 6);
                if (i % stride !== 0 && i !== points.length - 1) return null;
                const leftPos = Math.max(0, Math.min(width - 36, geometry.xAt(i) - 18));
                return (
                  <AppText key={p.monthKey} variant="micro" style={[styles.axisLabel, { left: leftPos }]}>
                    {monthShortLabel(p.monthKey)}
                  </AppText>
                );
              })}
            </Animated.View>

            <Animated.View style={[styles.peakLabel, chromeStyle]} pointerEvents="none">
              <AppText variant="micro" color={Colors.textMuted}>
                max{' '}
                {formatCompact(Math.max(...points.flatMap(p => [p.income, p.expense])), currency, numberFormat)}
              </AppText>
            </Animated.View>
          </>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 14,
    height: 3,
    borderRadius: 2,
  },
  wipeMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    overflow: 'hidden',
  },
  hitRow: {
    flexDirection: 'row',
    flex: 1,
  },
  hit: {
    flex: 1,
  },
  axis: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 2,
    height: 16,
  },
  axisLabel: {
    position: 'absolute',
    width: 36,
    textAlign: 'center',
    color: Colors.textMuted,
  },
  peakLabel: {
    position: 'absolute',
    top: 0,
    right: 2,
  },
});
