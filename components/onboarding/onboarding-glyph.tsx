import React from 'react';
import Svg, { Path, Rect, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export interface OnboardingGlyphProps {
  step: number;
  size?: number;
}

/** Line-art illustrations that sit inside the onboarding hero blob. */
export const OnboardingGlyph: React.FC<OnboardingGlyphProps> = ({ step, size = 128 }) => (
  <Svg width={size} height={size} viewBox="0 0 120 120">
    <Defs>
      <LinearGradient id="glyphFade" x1="0%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor={Colors.primary} stopOpacity="0.2" />
        <Stop offset="100%" stopColor={Colors.primary} stopOpacity="0" />
      </LinearGradient>
    </Defs>

    {step === 0 && (
      <>
        {/* Wallet body */}
        <Rect
          x="20"
          y="36"
          width="80"
          height="52"
          rx="14"
          fill="none"
          stroke={Colors.primary}
          strokeWidth="3.5"
        />
        {/* Card slot */}
        <Path
          d="M20 54 H100"
          stroke={Colors.primary}
          strokeWidth="3"
          strokeLinecap="round"
          opacity={0.45}
        />
        {/* Clasp */}
        <Circle cx="84" cy="70" r="6.5" fill="none" stroke={Colors.primary} strokeWidth="3.5" />
        {/* Coins rising out */}
        <Circle cx="42" cy="26" r="9" fill="none" stroke={Colors.accent} strokeWidth="3" />
        <Circle cx="64" cy="20" r="6" fill="none" stroke={Colors.accent} strokeWidth="2.6" opacity={0.7} />
      </>
    )}

    {step === 1 && (
      <>
        {/* Shield */}
        <Path
          d="M60 16 C74 22, 88 24, 96 24 C96 24, 98 74, 60 104 C22 74, 24 24, 24 24 C32 24, 46 22, 60 16 Z"
          fill="url(#glyphFade)"
          stroke={Colors.primary}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        {/* Lock */}
        <Rect x="47" y="56" width="26" height="21" rx="6" fill="none" stroke={Colors.primary} strokeWidth="3" />
        <Path
          d="M52 56 V49 C52 44, 55.5 41, 60 41 C64.5 41, 68 44, 68 49 V56"
          fill="none"
          stroke={Colors.primary}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <Circle cx="60" cy="66" r="2.6" fill={Colors.primary} />
      </>
    )}

    {step === 2 && (
      <>
        {/* Area under the curve */}
        <Path
          d="M18 82 C36 82, 44 46, 62 44 C78 42, 84 62, 102 40 L102 96 L18 96 Z"
          fill="url(#glyphFade)"
        />
        {/* Trend line */}
        <Path
          d="M18 82 C36 82, 44 46, 62 44 C78 42, 84 62, 102 40"
          fill="none"
          stroke={Colors.primary}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {/* Baseline */}
        <Path d="M18 96 H102" stroke={Colors.primary} strokeWidth="2.5" strokeLinecap="round" opacity={0.25} />
        {/* Data points */}
        <Circle cx="62" cy="44" r="5" fill="#FFFFFF" stroke={Colors.primary} strokeWidth="3.5" />
        <Circle cx="102" cy="40" r="4" fill={Colors.accent} />
      </>
    )}
  </Svg>
);
