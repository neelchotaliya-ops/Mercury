import React, { useState } from 'react';
import { View, StyleSheet, Pressable, TextInput, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { DatePickerModal } from '@/components/finance/date-picker-modal';
import { RecurringScheduleForm } from '@/hooks/use-recurring-schedule-form';
import { RecurringFrequency, IntervalUnit } from '@/types/finance';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, ControlHeights, Spacing } from '@/constants/theme';

const REMINDER_OPTIONS: { days: number; label: string }[] = [
  { days: 0, label: 'On day' },
  { days: 1, label: '1 day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
];

export interface RecurringScheduleFieldsProps {
  form: RecurringScheduleForm;
  advanced?: boolean;
}

/**
 * Shared recurring schedule fields adhering strictly to Mercury design system tokens and patterns.
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
    scheduleDescription,
  } = form;

  const handleStepInterval = (delta: number) => {
    haptics.selection();
    setIntervalValue(Math.max(1, Math.min(99, intervalValue + delta)));
  };

  return (
    <View style={styles.container}>
      {/* Frequency Segmented Control */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeader}>
          <AppText variant="micro" color={Colors.primaryDeep} style={styles.sectionLabel}>
            FREQUENCY
          </AppText>
        </View>

        <SegmentedControl<RecurringFrequency | 'custom'>
          variant="dark"
          options={[
            { key: 'monthly', label: 'Monthly' },
            { key: 'weekly', label: 'Weekly' },
            { key: 'yearly', label: 'Yearly' },
            { key: 'daily', label: 'Daily' },
            { key: 'custom', label: 'Custom' },
          ]}
          value={useCustomInterval ? 'custom' : frequency}
          onChange={key => {
            if (key === 'custom') {
              setUseCustomInterval(true);
            } else {
              setUseCustomInterval(false);
              setFrequency(key as any);
            }
          }}
        />

        {!useCustomInterval && (
          <View style={styles.captionBadge}>
            <Ionicons name="repeat" size={12} color={Colors.primary} />
            <AppText variant="caption" color={Colors.primaryDeep} style={styles.captionText}>
              {scheduleDescription}
            </AppText>
          </View>
        )}
      </View>

      {/* Custom Stepper & Units (When Custom frequency is selected) */}
      {useCustomInterval && (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <AppText variant="micro" color={Colors.primaryDeep} style={styles.sectionLabel}>
              REPEAT EVERY
            </AppText>
          </View>

          <View style={styles.customRow}>
            {/* Numeric Stepper */}
            <View style={styles.stepperContainer}>
              <Pressable
                onPress={() => handleStepInterval(-1)}
                disabled={intervalValue <= 1}
                style={({ pressed }) => [
                  styles.stepperBtn,
                  intervalValue <= 1 && styles.stepperBtnDisabled,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons
                  name="remove"
                  size={16}
                  color={intervalValue <= 1 ? Colors.textMuted : Colors.primary}
                />
              </Pressable>

              <TextInput
                value={String(intervalValue)}
                onChangeText={v => {
                  const num = parseInt(v, 10);
                  if (!isNaN(num)) setIntervalValue(Math.max(1, Math.min(99, num)));
                  else if (v === '') setIntervalValue(1);
                }}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.stepperInput}
              />

              <Pressable
                onPress={() => handleStepInterval(1)}
                disabled={intervalValue >= 99}
                style={({ pressed }) => [
                  styles.stepperBtn,
                  intervalValue >= 99 && styles.stepperBtnDisabled,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons
                  name="add"
                  size={16}
                  color={intervalValue >= 99 ? Colors.textMuted : Colors.primary}
                />
              </Pressable>
            </View>

            {/* Units Selector */}
            <View style={styles.unitsRow}>
              {(['day', 'week', 'month', 'year'] as IntervalUnit[]).map(unit => {
                const isSelected = intervalUnit === unit;
                const label = intervalValue > 1 ? `${unit}s` : unit;
                return (
                  <Pressable
                    key={unit}
                    onPress={() => {
                      haptics.selection();
                      setIntervalUnit(unit);
                    }}
                    style={[styles.unitChip, isSelected && styles.unitChipActive]}
                  >
                    <AppText
                      variant="micro"
                      color={isSelected ? Colors.ctaText : Colors.textPrimary}
                      style={{ fontWeight: isSelected ? '700' : '500', textTransform: 'capitalize' }}
                    >
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.captionBadge}>
            <Ionicons name="repeat" size={12} color={Colors.primary} />
            <AppText variant="caption" color={Colors.primaryDeep} style={styles.captionText}>
              {scheduleDescription}
            </AppText>
          </View>
        </View>
      )}

      {/* Starts On Date (Advanced Mode in Add Recurring Screen) */}
      {advanced && (
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeader}>
            <AppText variant="micro" color={Colors.primaryDeep} style={styles.sectionLabel}>
              STARTS ON
            </AppText>
          </View>
          <Pressable
            onPress={() => {
              haptics.press();
              setDatePickerTarget('start');
              setShowDatePicker(true);
            }}
            style={styles.datePickerBtn}
          >
            <View style={styles.datePickerIcon}>
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
            </View>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              {startDate.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* On Due Date (Execution Mode) */}
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeader}>
          <AppText variant="micro" color={Colors.primaryDeep} style={styles.sectionLabel}>
            ON THE DUE DATE
          </AppText>
        </View>

        <SegmentedControl<'auto' | 'remind'>
          variant="dark"
          options={[
            { key: 'auto', label: 'Log Automatically', icon: 'flash' },
            { key: 'remind', label: 'Remind Me Only', icon: 'notifications-outline' },
          ]}
          value={autoCreate ? 'auto' : 'remind'}
          onChange={key => {
            setAutoCreate(key === 'auto');
          }}
        />

        {autoCreate ? (
          <View style={styles.captionBadge}>
            <Ionicons name="flash" size={12} color={Colors.income} />
            <AppText variant="caption" color={Colors.textSecondary} style={styles.captionText}>
              Automatically records the transaction on each due date
            </AppText>
          </View>
        ) : (
          <View style={styles.captionBadge}>
            <Ionicons name="notifications-outline" size={12} color={Colors.primary} />
            <AppText variant="caption" color={Colors.primaryDeep} style={styles.captionText}>
              Sends a notification reminder to review and record
            </AppText>
          </View>
        )}

        {/* Reminder Offsets (Shown when Remind Me is selected) */}
        {!autoCreate && (
          <View style={styles.remindOffsetWrap}>
            <AppText variant="micro" color={Colors.primaryDeep} style={styles.subSectionLabel}>
              REMIND LEAD TIME
            </AppText>
            <View style={styles.reminderChipsRow}>
              {REMINDER_OPTIONS.map(opt => {
                const isSelected = reminderDays === opt.days;
                return (
                  <Pressable
                    key={opt.days}
                    onPress={() => {
                      haptics.selection();
                      setReminderDays(opt.days);
                    }}
                    style={[styles.reminderChip, isSelected && styles.reminderChipActive]}
                  >
                    <AppText
                      variant="micro"
                      color={isSelected ? Colors.ctaText : Colors.textPrimary}
                      style={{ fontWeight: isSelected ? '700' : '500' }}
                    >
                      {opt.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Advanced / More Options for Full Editor */}
      {advanced && (
        <View style={styles.sectionWrap}>
          <Pressable
            onPress={() => {
              haptics.selection();
              setShowMoreOptions(v => !v);
            }}
            hitSlop={8}
            style={styles.moreOptionsToggle}
          >
            <AppText variant="captionStrong" color={Colors.primary}>
              {showMoreOptions ? 'Fewer options' : 'More options (End date, note)'}
            </AppText>
            <Ionicons
              name={showMoreOptions ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Colors.primary}
            />
          </Pressable>

          {showMoreOptions && (
            <View style={styles.moreOptionsCard}>
              {/* Has End Date */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">Has an end date</AppText>
                  <AppText variant="micro" color={Colors.textSecondary}>
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
                <Pressable
                  onPress={() => {
                    setDatePickerTarget('end');
                    setShowDatePicker(true);
                  }}
                  style={styles.datePickerBtn}
                >
                  <View style={styles.datePickerIcon}>
                    <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                  </View>
                  <AppText variant="bodyStrong" style={{ flex: 1 }}>
                    Ends on: {endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </AppText>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </Pressable>
              )}

              {/* Note */}
              <View style={{ gap: 4, marginTop: 4 }}>
                <AppText variant="micro" color={Colors.primaryDeep} style={styles.sectionLabel}>
                  NOTE / MEMO
                </AppText>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="e.g. Shared with family, contract #..."
                  placeholderTextColor={Colors.textMuted}
                  style={styles.inputField}
                />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Date Picker Modal */}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 18,
  },
  sectionWrap: {
    gap: 7,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    fontFamily: 'Manrope_700Bold',
  },
  subSectionLabel: {
    fontSize: 9.5,
    letterSpacing: 0.7,
    fontFamily: 'Manrope_700Bold',
    paddingHorizontal: 2,
  },
  captionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.primarySoft,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  captionText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
  },
  customRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    width: 96,
    borderRadius: BorderRadius.xs,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.22)',
  },
  stepperBtn: {
    width: 30,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.25,
  },
  stepperInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: 'Sora_700Bold',
    color: Colors.textPrimary,
    padding: 0,
  },
  unitsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  unitChip: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.xs,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.08)',
  },
  unitChipActive: {
    backgroundColor: Colors.ctaBg,
    borderColor: Colors.ctaBg,
  },
  remindOffsetWrap: {
    gap: 6,
    marginTop: 4,
  },
  reminderChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  reminderChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.18)',
  },
  reminderChipActive: {
    backgroundColor: Colors.ctaBg,
    borderColor: Colors.ctaBg,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ControlHeights.md,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.18)',
  },
  datePickerIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  moreOptionsCard: {
    padding: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputField: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.18)',
    fontSize: 13.5,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
});



