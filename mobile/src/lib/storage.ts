import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Token de sessão: armazenamento seguro do sistema (Keystore/Keychain); na web, localStorage. */
export const secure = {
  async get(key: string): Promise<string | null> {
    try {
      return Platform.OS === 'web' ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string | null): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (value == null) await AsyncStorage.removeItem(key);
        else await AsyncStorage.setItem(key, value);
      } else if (value == null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value);
    } catch {
      /* sem armazenamento seguro: a sessão fica só em memória */
    }
  },
};
