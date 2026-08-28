import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GlassCard } from '@/components/ui/glass-card';
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
  initialConfig?: RepeatSheetConfig;
  onApply: (config: RepeatSheetConfig) => void;
}

const FREQUENCY_PRESETS: { key: RecurringFrequency; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { key: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
  { key: 'yearly', label: 'Yearly', icon: 'calendar-clear-outline' },
  { key: 'daily', label: 'Daily', icon: 'today-outline' },
];

const DAYS_OF_WEEK = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export const RepeatSheet: React.FC<RepeatSheetProps> = ({
  visible,
  onClose,
  amount,
  currency,
  initialConfig,
  onApply,
}) => {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, keyboardVisible } = useKeyboardBottomInset();

  const today = new Date();
  const [frequency, setFrequency] = useState<RecurringFrequency>(initialConfig?.frequency ?? 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState<number>(initialConfig?.dayOfMonth ?? today.getDate());
  const [dayOfWeek, setDayOfWeek] = useState<number>(initialConfig?.dayOfWeek ?? today.getDay());
  const [autoCreate, setAutoCreate] = useState<boolean>(initialConfig?.autoCreate ?? true);
  const [reminderDays, setReminderDays] = useState<number>(initialConfig?.reminderDays ?? 1);

  const dummyRule: any = {
    frequency,
    dayOfMonth,
    dayOfWeek,
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

            {/* Day of Month Selector for Monthly */}
            {frequency === 'monthly' && (
              <View style={styles.section}>
                <AppText variant="label" style={styles.sectionTitle}>
                  Day of Month
                </AppText>
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => {
                      haptics.selection();
                      setDayOfMonth(Math.max(1, dayOfMonth - 1));
                    }}
                    style={styles.stepperBtn}
                  >
                    <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                  </Pressable>
                  <View style={styles.stepperValue}>
                    <AppText variant="h2" color={Colors.primaryDeep}>
                      {dayOfMonth === -1
                        ? 'Last day'
                        : `${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}`}
                    </AppText>
                    <AppText variant="micro" color={Colors.textMuted}>
                      of every month
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => {
                      haptics.selection();
                      setDayOfMonth(Math.min(31, dayOfMonth + 1));
                    }}
                    style={styles.stepperBtn}
                  >
                    <Ionicons name="add" size={18} color={Colors.textPrimary} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Day of Week Selector for Weekly */}
            {frequency === 'weekly' && (
              <View style={styles.section}>
                <AppText variant="label" style={styles.sectionTitle}>
                  Day of Week
                </AppText>
                <View style={styles.dowRow}>
                  {DAYS_OF_WEEK.map(d => {
                    const active = dayOfWeek === d.value;
                    return (
                      <Pressable
                        key={d.value}
                        onPress={() => {
                          haptics.selection();
                          setDayOfWeek(d.value);
                        }}
                        style={[styles.dowChip, active && styles.dowChipActive]}
                      >
                        <AppText
                          variant="caption"
                          color={active ? '#FFFFFF' : Colors.textPrimary}
                          style={{ fontWeight: active ? '700' : '500' }}
                        >
                          {d.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Action Settings Card */}
            <GlassCard padding={14} style={styles.actionCard}>
              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <AppText variant="bodyStrong">Auto-create transactions</AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {autoCreate
                      ? 'Automatically logs the transaction on the due date'
                      : 'Sends a reminder notification for you to confirm'}
                  </AppText>
                </View>
                <Switch
                  value={autoCreate}
                  onValueChange={v => {
                    haptics.selection();
                    setAutoCreate(v);
                  }}
                  trackColor={{ false: 'rgba(25, 21, 39, 0.12)', true: Colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </GlassCard>

            {/* Summary Preview Banner */}
            <GlassCard padding={14} strong elevated style={styles.summaryBanner}>
              <Ionicons name="sparkles" size={18} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
                  {autoCreate ? 'Automatic Recurring Schedule' : 'Reminder Schedule'}
                </AppText>
                <AppText variant="caption" color={Colors.textSecondary} style={{ marginTop: 2 }}>
                  {autoCreate
                    ? `Logs today's entry and will automatically repeat ${scheduleDescription.toLowerCase()}.`
                    : `Logs today's entry and will remind you ${scheduleDescription.toLowerCase()}.`}
                </AppText>
              </View>
            </GlassCard>
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
    backgroundColor: '#FFFFFF',
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
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.soft,
  },
  stepperValue: {
    alignItems: 'center',
    gap: 2,
  },
  dowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  dowChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
  },
  dowChipActive: {
    backgroundColor: Colors.primary,
  },
  actionCard: {
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchInfo: {
    flex: 1,
    gap: 2,
  },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
});
