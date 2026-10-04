import { expect, test } from '@playwright/test';
import { API, collectErrors, createUser, DEMO, login, openTab, uniqueEmail } from './helpers';

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = collectErrors(page);
});
test.afterEach(() => {
  expect(errors, 'erros no console/página').toEqual([]);
});

test('US01 — cadastro com nome, e-mail e senha', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('Criar conta', { exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/register$/);

  // Validação na tela antes de chamar a API
  await page.getByRole('button', { name: 'Criar minha conta' }).filter({ visible: true }).click();
  await expect(page.getByText('Informe seu nome').filter({ visible: true })).toBeVisible();

  const email = uniqueEmail('us01');
  await page.getByLabel('Nome completo').filter({ visible: true }).fill('Joana Pereira');
  await page.getByLabel('E-mail').filter({ visible: true }).fill(email);
  await page.getByLabel('Senha').filter({ visible: true }).fill('fraca');
  await page.getByRole('button', { name: 'Criar minha conta' }).filter({ visible: true }).click();
  await expect(page.getByText('Mínimo de 8 caracteres').filter({ visible: true })).toBeVisible();

  await page.getByLabel('Senha').filter({ visible: true }).fill('MinhaSenha1');
  await page.getByRole('button', { name: 'Criar minha conta' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('Joana', { exact: true }).filter({ visible: true })).toBeVisible();
});

test('US01 — e-mail já cadastrado é avisado no campo', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Nome completo').filter({ visible: true }).fill('Outra Marina');
  await page.getByLabel('E-mail').filter({ visible: true }).fill(DEMO.email);
  await page.getByLabel('Senha').filter({ visible: true }).fill('Senha1234');
  await page.getByRole('button', { name: 'Criar minha conta' }).filter({ visible: true }).click();
  await expect(page.getByText('Este e-mail já tem conta').filter({ visible: true })).toBeVisible();
});

test('US02 — login, senha errada e sessão mantida ao recarregar', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('E-mail').filter({ visible: true }).fill(DEMO.email);
  await page.getByLabel('Senha').filter({ visible: true }).fill('senha-errada1');
  await page.getByRole('button', { name: 'Entrar' }).filter({ visible: true }).click();
  await expect(page.getByText('E-mail ou senha incorretos').filter({ visible: true })).toBeVisible();

  await page.getByLabel('Senha').filter({ visible: true }).fill(DEMO.password);
  await page.getByRole('button', { name: 'Entrar' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText('Marina', { exact: true }).filter({ visible: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Marina', { exact: true }).filter({ visible: true })).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await openTab(page, 'Perfil');
  await page.getByText('Sair da conta').filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login$/);
});

test('US03 — recuperar senha pelo link enviado por e-mail', async ({ page, request }) => {
  const u = await createUser(request, 'Rafa Lima');
  await page.goto('/login');
  await page.getByText('Esqueci minha senha').filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('E-mail').filter({ visible: true }).fill(u.email);
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).filter({ visible: true }).click();
  await expect(page.getByText(/você receberá o link em instantes/).filter({ visible: true })).toBeVisible();

  // Caixa de e-mails de desenvolvimento da API
  const mails = await (await request.get(`${API}/api/v1/dev/emails`)).json();
  const mail = mails.data.find((m: { to: string }) => m.to === u.email);
  expect(mail.subject).toContain('Redefinição de senha');
  const link = mail.text.match(/https?:\/\/\S+token=[a-f0-9]+/)[0] as string;

  await page.goto(link);
  await page.getByLabel('Nova senha', { exact: true }).filter({ visible: true }).fill('Recuperada9');
  await page.getByLabel('Confirme a senha').filter({ visible: true }).fill('Recuperada9');
  await page.getByRole('button', { name: 'Salvar nova senha' }).filter({ visible: true }).click();
  await expect(page.getByText('Senha alterada. Entre com a nova senha.').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para o login' }).filter({ visible: true }).click();
  await login(page, u.email, 'Recuperada9');

  // O mesmo link não funciona duas vezes
  await page.goto(link);
  await page.getByLabel('Nova senha', { exact: true }).filter({ visible: true }).fill('OutraSenha9');
  await page.getByLabel('Confirme a senha').filter({ visible: true }).fill('OutraSenha9');
  await page.getByRole('button', { name: 'Salvar nova senha' }).filter({ visible: true }).click();
  await expect(page.getByText(/Link inválido ou expirado/).filter({ visible: true })).toBeVisible();
});

test('US04 — editar nome e senha', async ({ page, request }) => {
  const u = await createUser(request, 'Carlos Dias');
  await login(page, u.email, u.password);
  await openTab(page, 'Perfil');
  await page.getByRole('button', { name: 'Editar nome e senha' }).filter({ visible: true }).click();

  await page.getByLabel('Nome completo').filter({ visible: true }).fill('Carlos Eduardo Dias');
  await page.getByRole('button', { name: 'Salvar nome' }).filter({ visible: true }).click();
  await expect(page.getByText('Nome atualizado.').filter({ visible: true })).toBeVisible();

  await page.getByLabel('Senha atual').filter({ visible: true }).fill('errada123');
  await page.getByLabel('Nova senha', { exact: true }).filter({ visible: true }).fill('NovaSenha77');
  await page.getByLabel('Confirme a nova senha').filter({ visible: true }).fill('NovaSenha77');
  await page.getByRole('button', { name: 'Trocar senha' }).filter({ visible: true }).click();
  await expect(page.getByText('Senha atual incorreta').filter({ visible: true })).toBeVisible();

  await page.getByLabel('Senha atual').filter({ visible: true }).fill(u.password);
  await page.getByRole('button', { name: 'Trocar senha' }).filter({ visible: true }).click();
  await expect(page.getByText(/Senha alterada/).filter({ visible: true })).toBeVisible();

  await page.goto('/home');
  await expect(page.getByText('Carlos', { exact: true }).filter({ visible: true })).toBeVisible();
  // A nova senha vale no login
  const res = await request.post(`${API}/api/v1/auth/login`, { data: { email: u.email, password: 'NovaSenha77' } });
  expect(res.status()).toBe(200);
});

test('US05/US06 — lista de linhas e busca por número ou nome', async ({ page }) => {
  await login(page, DEMO.email, DEMO.password);
  await openTab(page, 'Linhas');
  await expect(page.getByText('Todas as linhas (9)').filter({ visible: true })).toBeVisible();
  for (const code of ['08', '175', '232', '875', 'E50', 'N10']) {
    await expect(page.getByRole('button', { name: new RegExp(`^Linha ${code},`) }).filter({ visible: true })).toBeVisible();
  }

  const search = page.getByLabel('Buscar linha').filter({ visible: true });
  await search.fill('232');
  await expect(page.getByText('Resultados para “232” (1)').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Linha 232,/ }).filter({ visible: true })).toBeVisible();

  await search.fill('satelite');
  await expect(page.getByText('Resultados para “satelite” (1)').filter({ visible: true })).toBeVisible();

  await search.fill('175');
  await expect(page.getByText('Resultados para “175” (3)').filter({ visible: true })).toBeVisible();

  await search.fill('xyz');
  await expect(page.getByText('Nenhuma linha encontrada').filter({ visible: true })).toBeVisible();
});

test('US07/US08 — trajeto da linha no mapa e paradas em ordem', async ({ page }) => {
  await login(page, DEMO.email, DEMO.password);
  await openTab(page, 'Linhas');
  await page
    .getByRole('button', { name: /^Linha 175,/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByText('175 · Terminal → Vila Ema').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('12 paradas').filter({ visible: true })).toBeVisible();

  // Mapa Leaflet: trajeto (polilinha) e paradas desenhados
  const map = page.frameLocator('iframe[title="Mapa"]').first();
  await expect(map.locator('.leaflet-container')).toBeVisible();
  await expect(map.locator('path.leaflet-interactive')).not.toHaveCount(0);
  expect(await map.locator('path.leaflet-interactive').count()).toBeGreaterThanOrEqual(12);
  await expect(map.locator('.pin')).toHaveCount(2); // início e fim

  // Lista de paradas da linha
  await expect(page.getByRole('button', { name: /^Terminal Central, / }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Vila Ema \(final\), / }).filter({ visible: true })).toBeVisible();
});

test('US08 — lista de pontos de parada, busca e ordenação', async ({ page }) => {
  await login(page, DEMO.email, DEMO.password);
  await openTab(page, 'Paradas');
  await expect(page.getByText('69 pontos').filter({ visible: true })).toBeVisible();
  // Perto de mim: o mais próximo da localização simulada vem primeiro
  await expect(
    page
      .getByRole('button', { name: /^Parada / })
      .filter({ visible: true })
      .first(),
  ).toContainText(' m');

  await page.getByRole('button', { name: 'A–Z' }).filter({ visible: true }).click();
  await expect(
    page
      .getByRole('button', { name: /^Parada / })
      .filter({ visible: true })
      .first(),
  ).toContainText('Aeroporto');

  await page.getByLabel('Buscar parada').filter({ visible: true }).fill('matriz');
  await expect(page.getByText('1 pontos').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parada Praça da Matriz' }).filter({ visible: true })).toBeVisible();
});

test('US09 — linhas que passam na parada e horários previstos', async ({ page }) => {
  await login(page, DEMO.email, DEMO.password);
  await openTab(page, 'Paradas');
  await page.getByLabel('Buscar parada').filter({ visible: true }).fill('Terminal Central');
  await page.getByRole('button', { name: 'Parada Terminal Central' }).filter({ visible: true }).click();
  await expect(page.getByText(/linhas passam aqui/).filter({ visible: true })).toBeVisible();

  const l175 = page.getByRole('button', { name: /^Linha 175: próximo às \d\d:\d\d/ }).filter({ visible: true });
  await expect(l175).toBeVisible();
  await l175.click();
  await expect(page.getByText(/Horários previstos neste ponto \(\d+\)/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('05:00', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.getByText('Ver trajeto da linha 175 →').filter({ visible: true }).click();
  await expect(page.getByText('175 · Terminal → Vila Ema').filter({ visible: true })).toBeVisible();
});

test('US10 — minha localização no mapa', async ({ page }) => {
  await login(page, DEMO.email, DEMO.password);
  await openTab(page, 'Mapa');
  await expect(page.getByText('Você está aqui').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('-23.18800, -45.88600').filter({ visible: true })).toBeVisible();
  const map = page.frameLocator('iframe[title="Mapa"]').first();
  await expect(map.locator('.me')).toHaveCount(1);
  await expect(page.getByText('Pontos mais próximos').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Centralizar na minha localização' }).filter({ visible: true }).click();

  // Ver o trajeto de uma favorita junto com a localização
  await page.getByRole('button', { name: 'Linha 232' }).filter({ visible: true }).click();
  await expect(page.getByText('Centro → Jd. Satélite').filter({ visible: true }).first()).toBeVisible();
  await expect(map.locator('.me')).toHaveCount(1);
});

test('US10 — sem permissão de localização, o app avisa', async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: [] });
  const page = await ctx.newPage();
  await login(page, DEMO.email, DEMO.password);
  await openTab(page, 'Mapa');
  await expect(page.getByText(/Localização (não permitida|indisponível)/).filter({ visible: true })).toBeVisible();
  await ctx.close();
});

test('US11 — favoritar uma linha e acessá-la depois', async ({ page, request }) => {
  const u = await createUser(request, 'Bia Favoritos');
  await login(page, u.email, u.password);
  await expect(page.getByText('Toque na estrela de uma linha para ela aparecer aqui.').filter({ visible: true })).toBeVisible();

  await openTab(page, 'Linhas');
  await page.getByRole('button', { name: 'Favoritar E50' }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Remover E50 dos favoritos' }).filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: '★ Favoritas' }).filter({ visible: true }).click();
  await expect(page.getByText('Suas favoritas (1)').filter({ visible: true })).toBeVisible();

  // Pela tela da linha também
  await page.getByRole('button', { name: 'Todas' }).filter({ visible: true }).click();
  await page
    .getByRole('button', { name: /^Linha 301,/ })
    .filter({ visible: true })
    .click();
  await page.getByRole('button', { name: 'Favoritar linha' }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' }).filter({ visible: true })).toBeVisible();

  await page.goto('/home');
  await expect(page.getByRole('button', { name: 'Favorita E50' }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favorita 301' }).filter({ visible: true })).toBeVisible();

  // Desfavoritar
  await openTab(page, 'Linhas');
  await page.getByRole('button', { name: 'Remover E50 dos favoritos' }).filter({ visible: true }).click();
  await openTab(page, 'Início');
  await expect(page.getByRole('button', { name: 'Favorita E50' }).filter({ visible: true })).toHaveCount(0);
});

test('US12 — dashboard com resumo de viagens e favoritos', async ({ page, request }) => {
  const u = await createUser(request, 'Davi Dashboard');
  await login(page, u.email, u.password);
  const resumo = page.getByLabel('Resumo de viagens dos últimos 30 dias').filter({ visible: true });
  await expect(resumo).toContainText('0viagens');
  await expect(page.getByText(/Nenhuma viagem ainda/).filter({ visible: true })).toBeVisible();

  // Registra uma viagem na linha 232
  await openTab(page, 'Linhas');
  await page.getByLabel('Buscar linha').filter({ visible: true }).fill('232');
  await page
    .getByRole('button', { name: /^Linha 232,/ })
    .filter({ visible: true })
    .click();
  await page.getByRole('button', { name: 'Favoritar linha' }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Registrar viagem nesta linha' }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Escolher Praça da Matriz' }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Escolher Jd. Satélite' }).filter({ visible: true }).click();
  await expect(page.getByText(/Praça da Matriz → Jd\. Satélite: cerca de/).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar viagem' }).filter({ visible: true }).click();
  await expect(page.getByText(/Viagem registrada: Praça da Matriz → Jd\. Satélite/).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver no início' }).filter({ visible: true }).click();

  await expect(resumo).toContainText('1viagens');
  await expect(page.getByText('Últimos 30 dias · linha mais usada: 232').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Praça da Matriz → Jd. Satélite').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Favorita 232' }).filter({ visible: true })).toBeVisible();
});

test('US12 — dashboard da conta de demonstração', async ({ page }) => {
  await login(page, DEMO.email, DEMO.password);
  await expect(page.getByText('Linhas favoritas').filter({ visible: true })).toBeVisible();
  for (const code of ['175', '232', '875'])
    await expect(page.getByRole('button', { name: `Favorita ${code}` }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Viagens recentes').filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel('Resumo de viagens dos últimos 30 dias').filter({ visible: true })).toContainText('viagens');
});

test('US13 — API responde por HTTPS com HSTS e guarda senha em hash', async ({ request }) => {
  const https = await request.get('https://localhost:3443/api/v1/health');
  expect(https.status()).toBe(200);
  expect((await https.json()).data.https).toBe(true);
  expect(https.headers()['strict-transport-security']).toContain('max-age=31536000');

  const reg = await request.post(`${API}/api/v1/auth/register`, {
    data: { name: 'Hash', email: uniqueEmail('us13'), password: 'Senha123' },
  });
  const body = JSON.stringify(await reg.json());
  expect(body).not.toContain('Senha123');
  expect(body).not.toContain('password');
});
