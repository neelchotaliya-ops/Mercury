import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { haptics } from '@/utils/haptics';
import { PressScale, Spring } from '@/constants/motion';
import { NumberFormat } from '@/types/finance';
import { formatRawNumber } from '@/utils/currency';

export interface AmountDisplayProps {
  value: string;
  currencySymbol: string;
  currencyCode?: string;
  numberFormat?: NumberFormat;
  accentColor?: string;
}

export const AmountDisplay: React.FC<AmountDisplayProps> = ({
  value,
  currencySymbol,
  currencyCode,
  numberFormat,
  accentColor,
}) => {
  const tint = accentColor ?? Colors.textPrimary;
  const isEmpty = value.length === 0;
  const formattedValue = formatRawNumber(value, numberFormat, currencyCode);

  return (
    <View style={styles.displayRow}>
      <AppText variant="h2" color={isEmpty ? Colors.textMuted : tint} style={styles.symbol}>
        {currencySymbol}
      </AppText>
      <AppText
        variant="display"
        color={isEmpty ? Colors.textMuted : tint}
        style={styles.amount}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formattedValue}
      </AppText>
    </View>
  );
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
type KeyValue = (typeof KEYS)[number];

const KeypadKey: React.FC<{ keyValue: KeyValue; onPress: () => void }> = ({ keyValue, onPress }) => {
  const scale = useSharedValue(1);
  const bg = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: `rgba(25, 21, 39, ${bg.value * 0.08})`,
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(PressScale.control, Spring.press);
        bg.value = withSpring(1, { damping: 18, stiffness: 260 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Spring.settle);
        bg.value = withSpring(0, { damping: 18, stiffness: 200 });
      }}
      style={styles.keySlot}
    >
      <Animated.View style={[styles.key, animatedStyle]}>
        {keyValue === 'back' ? (
          <Ionicons name="backspace-outline" size={20} color={Colors.textPrimary} />
        ) : (
          <AppText variant="h3" style={styles.keyLabel}>
            {keyValue}
          </AppText>
        )}
      </Animated.View>
    </Pressable>
  );
};

export interface NumpadProps {
  value: string;
  onChangeValue: (value: string) => void;
}

export const Numpad: React.FC<NumpadProps> = ({ value, onChangeValue }) => {
  const handleKey = (key: KeyValue) => {
    haptics.selection();

    if (key === 'back') {
      onChangeValue(value.length > 0 ? value.slice(0, -1) : value);
      return;
    }
    if (key === '.') {
      if (value.includes('.')) return;
      onChangeValue(value.length === 0 ? '0.' : `${value}.`);
      return;
    }

    const [, decimals] = value.split('.');
    if (decimals && decimals.length >= 2) return;
    if (value === '0') {
      onChangeValue(key);
      return;
    }
    onChangeValue(`${value}${key}`);
  };

  return (
    <View style={styles.keypad}>
      {KEYS.map(key => (
        <KeypadKey key={key} keyValue={key} onPress={() => handleKey(key)} />
      ))}
    </View>
  );
};

export interface AmountInputProps extends AmountDisplayProps, NumpadProps {}

export const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChangeValue,
  currencySymbol,
  currencyCode,
  numberFormat,
  accentColor,
}) => {
  return (
    <View style={styles.container}>
      <AmountDisplay
        value={value}
        currencySymbol={currencySymbol}
        currencyCode={currencyCode}
        numberFormat={numberFormat}
        accentColor={accentColor}
      />
      <Numpad value={value} onChangeValue={onChangeValue} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  symbol: {
    fontSize: 26,
    fontFamily: 'Manrope_700Bold',
  },
  amount: {
    fontSize: 44,
    lineHeight: 50,
    fontFamily: 'Manrope_800ExtraBold',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 4,
  },
  keySlot: {
    width: '33.333%',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  key: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 22,
    fontFamily: 'Manrope_700Bold',
    color: Colors.textPrimary,
  },
});
