import AsyncStorage from '@react-native-async-storage/async-storage';

const INDEXED_HISTORY_KEY = '@xuwallet/indexed-history-opt-in';

export async function isIndexedHistoryEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INDEXED_HISTORY_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setIndexedHistoryEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(INDEXED_HISTORY_KEY, enabled ? 'true' : 'false');
}
