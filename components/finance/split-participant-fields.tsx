import React from 'react';
import { View, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { SplitForm } from '@/hooks/use-split-form';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius } from '@/constants/theme';

export interface SplitParticipantFieldsProps {
  form: SplitForm;
  currency: string;
}

/**
 * Add-a-person input, recent-friends quick-add, and the participant list
 * with directly editable share amounts — no equal/exact/percentage mode
 * switcher. Shared by `app/add-split.tsx` and
 * `components/finance/split-sheet.tsx` so there is exactly one
 * implementation of this UI.
 */
export const SplitParticipantFields: React.FC<SplitParticipantFieldsProps> = ({ form, currency }) => {
  const {
    participants,
    newParticipantName,
    setNewParticipantName,
    recentFriends,
    shares,
    sharesSum,
    isBalanced,
    numericTotal,
    addParticipant,
    removeParticipant,
    updateParticipantValue,
  } = form;

  return (
    <>
      <View style={styles.addRow}>
        <TextInput
          value={newParticipantName}
          onChangeText={setNewParticipantName}
          placeholder="Add person (e.g. Rahul, Priya)"
          placeholderTextColor={Colors.textMuted}
          onSubmitEditing={() => addParticipant()}
          returnKeyType="done"
          style={[styles.input, { flex: 1 }]}
        />
        <AppButton
          title="+ Add"
          size="sm"
          fullWidth={false}
          onPress={() => addParticipant()}
          disabled={!newParticipantName.trim()}
          style={styles.addBtn}
        />
      </View>

      {recentFriends.length > 0 && (
        <View style={styles.recentRow}>
          <AppText variant="micro" color={Colors.textMuted}>
            Quick add:
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
            {recentFriends
              .filter(f => !participants.some(p => p.name.toLowerCase() === f.toLowerCase()))
              .map(friend => (
                <Pressable key={friend} onPress={() => addParticipant(friend)} style={styles.recentChip}>
                  <Ionicons name="add-circle-outline" size={13} color={Colors.primary} />
                  <AppText variant="captionStrong" color={Colors.primaryDeep}>
                    {friend}
                  </AppText>
                </Pressable>
              ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.participantsList}>
        <AppText variant="label" style={styles.sectionTitle}>
          Participants ({participants.length})
        </AppText>

        {participants.map((p, idx) => {
          const share = shares[idx] ?? 0;
          return (
            <View key={p.id} style={styles.row}>
              <View style={[styles.avatar, p.isYou && styles.avatarYou]}>
                <Ionicons name={p.isYou ? 'person' : 'person-outline'} size={16} color={p.isYou ? Colors.primaryDeep : Colors.textSecondary} />
              </View>

              <View style={styles.rowInfo}>
                <AppText variant="bodyStrong">
                  {p.name} {p.isYou && <AppText variant="caption" color={Colors.primaryDeep}> (You)</AppText>}
                </AppText>
              </View>

              <TextInput
                value={p.value}
                onChangeText={v => updateParticipantValue(p.id, v)}
                placeholder={formatCurrency(share, currency)}
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.shareInput}
              />

              {!p.isYou && (
                <Pressable onPress={() => removeParticipant(p.id)} hitSlop={8} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {numericTotal > 0 && !isBalanced && (
        <View style={styles.balanceBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.expense} />
          <AppText variant="caption" color={Colors.expense} style={{ fontWeight: '600', flex: 1 }}>
            {sharesSum < numericTotal
              ? `${formatCurrency(numericTotal - sharesSum, currency)} left to assign`
              : `${formatCurrency(sharesSum - numericTotal, currency)} over the total`}
          </AppText>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentScroll: {
    gap: 6,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  participantsList: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(25, 21, 39, 0.02)',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.controlBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: {
    backgroundColor: Colors.primarySoft,
  },
  rowInfo: {
    flex: 1,
  },
  shareInput: {
    width: 88,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceOpaque,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'right',
    color: Colors.textPrimary,
  },
  removeBtn: {
    padding: 2,
  },
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
});
