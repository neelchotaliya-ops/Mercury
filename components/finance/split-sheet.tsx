import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GlassCard } from '@/components/ui/glass-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { calculateSplitShares, SplitMethod } from '@/utils/bank-statement';
import { formatCurrency } from '@/utils/currency';
import { generateId } from '@/utils/id';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';

const STORAGE_KEY_FRIENDS = '@mercury/recent_split_friends';

export interface SplitParticipantDraft {
  id: string;
  name: string;
  isYou: boolean;
  value: string; // custom amount or % string
  share?: number;
}

export interface SplitSheetResult {
  participants: (SplitParticipantDraft & { share: number })[];
  method: SplitMethod;
}

interface SplitSheetProps {
  visible: boolean;
  onClose: () => void;
  totalAmount: number;
  currency: string;
  initialParticipants?: SplitParticipantDraft[];
  initialMethod?: SplitMethod;
  onApply: (result: SplitSheetResult) => void;
}

export const SplitSheet: React.FC<SplitSheetProps> = ({
  visible,
  onClose,
  totalAmount,
  currency,
  initialParticipants,
  initialMethod = 'equal',
  onApply,
}) => {
  const [method, setMethod] = useState<SplitMethod>(initialMethod);
  const [participants, setParticipants] = useState<SplitParticipantDraft[]>(
    initialParticipants && initialParticipants.length >= 2
      ? initialParticipants
      : [
          { id: 'you', name: 'You', isYou: true, value: '' },
          { id: 'p1', name: 'Friend 1', isYou: false, value: '' },
        ]
  );
  const [newName, setNewName] = useState('');
  const [recentFriends, setRecentFriends] = useState<string[]>([]);

  // Load recent friends
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_FRIENDS).then(val => {
      if (val) {
        try {
          setRecentFriends(JSON.parse(val));
        } catch {}
      }
    });
  }, []);

  // Sync if initialParticipants changes
  useEffect(() => {
    if (initialParticipants && initialParticipants.length >= 2) {
      setParticipants(initialParticipants);
    }
  }, [initialParticipants]);

  const insets = useSafeAreaInsets();
  const { keyboardHeight, keyboardVisible } = useKeyboardBottomInset();

  const shares = useMemo<number[]>(() => {
    if (totalAmount <= 0 || participants.length === 0) {
      return participants.map(() => 0);
    }
    try {
      if (method === 'equal') {
        return calculateSplitShares(totalAmount, 'equal', participants.length);
      }
      if (method === 'percentage') {
        const rawValues = participants.map(p => parseFloat(p.value || '0'));
        return calculateSplitShares(totalAmount, 'percentage', participants.length, rawValues);
      }
      if (method === 'custom') {
        const rawValues = participants.map(p => parseFloat(p.value || '0'));
        return calculateSplitShares(totalAmount, 'custom', participants.length, rawValues);
      }
    } catch {
      return participants.map(() => 0);
    }
    return participants.map(() => 0);
  }, [totalAmount, method, participants]);

  const sharesSum = useMemo(() => shares.reduce((a, b) => a + b, 0), [shares]);
  const isBalanced = Math.abs(sharesSum - totalAmount) < 0.05;
  const canApply = totalAmount > 0 && participants.length >= 2 && (method === 'equal' || isBalanced);

  const youShare = shares[0] ?? 0;
  const totalOwed = shares.slice(1).reduce((a, b) => a + b, 0);

  const addPerson = (nameToAdd?: string) => {
    const name = (nameToAdd || newName).trim();
    if (!name) return;

    // Check if name already in list
    if (participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      setNewName('');
      return;
    }

    haptics.press();
    setParticipants(prev => [
      ...prev,
      { id: generateId(), name, isYou: false, value: '' },
    ]);
    setNewName('');

    // Update recent friends
    const updated = [name, ...recentFriends.filter(f => f.toLowerCase() !== name.toLowerCase())].slice(0, 8);
    setRecentFriends(updated);
    AsyncStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(updated)).catch(() => {});
  };

  const removePerson = (id: string) => {
    if (participants.length <= 2) {
      Alert.alert('Minimum 2 People', 'A split bill needs at least 2 people.');
      return;
    }
    haptics.press();
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const updateValue = (id: string, val: string) => {
    setParticipants(prev =>
      prev.map(p => (p.id === id ? { ...p, value: val } : p))
    );
  };

  const handleApply = () => {
    if (!canApply) return;
    haptics.success();
    const result: SplitSheetResult = {
      method,
      participants: participants.map((p, i) => ({
        ...p,
        share: shares[i] ?? 0,
      })),
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
              {/* Method Switcher */}
              <SegmentedControl<SplitMethod>
                options={[
                  { key: 'equal', label: '= Equally' },
                  { key: 'custom', label: 'Exact Shares' },
                  { key: 'percentage', label: '% Percentage' },
                ]}
                value={method}
                onChange={m => {
                  setMethod(m);
                  setParticipants(prev => prev.map(p => ({ ...p, value: '' })));
                }}
              />

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

              {/* Add Person Input & Quick Recent Chips */}
              <View style={styles.addSection}>
                <View style={styles.inputRow}>
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Add person name (e.g. Alex, Maya)"
                    placeholderTextColor={Colors.textMuted}
                    onSubmitEditing={() => addPerson()}
                    returnKeyType="done"
                    style={styles.personInput}
                  />
                  <Pressable
                    onPress={() => addPerson()}
                    disabled={!newName.trim()}
                    style={[styles.addBtn, !newName.trim() && { opacity: 0.5 }]}
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>

                {/* Recent Friends suggestions */}
                {recentFriends.length > 0 && (
                  <View style={styles.recentRow}>
                    <AppText variant="micro" color={Colors.textMuted} style={styles.recentLabel}>
                      Quick add:
                    </AppText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
                      {recentFriends
                        .filter(f => !participants.some(p => p.name.toLowerCase() === f.toLowerCase()))
                        .map(friend => (
                          <Pressable
                            key={friend}
                            onPress={() => addPerson(friend)}
                            style={styles.recentChip}
                          >
                            <Ionicons name="add-circle-outline" size={14} color={Colors.primary} />
                            <AppText variant="captionStrong" color={Colors.primaryDeep}>
                              {friend}
                            </AppText>
                          </Pressable>
                        ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Participants List */}
              <View style={styles.participantsList}>
                <AppText variant="label" style={styles.sectionTitle}>
                  Participants ({participants.length})
                </AppText>

                {participants.map((p, idx) => {
                  const share = shares[idx] ?? 0;
                  return (
                    <View key={p.id} style={styles.personRow}>
                      <View style={[styles.avatar, p.isYou && styles.avatarYou]}>
                        <Ionicons
                          name={p.isYou ? 'person' : 'person-outline'}
                          size={16}
                          color={p.isYou ? Colors.primaryDeep : Colors.textSecondary}
                        />
                      </View>

                      <View style={styles.personInfo}>
                        <AppText variant="bodyStrong">
                          {p.name} {p.isYou && <AppText variant="caption" color={Colors.primaryDeep}> (You)</AppText>}
                        </AppText>
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {method === 'equal' ? '1 share' : p.value ? `${p.value}${method === 'percentage' ? '%' : ''}` : 'No share set'}
                        </AppText>
                      </View>

                      {method !== 'equal' && (
                        <TextInput
                          value={p.value}
                          onChangeText={v => updateValue(p.id, v)}
                          placeholder={method === 'percentage' ? '0%' : '0'}
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="numeric"
                          style={styles.customInput}
                        />
                      )}

                      <View style={styles.shareCol}>
                        <AppText variant="bodyStrong" align="right" color={p.isYou ? Colors.textPrimary : Colors.income}>
                          {formatCurrency(share, currency)}
                        </AppText>
                      </View>

                      {!p.isYou && (
                        <Pressable
                          onPress={() => removePerson(p.id)}
                          hitSlop={8}
                          style={styles.removeBtn}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.expense} />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Validation Warning if Custom/% not balanced */}
              {method !== 'equal' && totalAmount > 0 && (
                <View
                  style={[
                    styles.validationBox,
                    isBalanced ? styles.validationBoxOk : styles.validationBoxWarn,
                  ]}
                >
                  <Ionicons
                    name={isBalanced ? 'checkmark-circle' : 'alert-circle'}
                    size={16}
                    color={isBalanced ? Colors.income : Colors.expense}
                  />
                  <AppText
                    variant="caption"
                    color={isBalanced ? Colors.income : Colors.expense}
                    style={{ fontWeight: '600', flex: 1 }}
                  >
                    {isBalanced
                      ? 'Total shares equal 100% of the bill.'
                      : `Total assigned: ${formatCurrency(sharesSum, currency)} of ${formatCurrency(totalAmount, currency)}`}
                  </AppText>
                </View>
              )}
            </ScrollView>

            {/* Footer Apply Button */}
            <View style={styles.footer}>
              <AppButton
                title={canApply ? `Split with ${participants.length} people` : 'Balance shares to continue'}
                size="md"
                onPress={handleApply}
                disabled={!canApply}
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
  addSection: {
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  personInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentLabel: {
    fontSize: 11,
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
  personRow: {
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
  personInfo: {
    flex: 1,
    gap: 1,
  },
  customInput: {
    width: 64,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceOpaque,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
    color: Colors.textPrimary,
  },
  shareCol: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  removeBtn: {
    padding: 4,
  },
  validationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: BorderRadius.sm,
  },
  validationBoxOk: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  validationBoxWarn: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
});
