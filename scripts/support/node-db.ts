import { DatabaseSync } from 'node:sqlite';

import { Db, SqlParams, SqlRunResult } from '../../db/types';

/**
 * A `Db` backed by Node's built-in SQLite, for tests.
 *
 * Node 22.5+ ships `node:sqlite`, so the same statements the device runs can
 * be exercised in a plain `tsx` script with no new dependency and no native
 * build step — `better-sqlite3` would have meant a prebuild fetch or a compile
 * for the same C library.
 *
 * The real `expo-sqlite` handle is async and this one is sync; wrapping the
 * sync calls in resolved promises satisfies the same interface, which is the
 * whole point of keeping `Db` narrow.
 */
class NodeDb implements Db {
  constructor(private readonly raw: DatabaseSync) {}

  async execAsync(source: string): Promise<void> {
    this.raw.exec(source);
  }

  async runAsync(source: string, params: SqlParams = []): Promise<SqlRunResult> {
    const result = this.raw.prepare(source).run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getFirstAsync<T>(source: string, params: SqlParams = []): Promise<T | null> {
    const row = this.raw.prepare(source).get(...params);
    return (row as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, params: SqlParams = []): Promise<T[]> {
    return this.raw.prepare(source).all(...params) as T[];
  }

  async *getEachAsync<T>(source: string, params: SqlParams = []): AsyncIterableIterator<T> {
    for (const row of this.raw.prepare(source).all(...params) as T[]) {
      yield row;
    }
  }

  /**
   * `node:sqlite` has no transaction helper, so this drives BEGIN/COMMIT
   * directly. Nested calls reuse the outer transaction rather than failing on
   * SQLite's lack of nested BEGIN — `applyMigrations` runs inside one, and the
   * write helpers it calls each want one too.
   */
  async withTransaction(task: (txn: Db) => Promise<void>): Promise<void> {
    if (this.raw.isTransaction) {
      await task(this);
      return;
    }
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.raw.exec('COMMIT');
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Opens an in-memory database with the same pragmas the app uses. */
export function openTestDb(): Db {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  return new NodeDb(raw);
}
