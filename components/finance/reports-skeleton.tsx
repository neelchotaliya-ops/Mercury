import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BorderRadius, Spacing } from '@/constants/theme';

export const ReportsSkeleton: React.FC = () => {
  return (
    <View style={styles.sections}>
      {/* 1. Hero Summary GlassCard */}
      <View style={styles.section}>
        <GlassCard strong elevated style={styles.heroCard} animate={false}>
          <Skeleton width={80} height={12} radius={4} />
          <Skeleton width={190} height={38} radius={8} style={{ marginVertical: 6 }} />
          <Skeleton width={140} height={12} radius={4} />

          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Skeleton width={75} height={11} radius={3} />
              <Skeleton width={60} height={16} radius={4} style={{ marginTop: 4 }} />
            </View>
            <View style={styles.stat}>
              <Skeleton width={45} height={11} radius={3} />
              <Skeleton width={35} height={16} radius={4} style={{ marginTop: 4 }} />
            </View>
            <View style={styles.stat}>
              <Skeleton width={50} height={11} radius={3} />
              <Skeleton width={65} height={16} radius={4} style={{ marginTop: 4 }} />
            </View>
          </View>
        </GlassCard>
      </View>

      {/* 2. Trend by month */}
      <View style={styles.section}>
        <AppText variant="label" style={styles.sectionLabel}>
          Trend by month
        </AppText>
        <GlassCard style={styles.chartCard} animate={false}>
          <View style={styles.trendHeader}>
            <Skeleton width={110} height={13} radius={3} />
            <Skeleton width={70} height={13} radius={3} />
          </View>
          <Skeleton width="100%" height={150} radius={BorderRadius.md} style={{ marginTop: 12 }} />
        </GlassCard>
      </View>

      {/* 3. By category */}
      <View style={styles.section}>
        <AppText variant="label" style={styles.sectionLabel}>
          By category
        </AppText>
        <GlassCard style={styles.chartCard} animate={false}>
          <View style={styles.donutRow}>
            <Skeleton width={130} height={130} radius={65} />
            <View style={styles.donutLegend}>
              <View style={styles.legendItem}>
                <Skeleton width={12} height={12} radius={3} />
                <Skeleton width="75%" height={14} radius={3} />
              </View>
              <View style={styles.legendItem}>
                <Skeleton width={12} height={12} radius={3} />
                <Skeleton width="60%" height={14} radius={3} />
              </View>
              <View style={styles.legendItem}>
                <Skeleton width={12} height={12} radius={3} />
                <Skeleton width="80%" height={14} radius={3} />
              </View>
              <View style={styles.legendItem}>
                <Skeleton width={12} height={12} radius={3} />
                <Skeleton width="50%" height={14} radius={3} />
              </View>
            </View>
          </View>
        </GlassCard>
      </View>

      {/* 4. Daily activity */}
      <View style={styles.section}>
        <AppText variant="label" style={styles.sectionLabel}>
          Daily activity
        </AppText>
        <GlassCard style={styles.chartCard} animate={false}>
          <Skeleton width="100%" height={110} radius={BorderRadius.md} />
        </GlassCard>
      </View>

      {/* 5. Busiest days */}
      <View style={styles.section}>
        <AppText variant="label" style={styles.sectionLabel}>
          Busiest days
        </AppText>
        <GlassCard style={styles.chartCard} animate={false}>
          <View style={styles.barsRow}>
            {Array.from({ length: 7 }).map((_, i) => (
              <View key={i} style={styles.barCol}>
                <Skeleton width={24} height={40 + (i % 3) * 25} radius={BorderRadius.xs} />
                <Skeleton width={18} height={10} radius={2} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
        </GlassCard>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sections: {
    gap: Spacing.xl,
  },
  section: {
    paddingHorizontal: 20,
    gap: 10,
  },
  sectionLabel: {
    marginLeft: 4,
  },
  heroCard: {
    gap: 4,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  statRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  chartCard: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    gap: 16,
  },
  donutLegend: {
    flex: 1,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 10,
  },
  barCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
