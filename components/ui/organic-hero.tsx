import React, { useEffect } from 'react';
import { Pressable, View, StyleSheet, ViewStyle } from 'react-native';
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
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { Ease } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { BLOB_VIEWBOX, BLOB_PATH, BLOB_PATH_ALT } from '@/constants/shapes';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type BadgeSlot = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface HeroBadge {
  id?: string | null;
  name?: string;
  balance?: number;
  icon: keyof typeof Ionicons.glyphMap;
  slot: BadgeSlot;
  color?: string;
  label?: string;
  onPress?: () => void;
}

export interface OrganicHeroProps {
  label?: string;
  value?: string;
  sub?: string;
  badges?: HeroBadge[];
  size?: number;
  currency?: string;
  onPressMain?: () => void;
  children?: React.ReactNode;
}

const SLOT_STYLES: Record<BadgeSlot, ViewStyle> = {
  topLeft: { top: '21%', left: '4%' },
  topRight: { top: '10%', right: '4%' },
  bottomLeft: { bottom: '24%', left: '3%' },
  bottomRight: { bottom: '15%', right: '5%' },
};

const RADIAL_VECTORS: Record<BadgeSlot, { dx: number; dy: number; stretchAngle: number }> = {
  topLeft: { dx: -22, dy: -18, stretchAngle: -25 },
  topRight: { dx: 22, dy: -18, stretchAngle: 25 },
  bottomLeft: { dx: -20, dy: 20, stretchAngle: 25 },
  bottomRight: { dx: 22, dy: 18, stretchAngle: -25 },
};

function formatShortCurrency(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  if (abs >= 1000000) {
    return `${sign}${sym}${(abs / 1000000).toFixed(1)}M`;
  }
  if (abs >= 1000) {
    return `${sign}${sym}${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}${sym}${abs.toFixed(0)}`;
}

// Subtle organic bubble keyframes
/**
 * The hero silhouette, resolved once.
 *
 * This was three sets of 38 control-point numbers interpolated into a fresh
 * path string inside a worklet on every frame. Handing react-native-svg a new
 * `d` 60 times a second makes it re-parse and re-tessellate the path natively
 * each time — by far the most expensive thing on the Home screen. The organic
 * silhouette is what mattered; animating it was not worth that cost, and the
 * blob still feels alive through the transform-driven breathe loop below.
 */
const HERO_PATH =
  'M104 8 C147 5 183 30 192 68 C200 104 178 132 158 156 C135 184 101 200 68 189 C33 177 12 146 9 109 C6 68 25 33 58 18 C72 11 89 9 104 8 Z';

interface SmallFloatingBubbleProps {
  badge: HeroBadge;
  index: number;
  proportionalScale?: number;
  currency?: string;
}

const SmallFloatingBubble: React.FC<SmallFloatingBubbleProps> = ({
  badge,
  index,
  proportionalScale = 1,
  currency = 'USD',
}) => {
  const mergeProgress = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const badgeAnim = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      mergeProgress.value = 1;
      return;
    }
    // The liquid "budding" read is worth keeping, but as an entrance that
    // settles — not a loop. Running it forever meant one perpetual animation
    // per badge with nothing driving it, which is exactly the ambient motion
    // that made the app feel busy and drop frames.
    mergeProgress.value = 0;
    mergeProgress.value = withDelay(
      60 + index * 70,
      withTiming(1, { duration: 620, easing: Ease.out })
    );
  }, [index, mergeProgress, reducedMotion]);

  useEffect(() => {
    badgeAnim.value = 0;
    badgeAnim.value = withSequence(
      withTiming(0, { duration: 100 }),
      withSpring(1, { damping: 13, stiffness: 190 })
    );
  }, [badge.id, badge.balance, badgeAnim]);

  const vector = RADIAL_VECTORS[badge.slot];

  const animatedStyle = useAnimatedStyle(() => {
    const p = mergeProgress.value;

    // Radial position: 0 = merged into giant blob edge, 1 = de-merged detached in space
    const tx = vector.dx * (p - 0.25);
    const ty = vector.dy * (p - 0.25);

    // Liquid droplet stretching during de-merging
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

    const popupScale = interpolate(badgeAnim.value, [0, 1], [0.75, 1], Extrapolation.CLAMP);

    const scaleX = stretch * proportionalScale * pressScale.value * popupScale;
    const scaleY = squish * proportionalScale * pressScale.value * popupScale;

    return {
      opacity,
      transform: [
        { translateX: tx },
        { translateY: ty },
        { rotate: `${rot}deg` },
        { scaleX },
        { scaleY },
      ],
    };
  });

  const handlePressIn = () => {
    pressScale.value = withSpring(0.88, { damping: 12, stiffness: 200 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const displayText =
    badge.balance !== undefined
      ? formatShortCurrency(badge.balance, currency)
      : badge.label;

  const bubbleSize = 64;

  return (
    <AnimatedPressable
      onPress={badge.onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.miniBlobContainer,
        SLOT_STYLES[badge.slot],
        animatedStyle,
      ]}
    >
      <Svg width={bubbleSize} height={bubbleSize} viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
        <Defs>
          <SvgLinearGradient id={`miniBlobGrad-${index}`} x1="10%" y1="0%" x2="90%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.96" />
            <Stop offset="100%" stopColor="#F5E8F0" stopOpacity="0.88" />
          </SvgLinearGradient>
        </Defs>

        <Path
          d={index % 2 === 0 ? BLOB_PATH : BLOB_PATH_ALT}
          fill={`url(#miniBlobGrad-${index})`}
          stroke="rgba(255,255,255,0.95)"
          strokeWidth={2}
        />
      </Svg>

      <View style={styles.miniBlobContent}>
        <Ionicons name={badge.icon} size={14} color={badge.color ?? Colors.primary} />
        {displayText ? (
          <AppText variant="micro" numberOfLines={1} style={styles.miniBlobLabel}>
            {displayText}
          </AppText>
        ) : null}
      </View>
    </AnimatedPressable>
  );
};

export const OrganicHero: React.FC<OrganicHeroProps> = ({
  label,
  value,
  sub,
  badges = [],
  size = 225,
  currency = 'USD',
  onPressMain,
  children,
}) => {
  const breathe = useSharedValue(0);
  const swapAnim = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    swapAnim.value = 0;
    swapAnim.value = withSequence(
      withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 14, stiffness: 180, mass: 0.8 })
    );
  }, [value, label, swapAnim]);

  useEffect(() => {
    if (reducedMotion) {
      breathe.value = 0;
      return;
    }
    // One slow loop drives the whole "living blob" read. It used to be five:
    // a morph that rebuilt the SVG path string every frame (forcing
    // react-native-svg to re-parse and re-tessellate the path 60x a second),
    // plus separate float, tilt, scaleX and scaleY loops. This is a single
    // shared value the style worklet derives all of that from, and it only
    // ever touches transforms, which stay on the UI thread and never
    // re-rasterise.
    breathe.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [breathe, reducedMotion]);

  const blobContainerStyle = useAnimatedStyle(() => {
    const swapScale = interpolate(
      swapAnim.value,
      [0, 0.4, 1],
      [0.86, 0.94, 1.0],
      Extrapolation.CLAMP
    );

    // All four of the old loops, derived from one value. The slight
    // counter-phase between scaleX and scaleY is what reads as "breathing"
    // rather than a plain pulse.
    const b = breathe.value;
    const floatY = interpolate(b, [0, 1], [-5, 4]);
    const tiltDeg = interpolate(b, [0, 1], [-1.2, 1.2]);
    const stretchX = interpolate(b, [0, 1], [0.978, 1.022]);
    const stretchY = interpolate(b, [0, 1], [1.022, 0.978]);

    return {
      transform: [
        { translateY: floatY },
        { rotate: `${tiltDeg}deg` },
        { scaleX: stretchX * swapScale },
        { scaleY: stretchY * swapScale },
      ],
    };
  });

  const contentAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(swapAnim.value, [0, 0.3, 1], [0, 0.4, 1], Extrapolation.CLAMP);
    const translateY = interpolate(swapAnim.value, [0, 1], [8, 0], Extrapolation.CLAMP);
    const scale = interpolate(swapAnim.value, [0, 1], [0.92, 1], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const maxAbsBalance = Math.max(
    ...badges.map(b => (b.balance !== undefined ? Math.abs(b.balance) : 1)),
    1
  );

  return (
    <View style={[styles.container, { width: size + 60, height: size + 30 }]}>
      <AnimatedPressable
        onPress={onPressMain}
        style={({ pressed }) => [
          styles.blobWrap,
          { width: size, height: size, opacity: pressed ? 0.92 : 1 },
          blobContainerStyle,
        ]}
      >
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
          <Path
            d={HERO_PATH}
            fill="url(#heroBlobFill)"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth={1.6}
          />
        </Svg>

        <Animated.View style={[styles.content, contentAnimStyle]}>
          {children ?? (
            <>
              {label ? (
                <AppText variant="caption" align="center">
                  {label}
                </AppText>
              ) : null}
              {value ? (
                <AppText
                  variant="display"
                  align="center"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                  style={styles.value}
                >
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
        </Animated.View>
      </AnimatedPressable>

      {badges.slice(0, 4).map((badge, index) => {
        const absBal = badge.balance !== undefined ? Math.abs(badge.balance) : 0;
        const ratio = maxAbsBalance > 0 ? absBal / maxAbsBalance : 0.5;
        const proportionalScale = 0.78 + ratio * 0.44;

        return (
          <SmallFloatingBubble
            key={`${badge.slot}-${index}`}
            badge={badge}
            index={index}
            proportionalScale={proportionalScale}
            currency={currency}
          />
        );
      })}
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
    width: '100%',
    marginTop: 2,
  },
  sub: {
    marginTop: 2,
  },
  miniBlobContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  miniBlobContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 6,
  },
  miniBlobLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

