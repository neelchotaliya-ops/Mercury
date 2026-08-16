import React, { useEffect, useState } from 'react';
import { StyleSheet, ViewStyle, DimensionValue, View, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BorderRadius } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * A clean, borderless, natural glassmorphic skeleton with a smooth,
 * elegant light shimmer sweep.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  radius = BorderRadius.sm,
  style,
}) => {
  const [layoutWidth, setLayoutWidth] = useState<number>(0);
  const shimmer = useSharedValue(0);
  const pulse = useSharedValue(0.75);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 0.85;
      return;
    }

    // Smooth, continuous light sheen sweep
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.bezier(0.3, 0.0, 0.2, 1) }),
      -1,
      false
    );

    // Subtle natural breathing
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [pulse, shimmer, reducedMotion]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== layoutWidth) {
      setLayoutWidth(w);
    }
  };

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const shimmerAnimatedStyle = useAnimatedStyle(() => {
    const w = layoutWidth > 0 ? layoutWidth : 260;
    const translateX = interpolate(shimmer.value, [0, 1], [-w * 1.1, w * 1.4]);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius: radius,
        },
        style,
      ]}
    >
      {/* Base soft neutral glass layer (borderless, gentle contrast) */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.base, containerAnimatedStyle]} />

      {/* Smooth, elegant light sheen */}
      {!reducedMotion && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.shimmerWrap, shimmerAnimatedStyle]}>
          <LinearGradient
            colors={[
              'rgba(255, 255, 255, 0)',
              'rgba(255, 255, 255, 0.55)',
              'rgba(255, 255, 255, 0)',
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(25, 21, 39, 0.055)',
    overflow: 'hidden',
  },
  base: {
    backgroundColor: 'rgba(25, 21, 39, 0.045)',
  },
  shimmerWrap: {
    width: '100%',
    height: '100%',
  },
});
