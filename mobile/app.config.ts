import type { ExpoConfig } from 'expo/config';

const isProd = process.env.APP_ENV === 'production';

/**
 * Mobilidade Urbana — Sprint 1.
 * Roda no Android Studio (projeto nativo em `android/`, emulador ou celular), no Expo Go e no navegador.
 * React Native 0.86 exige Android 7.0 (API 24) ou mais novo.
 */
const config: ExpoConfig = {
  name: 'Mobilidade Urbana',
  slug: 'mobilidade-urbana',
  scheme: 'mobilidade',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  android: {
    package: 'app.mobilidade.urbana',
    adaptiveIcon: {
      backgroundColor: '#1B4F72',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },
  ios: { bundleIdentifier: 'app.mobilidade.urbana', supportsTablet: false },
  web: { favicon: './assets/favicon.png', bundler: 'metro', name: 'Mobilidade Urbana', themeColor: '#1B4F72' },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: 'Usamos sua localização para mostrar onde você está no mapa e os pontos mais próximos.' }],
    ['expo-splash-screen', { backgroundColor: '#1B4F72', image: './assets/icon.png', imageWidth: 120 }],
    // Em desenvolvimento a API local roda em HTTP (10.0.2.2:3333); em produção só HTTPS (US13)
    ['expo-build-properties', { android: { usesCleartextTraffic: !isProd } }],
    // Assinatura de release pelas propriedades do Gradle (sem elas, usa a keystore de debug)
    './plugins/with-release-signing.js',
    // Windows: encurta o caminho do build nativo (limite de 260 caracteres)
    './plugins/with-short-native-path.js',
    // Java 17 para o Gradle (o Android Studio novo traz Java 25, que quebra o Gradle sync do React Native)
    './plugins/with-gradle-daemon-jdk.js',
  ],
  experiments: { typedRoutes: false },
  extra: {
    // Vazio = descobre sozinho (mesmo computador do Metro, porta 3333). Ver src/lib/api.ts
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  },
};

export default config;
