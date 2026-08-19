import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

import { applyMigrations } from './schema';
import { Db } from './types';

export const DATABASE_NAME = 'mercury.db';

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
 * The only real work is choosing a transaction implementation.
 * `withExclusiveTransactionAsync` throws outright on web ("not supported on
 * web" — the WASM backend has no second connection to be exclusive against),
 * so web gets `withTransactionAsync`. Native keeps the exclusive variant,
 * where it genuinely matters: the Android widget's headless task opens its own
 * connection to the same file, and serialising writes is what stops a widget
 * tap and an app write from clobbering each other.
 */
function adapt(raw: SQLite.SQLiteDatabase): Db {
  const db: Db = {
    execAsync: source => raw.execAsync(source),
    runAsync: (source, params = []) => raw.runAsync(source, params),
    getFirstAsync: (source, params = []) => raw.getFirstAsync(source, params),
    getAllAsync: (source, params = []) => raw.getAllAsync(source, params),
    getEachAsync: (source, params = []) => raw.getEachAsync(source, params),
    withTransaction: task =>
      Platform.OS === 'web'
        ? raw.withTransactionAsync(() => task(db))
        : raw.withExclusiveTransactionAsync(() => task(db)),
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
  return db;
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
