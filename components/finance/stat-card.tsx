import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/context/theme-context';

export interface StatCardProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, tint }) => {
  const { colors, borderRadius, spacing } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
          borderRadius: borderRadius.md,
          padding: spacing.lg,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="h3" style={{ color: colors.textPrimary }}>
        {value}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: {
    marginBottom: 4,
  },
});
