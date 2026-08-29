import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { RecurringFrequency, IntervalUnit } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { describeFrequency } from '@/utils/recurring-engine';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';

export interface RepeatSheetConfig {
  frequency: RecurringFrequency;
  intervalUnit?: IntervalUnit;
  intervalValue?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  autoCreate: boolean;
  reminderDays: number;
}

interface RepeatSheetProps {
  visible: boolean;
  onClose: () => void;
  amount: number;
  currency: string;
  /** The transaction's own date — also the day this repeats on, so there's
   * no separate day-of-week/day-of-month question to ask. */
  date: Date;
  initialConfig?: RepeatSheetConfig;
  onApply: (config: RepeatSheetConfig) => void;
}

const FREQUENCY_PRESETS: { key: RecurringFrequency; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { key: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
  { key: 'yearly', label: 'Yearly', icon: 'calendar-clear-outline' },
  { key: 'daily', label: 'Daily', icon: 'today-outline' },
];

export const RepeatSheet: React.FC<RepeatSheetProps> = ({
  visible,
  onClose,
  amount,
  currency,
  date,
  initialConfig,
  onApply,
}) => {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, keyboardVisible } = useKeyboardBottomInset();

  const [frequency, setFrequency] = useState<RecurringFrequency>(initialConfig?.frequency ?? 'monthly');
  const [autoCreate, setAutoCreate] = useState<boolean>(initialConfig?.autoCreate ?? true);
  const [reminderDays, setReminderDays] = useState<number>(initialConfig?.reminderDays ?? 1);

  const dayOfMonth = date.getDate();
  const dayOfWeek = date.getDay();

  const dummyRule: any = {
    frequency,
    dayOfMonth,
    dayOfWeek,
    startDate: date.toISOString(),
    intervalUnit: frequency === 'monthly' ? 'month' : frequency === 'weekly' ? 'week' : 'day',
    intervalValue: 1,
  };

  const scheduleDescription = describeFrequency(dummyRule);

  const handleApply = () => {
    haptics.success();
    onApply({
      frequency,
      intervalUnit: dummyRule.intervalUnit,
      intervalValue: 1,
      dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
      dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
      autoCreate,
      reminderDays,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { paddingBottom: keyboardHeight > 0 ? keyboardHeight : (insets.bottom > 0 ? insets.bottom : 0) }]}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { maxHeight: keyboardVisible ? '80%' : '90%' }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <View style={styles.headerRow}>
              <View>
                <AppText variant="h3">Recurring Payment</AppText>
                <AppText variant="caption" color={Colors.textSecondary}>
                  {amount > 0 ? `${formatCurrency(amount, currency)} ${scheduleDescription}` : 'Schedule automatic recurrence'}
                </AppText>
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={[styles.body, { maxHeight: keyboardVisible ? 240 : 460 }]}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Frequency Presets */}
            <View style={styles.section}>
              <AppText variant="label" style={styles.sectionTitle}>
                How Often
              </AppText>
              <View style={styles.freqRow}>
                {FREQUENCY_PRESETS.map(preset => {
                  const active = frequency === preset.key;
                  return (
                    <Pressable
                      key={preset.key}
                      onPress={() => {
                        haptics.selection();
                        setFrequency(preset.key);
                      }}
                      style={[styles.freqCard, active && styles.freqCardActive]}
                    >
                      <Ionicons
                        name={preset.icon}
                        size={20}
                        color={active ? '#FFFFFF' : Colors.primary}
                      />
                      <AppText
                        variant="caption"
                        color={active ? '#FFFFFF' : Colors.textPrimary}
                        style={{ fontWeight: active ? '700' : '600' }}
                      >
                        {preset.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Derived schedule caption — the transaction's own date is also
                the day it repeats on, so there's nothing further to pick. */}
            <AppText variant="caption" color={Colors.textMuted}>
              {frequency === 'weekly'
                ? `Repeats every ${date.toLocaleDateString(undefined, { weekday: 'long' })}`
                : frequency === 'monthly'
                ? `Repeats on the ${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'} of every month`
                : frequency === 'yearly'
                ? `Repeats every year on ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
                : 'Repeats every day'}
            </AppText>

            {/* On the due date */}
            <View style={styles.section}>
              <AppText variant="label" style={styles.sectionTitle}>
                On the Due Date
              </AppText>

              <Pressable
                onPress={() => {
                  haptics.selection();
                  setAutoCreate(true);
                }}
                style={[styles.choiceCard, autoCreate && styles.choiceCardActive]}
              >
                <Ionicons name="flash" size={20} color={autoCreate ? '#FFFFFF' : Colors.primary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" color={autoCreate ? '#FFFFFF' : Colors.textPrimary}>
                    Log it automatically
                  </AppText>
                  <AppText variant="caption" color={autoCreate ? 'rgba(255,255,255,0.85)' : Colors.textSecondary}>
                    We&apos;ll add the transaction for you
                  </AppText>
                </View>
                {autoCreate && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
              </Pressable>

              <Pressable
                onPress={() => {
                  haptics.selection();
                  setAutoCreate(false);
                }}
                style={[styles.choiceCard, !autoCreate && styles.choiceCardActive]}
              >
                <Ionicons name="notifications-outline" size={20} color={!autoCreate ? '#FFFFFF' : Colors.primary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" color={!autoCreate ? '#FFFFFF' : Colors.textPrimary}>
                    Just remind me
                  </AppText>
                  <AppText variant="caption" color={!autoCreate ? 'rgba(255,255,255,0.85)' : Colors.textSecondary}>
                    We&apos;ll send a notification instead
                  </AppText>
                </View>
                {!autoCreate && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
              </Pressable>

              {!autoCreate && (
                <View style={styles.reminderRow}>
                  {[0, 1, 3].map(days => {
                    const isSelected = reminderDays === days;
                    return (
                      <Pressable
                        key={days}
                        onPress={() => {
                          haptics.selection();
                          setReminderDays(days);
                        }}
                        style={[styles.reminderChip, isSelected && styles.reminderChipActive]}
                      >
                        <AppText
                          variant="caption"
                          color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                          style={{ fontWeight: isSelected ? '700' : '500' }}
                        >
                          {days === 0 ? 'On the day' : `${days} day${days === 1 ? '' : 's'} before`}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <AppButton
              title={`Set ${scheduleDescription}`}
              size="md"
              onPress={handleApply}
            />
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
  sheet: {
    backgroundColor: Colors.surfaceOpaque,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    maxHeight: '90%',
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
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  freqRow: {
    flexDirection: 'row',
    gap: 8,
  },
  freqCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    gap: 6,
  },
  freqCardActive: {
    backgroundColor: Colors.primary,
    borderColor: 'transparent',
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  choiceCardActive: {
    backgroundColor: Colors.primary,
    borderColor: 'transparent',
  },
  reminderRow: {
    flexDirection: 'row',
    gap: 6,
  },
  reminderChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
  },
  reminderChipActive: {
    backgroundColor: Colors.primary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
});
