/* eslint-disable no-undef */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Notificações do sistema (US17): sem módulo nativo nos testes
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[teste]' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  dismissAllNotificationsAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  AndroidImportance: { HIGH: 4 },
}));

// Navegação (expo-router): nos testes de lógica a "tela" está sempre em foco
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useSegments: () => [],
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));
