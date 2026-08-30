import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { Colors, BorderRadius, Gradients, Shadows, Spacing } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

export interface DatePickerModalProps {
  visible: boolean;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
  maxDate?: Date;
  minDate?: Date;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  maxDate = new Date(),
  minDate,
}) => {
  const [viewYear, setViewYear] = useState<number>(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(selectedDate.getMonth());
  const [tempDate, setTempDate] = useState<Date>(selectedDate);

  // Sync state whenever modal opens
  useEffect(() => {
    if (visible) {
      setViewYear(selectedDate.getFullYear());
      setViewMonth(selectedDate.getMonth());
      setTempDate(selectedDate);
    }
  }, [visible, selectedDate]);

  const changeMonth = (delta: number) => {
    haptics.selection();
    let newMonth = viewMonth + delta;
    let newYear = viewYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setViewMonth(newMonth);
    setViewYear(newYear);
  };

  const daysInMonth = useMemo(
    () => new Date(viewYear, viewMonth + 1, 0).getDate(),
    [viewYear, viewMonth]
  );
  const firstDayOffset = useMemo(
    () => new Date(viewYear, viewMonth, 1).getDay(),
    [viewYear, viewMonth]
  );

  const prevMonthDays = useMemo(
    () => new Date(viewYear, viewMonth, 0).getDate(),
    [viewYear, viewMonth]
  );

  const isToday = (d: number, m: number, y: number) => {
    const today = new Date();
    return (
      today.getDate() === d &&
      today.getMonth() === m &&
      today.getFullYear() === y
    );
  };

  const isSelected = (d: number, m: number, y: number) => {
    return (
      tempDate.getDate() === d &&
      tempDate.getMonth() === m &&
      tempDate.getFullYear() === y
    );
  };

  const isDateDisabled = (d: number, m: number, y: number) => {
    const check = new Date(y, m, d, 23, 59, 59, 999);
    if (maxDate && check.getTime() > maxDate.getTime()) return true;
    if (minDate && new Date(y, m, d, 0, 0, 0, 0).getTime() < minDate.getTime()) return true;
    return false;
  };

  const handleDayPress = (day: number) => {
    const next = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
    haptics.selection();
    setTempDate(next);
  };

  const handlePreset = (daysAgo: number) => {
    const target = new Date();
    target.setDate(target.getDate() - daysAgo);
    haptics.selection();
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    setTempDate(target);
  };

  const handleConfirm = () => {
    haptics.success();
    onSelectDate(tempDate);
    onClose();
  };

  // 35 or 42 grid cells
  const totalCells = firstDayOffset + daysInMonth > 35 ? 42 : 35;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressable} onPress={onClose} />

        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <AppText variant="h3">Select Date</AppText>
              <AppText variant="caption">
                {tempDate.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Quick Presets */}
          <View style={styles.presetsRow}>
            <Pressable
              onPress={() => handlePreset(0)}
              style={({ pressed }) => [
                styles.presetChip,
                isToday(tempDate.getDate(), tempDate.getMonth(), tempDate.getFullYear()) &&
                  styles.presetChipActive,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <AppText
                variant="micro"
                color={
                  isToday(tempDate.getDate(), tempDate.getMonth(), tempDate.getFullYear())
                    ? Colors.primary
                    : Colors.textSecondary
                }
              >
                Today
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => handlePreset(1)}
              style={({ pressed }) => [styles.presetChip, { opacity: pressed ? 0.7 : 1 }]}
            >
              <AppText variant="micro" color={Colors.textSecondary}>
                Yesterday
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => handlePreset(2)}
              style={({ pressed }) => [styles.presetChip, { opacity: pressed ? 0.7 : 1 }]}
            >
              <AppText variant="micro" color={Colors.textSecondary}>
                2 days ago
              </AppText>
            </Pressable>
          </View>

          {/* Month / Year Navigator */}
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => changeMonth(-1)}
              hitSlop={10}
              style={styles.navArrow}
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
            </Pressable>
            <AppText variant="bodyStrong">
              {MONTHS[viewMonth]} {viewYear}
            </AppText>
            <Pressable
              onPress={() => changeMonth(1)}
              hitSlop={10}
              style={styles.navArrow}
            >
              <Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* Weekdays Header */}
          <View style={styles.weekdaysRow}>
            {WEEKDAYS.map(day => (
              <View key={day} style={styles.weekdayCol}>
                <AppText variant="micro" color={Colors.textMuted} align="center">
                  {day}
                </AppText>
              </View>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.grid}>
            {Array.from({ length: totalCells }).map((_, index) => {
              const dayNumber = index - firstDayOffset + 1;
              const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;

              if (!isCurrentMonth) {
                const paddingDay =
                  dayNumber <= 0
                    ? prevMonthDays + dayNumber
                    : dayNumber - daysInMonth;
                return (
                  <View key={`pad-${index}`} style={styles.dayCell}>
                    <AppText variant="caption" color={Colors.textMuted} style={styles.dimmedText}>
                      {paddingDay}
                    </AppText>
                  </View>
                );
              }

              const selected = isSelected(dayNumber, viewMonth, viewYear);
              const disabled = isDateDisabled(dayNumber, viewMonth, viewYear);
              const today = isToday(dayNumber, viewMonth, viewYear);

              return (
                <Pressable
                  key={`day-${dayNumber}`}
                  onPress={() => !disabled && handleDayPress(dayNumber)}
                  disabled={disabled}
                  style={styles.dayCell}
                >
                  {selected ? (
                    <LinearGradient
                      colors={Gradients.cta as [string, string]}
                      style={styles.selectedPill}
                    >
                      <AppText variant="bodyStrong" color={Colors.ctaText}>
                        {dayNumber}
                      </AppText>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.dayCircle,
                        today && styles.todayCircle,
                        disabled && styles.disabledCell,
                      ]}
                    >
                      <AppText
                        variant="body"
                        color={
                          disabled
                            ? Colors.textMuted
                            : today
                            ? Colors.primary
                            : Colors.textPrimary
                        }
                      >
                        {dayNumber}
                      </AppText>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <AppButton
              title="Cancel"
              variant="ghost"
              size="md"
              fullWidth={false}
              onPress={onClose}
            />
            <AppButton
              title="Done"
              variant="primary"
              size="md"
              fullWidth={false}
              onPress={handleConfirm}
              style={styles.confirmBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surfaceOpaque,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.floating,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  presetChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  presetChipActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}18`,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  navArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.floating,
  },
  todayCircle: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  disabledCell: {
    opacity: 0.25,
  },
  dimmedText: {
    opacity: 0.25,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: Spacing.lg,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  cancelBtn: {
    paddingHorizontal: 16,
  },
  confirmBtn: {
    paddingHorizontal: 24,
  },
});
