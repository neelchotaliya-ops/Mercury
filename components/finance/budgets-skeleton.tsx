import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BorderRadius, Colors } from '@/constants/theme';

export const BudgetsSkeleton: React.FC = () => {
  return (
    <>
      {/* Summary Card */}
      <GlassCard strong style={styles.summary} elevated animate={false}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryText}>
            <AppText variant="label">Total budgeted</AppText>
            <Skeleton width={140} height={28} radius={6} style={{ marginVertical: 4 }} />
            <Skeleton width={100} height={13} radius={3} />
          </View>
          <View style={styles.summaryPill}>
            <Skeleton width={38} height={24} radius={4} />
          </View>
        </View>
        <Skeleton width="100%" height={10} radius={BorderRadius.pill} />
      </GlassCard>

      {/* Budget Item Cards List */}
      <View style={styles.list}>
        {/* Item 1 */}
        <GlassCard style={styles.itemCard} animate={false}>
          <View style={styles.itemHeader}>
            <Skeleton width={40} height={40} radius={BorderRadius.pill} />
            <View style={styles.itemTitleCol}>
              <Skeleton width="55%" height={15} radius={4} />
              <Skeleton width="35%" height={12} radius={3} />
            </View>
            <View style={styles.percentPill}>
              <Skeleton width={26} height={12} radius={3} />
            </View>
          </View>
          <Skeleton width="100%" height={6} radius={BorderRadius.pill} />
          <Skeleton width="40%" height={12} radius={3} />
        </GlassCard>

        {/* Item 2 */}
        <GlassCard style={styles.itemCard} animate={false}>
          <View style={styles.itemHeader}>
            <Skeleton width={40} height={40} radius={BorderRadius.pill} />
            <View style={styles.itemTitleCol}>
              <Skeleton width="45%" height={15} radius={4} />
              <Skeleton width="30%" height={12} radius={3} />
            </View>
            <View style={styles.percentPill}>
              <Skeleton width={26} height={12} radius={3} />
            </View>
          </View>
          <Skeleton width="100%" height={6} radius={BorderRadius.pill} />
          <Skeleton width="35%" height={12} radius={3} />
        </GlassCard>

        {/* Item 3 */}
        <GlassCard style={styles.itemCard} animate={false}>
          <View style={styles.itemHeader}>
            <Skeleton width={40} height={40} radius={BorderRadius.pill} />
            <View style={styles.itemTitleCol}>
              <Skeleton width="60%" height={15} radius={4} />
              <Skeleton width="40%" height={12} radius={3} />
            </View>
            <View style={styles.percentPill}>
              <Skeleton width={26} height={12} radius={3} />
            </View>
          </View>
          <Skeleton width="100%" height={6} radius={BorderRadius.pill} />
          <Skeleton width="45%" height={12} radius={3} />
        </GlassCard>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  summary: {
    gap: 16,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryText: {
    gap: 3,
    flex: 1,
  },
  summaryPill: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  list: {
    gap: 12,
  },
  itemCard: {
    gap: 14,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemTitleCol: {
    flex: 1,
    gap: 3,
  },
  percentPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
});
