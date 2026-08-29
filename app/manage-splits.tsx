import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { GradientScreen } from '@/components/ui/gradient-screen';
import { ModalHeader } from '@/components/ui/modal-header';
import { IconButton } from '@/components/ui/icon-button';
import { SplitInsightsView } from '@/components/finance/split-insights';
import { SplitInsights, getSplitInsights } from '@/db/insights';
import { useDbQuery } from '@/hooks/use-db-query';
import { Spacing } from '@/constants/theme';

/**
 * The Manage hub's home for split expenses — the full unsettled-splits
 * list (SplitInsightsView, unchanged from when it lived directly in the
 * Insights tab) plus a header shortcut to start a new split. Insights
 * itself now shows only a compact summary card linking here.
 */
export default function ManageSplitsScreen() {
  const router = useRouter();
  const { data: insights } = useDbQuery<SplitInsights | null>(
    'manage-splits',
    db => getSplitInsights(db),
    null
  );

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title="Split Expenses"
        onClose={() => router.back()}
        rightAction={
          <IconButton
            iconName="add"
            onPress={() => router.push('/add-split' as any)}
            size={42}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SplitInsightsView insights={insights} />
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
  },
});
