import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
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
}

/**
 * Category split as a donut.
 *
 * Capped at six segments with the tail folded into "Other" — beyond that the
 * slices get too thin to compare and the colours stop being separable. The
 * legend below is part of the chart, not decoration: several of the app's
 * category colours sit under a 3:1 contrast ratio against this surface, so
 * identity is always carried by a name as well as a hue.
 */
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
    return head;
  }, [slices]);

  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

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
            {segments.map(segment => {
              const sweep = Math.max(segment.share * 360 - GAP_DEGREES, 0.5);
              const dash = (sweep / 360) * circumference;
              const dimmed = selectedId !== undefined && selectedId !== segment.id;
              const node = (
                <Circle
                  key={segment.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={selectedId === segment.id ? STROKE + 4 : STROKE}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-((offset / 360) * circumference)}
                  strokeLinecap="butt"
                  fill="none"
                  opacity={dimmed ? 0.3 : 1}
                />
              );
              offset += segment.share * 360;
              return node;
            })}
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
              <View style={[styles.swatch, { backgroundColor: segment.color }]} />
              <AppText variant="micro" numberOfLines={1} style={styles.legendName}>
                {segment.name}
              </AppText>
              <AppText variant="micro" color={Colors.textPrimary}>
                {Math.round(segment.share * 100)}%
              </AppText>
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
    gap: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  legendRowActive: {
    backgroundColor: Colors.primarySoft,
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
