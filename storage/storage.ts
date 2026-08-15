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

export async function saveFinanceState(state: PersistedFinanceState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save finance state', e);
  }
}
