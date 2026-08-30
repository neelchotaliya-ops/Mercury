import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { DatePickerModal } from '@/components/finance/date-picker-modal';
import { RecurringScheduleForm } from '@/hooks/use-recurring-schedule-form';
import { RecurringFrequency, IntervalUnit } from '@/types/finance';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, ControlHeights } from '@/constants/theme';

const FREQUENCY_OPTIONS: { key: Exclude<RecurringFrequency, 'custom'>; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { key: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
  { key: 'yearly', label: 'Yearly', icon: 'calendar-clear-outline' },
  { key: 'daily', label: 'Daily', icon: 'today-outline' },
];

const REMINDER_OPTIONS = [0, 1, 3];

export interface RecurringScheduleFieldsProps {
  form: RecurringScheduleForm;
  /**
   * Full editor mode (the default): also renders the "Starts On" date
   * picker and a "More options" section (custom interval, end date, note).
   * Set to false for a compact inline context — e.g. the Repeat sheet in
   * Add Transaction — where the transaction's own date already fixes the
   * start date and those extra fields aren't offered.
   */
  advanced?: boolean;
}

/**
 * The frequency chips, schedule caption, and "on the due date" choice —
 * the entire shape of setting up a recurring rule's schedule. Shared by
 * `app/add-recurring.tsx` and `components/finance/repeat-sheet.tsx` so
 * there is exactly one implementation of this UI, not two that can drift
 * out of sync.
 */
export const RecurringScheduleFields: React.FC<RecurringScheduleFieldsProps> = ({ form, advanced = true }) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end'>('start');

  const {
    frequency,
    setFrequency,
    useCustomInterval,
    setUseCustomInterval,
    intervalValue,
    setIntervalValue,
    intervalUnit,
    setIntervalUnit,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    hasEndDate,
    setHasEndDate,
    autoCreate,
    setAutoCreate,
    reminderDays,
    setReminderDays,
    note,
    setNote,
    showMoreOptions,
    setShowMoreOptions,
    dayOfMonth,
  } = form;

  const scheduleCaption =
    frequency === 'weekly'
      ? `Repeats every ${startDate.toLocaleDateString(undefined, { weekday: 'long' })}`
      : frequency === 'monthly'
      ? `Repeats on the ${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'} of every month`
      : frequency === 'yearly'
      ? `Repeats every year on ${startDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`
      : 'Repeats every day';

  return (
    <>
      <View style={styles.section}>
        <AppText variant="label" style={styles.sectionTitle}>
          How Often
        </AppText>
        <View style={styles.freqRow}>
          {FREQUENCY_OPTIONS.map(opt => {
            const isSelected = !useCustomInterval && frequency === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  haptics.selection();
                  setUseCustomInterval(false);
                  setFrequency(opt.key);
                }}
                style={[styles.freqButton, isSelected && styles.freqButtonActive]}
              >
                <Ionicons name={opt.icon} size={18} color={isSelected ? '#FFFFFF' : Colors.primary} />
                <AppText
                  variant="caption"
                  color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                  style={{ fontWeight: isSelected ? '700' : '600' }}
                >
                  {opt.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {!advanced && !useCustomInterval && (
          <AppText variant="caption" color={Colors.textMuted}>
            {scheduleCaption}
          </AppText>
        )}
      </View>

      {advanced && (
        <View style={styles.field}>
          <AppText variant="label">Starts On</AppText>
          <Pressable
            onPress={() => {
              setDatePickerTarget('start');
              setShowDatePicker(true);
            }}
            style={styles.datePickerBtn}
          >
            <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
            <AppText variant="bodyStrong">
              {startDate.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </AppText>
          </Pressable>
          {!useCustomInterval && (
            <AppText variant="caption" color={Colors.textMuted}>
              {scheduleCaption}
            </AppText>
          )}
        </View>
      )}

      {advanced && (
        <>
          <Pressable
            onPress={() => setShowMoreOptions(v => !v)}
            hitSlop={8}
            style={styles.moreOptionsToggle}
          >
            <AppText variant="captionStrong" color={Colors.primary}>
              {showMoreOptions ? 'Fewer options' : 'More options'}
            </AppText>
            <Ionicons name={showMoreOptions ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
          </Pressable>

          {showMoreOptions && (
            <>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">Custom interval</AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    e.g. every 2 weeks, every 3 months
                  </AppText>
                </View>
                <Switch
                  value={useCustomInterval}
                  onValueChange={setUseCustomInterval}
                  trackColor={{ false: 'rgba(25, 21, 39, 0.12)', true: Colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {useCustomInterval && (
                <View style={styles.field}>
                  <AppText variant="label">Repeat Every</AppText>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={String(intervalValue)}
                      onChangeText={v => setIntervalValue(Math.max(1, parseInt(v) || 1))}
                      keyboardType="number-pad"
                      style={[styles.input, { width: 70, textAlign: 'center' }]}
                    />
                    <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
                      {(['day', 'week', 'month', 'year'] as IntervalUnit[]).map(unit => {
                        const isSelected = intervalUnit === unit;
                        return (
                          <Pressable
                            key={unit}
                            onPress={() => {
                              haptics.selection();
                              setIntervalUnit(unit);
                            }}
                            style={[styles.unitButton, isSelected && styles.unitButtonActive]}
                          >
                            <AppText
                              variant="caption"
                              color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                              style={{ fontWeight: isSelected ? '700' : '500' }}
                            >
                              {unit}s
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">Has an end date</AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    Automatically stop on a specific date
                  </AppText>
                </View>
                <Switch
                  value={hasEndDate}
                  onValueChange={v => {
                    setHasEndDate(v);
                    if (v && !endDate) {
                      const d = new Date(startDate);
                      d.setFullYear(d.getFullYear() + 1);
                      setEndDate(d);
                    }
                  }}
                  trackColor={{ false: 'rgba(25, 21, 39, 0.12)', true: Colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {hasEndDate && endDate && (
                <View style={styles.field}>
                  <AppText variant="label">End Date</AppText>
                  <Pressable
                    onPress={() => {
                      setDatePickerTarget('end');
                      setShowDatePicker(true);
                    }}
                    style={styles.datePickerBtn}
                  >
                    <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                    <AppText variant="bodyStrong">
                      {endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </AppText>
                  </Pressable>
                </View>
              )}

              <View style={styles.field}>
                <AppText variant="label">Note</AppText>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. Shared with family"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                />
              </View>
            </>
          )}
        </>
      )}

      <View style={styles.section}>
        {advanced && (
          <AppText variant="label" style={styles.sectionTitle}>
            On the Due Date
          </AppText>
        )}

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
          <View style={advanced ? styles.field : undefined}>
            {advanced && <AppText variant="label">Remind Me</AppText>}
            <View style={styles.reminderRow}>
              {REMINDER_OPTIONS.map(days => {
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
          </View>
        )}
      </View>

      {advanced && (
        <DatePickerModal
          visible={showDatePicker}
          selectedDate={datePickerTarget === 'start' ? startDate : (endDate ?? new Date())}
          onSelectDate={d => {
            if (datePickerTarget === 'start') setStartDate(d);
            else setEndDate(d);
          }}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.5,
  },
  field: {
    gap: 8,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  freqButton: {
    flex: 1,
    minWidth: '28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
    gap: 6,
  },
  freqButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ControlHeights.lg,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
  },
  moreOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  input: {
    height: ControlHeights.lg,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  unitButton: {
    flex: 1,
    height: ControlHeights.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
  },
  unitButtonActive: {
    backgroundColor: Colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: ControlHeights.lg,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  choiceCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
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
});
