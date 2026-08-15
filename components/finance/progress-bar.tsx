import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

import { Colors, Gradients } from '@/constants/theme';

export interface ProgressBarProps {
  /** 0 to 1. */
  progress: number;
  over?: boolean;
  height?: number;
  /** Tint the fill with a single colour instead of the default ramp. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Pill track with an animated pink-to-purple gradient fill. */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  over = false,
  height = 8,
  color,
  style,
}) => {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(Math.min(Math.max(progress, 0), 1) * 100, {
      duration: 780,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(width.value, 2)}%` }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }, style]}>
      <Animated.View style={[styles.fill, { borderRadius: height / 2 }, fillStyle]}>
        <LinearGradient
          colors={
            (over
              ? [Colors.expense, '#C0435F']
              : color
                ? [`${color}B3`, color]
                : Gradients.progress) as [string, string]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: Colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    overflow: 'hidden',
  },
});
