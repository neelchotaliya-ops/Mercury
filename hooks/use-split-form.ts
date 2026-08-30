import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { calculateSplitShares } from '@/utils/bank-statement';
import { haptics } from '@/utils/haptics';
import { generateId } from '@/utils/id';

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
        } catch { }
      }
    });
  }, []);

  const numericTotal = fixedTotal ?? parseFloat(totalAmountText || '0');

  // Compute shares:
  // If some participants have custom typed values, the remaining amount is
  // automatically distributed equally among the remaining participants without custom values.
  const shares = useMemo(() => {
    if (numericTotal <= 0 || participants.length === 0) {
      return participants.map(() => 0);
    }

    const parsed = participants.map(p => {
      const isCustom = p.value.trim() !== '';
      const num = parseFloat(p.value);
      return { isCustom: isCustom && !isNaN(num), value: !isNaN(num) ? num : 0 };
    });

    const customCount = parsed.filter(p => p.isCustom).length;

    // Case 1: No custom shares typed -> pure equal split
    if (customCount === 0) {
      return calculateSplitShares(numericTotal, 'equal', participants.length);
    }

    // Case 2: All participants have custom shares
    if (customCount === participants.length) {
      return parsed.map(p => p.value);
    }

    // Case 3: Mixed -> distribute remaining amount to unassigned participants
    const customSum = parsed.filter(p => p.isCustom).reduce((acc, p) => acc + p.value, 0);
    const unassignedCount = participants.length - customCount;
    const remainingAmount = Math.max(0, parseFloat((numericTotal - customSum).toFixed(2)));

    const autoShares = calculateSplitShares(remainingAmount, 'equal', unassignedCount);
    let autoIdx = 0;

    return parsed.map(p => {
      if (p.isCustom) return p.value;
      const shareVal = autoShares[autoIdx] ?? 0;
      autoIdx++;
      return shareVal;
    });
  }, [numericTotal, participants]);

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
      AsyncStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(updated)).catch(() => { });
    },
    [newParticipantName, participants, recentFriends]
  );

  const removeParticipant = useCallback((id: string) => {
    haptics.press();
    setParticipants(prev => (prev.length <= 1 ? prev : prev.filter(p => p.id !== id)));
  }, []);

  const removeRecentFriend = useCallback((nameToRemove: string) => {
    haptics.press();
    setRecentFriends(prev => {
      const updated = prev.filter(f => f.toLowerCase() !== nameToRemove.toLowerCase());
      AsyncStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const resetToEqual = useCallback(() => {
    haptics.press();
    setParticipants(prev => prev.map(p => ({ ...p, value: '' })));
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
    removeRecentFriend,
    resetToEqual,
    updateParticipantValue,
    reset,
  };
}

export type SplitForm = ReturnType<typeof useSplitForm>;
