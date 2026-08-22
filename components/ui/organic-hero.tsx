import React, { useCallback, useEffect, useState } from 'react';
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
  topLeft: { top: '19%', left: '3%' },
  topRight: { top: '9%', right: '3%' },
  bottomLeft: { bottom: '22%', left: '2%' },
  bottomRight: { bottom: '13%', right: '4%' },
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
 * 38-number control structures for hand-crafted resting and alternate lobes.
 */
function extractNumbers(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

const RESTING_NUMS = extractNumbers(BLOB_PATH);
const ALT_NUMS = extractNumbers(BLOB_PATH_ALT);

function pathFromNumbers(n: number[]): string {
  return (
    'M' +
    n[0].toFixed(1) +
    ' ' +
    n[1].toFixed(1) +
    ' C' +
    n[2].toFixed(1) +
    ' ' +
    n[3].toFixed(1) +
    ' ' +
    n[4].toFixed(1) +
    ' ' +
    n[5].toFixed(1) +
    ' ' +
    n[6].toFixed(1) +
    ' ' +
    n[7].toFixed(1) +
    ' C' +
    n[8].toFixed(1) +
    ' ' +
    n[9].toFixed(1) +
    ' ' +
    n[10].toFixed(1) +
    ' ' +
    n[11].toFixed(1) +
    ' ' +
    n[12].toFixed(1) +
    ' ' +
    n[13].toFixed(1) +
    ' C' +
    n[14].toFixed(1) +
    ' ' +
    n[15].toFixed(1) +
    ' ' +
    n[16].toFixed(1) +
    ' ' +
    n[17].toFixed(1) +
    ' ' +
    n[18].toFixed(1) +
    ' ' +
    n[19].toFixed(1) +
    ' C' +
    n[20].toFixed(1) +
    ' ' +
    n[21].toFixed(1) +
    ' ' +
    n[22].toFixed(1) +
    ' ' +
    n[23].toFixed(1) +
    ' ' +
    n[24].toFixed(1) +
    ' ' +
    n[25].toFixed(1) +
    ' C' +
    n[26].toFixed(1) +
    ' ' +
    n[27].toFixed(1) +
    ' ' +
    n[28].toFixed(1) +
    ' ' +
    n[29].toFixed(1) +
    ' ' +
    n[30].toFixed(1) +
    ' ' +
    n[31].toFixed(1) +
    ' C' +
    n[32].toFixed(1) +
    ' ' +
    n[33].toFixed(1) +
    ' ' +
    n[34].toFixed(1) +
    ' ' +
    n[35].toFixed(1) +
    ' ' +
    n[36].toFixed(1) +
    ' ' +
    n[37].toFixed(1) +
    ' Z'
  );
}

/**
 * Calculates dynamic fluid morphed blob paths in real-time.
 */
function getMorphBlobPath(t: number): string {
  const wave1 = (Math.sin(t * 1.2) + 1) / 2; // Smooth 0 to 1 cycle (~5.2s)
  const wave2 = Math.sin(t * 2.0) * 0.12;
  const p = Math.max(0, Math.min(1, wave1 + wave2));

  const n = new Array(38);
  for (let i = 0; i < 38; i++) {
    let val = RESTING_NUMS[i] + (ALT_NUMS[i] - RESTING_NUMS[i]) * p;
    // Harmonic liquid surface tension wave across control points
    const angle = (i / 38) * Math.PI * 4;
    const ripple = Math.sin(angle + t * 1.6) * 2.2;
    val += ripple;
    n[i] = val;
  }
  return pathFromNumbers(n);
}

/**
 * Hook that drives real-time 60fps shape morphing across all Android & iOS devices.
 */
function useDynamicBlobPath(reducedMotion: boolean): { blobPath: string; auraPath: string } {
  const [paths, setPaths] = useState(() => ({
    blobPath: BLOB_PATH,
    auraPath: BLOB_PATH_ALT,
  }));

  useFocusEffect(
    useCallback(() => {
      if (reducedMotion) return;

      let rafId: number;
      const startTime = Date.now();

      const updateFrame = () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const blobPath = getMorphBlobPath(elapsed);
        const auraPath = getMorphBlobPath(elapsed * 0.85 + 1.8);

        setPaths({ blobPath, auraPath });
        rafId = requestAnimationFrame(updateFrame);
      };

      rafId = requestAnimationFrame(updateFrame);

      return () => {
        cancelAnimationFrame(rafId);
      };
    }, [reducedMotion])
  );

  return paths;
}

interface SmallFloatingBubbleProps {
  badge: HeroBadge;
  index: number;
  proportionalScale?: number;
  currency?: string;
  timeShared: { value: number };
}

const SmallFloatingBubble: React.FC<SmallFloatingBubbleProps> = ({
  badge,
  index,
  proportionalScale = 1,
  currency = 'USD',
  timeShared,
}) => {
  const mergeProgress = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const badgeAnim = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  // Entrance merge animation
  useEffect(() => {
    if (reducedMotion) {
      mergeProgress.value = 1;
      return;
    }
    mergeProgress.value = 0;
    mergeProgress.value = withDelay(
      60 + index * 60,
      withTiming(1, { duration: 520, easing: Ease.out })
    );
  }, [index, mergeProgress, reducedMotion]);

  useEffect(() => {
    badgeAnim.value = 0;
    badgeAnim.value = withSequence(
      withTiming(0, { duration: 80 }),
      withSpring(1, { damping: 13, stiffness: 190 })
    );
  }, [badge.id, badge.balance, badgeAnim]);

  const vector = RADIAL_VECTORS[badge.slot];

  const animatedStyle = useAnimatedStyle(() => {
    const p = mergeProgress.value;
    const t = timeShared.value;

    // Radial position from merge entrance
    const tx = vector.dx * (p - 0.25);
    const ty = vector.dy * (p - 0.25);

    // Dynamic buoyant floating drift with unique phase offsets
    const speedMults = [1.2, 1.05, 0.95, 1.15];
    const phaseOffsets = [0.0, 1.6, 3.2, 4.8];
    const speed = speedMults[index % 4];
    const phase = phaseOffsets[index % 4];

    const floatY = Math.sin(t * speed + phase) * 6.5;
    const floatX = Math.cos(t * (speed * 0.8) + phase) * 3.0;
    const floatPulse = 1 + Math.sin(t * speed + phase) * 0.04;
    const floatRot = Math.sin(t * (speed * 0.7) + phase) * 3.0;

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
      [0.85, 0.96, 1.0, 0.97],
      Extrapolation.CLAMP
    );

    const rot = interpolate(
      p,
      [0, 0.5, 1],
      [vector.stretchAngle * 0.4, vector.stretchAngle, 0],
      Extrapolation.CLAMP
    );

    const popupScale = interpolate(badgeAnim.value, [0, 1], [0.75, 1], Extrapolation.CLAMP);

    const scaleX = stretch * proportionalScale * pressScale.value * popupScale * floatPulse;
    const scaleY = squish * proportionalScale * pressScale.value * popupScale * floatPulse;

    return {
      opacity,
      transform: [
        { translateX: tx + floatX },
        { translateY: ty + floatY },
        { rotate: `${rot + floatRot}deg` },
        { scaleX },
        { scaleY },
      ],
    };
  });

  const handlePressIn = () => {
    pressScale.value = withSpring(0.88, { damping: 14, stiffness: 220 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 14, stiffness: 220 });
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
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.99" />
            <Stop offset="60%" stopColor="#FAF2F8" stopOpacity="0.94" />
            <Stop offset="100%" stopColor="#F2E2EF" stopOpacity="0.88" />
          </SvgLinearGradient>
          <SvgRadialGradient id={`miniBlobGlow-${index}`} cx="35%" cy="30%" rx="60%" ry="60%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <Stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.12" />
            <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.06" />
          </SvgRadialGradient>
        </Defs>

        <Path
          d={index % 2 === 0 ? BLOB_PATH : BLOB_PATH_ALT}
          fill={`url(#miniBlobGrad-${index})`}
          stroke="rgba(255,255,255,0.98)"
          strokeWidth={1.8}
        />
        {/* Soft specular glossy bubble glint */}
        <Ellipse cx={78} cy={64} rx={32} ry={20} fill={`url(#miniBlobGlow-${index})`} />
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
  const reducedMotion = useReducedMotion();
  // Real-time 60fps shape morphing hook
  const { blobPath, auraPath } = useDynamicBlobPath(reducedMotion);

  // Time clock for buoyant floating & satellite drift
  const timeVal = useSharedValue(0);
  const swapAnim = useSharedValue(1);

  // Reactive touch squash and press response
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const ripple = useSharedValue(0);
  const mountStyle = useMountPop();

  useEffect(() => {
    swapAnim.value = 0;
    swapAnim.value = withSequence(
      withTiming(0, { duration: 110, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 14, stiffness: 180, mass: 0.8 })
    );
  }, [value, label, swapAnim]);

  useFocusEffect(
    useCallback(() => {
      if (reducedMotion) return;

      timeVal.value = 0;
      timeVal.value = withRepeat(
        withTiming(Math.PI * 2, { duration: 4600, easing: Easing.linear }),
        -1,
        false
      );

      return () => {
        cancelAnimation(timeVal);
      };
    }, [timeVal, reducedMotion])
  );

  /**
   * Main blob buoyancy floating & volume breathing
   */
  const blobContainerStyle = useAnimatedStyle(() => {
    const swapScale = interpolate(
      swapAnim.value,
      [0, 0.4, 1],
      [0.88, 0.95, 1.0],
      Extrapolation.CLAMP
    );

    const t = timeVal.value;

    // Buoyancy floating (±6.5px)
    const floatY = Math.sin(t) * 6.5;
    // Gentle horizontal drift (±3.0px)
    const floatX = Math.cos(t * 0.7) * 3.0;
    // Fluid volume breathing
    const stretchY = (1 + Math.sin(t) * 0.04) * swapScale * squashY.value;
    const stretchX = (1 - Math.sin(t) * 0.035) * swapScale * squashX.value;

    return {
      transform: [
        { translateX: floatX },
        { translateY: floatY },
        { scaleX: stretchX },
        { scaleY: stretchY },
      ],
    };
  });

  /** Aura: soft translucent halo that gently breathes behind main bubble */
  const auraStyle = useAnimatedStyle(() => {
    const t = timeVal.value;
    const rotate = Math.sin(t * 0.65 + 1.2) * 10;
    const scale = 1.06 + Math.sin(t * 0.85) * 0.05;

    return {
      transform: [
        { rotate: `${rotate}deg` },
        { scale },
      ],
    };
  });

  const rippleProps = useAnimatedProps(() => ({
    opacity: interpolate(ripple.value, [0, 0.15, 1], [0, 0.42, 0], Extrapolation.CLAMP),
    rx: interpolate(ripple.value, [0, 1], [88, 126]),
    ry: interpolate(ripple.value, [0, 1], [82, 118]),
  }));

  const contentAnimStyle = useAnimatedStyle(() => {
    const opacity = interpolate(swapAnim.value, [0, 0.3, 1], [0, 0.4, 1], Extrapolation.CLAMP);
    const translateY = interpolate(swapAnim.value, [0, 1], [6, 0], Extrapolation.CLAMP);
    const scale = interpolate(swapAnim.value, [0, 1], [0.94, 1], Extrapolation.CLAMP);

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
   * Refined, tactile tap response: springy compression, soft ripple, haptic impact.
   */
  const handlePressIn = () => {
    if (reducedMotion) return;
    haptics.selection();
    squashX.value = withSpring(1.12, Spring.pop);
    squashY.value = withSpring(0.88, Spring.pop);
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 520, easing: Ease.out });
  };

  const handlePressOut = () => {
    squashX.value = withSpring(1, Spring.settle);
    squashY.value = withSpring(1, Spring.settle);
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
        {/* Aura layer: soft translucent halo behind main bubble */}
        <Animated.View style={[styles.auraLayer, { width: size * 1.16, height: size * 1.16 }, auraStyle]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
            <Defs>
              <SvgLinearGradient id="heroAuraFill" x1="10%" y1="0%" x2="90%" y2="100%">
                <Stop offset="0%" stopColor="#F5D9EC" stopOpacity="0.6" />
                <Stop offset="50%" stopColor="#E9D5FF" stopOpacity="0.45" />
                <Stop offset="100%" stopColor="#DCE4FB" stopOpacity="0.35" />
              </SvgLinearGradient>
            </Defs>
            <Path d={auraPath} fill="url(#heroAuraFill)" />
          </Svg>
        </Animated.View>

        {/* Main hero blob with real-time continuous shape morphing, glow, and pearlescent gradient */}
        <Svg width={size} height={size} viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
          <Defs>
            <SvgLinearGradient id="heroBlobFill" x1="15%" y1="0%" x2="85%" y2="100%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.99" />
              <Stop offset="45%" stopColor="#FCF4F9" stopOpacity="0.94" />
              <Stop offset="100%" stopColor="#F5E4F0" stopOpacity="0.86" />
            </SvgLinearGradient>

            <SvgRadialGradient id="heroBlobGlow" cx="50%" cy="54%" rx="50%" ry="50%">
              <Stop offset="58%" stopColor="#6D28D9" stopOpacity="0.14" />
              <Stop offset="85%" stopColor="#EC4899" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#6D28D9" stopOpacity="0" />
            </SvgRadialGradient>
          </Defs>

          {/* Ambient soft glow */}
          <Ellipse cx={100} cy={108} rx={99} ry={92} fill="url(#heroBlobGlow)" />

          {/* Expanding bubble pop ripple on press */}
          <AnimatedEllipse
            cx={100}
            cy={108}
            animatedProps={rippleProps}
            fill="none"
            stroke={Colors.primary}
            strokeWidth={1.5}
          />

          {/* Main real-time morphing organic bubble path */}
          <Path
            d={blobPath}
            fill="url(#heroBlobFill)"
            stroke="rgba(255,255,255,0.96)"
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

      {/* Orbiting satellite bubbles */}
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
            timeShared={timeVal}
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
