import { expect, test } from '@playwright/test';
import { API, collectErrors, createUser, login, openTab } from './helpers';

/** Tentativas de "quebrar" o app como um usuário faria (bugs encontrados e corrigidos). */
let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = collectErrors(page);
});
test.afterEach(() => {
  expect(errors, 'erros no console/página').toEqual([]);
});

test('telas da conta exigem login, mesmo abrindo o endereço direto', async ({ page }) => {
  for (const path of ['/account', '/lines/2/trip', '/home', '/profile']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('endereços com ids inválidos mostram mensagem, sem quebrar', async ({ page }) => {
  await page.goto('/lines/abc');
  await expect(page.getByText('Linha não encontrada ou sem conexão.').filter({ visible: true })).toBeVisible();
  await page.goto('/stops/99999999999');
  await expect(page.getByText('Ponto não encontrado.').filter({ visible: true })).toBeVisible();
  await page.goto('/rota-que-nao-existe');
  await expect(page.getByText('Essa página não existe').filter({ visible: true })).toBeVisible();
});

test('link de redefinição quebrado ou inventado é recusado com mensagem clara', async ({ page }) => {
  await page.goto('/reset-password?token=abc');
  await expect(page.getByText('Link inválido. Peça um novo link de recuperação.').filter({ visible: true })).toBeVisible();
  await page.goto(`/reset-password?token=${'a'.repeat(64)}`);
  await page.getByLabel('Nova senha', { exact: true }).filter({ visible: true }).fill('Senha1234');
  await page.getByLabel('Confirme a senha').filter({ visible: true }).fill('Senha1234');
  await page.getByRole('button', { name: 'Salvar nova senha' }).filter({ visible: true }).click();
  await expect(page.getByText('Link inválido ou expirado. Peça um novo.').filter({ visible: true })).toBeVisible();
});

test('duplo clique no cadastro cria uma conta só; nome invisível é recusado', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/auth/register') && posts.push(r.url()));
  await page.goto('/register');
  const field = (l: string) => page.getByLabel(l, { exact: true }).filter({ visible: true });
  await field('Nome completo').fill('​​');
  await field('E-mail').fill(`duplo.${Date.now()}@teste.com`);
  await field('Senha').fill('Senha1234');
  await page.getByRole('button', { name: 'Criar minha conta' }).filter({ visible: true }).click();
  await expect(page.getByText('Informe seu nome').filter({ visible: true })).toBeVisible();
  expect(posts).toHaveLength(0);

  await field('Nome completo').fill('Dupla Clique');
  await page.getByRole('button', { name: 'Criar minha conta' }).filter({ visible: true }).dblclick();
  await expect(page).toHaveURL(/\/home$/);
  expect(posts).toHaveLength(1);
  // Logado, a tela de login volta para o início
  await page.goto('/login');
  await expect(page).toHaveURL(/\/home$/);
});

test('duplo clique em "Confirmar viagem" registra uma viagem só', async ({ page, request }) => {
  const u = await createUser(request, 'Viagem Única');
  await login(page, u.email, u.password);
  const lines = await (await request.get(`${API}/api/v1/lines?q=232`)).json();
  await page.goto(`/lines/${lines.data[0].id}/trip`);
  await page.getByRole('button', { name: 'Escolher Praça da Matriz' }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Escolher Jd. Satélite' }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Confirmar viagem' }).filter({ visible: true }).dblclick();
  await expect(page.getByText(/Viagem registrada/).filter({ visible: true })).toBeVisible();
  const trips = await (await request.get(`${API}/api/v1/me/trips`, { headers: { Authorization: `Bearer ${u.token}` } })).json();
  expect(trips.data).toHaveLength(1);
});

test('vários toques rápidos na estrela terminam iguais na tela e no servidor', async ({ page, request }) => {
  const u = await createUser(request, 'Estrela Nervosa');
  await login(page, u.email, u.password);
  await openTab(page, 'Linhas');
  const star = page.getByRole('button', { name: /^(Favoritar 301|Remover 301 dos favoritos)$/ }).filter({ visible: true });
  for (let i = 0; i < 5; i++) await star.click();
  await page.waitForTimeout(2500);
  const favs = await (await request.get(`${API}/api/v1/me/favorites`, { headers: { Authorization: `Bearer ${u.token}` } })).json();
  const onServer = favs.data.some((l: { code: string }) => l.code === '301');
  await expect(star).toHaveAttribute('aria-label', onServer ? 'Remover 301 dos favoritos' : 'Favoritar 301');
});

test('linha desativada não pode ser favoritada nem receber viagem', async ({ page, request }) => {
  const u = await createUser(request, 'Linha Parada');
  await login(page, u.email, u.password);
  const inactive = (await (await request.get(`${API}/api/v1/lines?includeInactive=true&q=014`)).json()).data[0];
  await page.goto(`/lines/${inactive.id}`);
  await expect(page.getByText('Linha desativada: não circula no momento.').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favoritar linha' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar viagem nesta linha' })).toHaveCount(0);
});

test('senha trocada em outro aparelho encerra esta sessão', async ({ page, request }) => {
  const u = await createUser(request, 'Dois Aparelhos');
  await login(page, u.email, u.password);
  await request.post(`${API}/api/v1/me/password`, {
    headers: { Authorization: `Bearer ${u.token}` },
    data: { currentPassword: u.password, newPassword: 'OutraSenha9' },
  });
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});

test('busca não aceita texto maior que o limite', async ({ page, request }) => {
  const u = await createUser(request, 'Busca Longa');
  await login(page, u.email, u.password);
  await openTab(page, 'Linhas');
  const search = page.getByLabel('Buscar linha').filter({ visible: true });
  await search.fill('x'.repeat(100));
  expect((await search.inputValue()).length).toBe(60);
  await expect(page.getByText('Nenhuma linha encontrada').filter({ visible: true })).toBeVisible();
});

test('caixa de e-mails de desenvolvimento só abre no próprio computador', async ({ request }) => {
  // pelo localhost abre (é o caso dos testes); a regra de rede está coberta nos testes da API
  expect((await request.get(`${API}/dev/emails`)).status()).toBe(200);
});
