import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Line, Circle } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { Duration, Ease } from '@/constants/motion';
import { MonthPoint } from '@/utils/insights';
import { monthShortLabel } from '@/utils/date';
import { formatCompact } from '@/utils/currency';

export interface TrendAreaChartProps {
  points: MonthPoint[];
  currency: string;
  /** Index of the selected month, if any. */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  height?: number;
}

const PAD_X = 18;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

/**
 * Spend over time as a single-series area chart.
 *
 * One measure, one hue, so there is no legend to read — the title names the
 * series. Only the peak and the latest point carry a value label; labelling
 * every point is noise the reader has to filter out. The baseline grid is
 * deliberately recessive so the data sits in front of it.
 */
export const TrendAreaChart: React.FC<TrendAreaChartProps> = ({
  points,
  currency,
  selectedIndex,
  onSelect,
  height = 150,
}) => {
  const [width, setWidth] = React.useState(0);
  // 0 = nothing revealed, 1 = the full plot showing. Wipes left to right on
  // mount and whenever the data itself changes (a range or filter edit),
  // which is what makes a redrawn chart read as "these are new numbers"
  // rather than the old picture silently being swapped out underneath you.
  const reveal = useSharedValue(0);

  const geometry = useMemo(() => {
    if (points.length === 0 || width === 0) return null;

    const max = Math.max(...points.map(p => p.amount), 1);
    const plotW = width - PAD_X * 2;
    const plotH = height - PAD_TOP - PAD_BOTTOM;
    const step = points.length > 1 ? plotW / (points.length - 1) : 0;

    const coords = points.map((p, i) => ({
      x: PAD_X + step * i,
      y: PAD_TOP + plotH - (p.amount / max) * plotH,
      point: p,
      index: i,
    }));

    // Catmull-Rom style smoothing keeps the line readable without inventing
    // peaks between months, which a heavier spline would.
    let line = `M${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cx = (prev.x + curr.x) / 2;
      line += ` C${cx} ${prev.y} ${cx} ${curr.y} ${curr.x} ${curr.y}`;
    }

    const area = `${line} L${coords[coords.length - 1].x} ${PAD_TOP + plotH} L${coords[0].x} ${
      PAD_TOP + plotH
    } Z`;

    const peakIndex = coords.reduce((best, c, i) => (c.point.amount > coords[best].point.amount ? i : best), 0);

    return { coords, line, area, max, plotH, peakIndex };
  }, [points, width, height]);

  useEffect(() => {
    if (!geometry) return;
    reveal.value = 0;
    reveal.value = withTiming(1, { duration: Duration.emphasis + 220, easing: Ease.out });
  }, [points, geometry, reveal]);

  // The curtain that opens over the (otherwise static, unanimated) plot —
  // cheaper than redrawing the path every frame, since the geometry itself
  // never changes during the reveal, only how much of it is visible.
  const wipeStyle = useAnimatedStyle(() => ({ width: reveal.value * width }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: Math.max((reveal.value - 0.65) / 0.35, 0),
  }));

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {geometry ? (
        <>
          <Animated.View style={[styles.wipeMask, wipeStyle]}>
            <Svg width={width} height={height}>
              <Defs>
                <SvgGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={Colors.primary} stopOpacity="0.28" />
                  <Stop offset="100%" stopColor={Colors.primary} stopOpacity="0.02" />
                </SvgGradient>
              </Defs>

              <Line
                x1={PAD_X}
                y1={PAD_TOP + geometry.plotH}
                x2={width - PAD_X}
                y2={PAD_TOP + geometry.plotH}
                stroke={Colors.divider}
                strokeWidth={1}
              />

              <Path d={geometry.area} fill="url(#trendFill)" />
              <Path
                d={geometry.line}
                stroke={Colors.primaryDeep}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {geometry.coords.map(c => {
                const emphasised =
                  c.index === selectedIndex ||
                  c.index === geometry.coords.length - 1 ||
                  c.index === geometry.peakIndex;
                if (!emphasised) return null;
                return (
                  <Circle
                    key={c.index}
                    cx={c.x}
                    cy={c.y}
                    r={c.index === selectedIndex ? 5 : 4}
                    fill={Colors.primaryDeep}
                    // A surface ring keeps the marker legible where it sits on the line.
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  />
                );
              })}
            </Svg>
          </Animated.View>

          {/* Touch targets are separate from the marks so they can be finger-sized. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={styles.hitRow} pointerEvents="box-none">
              {geometry.coords.map(c => (
                <Pressable
                  key={c.index}
                  onPress={() => onSelect?.(c.index)}
                  style={styles.hit}
                  hitSlop={6}
                />
              ))}
            </View>
          </View>

          <Animated.View style={[styles.axis, chromeStyle]} pointerEvents="none">
            {geometry.coords.map(c => {
              // Thin the axis labels rather than let them collide.
              const stride = Math.ceil(geometry.coords.length / 6);
              if (c.index % stride !== 0 && c.index !== geometry.coords.length - 1) return null;
              const leftPos = Math.max(0, Math.min(width - 36, c.x - 18));
              return (
                <AppText
                  key={c.index}
                  variant="micro"
                  style={[styles.axisLabel, { left: leftPos }]}
                >
                  {monthShortLabel(c.point.monthKey)}
                </AppText>
              );
            })}
          </Animated.View>

          <Animated.View style={[styles.peakLabel, chromeStyle]} pointerEvents="none">
            <AppText variant="micro" color={Colors.textSecondary}>
              peak {formatCompact(geometry.coords[geometry.peakIndex].point.amount, currency)}
            </AppText>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
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
