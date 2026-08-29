import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Home previously had no loading placeholder at all, unlike its three
 * sibling tabs (Activity/Budgets/Insights), which all use useScreenReady +
 * a matching skeleton — this closes that gap with the same pattern: defer
 * mounting the heavy hero-blob/orbit-badge animation and the rest of the
 * scroll content until transitions have settled.
 */
export const HomeSkeleton: React.FC = () => (
  <>
    <GlassCard strong elevated style={styles.hero} animate={false}>
      <Skeleton width={110} height={13} radius={3} />
      <Skeleton width={180} height={38} radius={8} style={styles.heroValue} />
      <Skeleton width={130} height={13} radius={3} style={styles.heroSub} />
    </GlassCard>

    <View style={styles.statsRow}>
      <GlassCard style={styles.statCard} animate={false}>
        <Skeleton width={50} height={12} radius={3} />
        <Skeleton width={80} height={18} radius={4} style={styles.statValue} />
      </GlassCard>
      <GlassCard style={styles.statCard} animate={false}>
        <Skeleton width={50} height={12} radius={3} />
        <Skeleton width={80} height={18} radius={4} style={styles.statValue} />
      </GlassCard>
    </View>

    <View style={styles.section}>
      <Skeleton width={70} height={11} radius={3} style={styles.sectionLabel} />
      <View style={styles.accountsRow}>
        {[0, 1, 2].map(i => (
          <GlassCard key={i} style={styles.accountChip} padding={16} animate={false}>
            <Skeleton width={28} height={28} radius={10} />
            <Skeleton width={70} height={18} radius={4} style={styles.accountValue} />
          </GlassCard>
        ))}
      </View>
    </View>

    <View style={styles.section}>
      <Skeleton width={100} height={11} radius={3} style={styles.sectionLabel} />
      <GlassCard style={styles.listCard} padding={18} animate={false}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[styles.row, i < 2 && styles.rowDivider]}>
            <Skeleton width={40} height={40} radius={20} />
            <View style={styles.rowText}>
              <Skeleton width="60%" height={14} radius={4} />
              <Skeleton width="35%" height={11} radius={3} style={styles.rowSubline} />
            </View>
            <Skeleton width={60} height={14} radius={4} />
          </View>
        ))}
      </GlassCard>
    </View>
  </>
);

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  heroValue: {
    marginTop: 10,
  },
  heroSub: {
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
  },
  statValue: {
    marginTop: 6,
  },
  section: {
    marginTop: 18,
    gap: 8,
  },
  sectionLabel: {
    marginLeft: 2,
  },
  accountsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  accountChip: {
    width: 144,
    height: 94,
    justifyContent: 'center',
  },
  accountValue: {
    marginTop: 10,
  },
  listCard: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(25, 21, 39, 0.06)',
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
    gap: 6,
  },
  rowSubline: {
    marginTop: 0,
  },
});
