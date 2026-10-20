import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Colors, BorderRadius } from '@/constants/theme';
import { Tag } from '@/types/finance';
import { normalizeTagName } from '@/db/tags';
import { haptics } from '@/utils/haptics';

export interface TagInputProps {
  /** Tags currently attached to the transaction. */
  selected: Tag[];
  /** Every tag that already exists — the reusable pool. */
  available: Tag[];
  /** Resolves a typed name to an existing tag or creates one; null for a blank name. */
  onResolveTag: (name: string) => Promise<Tag | null>;
  onChange: (next: Tag[]) => void;
  onFocus?: () => void;
}

/** Existing tags shown as suggestions; the rest are reachable by typing. */
const MAX_SUGGESTIONS = 12;

/**
 * Chip-style tag entry. Picking a suggestion reuses an existing tag; typing a
 * name that doesn't exist offers "Create". Matching is case-insensitive, so
 * the same label can never fork into two tags.
 */
export const TagInput: React.FC<TagInputProps> = ({ selected, available, onResolveTag, onChange, onFocus }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const name = normalizeTagName(query);
  const selectedIds = useMemo(() => new Set(selected.map(t => t.id)), [selected]);

  const suggestions = useMemo(() => {
    const needle = name.toLowerCase();
    return available
      .filter(t => !selectedIds.has(t.id) && (!needle || t.name.toLowerCase().includes(needle)))
      .slice(0, MAX_SUGGESTIONS);
  }, [available, selectedIds, name]);

  const exact = useMemo(
    () => (name ? available.find(t => t.name.toLowerCase() === name.toLowerCase()) : undefined),
    [available, name]
  );
  const canCreate = name.length > 0 && !exact;

  const select = (tag: Tag) => {
    if (selectedIds.has(tag.id)) return;
    haptics.selection();
    onChange([...selected, tag]);
    setQuery('');
  };

  const commit = async () => {
    if (!name || busy) {
      Keyboard.dismiss();
      return;
    }
    if (exact) {
      select(exact);
      return;
    }
    setBusy(true);
    try {
      const tag = await onResolveTag(name);
      if (tag) select(tag);
    } finally {
      setBusy(false);
    }
  };

  const remove = (tag: Tag) => {
    haptics.selection();
    onChange(selected.filter(t => t.id !== tag.id));
  };

  return (
    <View style={styles.wrap}>
      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map(tag => (
            <Pressable key={tag.id} onPress={() => remove(tag)} style={[styles.chip, styles.chipActive]} hitSlop={4}>
              <AppText variant="micro" color={Colors.primaryDeep} style={styles.chipTextActive}>
                #{tag.name}
              </AppText>
              <Ionicons name="close" size={12} color={Colors.primaryDeep} />
            </Pressable>
          ))}
        </View>
      )}

      <AppTextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Add a tag, e.g. work, trip, reimbursable"
        placeholderTextColor={Colors.textMuted}
        leftIcon="pricetag-outline"
        rightIcon={query ? 'close-circle' : undefined}
        onPressRightIcon={() => setQuery('')}
        onFocus={onFocus}
        autoCapitalize="none"
        maxLength={40}
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={commit}
      />

      {(suggestions.length > 0 || canCreate) && (
        <View style={styles.chips}>
          {canCreate && (
            <Pressable onPress={commit} style={[styles.chip, styles.chipCreate]} hitSlop={4}>
              <Ionicons name="add" size={12} color={Colors.primary} />
              <AppText variant="micro" color={Colors.primary} style={styles.chipTextActive}>
                Create “{name}”
              </AppText>
            </Pressable>
          )}
          {suggestions.map(tag => (
            <Pressable key={tag.id} onPress={() => select(tag)} style={styles.chip} hitSlop={4}>
              <AppText variant="micro" color={Colors.textPrimary}>
                #{tag.name}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.08)',
  },
  chipActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  chipCreate: {
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  chipTextActive: {
    fontWeight: '700',
  },
});
