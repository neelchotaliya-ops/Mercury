import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecurringScheduleFields } from '@/components/finance/recurring-schedule-fields';
import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { BorderRadius, Colors, ControlHeights, Shadows, Spacing } from '@/constants/theme';
import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { useRecurringScheduleForm } from '@/hooks/use-recurring-schedule-form';
import { IntervalUnit, RecurringFrequency, RecurringRule } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { generateOccurrences } from '@/utils/recurring-engine';

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
  /** The transaction's own date — also the day this repeats on */
  date: Date;
  initialConfig?: RepeatSheetConfig;
  onApply: (config: RepeatSheetConfig) => void;
  onClear?: () => void;
}

export const RepeatSheet: React.FC<RepeatSheetProps> = ({
  visible,
  onClose,
  amount,
  currency,
  date,
  initialConfig,
  onApply,
  onClear,
}) => {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, keyboardVisible } = useKeyboardBottomInset();

  // Shared recurring schedule form state
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

  const {
    activeFrequency,
    dayOfWeek,
    dayOfMonth,
    autoCreate,
    reminderDays,
    scheduleDescription,
  } = schedule;

  // Build temporary rule object to compute next occurrences
  const previewRule = useMemo<RecurringRule>(() => {
    const fields = schedule.buildFields();
    return {
      id: 'preview',
      type: 'expense',
      amount: amount || 0,
      accountId: '',
      ...fields,
      nextDue: fields.startDate,
      active: true,
      createdAt: new Date().toISOString(),
    };
  }, [schedule, amount]);

  const upcomingOccurrences = useMemo(() => {
    try {
      const from = new Date(date);
      const to = new Date(date);
      to.setFullYear(to.getFullYear() + 4);
      return generateOccurrences(previewRule, from, to, 3);
    } catch {
      return [];
    }
  }, [previewRule, date]);

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

  const handleRemove = () => {
    haptics.selection();
    if (onClear) onClear();
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
                <View style={styles.headerTitleWrap}>
                  <View style={styles.headerIconBadge}>
                    <Ionicons name="repeat" size={18} color={Colors.primary} />
                  </View>
                  <View style={styles.headerTextCol}>
                    <AppText variant="h3" color={Colors.textPrimary}>
                      Recurring Payment
                    </AppText>
                    {amount > 0 ? (
                      <AppText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                        <AppText variant="captionStrong" color={Colors.primaryDeep}>
                          {formatCurrency(amount, currency)}
                        </AppText>
                        {' • '}
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {scheduleDescription}
                        </AppText>
                      </AppText>
                    ) : (
                      <AppText variant="caption" color={Colors.textSecondary}>
                        Schedule automatic repetition cadence
                      </AppText>
                    )}
                  </View>
                </View>

                <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Schedule Form Fields */}
              <RecurringScheduleFields form={schedule} advanced={false} />

              {/* Upcoming Occurrences Timeline View (Unboxed & Simple Text) */}
              {upcomingOccurrences.length > 0 && (
                <View style={styles.timelineSection}>
                  <View style={styles.sectionHeader}>
                    <AppText variant="micro" color={Colors.primaryDeep} style={styles.sectionLabel}>
                      UPCOMING TIMELINE
                    </AppText>
                  </View>

                  <View style={styles.timelineList}>
                    {upcomingOccurrences.map((occDate, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === upcomingOccurrences.length - 1;
                      return (
                        <View key={idx} style={styles.timelineRow}>
                          {/* Timeline Axis (Dot + Track) */}
                          <View style={styles.timelineAxis}>
                            <View
                              style={[
                                styles.timelineDotOuter,
                                isFirst ? styles.timelineDotOuterActive : styles.timelineDotOuterMuted,
                              ]}
                            >
                              <View
                                style={[
                                  styles.timelineDotInner,
                                  isFirst ? styles.timelineDotInnerActive : styles.timelineDotInnerMuted,
                                ]}
                              />
                            </View>
                            {!isLast && <View style={styles.timelineTrack} />}
                          </View>

                          {/* Timeline Body */}
                          <View style={[styles.timelineContent, isLast && styles.timelineContentLast]}>
                            <View style={styles.timelineDateRow}>
                              <AppText
                                variant={isFirst ? 'bodyStrong' : 'body'}
                                color={isFirst ? Colors.textPrimary : Colors.textSecondary}
                              >
                                {occDate.toLocaleDateString(undefined, {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </AppText>
                              {amount > 0 && (
                                <AppText
                                  variant={isFirst ? 'bodyStrong' : 'caption'}
                                  color={isFirst ? Colors.primaryDeep : Colors.textSecondary}
                                  style={{ fontWeight: isFirst ? '700' : '500' }}
                                >
                                  {formatCurrency(amount, currency)}
                                </AppText>
                              )}
                            </View>

                            <AppText
                              variant="micro"
                              color={isFirst ? Colors.primaryDeep : Colors.textMuted}
                              style={{ fontWeight: isFirst ? '600' : '500' }}
                            >
                              {isFirst ? 'Next occurrence' : `${idx + 1}${idx === 1 ? 'nd' : 'rd'} cycle`}
                            </AppText>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Sticky Footer Apply Button & Remove Action */}
            <View style={styles.footer}>
              {initialConfig && (
                <Pressable onPress={handleRemove} style={styles.removeBtn}>
                  <Ionicons name="trash-outline" size={17} color={Colors.expense} />
                  <AppText variant="captionStrong" color={Colors.expense}>
                    Remove
                  </AppText>
                </Pressable>
              )}

              <View style={styles.btnWrap}>
                <AppButton
                  title={`Set ${scheduleDescription}`}
                  size="lg"
                  onPress={handleApply}
                />
              </View>
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
    width: '100%',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingTop: 10,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
    ...Shadows.lifted,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.15)',
    alignSelf: 'center',
    marginBottom: 10,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(25, 21, 39, 0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    marginLeft: 12,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 18,
  },
  timelineSection: {
    gap: 6,
  },
  sectionHeader: {
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    fontFamily: 'Manrope_700Bold',
  },
  timelineList: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 44,
  },
  timelineAxis: {
    width: 18,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  timelineDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineDotOuterActive: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.45)',
  },
  timelineDotOuterMuted: {
    backgroundColor: 'rgba(25, 21, 39, 0.05)',
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timelineDotInnerActive: {
    backgroundColor: Colors.primary,
  },
  timelineDotInnerMuted: {
    backgroundColor: Colors.textMuted,
  },
  timelineTrack: {
    position: 'absolute',
    top: 14,
    bottom: -4,
    width: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 14,
    gap: 1,
  },
  timelineContentLast: {
    paddingBottom: 4,
  },
  timelineDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(25, 21, 39, 0.06)',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  btnWrap: {
    flex: 1,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: ControlHeights.lg,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(224, 92, 126, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224, 92, 126, 0.2)',
    gap: 6,
  },
});




