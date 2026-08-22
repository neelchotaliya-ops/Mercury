import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

import { STORAGE_KEY as BLOB_KEY } from '@/storage/storage';

import { applyMigrations, getMeta } from './schema';
import { migrateBlobIntoDb, BlobMigrationResult } from './migrate-from-blob';
import { Db } from './types';

export const DATABASE_NAME = 'mercury.db';

const BLOB_BACKUP_KEY = `${BLOB_KEY}_backup`;
const BLOB_QUARANTINE_KEY = `${BLOB_KEY}_quarantine`;

/**
 * The one place in the app that imports `expo-sqlite`.
 *
 * Everything else under `db/` takes a `Db` and stays engine-agnostic, which is
 * what lets the identical SQL run under `node:sqlite` in tests. Keep it that
 * way: an `expo-sqlite` import anywhere else makes that module untestable
 * without a device.
 *
 * This module deliberately imports nothing from React. The Android widget runs
 * in a headless JS task with no React tree, and it opens the same database
 * through here.
 */
let openPromise: Promise<Db> | null = null;

/**
 * Wraps an expo-sqlite handle in the narrow `Db` interface.
 *
 * Two things beyond the raw calls: choosing a transaction implementation, and
 * making nested `withTransaction` calls safe.
 *
 * `withExclusiveTransactionAsync` throws outright on web ("not supported on
 * web" — the WASM backend has no second connection to be exclusive against),
 * so web gets `withTransactionAsync`. Native keeps the exclusive variant,
 * where it genuinely matters: the Android widget's headless task opens its own
 * connection to the same file, and serialising writes is what stops a widget
 * tap and an app write from clobbering each other.
 *
 * Nesting: several write-path functions (`updateSettings`, `insertTransaction`,
 * the migration) open their own transaction, and it is entirely normal for
 * one of them to be called from inside another's — the blob migration calls
 * `updateSettings` while its own bulk import transaction is still open, for
 * instance. Neither of expo-sqlite's transaction methods supports that: a
 * nested `withTransactionAsync` on web threw "cannot rollback - no
 * transaction is active" the first time this was actually exercised end to
 * end, confirmed by driving the real migration in a browser rather than
 * trusting the `node:sqlite` test double, whose nesting behaviour turned out
 * to be more forgiving than the real thing. A `depth` counter closed over
 * here makes a nested call just run the task directly against the
 * already-open transaction, the same way `scripts/support/node-db.ts`
 * already handled it — this brings the real adapter in line with that.
 */
function adapt(raw: SQLite.SQLiteDatabase): Db {
  let depth = 0;

  const db: Db = {
    execAsync: source => raw.execAsync(source),
    runAsync: (source, params = []) => raw.runAsync(source, params),
    getFirstAsync: (source, params = []) => raw.getFirstAsync(source, params),
    getAllAsync: (source, params = []) => raw.getAllAsync(source, params),
    getEachAsync: (source, params = []) => raw.getEachAsync(source, params),
    withTransaction: async task => {
      if (depth > 0) {
        depth++;
        try {
          await task(db);
        } finally {
          depth--;
        }
        return;
      }
      depth++;
      try {
        if (Platform.OS === 'web') {
          await raw.withTransactionAsync(() => task(db));
        } else {
          await raw.withExclusiveTransactionAsync(() => task(db));
        }
      } finally {
        depth--;
      }
    },
  };
  return db;
}

async function open(): Promise<Db> {
  const raw = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL is a no-op on the web backend, which reports its own journal mode;
  // the rest apply everywhere.
  await raw.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
  `);

  const db = adapt(raw);
  await applyMigrations(db);
  lastMigrationResult = await runBlobMigration(db);
  return db;
}

/**
 * Reads the old single-key AsyncStorage blob (if any) and imports it, then
 * archives or quarantines the raw bytes depending on the outcome. This is the
 * IO half of the migration — `db/migrate-from-blob.ts` is the pure core and
 * is what the tests exercise; this function is the one place that actually
 * touches `AsyncStorage`.
 *
 * Idempotent: `migrateBlobIntoDb` checks `meta.blob_migration_state` itself
 * and returns immediately on every launch after the first successful one, so
 * this runs on every cold start but is cheap once done.
 */
async function runBlobMigration(db: Db): Promise<BlobMigrationResult> {
  const already = await getMeta(db, 'blob_migration_state');
  if (already === 'done') return { status: 'already-done' };

  let rawBlob: string | null = null;
  try {
    rawBlob = await AsyncStorage.getItem(BLOB_KEY);
  } catch (e) {
    console.warn('Failed to read the legacy data blob for migration', e);
  }

  const result = await migrateBlobIntoDb(db, rawBlob);

  if (result.status === 'migrated' && rawBlob !== null) {
    // Kept for one release as a rollback path, then deleted in a follow-up
    // migration. Never destroyed outright the moment SQLite has the data —
    // if something is subtly wrong with the import, this is what a support
    // flow (or a future "restore pre-SQLite backup" setting) recovers from.
    try {
      await AsyncStorage.setItem(BLOB_BACKUP_KEY, rawBlob);
      await AsyncStorage.removeItem(BLOB_KEY);
    } catch (e) {
      console.warn('Failed to archive the legacy blob after a successful migration', e);
    }
  } else if (result.status === 'failed' && rawBlob !== null) {
    // The blob parsed as something other than valid Mercury data. Quarantine
    // the raw bytes under a different key rather than deleting them — the
    // original is preserved exactly as it was, byte for byte, for recovery.
    try {
      await AsyncStorage.setItem(BLOB_QUARANTINE_KEY, rawBlob);
    } catch (e) {
      console.warn('Failed to quarantine an unreadable legacy blob', e);
    }
  }

  return result;
}

let lastMigrationResult: BlobMigrationResult | null = null;

/**
 * The outcome of the blob migration that ran (or would have run) during the
 * most recent `getDb()` resolution. Settings/onboarding surfaces a recovery
 * banner when this comes back `'failed'` — never `console.warn` and move on,
 * which is the exact failure mode that used to lose user data silently.
 */
export async function getBlobMigrationResult(): Promise<BlobMigrationResult | null> {
  await getDb();
  return lastMigrationResult;
}

/**
 * The shared handle.
 *
 * The promise is created at first call and reused, so concurrent callers on a
 * cold start share one open rather than racing to create several connections.
 *
 * `busy_timeout` is not optional here: the widget's headless runtime opens its
 * own connection to the same file, and without a timeout a concurrent write
 * fails immediately with SQLITE_BUSY instead of waiting its turn.
 */
export function getDb(): Promise<Db> {
  if (!openPromise) {
    openPromise = open().catch(e => {
      // Don't cache a failed open — the next caller should get a fresh attempt
      // rather than the same rejected promise forever.
      openPromise = null;
      throw e;
    });
  }
  return openPromise;
}

/**
 * Flushes the write-ahead log back into the main database file.
 *
 * Worth doing when the app goes to the background: Android's Auto Backup can
 * copy the database file without its `-wal` sidecar, and a restore from such a
 * backup silently loses every write still sitting in the log.
 */
export async function checkpoint(): Promise<void> {
  const db = await getDb();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
}
