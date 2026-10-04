import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:3333';
export const DEMO = { email: 'marina@email.com', password: 'Senha@123' };

export const uniqueEmail = (tag: string) => `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@teste.com`;

/** Cria uma conta direto pela API (mais rápido que pela tela). */
export async function createUser(request: APIRequestContext, name = 'Teste E2E', password = 'Senha123') {
  const email = uniqueEmail('e2e');
  const res = await request.post(`${API}/api/v1/auth/register`, { data: { name, email, password } });
  expect(res.status()).toBe(201);
  return { email, password, name, token: (await res.json()).data.token as string };
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').filter({ visible: true }).fill(email);
  await page.getByLabel('Senha').filter({ visible: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/home$/);
}

export async function openTab(page: Page, name: 'Início' | 'Linhas' | 'Mapa' | 'Paradas' | 'Perfil') {
  await page.getByRole('tab', { name }).filter({ visible: true }).click();
}

/** Erros de execução da página (ignora tiles do mapa sem internet). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_INTERNET|ERR_NAME/.test(m.text())) errors.push(m.text());
  });
  return errors;
}
