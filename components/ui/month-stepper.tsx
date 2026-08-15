import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/app-text';
import { Colors, BorderRadius } from '@/constants/theme';
import { monthKeyLabel, shiftMonthKey } from '@/utils/date';

export interface MonthStepperProps {
  monthKey: string;
  onChange: (monthKey: string) => void;
}

export const MonthStepper: React.FC<MonthStepperProps> = ({ monthKey, onChange }) => {
  const step = (delta: number) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    onChange(shiftMonthKey(monthKey, delta));
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.arrow}>
        <Ionicons name="chevron-back" size={17} color={Colors.textSecondary} />
      </Pressable>
      <AppText variant="bodyStrong">{monthKeyLabel(monthKey)}</AppText>
      <Pressable onPress={() => step(1)} hitSlop={10} style={styles.arrow}>
        <Ionicons name="chevron-forward" size={17} color={Colors.textSecondary} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  arrow: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
