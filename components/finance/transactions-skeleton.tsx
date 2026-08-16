import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BorderRadius, Spacing, Colors } from '@/constants/theme';

export const TransactionsSkeleton: React.FC = () => {
  return (
    <>
      {/* Day Group 1 */}
      <View style={styles.group}>
        <AppText variant="label" style={styles.dayLabel}>
          Today
        </AppText>
        <GlassCard style={styles.groupCard} padding={18} animate={false}>
          {/* Row 1 */}
          <View style={styles.row}>
            <Skeleton width={42} height={42} radius={BorderRadius.pill} />
            <View style={styles.textCol}>
              <Skeleton width="55%" height={15} radius={4} />
              <Skeleton width="35%" height={12} radius={3} style={{ marginTop: 4 }} />
            </View>
            <Skeleton width={65} height={16} radius={4} />
          </View>

          <View style={styles.divider} />

          {/* Row 2 */}
          <View style={styles.row}>
            <Skeleton width={42} height={42} radius={BorderRadius.pill} />
            <View style={styles.textCol}>
              <Skeleton width="65%" height={15} radius={4} />
              <Skeleton width="40%" height={12} radius={3} style={{ marginTop: 4 }} />
            </View>
            <Skeleton width={80} height={16} radius={4} />
          </View>
        </GlassCard>
      </View>

      {/* Day Group 2 */}
      <View style={styles.group}>
        <AppText variant="label" style={styles.dayLabel}>
          Yesterday
        </AppText>
        <GlassCard style={styles.groupCard} padding={18} animate={false}>
          {/* Row 1 */}
          <View style={styles.row}>
            <Skeleton width={42} height={42} radius={BorderRadius.pill} />
            <View style={styles.textCol}>
              <Skeleton width="50%" height={15} radius={4} />
              <Skeleton width="30%" height={12} radius={3} style={{ marginTop: 4 }} />
            </View>
            <Skeleton width={55} height={16} radius={4} />
          </View>

          <View style={styles.divider} />

          {/* Row 2 */}
          <View style={styles.row}>
            <Skeleton width={42} height={42} radius={BorderRadius.pill} />
            <View style={styles.textCol}>
              <Skeleton width="70%" height={15} radius={4} />
              <Skeleton width="45%" height={12} radius={3} style={{ marginTop: 4 }} />
            </View>
            <Skeleton width={90} height={16} radius={4} />
          </View>
        </GlassCard>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  group: {
    marginBottom: Spacing.lg,
    gap: 9,
  },
  dayLabel: {
    marginLeft: 4,
  },
  groupCard: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 13,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
});
