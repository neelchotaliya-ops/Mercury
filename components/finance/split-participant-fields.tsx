import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
import { SplitForm } from '@/hooks/use-split-form';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { Colors, BorderRadius, ControlHeights, Spacing } from '@/constants/theme';

export interface SplitParticipantFieldsProps {
  form: SplitForm;
  currency: string;
}

/**
 * SplitParticipantFields matches the Mercury glassmorphic & control theme.
 * Clean participant cards with cohesive avatars, inputs, and quick-add chips.
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
    removeRecentFriend,
    resetToEqual,
    updateParticipantValue,
  } = form;

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const currencySymbol = getCurrencySymbol(currency);
  const hasCustomShares = participants.some(p => p.value.trim() !== '');

  return (
    <View style={styles.container}>
      {/* Add person input bar */}
      <View style={styles.addRow}>
        <View style={{ flex: 1 }}>
          <AppTextInput
            size="md"
            leftIcon="person-add-outline"
            value={newParticipantName}
            onChangeText={setNewParticipantName}
            placeholder="Add person (e.g. Rahul, Priya)"
            onSubmitEditing={() => addParticipant()}
            returnKeyType="done"
          />
        </View>
        <AppButton
          title="+ Add"
          size="md"
          fullWidth={false}
          onPress={() => addParticipant()}
          disabled={!newParticipantName.trim()}
          style={styles.addBtn}
        />
      </View>

      {/* Quick Add pills */}
      {recentFriends.length > 0 && (
        <View style={styles.recentRow}>
          <AppText variant="micro" color={Colors.textMuted} style={styles.recentLabel}>
            QUICK ADD
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
            {recentFriends
              .filter(f => !participants.some(p => p.name.toLowerCase() === f.toLowerCase()))
              .map(friend => (
                <View key={friend} style={styles.recentChip}>
                  <Pressable
                    onPress={() => addParticipant(friend)}
                    style={styles.recentChipMain}
                  >
                    <Ionicons name="add-circle" size={14} color={Colors.primary} />
                    <AppText variant="captionStrong" color={Colors.primaryDeep}>
                      {friend}
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => removeRecentFriend(friend)}
                    hitSlop={8}
                    style={styles.recentChipRemove}
                  >
                    <Ionicons name="close" size={12} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
          </ScrollView>
        </View>
      )}

      {/* Participants Card List */}
      <View style={styles.participantsList}>
        <View style={styles.participantsHeader}>
          <AppText variant="micro" color={Colors.textMuted}>
            SPLIT BREAKDOWN ({participants.length})
          </AppText>
          {hasCustomShares && (
            <Pressable onPress={resetToEqual} hitSlop={8} style={styles.resetEqualBtn}>
              <Ionicons name="sync-outline" size={12} color={Colors.primary} />
              <AppText variant="captionStrong" color={Colors.primary}>
                Split equally
              </AppText>
            </Pressable>
          )}
        </View>

        {participants.map((p, idx) => {
          const share = shares[idx] ?? 0;
          const isCustom = p.value.trim() !== '';
          const isFocused = focusedId === p.id;
          const formattedShare = share > 0 ? (Number.isInteger(share) ? String(share) : share.toFixed(2)) : '0';
          const displayedValue = isFocused ? p.value : (isCustom ? p.value : formattedShare);

          return (
            <View key={p.id} style={[styles.participantCard, p.isYou && styles.participantCardYou]}>
              {/* Avatar */}
              <View style={[styles.avatar, p.isYou && styles.avatarYou]}>
                {p.isYou ? (
                  <Ionicons name="person" size={15} color={Colors.primaryDeep} />
                ) : (
                  <AppText variant="captionStrong" color={Colors.textSecondary}>
                    {p.name.charAt(0).toUpperCase()}
                  </AppText>
                )}
              </View>

              {/* Name & Share status */}
              <View style={styles.rowInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {p.name}
                  </AppText>
                  {p.isYou && (
                    <View style={styles.youBadge}>
                      <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
                        Payer
                      </AppText>
                    </View>
                  )}
                </View>
                <AppText variant="caption" color={isCustom ? Colors.primaryDeep : Colors.textMuted}>
                  {isCustom ? 'Custom amount' : 'Equal split'}
                </AppText>
              </View>

              {/* Share Amount Input Container */}
              <View
                style={[
                  styles.amountInputContainer,
                  isFocused && styles.amountInputContainerFocused,
                  isCustom && !isFocused && styles.amountInputContainerCustom,
                ]}
              >
                <AppText
                  variant="captionStrong"
                  color={isFocused || isCustom ? Colors.primaryDeep : Colors.textMuted}
                  style={styles.currencyPrefix}
                >
                  {currencySymbol}
                </AppText>
                <TextInput
                  value={displayedValue}
                  onChangeText={v => updateParticipantValue(p.id, v)}
                  placeholder={formattedShare}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  onFocus={() => {
                    setFocusedId(p.id);
                    if (p.value === '') {
                      updateParticipantValue(p.id, formattedShare);
                    }
                  }}
                  onBlur={() => setFocusedId(null)}
                  style={[
                    styles.amountInput,
                    (isCustom || isFocused) && styles.amountInputActive,
                  ]}
                />
              </View>

              {/* Remove button */}
              {!p.isYou && (
                <Pressable onPress={() => removeParticipant(p.id)} hitSlop={8} style={styles.removeBtn}>
                  <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {/* Balance alert banner */}
      {numericTotal > 0 && !isBalanced && (
        <View style={styles.balanceBanner}>
          <Ionicons name="alert-circle" size={18} color={Colors.expense} />
          <View style={styles.balanceTextCol}>
            <AppText variant="captionStrong" color={Colors.expense}>
              {sharesSum < numericTotal
                ? `${formatCurrency(numericTotal - sharesSum, currency)} unassigned`
                : `${formatCurrency(sharesSum - numericTotal, currency)} over total`}
            </AppText>
            <AppText variant="micro" color={Colors.textMuted}>
              Total must equal {formatCurrency(numericTotal, currency)}
            </AppText>
          </View>
          <Pressable onPress={resetToEqual} style={styles.balanceResetBtn}>
            <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
              Reset Equal
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    minWidth: 70,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentLabel: {
    fontSize: 12,
  },
  recentScroll: {
    gap: 6,
    paddingRight: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    overflow: 'hidden',
  },
  recentChipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 5,
  },
  recentChipRemove: {
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 5,
  },
  participantsList: {
    gap: 8,
    marginTop: 4,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  resetEqualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  participantCardYou: {
    backgroundColor: 'rgba(139, 92, 246, 0.04)',
    borderColor: 'rgba(139, 92, 246, 0.18)',
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: {
    backgroundColor: Colors.primarySoft,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 104,
    height: ControlHeights.sm,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceOpaque,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  amountInputContainerCustom: {
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  amountInputContainerFocused: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  currencyPrefix: {
    fontSize: 12,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.textPrimary,
    textAlign: 'right',
    paddingVertical: 0,
  },
  amountInputActive: {
    color: Colors.primaryDeep,
    fontFamily: 'Manrope_700Bold',
  },
  removeBtn: {
    padding: 4,
  },
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.2)',
    marginTop: 4,
  },
  balanceTextCol: {
    flex: 1,
    gap: 2,
  },
  balanceResetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
});




