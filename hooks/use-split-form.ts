import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { calculateSplitShares } from '@/utils/bank-statement';
import { generateId } from '@/utils/id';
import { haptics } from '@/utils/haptics';

const STORAGE_KEY_FRIENDS = '@mercury/recent_split_friends';

export interface SplitParticipantEntry {
  id: string;
  name: string;
  isYou: boolean;
  /** A directly-typed share amount. Empty means "use the equal-split default". */
  value: string;
}

export interface UseSplitFormOptions {
  /**
   * When the caller already owns the bill total (e.g. add-transaction.tsx's
   * own amount field, for the inline Split sheet), pass it here — this hook
   * then derives shares from it instead of rendering its own amount field.
   */
  fixedTotal?: number;
  initialTotalText?: string;
  initialParticipants?: SplitParticipantEntry[];
}

/**
 * Owns the participant list and share math for a split bill. Both
 * `app/add-split.tsx` (full-screen editor) and
 * `components/finance/split-sheet.tsx` (inline sheet in Add Transaction)
 * call this, so there is exactly one implementation of "how splitting a
 * bill works" instead of two that can drift.
 *
 * There is deliberately no "method" concept (equal/exact/percentage) —
 * participants default to an equal split, and each person's amount is
 * directly editable; the sum just has to add back up to the total. That's
 * simpler than switching modes for the same underlying idea, and matches
 * "who owes me what" rather than bill-splitting math.
 */
export function useSplitForm(options: UseSplitFormOptions = {}) {
  const { fixedTotal, initialTotalText, initialParticipants } = options;

  const [totalAmountText, setTotalAmountText] = useState(initialTotalText ?? '');
  const [participants, setParticipants] = useState<SplitParticipantEntry[]>(
    initialParticipants && initialParticipants.length >= 1
      ? initialParticipants
      : [{ id: 'you', name: 'You', isYou: true, value: '' }]
  );
  const [newParticipantName, setNewParticipantName] = useState('');
  const [recentFriends, setRecentFriends] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_FRIENDS).then(val => {
      if (val) {
        try {
          setRecentFriends(JSON.parse(val));
        } catch {}
      }
    });
  }, []);

  const numericTotal = fixedTotal ?? parseFloat(totalAmountText || '0');

  // The equal-split default for each participant, remainder-distributed
  // (calculateSplitShares handles paise-level rounding) — used for anyone
  // who hasn't typed their own amount.
  const equalShares = useMemo(
    () => (numericTotal > 0 && participants.length > 0 ? calculateSplitShares(numericTotal, 'equal', participants.length) : participants.map(() => 0)),
    [numericTotal, participants.length]
  );

  const shares = useMemo(
    () =>
      participants.map((p, i) => {
        const typed = parseFloat(p.value);
        return p.value.trim() !== '' && !isNaN(typed) ? typed : (equalShares[i] ?? 0);
      }),
    [participants, equalShares]
  );

  const sharesSum = useMemo(() => shares.reduce((a, b) => a + b, 0), [shares]);
  const isBalanced = Math.abs(sharesSum - numericTotal) < 0.05;
  const canSubmit = numericTotal > 0 && participants.length >= 2 && isBalanced;

  const addParticipant = useCallback(
    (nameToAdd?: string) => {
      const name = (nameToAdd ?? newParticipantName).trim();
      if (!name) return;
      if (participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        setNewParticipantName('');
        return;
      }
      haptics.press();
      setParticipants(prev => [...prev, { id: generateId(), name, isYou: false, value: '' }]);
      setNewParticipantName('');

      const updated = [name, ...recentFriends.filter(f => f.toLowerCase() !== name.toLowerCase())].slice(0, 8);
      setRecentFriends(updated);
      AsyncStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(updated)).catch(() => {});
    },
    [newParticipantName, participants, recentFriends]
  );

  const removeParticipant = useCallback((id: string) => {
    haptics.press();
    setParticipants(prev => (prev.length <= 1 ? prev : prev.filter(p => p.id !== id)));
  }, []);

  const updateParticipantValue = useCallback((id: string, value: string) => {
    setParticipants(prev => prev.map(p => (p.id === id ? { ...p, value } : p)));
  }, []);

  const reset = useCallback(() => {
    setTotalAmountText('');
    setParticipants([{ id: 'you', name: 'You', isYou: true, value: '' }]);
    setNewParticipantName('');
  }, []);

  return {
    totalAmountText,
    setTotalAmountText,
    numericTotal,
    participants,
    setParticipants,
    newParticipantName,
    setNewParticipantName,
    recentFriends,
    shares,
    sharesSum,
    isBalanced,
    canSubmit,
    addParticipant,
    removeParticipant,
    updateParticipantValue,
    reset,
  };
}

export type SplitForm = ReturnType<typeof useSplitForm>;
