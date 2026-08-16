import React, { useCallback, useEffect } from 'react';
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
  useAnimatedProps,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  cancelAnimation,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { Ease, Spring } from '@/constants/motion';
import { useMountPop } from '@/hooks/use-mount-pop';
import { haptics } from '@/utils/haptics';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { BLOB_VIEWBOX, BLOB_PATH, BLOB_PATH_ALT } from '@/constants/shapes';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

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

/**
 * The blob geometry, resolved once into flat number arrays rather than
 * re-parsed on every touch.
 *
 * `BLOB_PATH` and `BLOB_PATH_ALT` (constants/shapes.ts) are both authored as
 * "M x y" + six "C x y x y x y" segments — the same 38-number shape — so any
 * point in either array lines up with the matching point in the other. That
 * is what makes numeric interpolation between them valid: mismatched control
 * points would produce a path that self-intersects rather than a shape that
 * reads as one blob turning into another.
 */
function extractNumbers(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

const RESTING_NUMS = extractNumbers(BLOB_PATH);
const ALT_NUMS = extractNumbers(BLOB_PATH_ALT);

function pathFromNumbers(n: number[]): string {
  'worklet';
  return `M${n[0]} ${n[1]} C${n[2]} ${n[3]} ${n[4]} ${n[5]} ${n[6]} ${n[7]} C${n[8]} ${n[9]} ${n[10]} ${n[11]} ${n[12]} ${n[13]} C${n[14]} ${n[15]} ${n[16]} ${n[17]} ${n[18]} ${n[19]} C${n[20]} ${n[21]} ${n[22]} ${n[23]} ${n[24]} ${n[25]} C${n[26]} ${n[27]} ${n[28]} ${n[29]} ${n[30]} ${n[31]} C${n[32]} ${n[33]} ${n[34]} ${n[35]} ${n[36]} ${n[37]} Z`;
}

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
      120 + index * 70,
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
  // A second, independent loop for the aura layer behind the main blob — see
  // the styles/render comment below for why two cheap loops read as one
  // continuously morphing shape.
  const aura = useSharedValue(0);
  const swapAnim = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  // 0 = resting shape, 1 = fully turned into the alternate lobe. Only ever
  // touched by a press, and only for the ~0.5s the sequence below takes —
  // this is the one place a path's `d` gets recomputed per frame, and it is
  // bounded to a direct response to touch rather than running forever.
  const morph = useSharedValue(0);
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const ripple = useSharedValue(0);
  const mountStyle = useMountPop();

  useEffect(() => {
    swapAnim.value = 0;
    swapAnim.value = withSequence(
      withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 14, stiffness: 180, mass: 0.8 })
    );
  }, [value, label, swapAnim]);

  // Start the ambient loops when the Home tab is visible; cancel them when
  // the user navigates away. Previously two infinite loops ran for the entire
  // app lifetime (all four tabs stay mounted after first visit).
  useFocusEffect(
    useCallback(() => {
      if (reducedMotion) return;
      breathe.value = withRepeat(
        withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
      aura.value = withRepeat(
        withTiming(1, { duration: 8600, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
      return () => {
        cancelAnimation(breathe);
        cancelAnimation(aura);
      };
    }, [breathe, aura, reducedMotion])
  );

  const blobContainerStyle = useAnimatedStyle(() => {
    const swapScale = interpolate(
      swapAnim.value,
      [0, 0.4, 1],
      [0.86, 0.94, 1.0],
      Extrapolation.CLAMP
    );

    // All four of the old ambient loops, derived from one value, plus the
    // press-triggered squash on top. The slight counter-phase between scaleX
    // and scaleY is what reads as "breathing" rather than a plain pulse.
    const b = breathe.value;
    const floatY = interpolate(b, [0, 1], [-5, 4]);
    const tiltDeg = interpolate(b, [0, 1], [-1.2, 1.2]);
    const stretchX = interpolate(b, [0, 1], [0.978, 1.022]);
    const stretchY = interpolate(b, [0, 1], [1.022, 0.978]);

    return {
      transform: [
        { translateY: floatY },
        { rotate: `${tiltDeg}deg` },
        { scaleX: stretchX * swapScale * squashX.value },
        { scaleY: stretchY * swapScale * squashY.value },
      ],
    };
  });

  /** The aura: a second lobe, faint, rotating slowly behind the main blob. */
  const auraStyle = useAnimatedStyle(() => {
    const a = aura.value;
    const rotateDeg = interpolate(a, [0, 1], [-9, 11]);
    const scale = interpolate(a, [0, 1], [1.05, 0.97]);
    return {
      transform: [{ rotate: `${rotateDeg}deg` }, { scale }],
    };
  });

  const mainPathProps = useAnimatedProps(() => {
    'worklet';
    const t = morph.value;
    if (t === 0) return { d: BLOB_PATH };
    const n: number[] = new Array(38);
    for (let i = 0; i < 38; i++) {
      n[i] = RESTING_NUMS[i] + (ALT_NUMS[i] - RESTING_NUMS[i]) * t;
    }
    return { d: pathFromNumbers(n) };
  });

  const rippleProps = useAnimatedProps(() => ({
    opacity: interpolate(ripple.value, [0, 0.15, 1], [0, 0.35, 0], Extrapolation.CLAMP),
    rx: interpolate(ripple.value, [0, 1], [90, 118]),
    ry: interpolate(ripple.value, [0, 1], [84, 110]),
  }));

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

  /**
   * The "poke a bubble" reaction: an asymmetric squash-and-overshoot on the
   * whole blob, a real (bounded) shape change via the path morph above, a
   * ripple ring, and a light haptic — everything a tap on the balance figure
   * gets, and none of it runs before or after the ~0.6s it takes.
   */
  const handlePressIn = () => {
    if (reducedMotion) return;
    haptics.selection();
    squashX.value = withSpring(1.09, Spring.pop);
    squashY.value = withSpring(0.88, Spring.pop);
    morph.value = withTiming(1, { duration: 220, easing: Ease.out });
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 560, easing: Ease.out });
  };

  const handlePressOut = () => {
    squashX.value = withSpring(1, Spring.settle);
    squashY.value = withSpring(1, Spring.settle);
    morph.value = withTiming(0, { duration: 360, easing: Ease.emphasis });
  };

  return (
    <Animated.View
      style={[styles.container, { width: size + 60, height: size + 30 }, mountStyle]}
    >
      <AnimatedPressable
        onPress={onPressMain}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.blobWrap,
          { width: size, height: size, opacity: pressed ? 0.96 : 1 },
          blobContainerStyle,
        ]}
      >
        {/* The aura is its own Svg wrapped in an Animated.View that carries the
            transform — Svg only accepts SVG children, so the rotate/scale
            loop cannot live on a View nested inside it. */}
        <Animated.View style={[styles.auraLayer, { width: size * 1.16, height: size * 1.16 }, auraStyle]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
            <Defs>
              <SvgLinearGradient id="heroAuraFill" x1="10%" y1="0%" x2="90%" y2="100%">
                <Stop offset="0%" stopColor="#F5D9EC" stopOpacity="0.55" />
                <Stop offset="100%" stopColor="#DCE4FB" stopOpacity="0.4" />
              </SvgLinearGradient>
            </Defs>
            <Path d={BLOB_PATH_ALT} fill="url(#heroAuraFill)" />
          </Svg>
        </Animated.View>

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
          {/* Expanding ring on press — a bubble's "pop" response. */}
          <AnimatedEllipse
            cx={100}
            cy={108}
            animatedProps={rippleProps}
            fill="none"
            stroke={Colors.primary}
            strokeWidth={1.4}
          />
          <AnimatedPath
            animatedProps={mainPathProps}
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
    </Animated.View>
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
  auraLayer: {
    position: 'absolute',
    top: '-8%',
    left: '-8%',
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
