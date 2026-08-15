import React from 'react';
import { Pressable, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/context/theme-context';
import { AppText } from './app-text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle;
  enableHaptics?: boolean;
}

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  textStyle,
  enableHaptics = true,
}) => {
  const { colors, borderRadius, spacing, shadows } = useAppTheme();

  const handlePress = () => {
    if (disabled || loading) return;
    if (enableHaptics) {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        // Ignore fallback
      }
    }
    onPress();
  };

  const getContainerStyle = (pressed: boolean): ViewStyle => {
    let base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: borderRadius.pill,
      opacity: pressed ? 0.90 : disabled ? 0.5 : 1,
      transform: [{ scale: pressed ? 0.98 : 1 }],
    };

    if (fullWidth) {
      base.width = '100%';
    }

    // Size styling
    switch (size) {
      case 'sm':
        base.paddingVertical = spacing.sm;
        base.paddingHorizontal = spacing.md;
        break;
      case 'md':
        base.paddingVertical = spacing.md;
        base.paddingHorizontal = spacing.xl;
        break;
      case 'lg':
      default:
        base.paddingVertical = 18;
        base.paddingHorizontal = spacing['2xl'];
        break;
    }

    // Variant styling
    switch (variant) {
      case 'primary':
        base.backgroundColor = '#000000';
        Object.assign(base, shadows.button);
        break;
      case 'secondary':
        base.backgroundColor = colors.buttonSecondaryBg;
        break;
      case 'ghost':
        base.backgroundColor = 'transparent';
        base.borderWidth = 1;
        base.borderColor = colors.border;
        break;
      case 'text':
        base.backgroundColor = 'transparent';
        base.paddingVertical = spacing.xs;
        base.paddingHorizontal = spacing.xs;
        break;
    }

    return base;
  };

  const getTextColor = (): string => {
    switch (variant) {
      case 'primary':
        return '#FFFFFF';
      case 'secondary':
        return colors.buttonSecondaryText;
      case 'ghost':
        return colors.textPrimary;
      case 'text':
        return colors.textSecondary;
      default:
        return '#FFFFFF';
    }
  };

  const computedTextStyle: TextStyle[] = [
    {
      textTransform: variant === 'primary' ? 'uppercase' : 'none',
      letterSpacing: variant === 'primary' ? 1.5 : 0,
      fontSize: 14,
      fontWeight: '700',
    },
    ...(textStyle ? [textStyle] : []),
  ];

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        getContainerStyle(pressed),
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <AppText variant="button" color={getTextColor()} style={computedTextStyle}>
          {title}
        </AppText>
      )}
    </Pressable>
  );
};
