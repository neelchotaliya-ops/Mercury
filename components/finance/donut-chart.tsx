import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';

export interface DonutChartDatum {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutChartDatum[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

/** Segments are separated by a small gap and rounded, so the ring reads as
 *  distinct arcs rather than one solid band. */
export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 168,
  strokeWidth = 14,
  centerLabel,
  centerValue,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const gap = data.length > 1 ? 3 : 0;
  let offset = 0;

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {total > 0 &&
            data.map((d, index) => {
              const raw = (d.value / total) * circumference;
              const length = Math.max(raw - gap, 1);
              const dashOffset = -offset;
              offset += raw;

              return (
                <Circle
                  key={index}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={d.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  fill="none"
                />
              );
            })}
        </G>
      </Svg>

      {(centerLabel || centerValue) && (
        <View style={styles.center} pointerEvents="none">
          {centerValue ? (
            <AppText variant="h2" align="center" numberOfLines={1} adjustsFontSizeToFit>
              {centerValue}
            </AppText>
          ) : null}
          {centerLabel ? (
            <AppText variant="micro" align="center">
              {centerLabel}
            </AppText>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 30,
  },
});
