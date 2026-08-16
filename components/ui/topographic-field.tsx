import React from 'react';
import { StyleSheet, View, ViewStyle, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Circle } from 'react-native-svg';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface TopographicFieldProps {
  style?: ViewStyle;
  warm?: boolean;
}

interface OrbProps {
  size: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  color1: string;
  color2: string;
  id: string;
}

/**
 * A single soft colour bloom. Deliberately static.
 *
 * This used to run three infinite loops each — translate, translate, scale —
 * on a 380-420px radial-gradient SVG. Scaling an SVG forces the platform to
 * re-rasterise it every frame, and because this field is rendered by
 * GradientScreen it existed on every screen at once: twelve permanent
 * animations per screen, and tab screens stay mounted, so roughly fifty were
 * running together after visiting all four tabs. That was the app's single
 * biggest source of jank, and none of it was motion the user asked for.
 *
 * The bloom itself is what makes the background feel soft, and that survives
 * intact without moving.
 */
const Orb: React.FC<OrbProps> = React.memo(function Orb({
  size,
  top,
  left,
  right,
  bottom,
  color1,
  color2,
  id,
}) {
  return (
    <View style={[styles.orbContainer, { width: size, height: size, top, left, right, bottom }]}>
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
    </View>
  );
});

/**
 * Ambient colour wash behind a screen's content. Memoized and static, so it
 * renders once per screen and then costs nothing.
 */
export const TopographicField: React.FC<TopographicFieldProps> = React.memo(
  function TopographicField({ style, warm = false }) {
    return (
      <View pointerEvents="none" style={[styles.container, style]}>
        <Orb
          id="orbTopLeft"
          size={380}
          top={-60}
          left={-60}
          color1={warm ? '#FBCFE8' : '#C4B5FD'}
          color2={warm ? '#FED7AA' : '#DDD6FE'}
        />
        <Orb
          id="orbTopRight"
          size={360}
          top={-30}
          right={-50}
          color1={warm ? '#F472B6' : '#FBCFE8'}
          color2={warm ? '#DDD6FE' : '#BAE6FD'}
        />
        <Orb
          id="orbMidLeft"
          size={370}
          top={SCREEN_HEIGHT * 0.3}
          left={-70}
          color1={warm ? '#DDD6FE' : '#BAE6FD'}
          color2={warm ? '#FBCFE8' : '#E0F2FE'}
        />
        <Orb
          id="orbBottom"
          size={420}
          bottom={-80}
          right={-70}
          color1={warm ? '#FBCFE8' : '#DDD6FE'}
          color2={warm ? '#C4B5FD' : '#BAE6FD'}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orbContainer: {
    position: 'absolute',
  },
});
