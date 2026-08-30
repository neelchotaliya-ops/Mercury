import { useCallback, useEffect, useMemo, useState } from 'react';

import { RecurringFrequency, IntervalUnit, RecurringRule } from '@/types/finance';
import { describeFrequency, formatDateIso } from '@/utils/recurring-engine';

/**
 * Everything a recurring rule's schedule needs, independent of the
 * transaction it's attached to (amount/account/category live outside this).
 */
export interface RecurringScheduleFields {
  frequency: RecurringFrequency;
  intervalUnit?: IntervalUnit;
  intervalValue?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  autoCreate: boolean;
  reminderDays: number;
  note?: string;
}

/** The plain, framework-free inputs `buildRecurringScheduleFields` derives from. */
export interface RecurringScheduleState {
  frequency: RecurringFrequency;
  useCustomInterval: boolean;
  intervalUnit: IntervalUnit;
  intervalValue: number;
  startDate: Date;
  hasEndDate: boolean;
  endDate: Date | null;
  autoCreate: boolean;
  reminderDays: number;
  note: string;
}

/**
 * Pure derivation from raw schedule state to the `RecurringRule` fields it
 * produces — kept framework-free (no `useState`/`useCallback`) so it can be
 * unit-tested directly with plain objects, the same way
 * `utils/recurring-engine.ts` stays pure and testable. `useRecurringScheduleForm`
 * below is a thin `useState` wrapper around this.
 */
export function buildRecurringScheduleFields(state: RecurringScheduleState): RecurringScheduleFields {
  const { frequency, useCustomInterval, intervalUnit, intervalValue, startDate, hasEndDate, endDate, autoCreate, reminderDays, note } = state;
  const activeFrequency: RecurringFrequency = useCustomInterval ? 'custom' : frequency;
  const dayOfWeek = startDate.getDay();
  const dayOfMonth = startDate.getDate();

  return {
    frequency: activeFrequency,
    intervalUnit: activeFrequency === 'custom' ? intervalUnit : undefined,
    intervalValue: activeFrequency === 'custom' ? intervalValue : undefined,
    dayOfWeek: activeFrequency === 'weekly' ? dayOfWeek : undefined,
    dayOfMonth: activeFrequency === 'monthly' ? dayOfMonth : undefined,
    startDate: formatDateIso(startDate),
    endDate: hasEndDate && endDate ? formatDateIso(endDate) : undefined,
    autoCreate,
    reminderDays,
    note: note.trim() || undefined,
  };
}

export interface UseRecurringScheduleFormOptions {
  /**
   * When the caller already owns "which date" (e.g. add-transaction.tsx's
   * inline Repeat sheet, where the transaction's own date doubles as the
   * schedule's start date), pass it here. The hook then tracks `startDate`
   * to this prop instead of managing its own — there is no separate
   * "Starts On" question to ask, and none is rendered by
   * `RecurringScheduleFields` when this is set.
   */
  fixedDate?: Date;
}

/**
 * Owns every piece of state a recurring rule's schedule needs. Both
 * `app/add-recurring.tsx` (full-screen editor) and
 * `components/finance/repeat-sheet.tsx` (inline bottom sheet in Add
 * Transaction) call this — previously each hand-rolled its own copy of this
 * exact state, which is how a fix landed in one and not the other (the
 * `setDayOfWeek`/`setDayOfMonth` crash this session's bug-hunt found). There
 * is now exactly one implementation to get right.
 */
export function useRecurringScheduleForm(options: UseRecurringScheduleFormOptions = {}) {
  const { fixedDate } = options;

  // The four common frequencies are the primary choice; "custom" is a
  // separate opt-in toggle rather than a fifth option, so the default form
  // only ever presents one obvious decision, not five.
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [useCustomInterval, setUseCustomInterval] = useState(false);
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('month');

  const [startDate, setStartDate] = useState<Date>(fixedDate ?? new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [hasEndDate, setHasEndDate] = useState(false);

  const [autoCreate, setAutoCreate] = useState(true);
  const [reminderDays, setReminderDays] = useState(1);
  const [note, setNote] = useState('');

  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Keep in sync with a fixed external date (the sheet's "date doubles as
  // start date" case) if the caller's own date field changes.
  useEffect(() => {
    if (fixedDate) setStartDate(fixedDate);
  }, [fixedDate]);

  // The effective frequency actually saved/previewed — 'custom' whenever
  // the advanced toggle is on, otherwise whichever primary chip is picked.
  const activeFrequency: RecurringFrequency = useCustomInterval ? 'custom' : frequency;

  // Which day it repeats on is always the same day as the start date, never
  // a separately-asked question — picking "the 15th" to start and then
  // "Tuesdays" to repeat was a confusing, rarely-intended combination the
  // old two-question form allowed.
  const dayOfWeek = startDate.getDay();
  const dayOfMonth = startDate.getDate();

  const scheduleDescription = useMemo(
    () =>
      describeFrequency({
        frequency: activeFrequency,
        dayOfWeek,
        dayOfMonth,
        startDate: startDate.toISOString(),
        intervalUnit,
        intervalValue,
      } as RecurringRule),
    [activeFrequency, dayOfWeek, dayOfMonth, startDate, intervalUnit, intervalValue]
  );

  /** Loads an existing rule's schedule into the form, for editing. */
  const populate = useCallback((rule: RecurringRule) => {
    if (rule.frequency === 'custom') {
      setUseCustomInterval(true);
      setFrequency('monthly'); // sensible fallback if the user turns custom off
    } else {
      setUseCustomInterval(false);
      setFrequency(rule.frequency);
    }
    if (rule.intervalValue != null) setIntervalValue(rule.intervalValue);
    if (rule.intervalUnit != null) setIntervalUnit(rule.intervalUnit);
    setStartDate(new Date(rule.startDate));
    if (rule.endDate) {
      setEndDate(new Date(rule.endDate));
      setHasEndDate(true);
    } else {
      setHasEndDate(false);
      setEndDate(null);
    }
    setAutoCreate(rule.autoCreate);
    setReminderDays(rule.reminderDays);
    setNote(rule.note ?? '');
    setShowMoreOptions(rule.frequency === 'custom' || !!rule.endDate);
  }, []);

  const reset = useCallback(() => {
    setFrequency('monthly');
    setUseCustomInterval(false);
    setIntervalValue(1);
    setIntervalUnit('month');
    setStartDate(fixedDate ?? new Date());
    setHasEndDate(false);
    setEndDate(null);
    setAutoCreate(true);
    setReminderDays(1);
    setNote('');
    setShowMoreOptions(false);
  }, [fixedDate]);

  /** The subset of a RecurringRule this form owns — merge with id/amount/accountId/categoryId. */
  const buildFields = useCallback(
    (): RecurringScheduleFields =>
      buildRecurringScheduleFields({
        frequency,
        useCustomInterval,
        intervalUnit,
        intervalValue,
        startDate,
        hasEndDate,
        endDate,
        autoCreate,
        reminderDays,
        note,
      }),
    [frequency, useCustomInterval, intervalUnit, intervalValue, startDate, hasEndDate, endDate, autoCreate, reminderDays, note]
  );

  return {
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
    activeFrequency,
    dayOfWeek,
    dayOfMonth,
    scheduleDescription,
    populate,
    reset,
    buildFields,
  };
}

export type RecurringScheduleForm = ReturnType<typeof useRecurringScheduleForm>;
