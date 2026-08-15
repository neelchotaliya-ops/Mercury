import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { useAppTheme } from '@/context/theme-context';

export interface StatCardProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  animateIndex?: number;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, tint, animateIndex }) => {
  const { colors } = useAppTheme();

  return (
    <GlassCard style={styles.card} animateIndex={animateIndex}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="h3" style={{ color: colors.textPrimary }}>
        {value}
      </AppText>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
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
