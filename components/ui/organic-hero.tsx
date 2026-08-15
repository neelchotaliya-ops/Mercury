import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Path,
  Ellipse,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { BLOB_VIEWBOX } from '@/constants/shapes';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type BadgeSlot = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface HeroBadge {
  icon: keyof typeof Ionicons.glyphMap;
  slot: BadgeSlot;
  color?: string;
  label?: string;
}

export interface OrganicHeroProps {
  label?: string;
  value?: string;
  sub?: string;
  badges?: HeroBadge[];
  size?: number;
  children?: React.ReactNode;
}

const SLOT_STYLES: Record<BadgeSlot, ViewStyle> = {
  topLeft: { top: '21%', left: '6%' },
  topRight: { top: '10%', right: '6%' },
  bottomLeft: { bottom: '24%', left: '5%' },
  bottomRight: { bottom: '15%', right: '7%' },
};

const RADIAL_VECTORS: Record<BadgeSlot, { dx: number; dy: number; stretchAngle: number }> = {
  topLeft: { dx: -22, dy: -18, stretchAngle: -25 },
  topRight: { dx: 22, dy: -18, stretchAngle: 25 },
  bottomLeft: { dx: -20, dy: 20, stretchAngle: 25 },
  bottomRight: { dx: 22, dy: 18, stretchAngle: -25 },
};

// Subtle organic bubble keyframes
const HERO_NUMS_A = [
  104, 8, 140, 6, 176, 28, 186, 64, 195, 98, 174, 126, 156, 150, 134, 178, 102, 194, 70, 184, 36,
  173, 14, 144, 11, 108, 8, 70, 26, 36, 57, 20, 72, 12, 88, 9, 104, 8,
];

const HERO_NUMS_B = [
  102, 10, 143, 8, 178, 24, 188, 62, 197, 99, 172, 129, 154, 153, 132, 180, 98, 196, 68, 186, 34,
  175, 12, 142, 10, 106, 8, 68, 28, 34, 58, 18, 74, 10, 88, 11, 102, 10,
];

const HERO_NUMS_C = [
  106, 6, 138, 5, 174, 30, 184, 66, 193, 96, 176, 124, 158, 148, 136, 176, 104, 192, 72, 182, 38,
  171, 16, 146, 12, 110, 9, 72, 24, 38, 56, 22, 70, 14, 88, 7, 106, 6,
];

function interpolateHeroPath(t: number): string {
  'worklet';
  let p = 0;
  let from = HERO_NUMS_A;
  let to = HERO_NUMS_B;

  if (t <= 0.5) {
    p = t * 2;
    from = HERO_NUMS_A;
    to = HERO_NUMS_B;
  } else {
    p = (t - 0.5) * 2;
    from = HERO_NUMS_B;
    to = HERO_NUMS_C;
  }

  const n: number[] = [];
  for (let i = 0; i < HERO_NUMS_A.length; i++) {
    const f = from[i] ?? HERO_NUMS_A[i];
    const target = to[i] ?? f;
    const val = f + (target - f) * p;
    n.push(Math.round(val * 10) / 10);
  }

  return `M${n[0]} ${n[1]} C${n[2]} ${n[3]} ${n[4]} ${n[5]} ${n[6]} ${n[7]} C${n[8]} ${n[9]} ${n[10]} ${n[11]} ${n[12]} ${n[13]} C${n[14]} ${n[15]} ${n[16]} ${n[17]} ${n[18]} ${n[19]} C${n[20]} ${n[21]} ${n[22]} ${n[23]} ${n[24]} ${n[25]} C${n[26]} ${n[27]} ${n[28]} ${n[29]} ${n[30]} ${n[31]} C${n[32]} ${n[33]} ${n[34]} ${n[35]} ${n[36]} ${n[37]} Z`;
}

interface SmallFloatingBubbleProps {
  badge: HeroBadge;
  index: number;
}

const SmallFloatingBubble: React.FC<SmallFloatingBubbleProps> = ({ badge, index }) => {
  const mergeProgress = useSharedValue(0);

  useEffect(() => {
    const duration = 4800 + index * 700;

    mergeProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: duration + 300, easing: Easing.inOut(Easing.cubic) })
      ),
      -1,
      true
    );
  }, [index, mergeProgress]);

  const vector = RADIAL_VECTORS[badge.slot];

  const animatedStyle = useAnimatedStyle(() => {
    const p = mergeProgress.value;

    // Radial position: 0 = merged into giant blob edge, 1 = de-merged detached in space
    const tx = vector.dx * (p - 0.25);
    const ty = vector.dy * (p - 0.25);

    // Liquid droplet stretching during de-merging (around p = 0.35 to 0.6)
    const stretch = interpolate(
      p,
      [0, 0.35, 0.6, 1],
      [0.86, 1.14, 1.04, 1.0],
      Extrapolation.CLAMP
    );

    const squish = interpolate(
      p,
      [0, 0.35, 0.6, 1],
      [0.86, 0.90, 0.98, 1.0],
      Extrapolation.CLAMP
    );

    const opacity = interpolate(
      p,
      [0, 0.2, 0.8, 1],
      [0.82, 0.96, 1.0, 0.95],
      Extrapolation.CLAMP
    );

    const rot = interpolate(
      p,
      [0, 0.5, 1],
      [vector.stretchAngle * 0.4, vector.stretchAngle, 0],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { rotate: `${rot}deg` },
        { scaleX: stretch },
        { scaleY: squish },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.bubbleBadge,
        SLOT_STYLES[badge.slot],
        animatedStyle,
      ]}
    >
      <Ionicons name={badge.icon} size={17} color={badge.color ?? Colors.primary} />
      {badge.label ? (
        <AppText variant="micro" style={styles.badgeLabel}>
          {badge.label}
        </AppText>
      ) : null}
    </Animated.View>
  );
};

export const OrganicHero: React.FC<OrganicHeroProps> = ({
  label,
  value,
  sub,
  badges = [],
  size = 225,
  children,
}) => {
  const morphProgress = useSharedValue(0);
  const float = useSharedValue(0);
  const tilt = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);

  useEffect(() => {
    morphProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 5200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    float.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
        withTiming(4, { duration: 3800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    tilt.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 4800, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1.5, { duration: 4800, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    scaleX.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.975, { duration: 4200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    scaleY.value = withRepeat(
      withSequence(
        withTiming(0.975, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.025, { duration: 4200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [morphProgress, float, tilt, scaleX, scaleY]);

  const blobContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: float.value },
      { rotate: `${tilt.value}deg` },
      { scaleX: scaleX.value },
      { scaleY: scaleY.value },
    ],
  }));

  const mainPathProps = useAnimatedProps(() => {
    'worklet';
    return {
      d: interpolateHeroPath(morphProgress.value),
    };
  });

  return (
    <View style={[styles.container, { width: size + 60, height: size + 30 }]}>
      <Animated.View style={[styles.blobWrap, { width: size, height: size }, blobContainerStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
          <Defs>
            <SvgLinearGradient id="heroBlobFill" x1="10%" y1="0%" x2="90%" y2="100%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
              <Stop offset="100%" stopColor="#FCEEF5" stopOpacity="0.84" />
            </SvgLinearGradient>
            <SvgRadialGradient id="heroBlobGlow" cx="50%" cy="54%" rx="50%" ry="50%">
              <Stop offset="62%" stopColor="#6D28D9" stopOpacity="0.14" />
              <Stop offset="100%" stopColor="#6D28D9" stopOpacity="0" />
            </SvgRadialGradient>
          </Defs>

          <Ellipse cx={100} cy={108} rx={99} ry={92} fill="url(#heroBlobGlow)" />
          <AnimatedPath
            animatedProps={mainPathProps}
            fill="url(#heroBlobFill)"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth={1.6}
          />
        </Svg>

        <View style={styles.content}>
          {children ?? (
            <>
              {label ? (
                <AppText variant="caption" align="center">
                  {label}
                </AppText>
              ) : null}
              {value ? (
                <AppText variant="display" align="center" style={styles.value}>
                  {value}
                </AppText>
              ) : null}
              {sub ? (
                <AppText variant="caption" align="center" style={styles.sub}>
                  {sub}
                </AppText>
              ) : null}
            </>
          )}
        </View>
      </Animated.View>

      {badges.slice(0, 4).map((badge, index) => (
        <SmallFloatingBubble key={`${badge.slot}-${index}`} badge={badge} index={index} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blobWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 28,
  },
  value: {
    marginTop: 2,
  },
  sub: {
    marginTop: 2,
  },
  bubbleBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 46,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 23,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    justifyContent: 'center',
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  badgeLabel: {
    color: Colors.textSecondary,
  },
});

