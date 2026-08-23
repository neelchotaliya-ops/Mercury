/**
 * Subcategory CRUD.
 *
 * Subcategories are optional structure within a category (e.g. "Netflix"
 * under "Subscriptions"). They never flow into the rollup — filtering by
 * subcategory uses a bounded raw scan, identical to the existing minAmount
 * fallback.
 *
 * All reads and writes follow the same pattern as db/entities.ts: take a `Db`
 * as the first argument so the same functions run under Node's built-in
 * node:sqlite in test scripts without any device or emulator.
 */

import { Subcategory } from '@/types/finance';

import { Db, SubcategoryRow } from './types';

function rowToSubcategory(row: SubcategoryRow): Subcategory {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    icon: row.icon as Subcategory['icon'],
    color: row.color,
    isDefault: row.is_default === 1,
  };
}

export async function listSubcategories(db: Db): Promise<Subcategory[]> {
  const rows = await db.getAllAsync<SubcategoryRow>(
    'SELECT * FROM subcategories ORDER BY sort_order, name'
  );
  return rows.map(rowToSubcategory);
}

export async function listSubcategoriesByCategory(
  db: Db,
  categoryId: string
): Promise<Subcategory[]> {
  const rows = await db.getAllAsync<SubcategoryRow>(
    'SELECT * FROM subcategories WHERE category_id = ? ORDER BY sort_order, name',
    [categoryId]
  );
  return rows.map(rowToSubcategory);
}

export async function insertSubcategory(
  db: Db,
  sub: Subcategory,
  sortOrder: number
): Promise<void> {
  await db.runAsync(
    `INSERT INTO subcategories (id, category_id, name, icon, color, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sub.id, sub.categoryId, sub.name, sub.icon, sub.color, sub.isDefault ? 1 : 0, sortOrder]
  );
}

export async function updateSubcategory(db: Db, sub: Subcategory): Promise<void> {
  await db.runAsync(
    `UPDATE subcategories SET name = ?, icon = ?, color = ? WHERE id = ?`,
    [sub.name, sub.icon, sub.color, sub.id]
  );
}

export async function deleteSubcategory(db: Db, id: string): Promise<void> {
  // ON DELETE SET NULL on transactions.subcategory_id handles the cascade.
  await db.runAsync('DELETE FROM subcategories WHERE id = ?', [id]);
}

export async function reorderSubcategories(
  db: Db,
  orderedIds: string[]
): Promise<void> {
  await db.withTransaction(async txn => {
    for (let i = 0; i < orderedIds.length; i++) {
      await txn.runAsync('UPDATE subcategories SET sort_order = ? WHERE id = ?', [i, orderedIds[i]]);
    }
  });
}
