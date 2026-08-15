import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '@/context/theme-context';

export interface TopographicRingsProps {
  size?: number;
  ringCount?: number;
  style?: ViewStyle;
}

export const TopographicRings: React.FC<TopographicRingsProps> = ({ size = 340, ringCount = 5, style }) => {
  const { colors } = useAppTheme();
  const center = size / 2;
  const step = center / (ringCount + 1);

  return (
    <View pointerEvents="none" style={[styles.container, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {Array.from({ length: ringCount }).map((_, index) => (
          <Circle
            key={index}
            cx={center}
            cy={center}
            r={step * (index + 1)}
            stroke={colors.ringColor}
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
