import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { ProgressBar } from '@/components/finance/progress-bar';
import { Colors } from '@/constants/theme';
import { Duration, Ease } from '@/constants/motion';
import { CategorySlice } from '@/utils/insights';
import { formatCurrency } from '@/utils/currency';

export interface CategoryDonutProps {
  slices: CategorySlice[];
  currency: string;
  centerLabel: string;
  total: number;
  size?: number;
  selectedId?: string;
  onSelect?: (categoryId: string | undefined) => void;
}

/** Part-to-whole reads at a glance only while the segment count stays small. */
const MAX_SEGMENTS = 6;
const STROKE = 22;
/** Surface-coloured gap so neighbouring segments never appear to merge. */
const GAP_DEGREES = 2;

interface Segment {
  id: string;
  name: string;
  color: string;
  amount: number;
  share: number;
  /** Cumulative degrees where this segment starts/ends in the final layout. */
  startDeg: number;
  endDeg: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Category split as a donut.
 *
 * Capped at six segments with the tail folded into "Other" — beyond that the
 * slices get too thin to compare and the colours stop being separable. The
 * ranked bars underneath are part of the chart, not a duplicate of it: a
 * donut gives the whole-versus-parts gestalt at a glance, but is a poor tool
 * for comparing two segments of similar size, which is exactly what a length
 * encoding is good at — the two views answer different questions about the
 * same numbers. It doubles as the legend: several of the app's category
 * colours sit under a 3:1 contrast ratio against this surface (documented in
 * docs/insights.md), so every segment is named as well as coloured.
 */
interface DonutSegmentProps {
  segment: Segment;
  sweep: ReturnType<typeof useSharedValue<number>>;
  circumference: number;
  cx: number;
  cy: number;
  radius: number;
  selected: boolean;
  dimmed: boolean;
}

/**
 * One arc. Split out so its `useAnimatedProps` call sits at this component's
 * own top level — calling it inside the parent's `.map()` would violate the
 * Rules of Hooks the moment the segment count changes (switching Expense and
 * Income filters to categories with a different count, for instance), since
 * the number of hook calls per render must stay fixed.
 */
const DonutSegment: React.FC<DonutSegmentProps> = ({
  segment,
  sweep,
  circumference,
  cx,
  cy,
  radius,
  selected,
  dimmed,
}) => {
  // Each segment computes how much of its own arc is inside the sweep's
  // current budget: fully hidden until the hand reaches it, then draws in,
  // then holds steady as later segments draw.
  const animatedProps = useAnimatedProps(() => {
    const budgetDeg = sweep.value * 360;
    const visibleDeg = Math.min(
      Math.max(budgetDeg - segment.startDeg, 0),
      segment.endDeg - segment.startDeg
    );
    const sweepDeg = Math.max(visibleDeg - GAP_DEGREES, 0);
    const dash = (sweepDeg / 360) * circumference;
    return {
      strokeDasharray: `${dash} ${circumference - dash}`,
      strokeDashoffset: -((segment.startDeg / 360) * circumference),
    };
  });

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={radius}
      stroke={segment.color}
      strokeWidth={selected ? STROKE + 4 : STROKE}
      animatedProps={animatedProps}
      strokeLinecap="butt"
      fill="none"
      opacity={dimmed ? 0.3 : 1}
    />
  );
};

export const CategoryDonut: React.FC<CategoryDonutProps> = ({
  slices,
  currency,
  centerLabel,
  total,
  size = 190,
  selectedId,
  onSelect,
}) => {
  const segments = useMemo<Segment[]>(() => {
    const head = slices.slice(0, MAX_SEGMENTS - 1).map(s => ({
      id: s.category.id,
      name: s.category.name,
      color: s.category.color,
      amount: s.amount,
      share: s.share,
    }));

    const tail = slices.slice(MAX_SEGMENTS - 1);
    if (tail.length > 0) {
      head.push({
        id: '__other',
        name: `Other (${tail.length})`,
        color: Colors.textMuted,
        amount: tail.reduce((n, s) => n + s.amount, 0),
        share: tail.reduce((n, s) => n + s.share, 0),
      });
    }

    let cursor = 0;
    return head.map(segment => {
      const startDeg = cursor;
      cursor += segment.share * 360;
      return { ...segment, startDeg, endDeg: cursor };
    });
  }, [slices]);

  // Drives a single clock-hand sweep that draws each segment in turn, rather
  // than every segment fading in at once — the ordering itself reads as
  // "biggest first," reinforcing what the chart is telling you. Bounded to
  // one pass whenever the underlying totals change, not an ongoing loop.
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = 0;
    sweep.value = withTiming(1, { duration: Duration.emphasis + 260, easing: Ease.out });
  }, [total, segments.length, sweep]);

  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* transform string, not rotation/origin props: those are iOS/Android
              only and warn on web. */}
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={Colors.track}
              strokeWidth={STROKE}
              fill="none"
            />
            {segments.map(segment => (
              <DonutSegment
                key={segment.id}
                segment={segment}
                sweep={sweep}
                circumference={circumference}
                cx={size / 2}
                cy={size / 2}
                radius={radius}
                selected={selectedId === segment.id}
                dimmed={selectedId !== undefined && selectedId !== segment.id}
              />
            ))}
          </G>
        </Svg>

        <View style={styles.center} pointerEvents="none">
          <AppText variant="micro">{centerLabel}</AppText>
          <AppText variant="h3" align="center" numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(total, currency)}
          </AppText>
        </View>
      </View>

      <View style={styles.legend}>
        {segments.map(segment => {
          const active = selectedId === segment.id;
          return (
            <Pressable
              key={segment.id}
              onPress={() => onSelect?.(active ? undefined : segment.id)}
              style={[styles.legendRow, active && styles.legendRowActive]}
            >
              <View style={styles.legendTop}>
                <View style={[styles.swatch, { backgroundColor: segment.color }]} />
                <AppText variant="micro" numberOfLines={1} style={styles.legendName}>
                  {segment.name}
                </AppText>
                <AppText variant="micro" color={Colors.textPrimary}>
                  {formatCurrency(segment.amount, currency)} · {Math.round(segment.share * 100)}%
                </AppText>
              </View>
              <ProgressBar progress={segment.share} color={segment.color} height={5} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 14,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 44,
    gap: 2,
  },
  legend: {
    width: '100%',
    gap: 4,
  },
  legendRow: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  legendRowActive: {
    backgroundColor: Colors.primarySoft,
  },
  legendTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendName: {
    flex: 1,
    color: Colors.textSecondary,
  },
});
