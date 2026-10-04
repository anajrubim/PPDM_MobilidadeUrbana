import { defineConfig } from '@playwright/test';

/**
 * Testes ponta a ponta do app (versão web) contra a API real.
 * Antes: banco + API (npm run dev na raiz) e o app web (porta 8081).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:8081',
    viewport: { width: 390, height: 844 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Perto do Terminal Central (rede de demonstração em São José dos Campos)
    geolocation: { latitude: -23.188, longitude: -45.886 },
    permissions: ['geolocation'],
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Usa o Chrome instalado se PW_CHANNEL=chrome; senão o Chromium do Playwright (ou CHROMIUM_PATH)
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
});
