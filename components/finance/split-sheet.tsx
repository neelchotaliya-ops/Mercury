import React from 'react';
import { View, StyleSheet, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GlassCard } from '@/components/ui/glass-card';
import { SplitParticipantFields } from '@/components/finance/split-participant-fields';
import { useSplitForm, SplitParticipantEntry } from '@/hooks/use-split-form';
import { formatCurrency } from '@/utils/currency';
import { Colors, Spacing, Shadows } from '@/constants/theme';

export type SplitParticipantDraft = SplitParticipantEntry;

export interface SplitSheetResult {
  participants: (SplitParticipantDraft & { share: number })[];
}

interface SplitSheetProps {
  visible: boolean;
  onClose: () => void;
  totalAmount: number;
  currency: string;
  initialParticipants?: SplitParticipantDraft[];
  onApply: (result: SplitSheetResult) => void;
}

export const SplitSheet: React.FC<SplitSheetProps> = ({
  visible,
  onClose,
  totalAmount,
  currency,
  initialParticipants,
  onApply,
}) => {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, keyboardVisible } = useKeyboardBottomInset();

  // Same shared hook add-split.tsx uses. `fixedTotal` means this instance
  // never owns its own amount field — the transaction's own amount is the
  // bill total.
  const splitForm = useSplitForm({ fixedTotal: totalAmount, initialParticipants });
  const { participants, shares, canSubmit, reset, setParticipants } = splitForm;

  // Re-sync to the last-applied (or default) state whenever the sheet
  // opens, so edits abandoned by dismissing without "Apply" don't linger.
  React.useEffect(() => {
    if (!visible) return;
    if (initialParticipants && initialParticipants.length >= 1) {
      setParticipants(initialParticipants);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const youShare = shares[0] ?? 0;
  const totalOwed = shares.slice(1).reduce((a, b) => a + b, 0);

  const handleApply = () => {
    if (!canSubmit) return;
    const result: SplitSheetResult = {
      participants: participants.map((p, i) => ({ ...p, share: shares[i] ?? 0 })),
    };
    onApply(result);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingBottom: keyboardHeight > 0 ? keyboardHeight : (insets.bottom > 0 ? insets.bottom : 0) }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheetContainer, { maxHeight: keyboardVisible ? '80%' : '90%' }]}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.dragHandle} />
              <View style={styles.headerRow}>
                <View>
                  <AppText variant="h3">Split Bill</AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {totalAmount > 0
                      ? `Total: ${formatCurrency(totalAmount, currency)}`
                      : 'Enter total amount first'}
                  </AppText>
                </View>
                <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={[styles.body, { maxHeight: keyboardVisible ? 220 : 460 }]}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Owed Live Breakdown Card */}
              {totalAmount > 0 && participants.length > 1 && (
                <GlassCard padding={14} strong elevated style={styles.breakdownCard}>
                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownCol}>
                      <AppText variant="micro" color={Colors.textMuted}>Your share</AppText>
                      <AppText variant="h3" color={Colors.textPrimary}>
                        {formatCurrency(youShare, currency)}
                      </AppText>
                    </View>
                    <View style={styles.breakdownDivider} />
                    <View style={styles.breakdownCol}>
                      <AppText variant="micro" color={Colors.income}>You will be owed</AppText>
                      <AppText variant="h3" color={Colors.income}>
                        +{formatCurrency(totalOwed, currency)}
                      </AppText>
                    </View>
                  </View>
                </GlassCard>
              )}

              <SplitParticipantFields form={splitForm} currency={currency} />
            </ScrollView>

            {/* Footer Apply Button */}
            <View style={styles.footer}>
              <AppButton
                title={canSubmit ? `Split with ${participants.length} people` : 'Balance shares to continue'}
                size="md"
                onPress={handleApply}
                disabled={!canSubmit}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 10, 30, 0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    maxHeight: '90%',
  },
  sheet: {
    backgroundColor: Colors.surfaceOpaque,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    overflow: 'hidden',
    ...Shadows.lifted,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(25, 21, 39, 0.15)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
  },
  body: {
    maxHeight: 460,
  },
  bodyContent: {
    padding: 20,
    gap: Spacing.md,
  },
  breakdownCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  breakdownDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(25, 21, 39, 0.08)',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
});
