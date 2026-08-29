import React from 'react';
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
import { RecurringScheduleFields } from '@/components/finance/recurring-schedule-fields';
import { useRecurringScheduleForm } from '@/hooks/use-recurring-schedule-form';
import { RecurringFrequency, IntervalUnit } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { Colors, Spacing, Shadows } from '@/constants/theme';

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

  // Same shared hook add-recurring.tsx uses, so a fix to the schedule logic
  // never has to be made twice. `fixedDate` means this instance never owns
  // its own start-date state — the transaction's date is the start date.
  const schedule = useRecurringScheduleForm({ fixedDate: date });

  React.useEffect(() => {
    if (!visible) return;
    if (initialConfig) {
      schedule.setFrequency(initialConfig.frequency === 'custom' ? 'monthly' : initialConfig.frequency);
      schedule.setUseCustomInterval(initialConfig.frequency === 'custom');
      if (initialConfig.intervalUnit) schedule.setIntervalUnit(initialConfig.intervalUnit);
      if (initialConfig.intervalValue) schedule.setIntervalValue(initialConfig.intervalValue);
      schedule.setAutoCreate(initialConfig.autoCreate);
      schedule.setReminderDays(initialConfig.reminderDays);
    } else {
      schedule.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const { activeFrequency, dayOfWeek, dayOfMonth, autoCreate, reminderDays, scheduleDescription } = schedule;

  const handleApply = () => {
    haptics.success();
    const fields = schedule.buildFields();
    onApply({
      frequency: activeFrequency,
      intervalUnit: fields.intervalUnit,
      intervalValue: fields.intervalValue ?? 1,
      dayOfMonth: activeFrequency === 'monthly' ? dayOfMonth : undefined,
      dayOfWeek: activeFrequency === 'weekly' ? dayOfWeek : undefined,
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
            <RecurringScheduleFields form={schedule} advanced={false} />
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
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
});
