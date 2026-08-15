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
  topLeft: { top: '18%', left: '4%' },
  topRight: { top: '7%', right: '4%' },
  bottomLeft: { bottom: '22%', left: '3%' },
  bottomRight: { bottom: '12%', right: '5%' },
};

// Keyframe coordinates for 3 distinct organic hero blob shapes (38 numbers each)
const HERO_NUMS_A = [
  104, 7, 144, 4, 180, 28, 190, 66, 199, 101, 176, 128, 157, 153, 134, 182, 101, 199, 68, 188, 32,
  176, 11, 145, 8, 108, 5, 68, 24, 33, 57, 17, 72, 10, 89, 8, 104, 7,
];

const HERO_NUMS_B = [
  94, 14, 134, 2, 174, 34, 184, 74, 192, 110, 168, 140, 144, 164, 122, 184, 90, 196, 56, 182, 24,
  166, 10, 130, 12, 94, 14, 56, 36, 22, 66, 12, 78, 8, 94, 14,
];

const HERO_NUMS_C = [
  112, 4, 152, 10, 184, 22, 194, 58, 198, 96, 178, 130, 154, 152, 130, 176, 96, 190, 66, 184, 34,
  176, 16, 142, 10, 106, 6, 68, 20, 36, 52, 22, 68, 12, 90, 5, 112, 4,
];

// Keyframe coordinates for small floating blobs (60x60 viewBox, 26 numbers)
const SMALL_NUMS_A = [
  30, 3, 44, 2, 57, 12, 57, 27, 57, 42, 46, 56, 30, 57, 14, 58, 3, 46, 3, 30, 3, 14, 16, 4, 30, 3,
];

const SMALL_NUMS_B = [
  27, 5, 41, 1, 59, 16, 55, 30, 51, 44, 42, 58, 28, 55, 12, 59, 1, 42, 5, 27, 9, 12, 13, 9, 27, 5,
];

const SMALL_NUMS_C = [
  33, 2, 47, 4, 55, 9, 58, 24, 60, 39, 49, 53, 33, 58, 17, 54, 5, 49, 2, 33, 1, 17, 19, 1, 33, 2,
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
  for (let i = 0; i < from.length; i++) {
    const val = from[i] + (to[i] - from[i]) * p;
    n.push(Math.round(val * 10) / 10);
  }

  return `M${n[0]} ${n[1]} C${n[2]} ${n[3]} ${n[4]} ${n[5]} ${n[6]} ${n[7]} C${n[8]} ${n[9]} ${n[10]} ${n[11]} ${n[12]} ${n[13]} C${n[14]} ${n[15]} ${n[16]} ${n[17]} ${n[18]} ${n[19]} C${n[20]} ${n[21]} ${n[22]} ${n[23]} ${n[24]} ${n[25]} C${n[26]} ${n[27]} ${n[28]} ${n[29]} ${n[30]} ${n[31]} C${n[32]} ${n[33]} ${n[34]} ${n[35]} ${n[36]} ${n[37]} Z`;
}

function interpolateSmallPath(t: number): string {
  'worklet';
  let p = 0;
  let from = SMALL_NUMS_A;
  let to = SMALL_NUMS_B;

  if (t <= 0.5) {
    p = t * 2;
    from = SMALL_NUMS_A;
    to = SMALL_NUMS_B;
  } else {
    p = (t - 0.5) * 2;
    from = SMALL_NUMS_B;
    to = SMALL_NUMS_C;
  }

  const n: number[] = [];
  for (let i = 0; i < from.length; i++) {
    const val = from[i] + (to[i] - from[i]) * p;
    n.push(Math.round(val * 10) / 10);
  }

  return `M${n[0]} ${n[1]} C${n[2]} ${n[3]} ${n[4]} ${n[5]} ${n[6]} ${n[7]} C${n[8]} ${n[9]} ${n[10]} ${n[11]} ${n[12]} ${n[13]} C${n[14]} ${n[15]} ${n[16]} ${n[17]} ${n[18]} ${n[19]} C${n[20]} ${n[21]} ${n[22]} ${n[23]} ${n[24]} ${n[25]} Z`;
}

interface SmallFloatingBlobProps {
  badge: HeroBadge;
  index: number;
}

const SmallFloatingBlob: React.FC<SmallFloatingBlobProps> = ({ badge, index }) => {
  const morph = useSharedValue(0);
  const floatY = useSharedValue(0);
  const floatX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);

  useEffect(() => {
    const duration = 3400 + index * 600;

    morph.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: duration + 400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    floatY.value = withRepeat(
      withSequence(
        withTiming(index % 2 === 0 ? -7 : -5, { duration: duration - 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(index % 2 === 0 ? 5 : 7, { duration: duration + 200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    floatX.value = withRepeat(
      withSequence(
        withTiming(index % 2 === 0 ? 4 : -4, { duration: duration + 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(index % 2 === 0 ? -4 : 4, { duration: duration - 300, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    rotate.value = withRepeat(
      withSequence(
        withTiming(index % 2 === 0 ? 5 : -5, { duration: duration + 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(index % 2 === 0 ? -5 : 5, { duration: duration + 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    scaleX.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: duration - 200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.94, { duration: duration + 300, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    scaleY.value = withRepeat(
      withSequence(
        withTiming(0.94, { duration: duration - 200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.06, { duration: duration + 300, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [index, morph, floatY, floatX, rotate, scaleX, scaleY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatY.value },
      { translateX: floatX.value },
      { rotate: `${rotate.value}deg` },
      { scaleX: scaleX.value },
      { scaleY: scaleY.value },
    ],
  }));

  const animatedPathProps = useAnimatedProps(() => {
    'worklet';
    return {
      d: interpolateSmallPath(morph.value),
    };
  });

  const blobWidth = badge.label ? 88 : 54;
  const blobHeight = 54;

  return (
    <Animated.View
      style={[
        styles.smallBlobContainer,
        SLOT_STYLES[badge.slot],
        { width: blobWidth, height: blobHeight },
        animatedStyle,
      ]}
    >
      <Svg width={blobWidth} height={blobHeight} viewBox="0 0 60 60" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`smallFill-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="100%" stopColor="#FDECF4" stopOpacity="0.86" />
          </SvgLinearGradient>
        </Defs>
        <AnimatedPath
          animatedProps={animatedPathProps}
          fill={`url(#smallFill-${index})`}
          stroke="rgba(255, 255, 255, 0.95)"
          strokeWidth={1.8}
        />
      </Svg>
      <View style={styles.smallBlobContent}>
        <Ionicons name={badge.icon} size={17} color={badge.color ?? Colors.primary} />
        {badge.label ? (
          <AppText variant="micro" style={styles.badgeLabel}>
            {badge.label}
          </AppText>
        ) : null}
      </View>
    </Animated.View>
  );
};

export const OrganicHero: React.FC<OrganicHeroProps> = ({
  label,
  value,
  sub,
  badges = [],
  size = 250,
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
        withTiming(1, { duration: 4600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 4600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    float.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
        withTiming(6, { duration: 3200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    tilt.value = withRepeat(
      withSequence(
        withTiming(2.2, { duration: 4400, easing: Easing.inOut(Easing.ease) }),
        withTiming(-2.2, { duration: 4400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    scaleX.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 3800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.96, { duration: 3800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    scaleY.value = withRepeat(
      withSequence(
        withTiming(0.96, { duration: 3800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.04, { duration: 3800, easing: Easing.inOut(Easing.ease) })
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
    <View style={[styles.container, { width: size + 80, height: size + 40 }]}>
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
        <SmallFloatingBlob key={`${badge.slot}-${index}`} badge={badge} index={index} />
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
  smallBlobContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  smallBlobContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  badgeLabel: {
    color: Colors.textSecondary,
  },
});

