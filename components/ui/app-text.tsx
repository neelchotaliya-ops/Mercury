import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';
import { useAppTheme } from '@/context/theme-context';
import { Fonts } from '@/constants/theme';

export type TextVariant = 'h1' | 'h2' | 'h3' | 'subtitle' | 'body' | 'caption' | 'button' | 'link';

export interface AppTextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy';
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
  style?: TextStyle | TextStyle[];
  children: React.ReactNode;
}

export const AppText: React.FC<AppTextProps> = ({
  variant = 'body',
  color,
  weight,
  align = 'left',
  style,
  children,
  ...rest
}) => {
  const { colors, typography } = useAppTheme();

  const getVariantStyles = (): TextStyle => {
    switch (variant) {
      case 'h1':
        return {
          fontFamily: Fonts.title.extraBold,
          fontSize: typography.fontSizes['4xl'], // 32
          lineHeight: 38,
          letterSpacing: typography.letterSpacing.tight,
          color: colors.textPrimary,
        };
      case 'h2':
        return {
          fontFamily: Fonts.title.bold,
          fontSize: typography.fontSizes['3xl'], // 28
          lineHeight: 34,
          letterSpacing: typography.letterSpacing.tight,
          color: colors.textPrimary,
        };
      case 'h3':
        return {
          fontFamily: Fonts.title.semibold,
          fontSize: typography.fontSizes['2xl'], // 24
          lineHeight: 30,
          color: colors.textPrimary,
        };
      case 'subtitle':
        return {
          fontFamily: Fonts.subtitle.regular,
          fontSize: typography.fontSizes.md, // 16
          lineHeight: 22,
          color: colors.textSecondary,
        };
      case 'body':
        return {
          fontFamily: Fonts.subtitle.regular,
          fontSize: typography.fontSizes.sm, // 14
          lineHeight: 20,
          color: colors.textSecondary,
        };
      case 'caption':
        return {
          fontFamily: Fonts.subtitle.regular,
          fontSize: typography.fontSizes.xs, // 12
          lineHeight: 16,
          color: colors.textMuted,
        };
      case 'button':
        return {
          fontFamily: Fonts.title.bold,
          fontSize: typography.fontSizes.sm, // 14
          letterSpacing: typography.letterSpacing.wide,
          color: colors.buttonPrimaryText,
        };
      case 'link':
        return {
          fontFamily: Fonts.subtitle.semibold,
          fontSize: typography.fontSizes.sm, // 14
          color: colors.primary,
        };
      default:
        return {};
    }
  };

  const computedStyle: TextStyle = {
    ...getVariantStyles(),
    ...(color ? { color } : {}),
    ...(align ? { textAlign: align } : {}),
  };

  return (
    <RNText style={[computedStyle, ...(Array.isArray(style) ? style : style ? [style] : [])]} {...rest}>
      {children}
    </RNText>
  );
};
