/**
 * Reusable transaction tags.
 *
 * Names are unique case-insensitively (`name_lc`), so typing "work" after
 * "Work" reuses the existing tag instead of forking a near-duplicate. Takes a
 * `Db` first, like the rest of `db/`, so it runs under node:sqlite in tests.
 */

import { Tag } from '@/types/finance';
import { generateId } from '@/utils/id';

import { Db, TagRow } from './types';
import { bumpDataVersion } from './version';

export const MAX_TAG_LENGTH = 30;

/** Trims, strips a leading "#", and collapses inner whitespace. Empty string means "not a usable tag". */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
}

function rowToTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export async function listTags(db: Db): Promise<Tag[]> {
  const rows = await db.getAllAsync<TagRow>('SELECT * FROM tags ORDER BY name_lc');
  return rows.map(rowToTag);
}

/** The write half of `getOrCreateTag`, without the version bump — safe inside an open transaction. */
export async function getOrCreateTagRow(db: Db, rawName: string): Promise<Tag | null> {
  const name = normalizeTagName(rawName);
  if (!name) return null;
  const nameLc = name.toLowerCase();

  const existing = await db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE name_lc = ?', [nameLc]);
  if (existing) return rowToTag(existing);

  const tag: Tag = { id: generateId(), name, createdAt: new Date().toISOString() };
  await db.runAsync('INSERT INTO tags (id, name, name_lc, created_at) VALUES (?, ?, ?, ?)', [
    tag.id,
    tag.name,
    nameLc,
    tag.createdAt,
  ]);
  return tag;
}

/** Returns the existing tag with this name (any casing) or creates it. Null for a blank name. */
export async function getOrCreateTag(db: Db, rawName: string): Promise<Tag | null> {
  const tag = await getOrCreateTagRow(db, rawName);
  if (tag) bumpDataVersion();
  return tag;
}

/** Replaces a transaction's tag links. Call inside the transaction that writes the row. */
export async function setTransactionTags(db: Db, transactionId: string, tagIds: string[] | undefined): Promise<void> {
  await db.runAsync('DELETE FROM transaction_tags WHERE transaction_id = ?', [transactionId]);
  for (const tagId of new Set(tagIds ?? [])) {
    await db.runAsync('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)', [
      transactionId,
      tagId,
    ]);
  }
}

export async function deleteTag(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM tags WHERE id = ?', [id]);
  bumpDataVersion();
}
