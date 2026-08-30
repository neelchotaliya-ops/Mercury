import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useTiltGravity } from '@/hooks/use-tilt-gravity';
import { BLOB_VIEWBOX, BLOB_PATH, BLOB_PATH_ALT } from '@/constants/shapes';

import { NumberFormat } from '@/types/finance';
import { getCurrencySymbol } from '@/utils/currency';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// 4 organic fluid liquid shapes for continuous seamless bezier morphing
const SHAPE_0 = [104, 7, 144, 4, 180, 28, 190, 66, 199, 101, 176, 128, 157, 153, 134, 182, 101, 199, 68, 188, 32, 176, 11, 145, 8, 108, 5, 68, 24, 33, 57, 17, 72, 10, 89, 8, 104, 7];
const SHAPE_1 = [96, 6, 136, 3, 174, 22, 187, 57, 200, 93, 182, 126, 160, 150, 136, 176, 98, 197, 65, 184, 30, 170, 13, 138, 10, 102, 7, 64, 30, 31, 62, 16, 73, 10, 85, 7, 96, 6];
const SHAPE_2 = [112, 12, 158, 8, 196, 35, 192, 78, 188, 118, 194, 142, 166, 170, 138, 198, 94, 200, 62, 182, 28, 164, 10, 135, 12, 96, 14, 56, 38, 24, 72, 14, 86, 9, 99, 10, 112, 12];
const SHAPE_3 = [90, 10, 126, 4, 164, 16, 188, 50, 212, 84, 182, 132, 150, 160, 118, 188, 74, 194, 44, 172, 14, 150, 8, 118, 12, 80, 16, 42, 34, 22, 64, 14, 74, 11, 82, 10, 90, 10];

export type BadgeSlot = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface HeroBadge {
  id?: string | null;
  name?: string;
  balance?: number;
  currency?: string;
  numberFormat?: NumberFormat;
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
  numberFormat?: NumberFormat;
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

function formatShortCurrency(amount: number, currency: string, numberFormat?: NumberFormat): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const sym = getCurrencySymbol(currency);
  const isIndian = numberFormat === 'indian' || (!numberFormat && currency === 'INR');

  if (isIndian) {
    if (abs >= 10000000) return `${sign}${sym}${(abs / 10000000).toFixed(1)}Cr`;
    if (abs >= 100000) return `${sign}${sym}${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `${sign}${sym}${(abs / 1000).toFixed(1)}k`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }

  if (abs >= 1000000000) {
    return `${sign}${sym}${(abs / 1000000000).toFixed(1)}B`;
  }
  if (abs >= 1000000) {
    return `${sign}${sym}${(abs / 1000000).toFixed(1)}M`;
  }
  if (abs >= 1000) {
    return `${sign}${sym}${(abs / 1000).toFixed(1)}k`;
  }
  return `${sign}${sym}${abs.toFixed(0)}`;
}

interface SmallFloatingBubbleProps {
  badge: HeroBadge;
  index: number;
  proportionalScale?: number;
  currency?: string;
  numberFormat?: NumberFormat;
  timeShared: { value: number };
  /** Main blob's tilt-gravity offset, applied at a reduced scale so satellites feel loosely tethered rather than rigidly locked to it. */
  tiltShared?: { gx: { value: number }; gy: { value: number } };
}

const SmallFloatingBubbleBase: React.FC<SmallFloatingBubbleProps> = ({
  badge,
  index,
  proportionalScale = 1,
  currency = 'USD',
  numberFormat,
  timeShared,
  tiltShared,
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

    // Loosely tethered to the main blob's tilt — same direction, smaller
    // magnitude, so the satellites read as trailing it rather than being
    // rigidly welded on.
    const tiltX = tiltShared ? tiltShared.gx.value * 0.55 : 0;
    const tiltY = tiltShared ? tiltShared.gy.value * 0.55 : 0;

    return {
      opacity,
      transform: [
        { translateX: tx + floatX + tiltX },
        { translateY: ty + floatY + tiltY },
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
      ? formatShortCurrency(badge.balance, badge.currency ?? currency, badge.numberFormat ?? numberFormat)
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

/** Re-rendered by the parent on every data refresh; memoized so it doesn't also re-render on every animation frame. */
const SmallFloatingBubble = React.memo(SmallFloatingBubbleBase);

/** How long a hold has to run before it pays off. */
const HOLD_TO_BURST_MS = 1400;
/** Gap between haptic/charge ticks at the very start of a hold (ms). */
const MAX_TICK_MS = 190;
/** Gap between ticks right at the peak — this is what actually sells "continuous": short, tight, back-to-back pulses read as one rising buzz even though each is a discrete impact. */
const MIN_TICK_MS = 20;
/** How many pieces the blob bursts into. */
const SHARD_COUNT = 6;

interface BurstShardProps {
  index: number;
  total: number;
  onCollected: () => void;
}

/**
 * One fragment of the blob after it bursts. Flies outward on mount (its own
 * random-ish angle/distance so the scatter doesn't look mechanical), then sits
 * there waiting to be tapped — a tap shrinks it back down to the blob's center,
 * counted immediately by the parent so "all collected" can fire the reform
 * while the last piece or two are still animating home.
 */
const BurstShardBase: React.FC<BurstShardProps> = ({ index, total, onCollected }) => {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);
  const collectedRef = useRef(false);

  useEffect(() => {
    const jitter = (Math.random() - 0.5) * 0.6;
    const angle = (index / total) * Math.PI * 2 + jitter;
    const dist = 58 + Math.random() * 46;
    const restX = Math.cos(angle) * dist;
    const restY = Math.sin(angle) * dist + 10; // slight downward gravity bias
    const spin = (Math.random() - 0.5) * 220;
    const delay = index * 16;

    scale.value = withDelay(delay, withTiming(0.6 + Math.random() * 0.18, { duration: 240, easing: Ease.out }));
    rotate.value = withDelay(delay, withTiming(spin, { duration: 340, easing: Ease.out }));
    tx.value = withDelay(delay, withTiming(restX, { duration: 280, easing: Ease.out }));
    ty.value = withDelay(
      delay,
      withSequence(
        withTiming(restY - 10, { duration: 230, easing: Ease.out }),
        withSpring(restY, Spring.settle)
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  const handleTap = () => {
    if (collectedRef.current) return;
    collectedRef.current = true;
    haptics.selection();
    tx.value = withTiming(0, { duration: 260, easing: Ease.inOut });
    ty.value = withTiming(0, { duration: 260, easing: Ease.inOut });
    scale.value = withTiming(0, { duration: 220, easing: Ease.inOut });
    opacity.value = withTiming(0, { duration: 220, easing: Ease.inOut });
    onCollected();
  };

  return (
    <AnimatedPressable onPress={handleTap} hitSlop={12} style={[styles.shard, style]}>
      <Svg width={34} height={34} viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
        <Defs>
          <SvgLinearGradient id={`shardGrad-${index}`} x1="15%" y1="0%" x2="85%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.99" />
            <Stop offset="100%" stopColor="#F5E4F0" stopOpacity="0.9" />
          </SvgLinearGradient>
        </Defs>
        <Path
          d={index % 2 === 0 ? BLOB_PATH : BLOB_PATH_ALT}
          fill={`url(#shardGrad-${index})`}
          stroke="rgba(255,255,255,0.96)"
          strokeWidth={2.4}
        />
      </Svg>
    </AnimatedPressable>
  );
};

const BurstShard = React.memo(BurstShardBase);

export const OrganicHero: React.FC<OrganicHeroProps> = ({
  label,
  value,
  sub,
  badges = [],
  size = 225,
  currency = 'USD',
  numberFormat,
  onPressMain,
  children,
}) => {
  const reducedMotion = useReducedMotion();

  // Time clock for buoyant floating & satellite drift
  const timeVal = useSharedValue(0);
  const morphVal = useSharedValue(0);
  const swapAnim = useSharedValue(1);

  // Reactive touch squash and press response
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const ripple = useSharedValue(0);
  const mountStyle = useMountPop();

  // Tilt the phone, the blob rolls that way — see hooks/use-tilt-gravity.ts.
  const tilt = useTiltGravity();

  // Hold-to-burst: 0..1 progress through the charge, driving the shake/inflate/
  // glow build-up. blobOpacity/blobPopScale are the blob's own pop-out (burst)
  // and pop-in (reform) — separate from blobContainerStyle so they don't fight
  // the position/tilt/charge transforms already living there.
  const chargeProgress = useSharedValue(0);
  const blobOpacity = useSharedValue(1);
  const blobPopScale = useSharedValue(1);

  const [burstActive, setBurstActive] = useState(false);
  const [collectedCount, setCollectedCount] = useState(0);
  const [burstKey, setBurstKey] = useState(0);

  const holdStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRef = useRef(false);
  const hasBurstedRef = useRef(false);

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

      morphVal.value = 0;
      morphVal.value = withRepeat(
        withTiming(4, { duration: 7000, easing: Easing.linear }),
        -1,
        false
      );

      return () => {
        cancelAnimation(timeVal);
        cancelAnimation(morphVal);
      };
    }, [timeVal, morphVal, reducedMotion])
  );

  /**
   * Ultra-fast zero-allocation cubic shape morphing on UI thread
   */
  const blobPathProps = useAnimatedProps(() => {
    'worklet';
    if (reducedMotion) return { d: BLOB_PATH };

    const t = morphVal.value;
    const seg = Math.floor(t) % 4;
    const frac = t - Math.floor(t);
    // Smooth cubic easing across keyframes
    const p = frac * frac * (3 - 2 * frac);

    let from = SHAPE_0, to = SHAPE_1;
    if (seg === 1) { from = SHAPE_1; to = SHAPE_2; }
    else if (seg === 2) { from = SHAPE_2; to = SHAPE_3; }
    else if (seg === 3) { from = SHAPE_3; to = SHAPE_0; }

    const c0 = (from[0] + (to[0] - from[0]) * p) | 0;
    const c1 = (from[1] + (to[1] - from[1]) * p) | 0;
    const c2 = (from[2] + (to[2] - from[2]) * p) | 0;
    const c3 = (from[3] + (to[3] - from[3]) * p) | 0;
    const c4 = (from[4] + (to[4] - from[4]) * p) | 0;
    const c5 = (from[5] + (to[5] - from[5]) * p) | 0;
    const c6 = (from[6] + (to[6] - from[6]) * p) | 0;
    const c7 = (from[7] + (to[7] - from[7]) * p) | 0;
    const c8 = (from[8] + (to[8] - from[8]) * p) | 0;
    const c9 = (from[9] + (to[9] - from[9]) * p) | 0;
    const c10 = (from[10] + (to[10] - from[10]) * p) | 0;
    const c11 = (from[11] + (to[11] - from[11]) * p) | 0;
    const c12 = (from[12] + (to[12] - from[12]) * p) | 0;
    const c13 = (from[13] + (to[13] - from[13]) * p) | 0;
    const c14 = (from[14] + (to[14] - from[14]) * p) | 0;
    const c15 = (from[15] + (to[15] - from[15]) * p) | 0;
    const c16 = (from[16] + (to[16] - from[16]) * p) | 0;
    const c17 = (from[17] + (to[17] - from[17]) * p) | 0;
    const c18 = (from[18] + (to[18] - from[18]) * p) | 0;
    const c19 = (from[19] + (to[19] - from[19]) * p) | 0;
    const c20 = (from[20] + (to[20] - from[20]) * p) | 0;
    const c21 = (from[21] + (to[21] - from[21]) * p) | 0;
    const c22 = (from[22] + (to[22] - from[22]) * p) | 0;
    const c23 = (from[23] + (to[23] - from[23]) * p) | 0;
    const c24 = (from[24] + (to[24] - from[24]) * p) | 0;
    const c25 = (from[25] + (to[25] - from[25]) * p) | 0;
    const c26 = (from[26] + (to[26] - from[26]) * p) | 0;
    const c27 = (from[27] + (to[27] - from[27]) * p) | 0;
    const c28 = (from[28] + (to[28] - from[28]) * p) | 0;
    const c29 = (from[29] + (to[29] - from[29]) * p) | 0;
    const c30 = (from[30] + (to[30] - from[30]) * p) | 0;
    const c31 = (from[31] + (to[31] - from[31]) * p) | 0;
    const c32 = (from[32] + (to[32] - from[32]) * p) | 0;
    const c33 = (from[33] + (to[33] - from[33]) * p) | 0;
    const c34 = (from[34] + (to[34] - from[34]) * p) | 0;
    const c35 = (from[35] + (to[35] - from[35]) * p) | 0;
    const c36 = (from[36] + (to[36] - from[36]) * p) | 0;
    const c37 = (from[37] + (to[37] - from[37]) * p) | 0;

    // Tilt-driven weight shift: the side of the blob facing downhill bulges
    // outward, the opposite side pulls thin, so it reads as liquid settling
    // under gravity rather than a static shape sliding around. `pts` holds
    // the 19 (x,y) control points computed above; center is the viewBox
    // midpoint (100,100) since every SHAPE_n array is authored around it.
    const pts = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23, c24, c25, c26, c27, c28, c29, c30, c31, c32, c33, c34, c35, c36, c37];
    const tgx = tilt.gx.value;
    const tgy = tilt.gy.value;
    const tiltMag = Math.min(1, Math.sqrt(tgx * tgx + tgy * tgy) / 14);
    if (tiltMag > 0.02) {
      const tiltAngle = Math.atan2(tgy, tgx);
      const bulgeStrength = 9;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i] - 100;
        const dy = pts[i + 1] - 100;
        const r = Math.sqrt(dx * dx + dy * dy) || 1;
        const bulge = Math.cos(Math.atan2(dy, dx) - tiltAngle) * bulgeStrength * tiltMag;
        pts[i] = (pts[i] + (dx / r) * bulge) | 0;
        pts[i + 1] = (pts[i + 1] + (dy / r) * bulge) | 0;
      }
    }

    return {
      d: `M${pts[0]} ${pts[1]} C${pts[2]} ${pts[3]} ${pts[4]} ${pts[5]} ${pts[6]} ${pts[7]} C${pts[8]} ${pts[9]} ${pts[10]} ${pts[11]} ${pts[12]} ${pts[13]} C${pts[14]} ${pts[15]} ${pts[16]} ${pts[17]} ${pts[18]} ${pts[19]} C${pts[20]} ${pts[21]} ${pts[22]} ${pts[23]} ${pts[24]} ${pts[25]} C${pts[26]} ${pts[27]} ${pts[28]} ${pts[29]} ${pts[30]} ${pts[31]} C${pts[32]} ${pts[33]} ${pts[34]} ${pts[35]} ${pts[36]} ${pts[37]} Z`
    };
  });

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

    // Buoyancy floating
    const floatY = Math.sin(t * 0.8) * 5.0;
    const floatX = Math.cos(t * 0.6) * 2.5;

    // Fluid volume breathing
    const stretchY = (1 + Math.sin(t * 1.2) * 0.035) * swapScale * squashY.value;
    const stretchX = (1 - Math.sin(t * 1.2) * 0.03) * swapScale * squashX.value;
    const rotate = Math.sin(t * 0.5) * 4.0;

    // Hold-to-burst charge: a fast, growing shiver plus a slight inflate —
    // tension visibly building the longer the press holds.
    const charge = chargeProgress.value;
    const shake = charge > 0 ? Math.sin(t * 55) * 2.4 * charge : 0;
    const inflate = 1 + charge * 0.09;

    return {
      transform: [
        { translateX: floatX + tilt.gx.value + shake },
        { translateY: floatY + tilt.gy.value },
        { rotate: `${rotate}deg` },
        { scaleX: stretchX * inflate },
        { scaleY: stretchY * inflate },
      ],
    };
  });

  /** Aura: asynchronous counter-morphing translucent halo */
  const auraStyle = useAnimatedStyle(() => {
    const t = timeVal.value;
    const rotate = Math.cos(t * 0.55 + 1.2) * -12.0;
    const scale = 1.05 + Math.sin(t * 0.8) * 0.04;

    // Trails the main blob's tilt at a reduced scale for a soft parallax
    // depth cue rather than moving in lockstep with it.
    return {
      transform: [
        { translateX: tilt.gx.value * 0.35 },
        { translateY: tilt.gy.value * 0.35 },
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

  /** Warm highlight that brightens through a hold — the "charging up" cue, independent of the shake/inflate. */
  const chargeGlowProps = useAnimatedProps(() => ({
    opacity: chargeProgress.value * 0.5,
  }));

  /** The blob's own pop-out (burst) / pop-in (reform), kept separate from blobContainerStyle's position/tilt/charge transforms. */
  const blobInnerStyle = useAnimatedStyle(() => ({
    opacity: blobOpacity.value,
    transform: [{ scale: blobPopScale.value }],
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

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const triggerBurst = () => {
    clearHoldTimer();
    holdStartRef.current = null;
    hasBurstedRef.current = true;
    haptics.success();
    // Quick pop-out, then swap to the shard pieces once it's mostly faded —
    // this is what makes the burst read as the blob's own doing rather than
    // an abrupt cut to a different view.
    blobPopScale.value = withTiming(1.35, { duration: 170, easing: Ease.out });
    blobOpacity.value = withTiming(0, { duration: 150, easing: Ease.out });
    chargeProgress.value = withTiming(0, { duration: 100 });
    setTimeout(() => {
      setCollectedCount(0);
      setBurstKey(k => k + 1);
      setBurstActive(true);
    }, 150);
  };

  /**
   * Escalating hold: each tick fires a stronger haptic and reschedules itself
   * sooner than the last, so the gap between pulses shrinks as intensity
   * rises — the closest cross-platform approximation of a continuous ramp,
   * since expo-haptics only exposes discrete impacts. chargeProgress eases
   * toward each new checkpoint over exactly that same shrinking gap, which
   * keeps the *visual* side genuinely continuous even though the haptic
   * side is a pulse train underneath it.
   */
  const scheduleTick = () => {
    const start = holdStartRef.current;
    if (start == null) return;
    const elapsed = Date.now() - start;
    const progress = Math.min(1, elapsed / HOLD_TO_BURST_MS);
    const eased = progress * progress;
    const nextDelay = Math.round(MAX_TICK_MS - (MAX_TICK_MS - MIN_TICK_MS) * eased);

    chargeProgress.value = withTiming(progress, { duration: nextDelay, easing: Easing.linear });
    haptics.chargeTick(progress);

    if (progress >= 1) {
      triggerBurst();
      return;
    }
    if (elapsed > 180) longPressRef.current = true;
    holdTimerRef.current = setTimeout(scheduleTick, Math.max(nextDelay, 1));
  };

  const handleShardCollected = useCallback(() => {
    setCollectedCount(c => c + 1);
  }, []);

  // All pieces tapped: let the last one or two finish flying home, then
  // reform the blob and hand control back to it.
  useEffect(() => {
    if (!burstActive || collectedCount < SHARD_COUNT) return;
    const t = setTimeout(() => {
      setBurstActive(false);
      haptics.success();
    }, 320);
    return () => clearTimeout(t);
  }, [burstActive, collectedCount]);

  // Pop the blob back in once the shards are gone. Guarded so this never
  // fires on first mount — hasBurstedRef only flips true inside an actual burst.
  useEffect(() => {
    if (burstActive || !hasBurstedRef.current) return;
    blobOpacity.value = 0;
    blobPopScale.value = 0.72;
    blobOpacity.value = withTiming(1, { duration: 220, easing: Ease.out });
    blobPopScale.value = withSpring(1, Spring.pop);
  }, [burstActive, blobOpacity, blobPopScale]);

  /**
   * Refined, tactile tap response: springy compression, soft ripple, haptic
   * impact — and, if the press keeps holding, the escalating charge that
   * ends in a burst. Reduced motion skips the whole charge/burst mechanic
   * (it's exactly the kind of motion that setting exists to suppress) and
   * falls back to the plain tap response.
   */
  const handlePressIn = () => {
    if (reducedMotion) return;
    if (burstActive) return;

    squashX.value = withSpring(1.12, Spring.pop);
    squashY.value = withSpring(0.88, Spring.pop);
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 520, easing: Ease.out });

    longPressRef.current = false;
    holdStartRef.current = Date.now();
    scheduleTick();
  };

  const handlePressOut = () => {
    squashX.value = withSpring(1, Spring.settle);
    squashY.value = withSpring(1, Spring.settle);

    if (reducedMotion || burstActive) return;
    clearHoldTimer();
    holdStartRef.current = null;
    chargeProgress.value = withSpring(0, Spring.settle);
  };

  const handlePress = () => {
    if (longPressRef.current || burstActive) return;
    onPressMain?.();
  };

  return (
    <Animated.View
      style={[styles.container, { width: size + 60, height: size + 30 }, mountStyle]}
    >
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        pointerEvents={burstActive ? 'none' : 'auto'}
        style={({ pressed }) => [
          styles.blobWrap,
          { width: size, height: size, opacity: pressed ? 0.96 : 1 },
          blobContainerStyle,
        ]}
      >
        {/* Aura layer: soft translucent halo behind main bubble */}
        <Animated.View style={[styles.auraLayer, { width: size * 1.16, height: size * 1.16 }, auraStyle, blobInnerStyle]}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
            <Defs>
              <SvgLinearGradient id="heroAuraFill" x1="10%" y1="0%" x2="90%" y2="100%">
                <Stop offset="0%" stopColor="#F5D9EC" stopOpacity="0.6" />
                <Stop offset="50%" stopColor="#E9D5FF" stopOpacity="0.45" />
                <Stop offset="100%" stopColor="#DCE4FB" stopOpacity="0.35" />
              </SvgLinearGradient>
            </Defs>
            <Path d={BLOB_PATH_ALT} fill="url(#heroAuraFill)" />
          </Svg>
        </Animated.View>

        {/* Main hero blob with glow, and pearlescent gradient */}
        <Animated.View style={blobInnerStyle}>
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

            {/* Warm highlight that brightens through a hold */}
            <AnimatedEllipse
              cx={100}
              cy={108}
              rx={95}
              ry={88}
              animatedProps={chargeGlowProps}
              fill={Colors.primary}
            />

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
            <AnimatedPath
              animatedProps={blobPathProps}
              fill="url(#heroBlobFill)"
              stroke="rgba(255,255,255,0.96)"
              strokeWidth={1.6}
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.content, contentAnimStyle, blobInnerStyle]}>
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

      {/* Burst pieces: tap each one to bring it home and reform the blob */}
      {burstActive &&
        Array.from({ length: SHARD_COUNT }).map((_, i) => (
          <BurstShard key={`${burstKey}-${i}`} index={i} total={SHARD_COUNT} onCollected={handleShardCollected} />
        ))}

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
            numberFormat={numberFormat}
            timeShared={timeVal}
            tiltShared={tilt}
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
  shard: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -17,
    marginTop: -17,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
