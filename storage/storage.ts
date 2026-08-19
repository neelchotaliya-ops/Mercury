import AsyncStorage from '@react-native-async-storage/async-storage';
import { FinanceState } from '@/types/finance';

const STORAGE_KEY = 'mercury_finance_data_v1';

export type PersistedFinanceState = Omit<FinanceState, 'isLoaded'>;

export async function loadFinanceState(): Promise<PersistedFinanceState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedFinanceState;
  } catch (e) {
    console.warn('Failed to load finance state', e);
    return null;
  }
}

/**
 * Why a save can fail, and why that must not be swallowed.
 *
 * AsyncStorage on Android is backed by SQLite with a size cap — 6 MB by
 * default, raised to 50 MB by `plugins/with-async-storage-size.js`. Once the
 * ledger outgrows whatever the cap is, `setItem` throws and every subsequent
 * write throws with it: the app keeps running on in-memory state that is never
 * persisted, and the user loses everything entered since the ceiling was hit,
 * silently, on next launch.
 *
 * This used to `console.warn` and return, which is exactly why the failure was
 * invisible. The caller now gets the error and is responsible for telling the
 * user, because a storage failure in a finance app is not a log line — it is
 * the most important thing happening on the device.
 */
export class StorageWriteError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      'Could not save your data. Your device may be out of space, or the ledger may have outgrown its storage limit.'
    );
    this.name = 'StorageWriteError';
    this.cause = cause;
  }
}

export async function saveFinanceState(state: PersistedFinanceState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save finance state', e);
    throw new StorageWriteError(e);
  }
}
