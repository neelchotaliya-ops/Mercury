import React, { forwardRef } from 'react';
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { Colors, BorderRadius, ControlHeights } from '@/constants/theme';

export type InputSize = 'sm' | 'md' | 'lg';

export interface AppTextInputProps extends Omit<TextInputProps, 'style'> {
  size?: InputSize;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onPressRightIcon?: () => void;
  prefix?: string;
  suffix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
  error?: boolean;
}

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  (
    {
      size = 'lg',
      leftIcon,
      rightIcon,
      onPressRightIcon,
      prefix,
      suffix,
      containerStyle,
      style,
      error = false,
      placeholderTextColor = Colors.textMuted,
      ...rest
    },
    ref
  ) => {
    const height = ControlHeights[size];
    const fontSize = size === 'lg' ? 15 : size === 'md' ? 14 : 13;

    return (
      <View
        style={[
          styles.container,
          { height },
          error && styles.containerError,
          containerStyle,
        ]}
      >
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={fontSize + 3}
            color={Colors.textMuted}
            style={styles.leftIcon}
          />
        ) : null}

        {prefix ? (
          <AppText
            variant="bodyStrong"
            color={Colors.textMuted}
            style={styles.prefix}
          >
            {prefix}
          </AppText>
        ) : null}

        <TextInput
          ref={ref}
          placeholderTextColor={placeholderTextColor}
          style={[
            styles.input,
            { fontSize },
            style,
          ]}
          {...rest}
        />

        {suffix ? (
          <AppText
            variant="caption"
            color={Colors.textMuted}
            style={styles.suffix}
          >
            {suffix}
          </AppText>
        ) : null}

        {rightIcon ? (
          <Pressable
            onPress={onPressRightIcon}
            disabled={!onPressRightIcon}
            hitSlop={8}
            style={styles.rightIconPressable}
          >
            <Ionicons
              name={rightIcon}
              size={fontSize + 3}
              color={Colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    );
  }
);

AppTextInput.displayName = 'AppTextInput';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
  },
  containerError: {
    borderWidth: 1,
    borderColor: Colors.expense,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIconPressable: {
    marginLeft: 8,
    padding: 2,
  },
  prefix: {
    marginRight: 8,
  },
  suffix: {
    marginLeft: 8,
  },
});
