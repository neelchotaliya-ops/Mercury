import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { BorderRadius } from '@/constants/theme';

export interface StatCardProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  animateIndex?: number;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, tint, animateIndex }) => (
  <GlassCard style={styles.card} padding={16} radius={BorderRadius.md} animateIndex={animateIndex}>
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <AppText variant="micro" numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
    </View>
    <AppText variant="h3" numberOfLines={1} adjustsFontSizeToFit style={styles.value}>
      {value}
    </AppText>
  </GlassCard>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    height: 100,
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
  value: {
    marginTop: 2,
  },
});
