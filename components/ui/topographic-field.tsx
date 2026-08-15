import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface TopographicFieldProps {
  style?: ViewStyle;
  warm?: boolean;
}

interface MergingLiquidOrbProps {
  size: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  color1: string;
  color2: string;
  targetX: number;
  targetY: number;
  duration: number;
  id: string;
}

const MergingLiquidOrb: React.FC<MergingLiquidOrbProps> = ({
  size,
  top,
  left,
  right,
  bottom,
  color1,
  color2,
  targetX,
  targetY,
  duration,
  id,
}) => {
  const moveX = useSharedValue(0);
  const moveY = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    moveX.value = withRepeat(
      withSequence(
        withTiming(targetX, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(-targetX * 0.5, { duration: duration + 1500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    moveY.value = withRepeat(
      withSequence(
        withTiming(targetY, { duration: duration + 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-targetY * 0.6, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: duration + 800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.92, { duration: duration + 1200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [duration, targetX, targetY, moveX, moveY, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: moveX.value },
      { translateY: moveY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.orbContainer,
        {
          width: size,
          height: size,
          top,
          left,
          right,
          bottom,
        },
        animStyle,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <SvgRadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color1} stopOpacity="0.32" />
            <Stop offset="50%" stopColor={color2} stopOpacity="0.14" />
            <Stop offset="100%" stopColor={color1} stopOpacity="0" />
          </SvgRadialGradient>
        </Defs>
        <Circle cx={100} cy={100} r={98} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
};

export const TopographicField: React.FC<TopographicFieldProps> = ({ style, warm = false }) => {
  return (
    <View pointerEvents="none" style={[styles.container, style]}>
      {/* Top Left Soft Lavender Blob */}
      <MergingLiquidOrb
        id="orbTopLeft"
        size={380}
        top={-60}
        left={-60}
        targetX={45}
        targetY={35}
        color1={warm ? '#FBCFE8' : '#C4B5FD'}
        color2={warm ? '#FED7AA' : '#DDD6FE'}
        duration={9000}
      />

      {/* Top Right Soft Blush Rose Blob (drifts inward to merge with Top Left) */}
      <MergingLiquidOrb
        id="orbTopRight"
        size={360}
        top={-30}
        right={-50}
        targetX={-45}
        targetY={40}
        color1={warm ? '#F472B6' : '#FBCFE8'}
        color2={warm ? '#DDD6FE' : '#BAE6FD'}
        duration={10500}
      />

      {/* Mid Left Soft Sky Blue Blob */}
      <MergingLiquidOrb
        id="orbMidLeft"
        size={370}
        top={SCREEN_HEIGHT * 0.30}
        left={-70}
        targetX={40}
        targetY={-30}
        color1={warm ? '#DDD6FE' : '#BAE6FD'}
        color2={warm ? '#FBCFE8' : '#E0F2FE'}
        duration={11000}
      />

      {/* Bottom Soft Violet/Peach Blob */}
      <MergingLiquidOrb
        id="orbBottom"
        size={420}
        bottom={-80}
        right={-70}
        targetX={-35}
        targetY={-35}
        color1={warm ? '#FBCFE8' : '#DDD6FE'}
        color2={warm ? '#C4B5FD' : '#BAE6FD'}
        duration={12500}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orbContainer: {
    position: 'absolute',
  },
});
