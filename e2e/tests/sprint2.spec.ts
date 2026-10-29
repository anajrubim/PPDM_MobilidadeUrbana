import { expect, test, type APIRequestContext } from '@playwright/test';
import { API, collectErrors, createUser, login } from './helpers';

/**
 * Sprint 2 (US15–US29) no app web contra a API real.
 * Antes: banco com seed, API (npm run dev:api) e app web (porta 8081).
 */
let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = collectErrors(page);
  // Confirmações (window.confirm) da versão web: aceita
  page.on('dialog', (d) => void d.accept());
});
test.afterEach(() => {
  if (errors.length) console.log('ERROS:', JSON.stringify(errors).slice(0, 1500));
  expect(errors, 'erros no console/página').toEqual([]);
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function lineId(request: APIRequestContext, code: string): Promise<number> {
  const res = await request.get(`${API}/api/v1/lines?q=${encodeURIComponent(code)}`);
  return (await res.json()).data.find((l: { code: string }) => l.code === code).id;
}
async function stopId(request: APIRequestContext, name: string): Promise<number> {
  const res = await request.get(`${API}/api/v1/stops?q=${encodeURIComponent(name)}&sort=name`);
  return (await res.json()).data.find((s: { name: string }) => s.name === name).id;
}
const visible = <T extends { filter: (o: { visible: boolean }) => T }>(l: T) => l.filter({ visible: true });

test('US15/US26 — planejar viagem com baldeação, ver o tempo estimado e salvar no histórico (US19)', async ({ page, request }) => {
  const u = await createUser(request, 'Paula Planeja');
  await login(page, u.email, u.password);
  // "Para onde vamos?" do início abre o planejador
  await visible(page.getByRole('search', { name: /para onde vamos/i })).click();
  await expect(page).toHaveURL(/\/plan$/);

  const dest = await stopId(request, 'Shopping Colinas');
  await page.goto(`/plan?fromStopId=${await stopId(request, 'Vila Industrial')}&toStopId=${dest}`);
  await expect(visible(page.getByText(/opç(ão|ões) encontrada/))).toBeVisible();
  await expect(visible(page.getByText('Mais rápida')).first()).toBeVisible();
  await expect(visible(page.getByText('1 baldeação')).first()).toBeVisible();
  await expect(visible(page.getByText(/Sair às/)).first()).toBeVisible();

  await visible(page.getByRole('button', { name: 'Ver detalhes da opção' })).first().click();
  await expect(visible(page.getByRole('button', { name: 'Acompanhar ônibus' }))).toBeVisible();
  await visible(page.getByRole('button', { name: 'Salvar no histórico' })).click();
  await expect(visible(page.getByText('Viagem guardada no seu histórico como planejada.'))).toBeVisible();

  await page.goto('/history');
  await expect(visible(page.getByText('Planejada', { exact: true })).first()).toBeVisible();
  await expect(visible(page.getByText('Vila Industrial → Shopping Colinas'))).toBeVisible();
  await visible(page.getByRole('button', { name: 'Marcar como realizada' })).click();
  await expect(visible(page.getByText('Planejada', { exact: true }))).toHaveCount(0);
});

test('US16 — acompanhar o ônibus ao vivo até o ponto', async ({ page, request }) => {
  const u = await createUser(request, 'Vitor Vivo');
  await login(page, u.email, u.password);
  const id = await lineId(request, '175');
  await page.goto(`/lines/${id}`);
  await visible(page.getByRole('button', { name: /Ver ônibus ao vivo/ })).click();
  await expect(page).toHaveURL(new RegExp(`/live/${id}`));
  await expect(visible(page.getByText('PRÓXIMO ÔNIBUS EM'))).toBeVisible();
  await expect(visible(page.getByText(/^\d\d:\d\d$|^\d+h\d\d$/)).first()).toBeVisible();
  await expect(visible(page.getByText(/Ao vivo · \d+ ônibus|Sem conexão/))).toBeVisible();
  // Trocar o ponto de embarque
  await visible(page.getByRole('button', { name: 'Praça da Matriz' })).click();
  await expect(visible(page.getByText(/até o ponto Praça da Matriz/))).toBeVisible();
});

test('US17/US20 — aviso de itinerário numa favorita vira notificação; histórico e preferências', async ({ page, request }) => {
  const u = await createUser(request, 'Nina Notifica');
  const id = await lineId(request, '301');
  await request.put(`${API}/api/v1/me/favorites/${id}`, { headers: auth(u.token) });
  const sim = await request.post(`${API}/api/v1/dev/alerts`, { data: { lineCode: '301', kind: 'detour', durationMin: 30 } });
  expect(sim.status()).toBe(201);

  await login(page, u.email, u.password);
  // Sininho com contador e aviso no início
  await expect(visible(page.getByRole('button', { name: /Notificações: \d+ não lidas/ }))).toBeVisible();
  await expect(visible(page.getByText(/Linha 301: Desvio no itinerário/)).first()).toBeVisible();
  await visible(page.getByRole('button', { name: /Notificações: \d+ não lidas/ })).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(visible(page.getByText('Mudança de itinerário · Linha 301')).first()).toBeVisible();

  await visible(page.getByRole('button', { name: 'Marcar todas como lidas' })).click();
  await expect(visible(page.getByText('Nenhum alerta novo'))).toBeVisible();
  await visible(page.getByRole('tab', { name: 'Histórico' })).click();
  await expect(visible(page.getByText('Mudança de itinerário · Linha 301')).first()).toBeVisible();

  await visible(page.getByRole('button', { name: 'Preferências de notificação' })).click();
  await expect(visible(page.getByLabel('Atrasos nas favoritas'))).toBeVisible();
  await visible(page.getByLabel('Atrasos nas favoritas')).click();
  await expect.poll(async () => (await (await request.get(`${API}/api/v1/me/notification-settings`, { headers: auth(u.token) })).json()).data.delays).toBe(false);
});

test('US18 — criar alerta de proximidade a partir do ponto', async ({ page, request }) => {
  const u = await createUser(request, 'Alice Alerta');
  await login(page, u.email, u.password);
  const id = await lineId(request, '175');
  const stop = await stopId(request, 'Praça da Matriz');
  await page.goto(`/alerts/new?lineId=${id}&stopId=${stop}`);
  await visible(page.getByRole('button', { name: '10 min' })).click();
  await visible(page.getByRole('button', { name: 'Manhã (6h–10h)' })).click();
  await visible(page.getByRole('button', { name: 'Criar alerta' })).click();
  await expect(visible(page.getByText(/Avisamos quando a linha 175 estiver a 10 min de Praça da Matriz/))).toBeVisible();
  await visible(page.getByRole('button', { name: 'Ver meus alertas' })).click();
  await expect(visible(page.getByText(/Avisa 10 min antes · 06:00–10:00/))).toBeVisible();
  await visible(page.getByLabel(/^Desativar alerta/)).click();
  await expect.poll(async () => (await (await request.get(`${API}/api/v1/me/alerts`, { headers: auth(u.token) })).json()).data[0].active).toBe(false);
});

test('US21/US22 — avaliar a linha com nota e comentário e ver a média', async ({ page, request }) => {
  const u = await createUser(request, 'Rui Avalia');
  await login(page, u.email, u.password);
  const id = await lineId(request, 'E50');
  await page.goto(`/lines/${id}`);
  await visible(page.getByRole('button', { name: 'Avaliações da linha' })).click();
  await expect(page).toHaveURL(new RegExp(`/lines/${id}/rate`));
  await visible(page.getByRole('button', { name: '4 estrelas' })).click();
  await expect(visible(page.getByText('Boa', { exact: true }))).toBeVisible();
  await visible(page.getByLabel('Comentário (opcional)')).fill('Confortável e pontual no teste E2E');
  await visible(page.getByRole('button', { name: 'Enviar avaliação' })).click();
  await expect(visible(page.getByText(/Obrigado! Sua avaliação foi registrada/))).toBeVisible();
  const r = await (await request.get(`${API}/api/v1/lines/${id}/ratings`, { headers: auth(u.token) })).json();
  expect(r.data.mine).toMatchObject({ score: 4, comment: 'Confortável e pontual no teste E2E' });
  expect(r.data.summary.count).toBeGreaterThan(0);
});

test('US23/US25 — denunciar com protocolo; US24 — ver e apoiar denúncias de outros', async ({ page, request }) => {
  const u = await createUser(request, 'Davi Denuncia');
  await login(page, u.email, u.password);
  const id = await lineId(request, '08');
  const text = `Muito cheio no teste E2E ${Date.now()}`;
  await page.goto(`/lines/${id}/report`);
  await visible(page.getByRole('radio', { name: 'Superlotação' })).click();
  await visible(page.getByLabel('Detalhes (opcional)')).fill(text);
  await visible(page.getByRole('button', { name: 'Enviar denúncia' })).click();
  await expect(visible(page.getByText('Recebemos sua denúncia'))).toBeVisible();
  await expect(visible(page.getByLabel(/Protocolo DEN-\d{4}-\d{6}/))).toBeVisible();
  await visible(page.getByRole('button', { name: 'Ver denúncias da linha' })).click();
  await expect(visible(page.getByText(text))).toBeVisible();
  await expect(visible(page.getByText(/sua denúncia/)).first()).toBeVisible();

  // Outra pessoa vê (sem saber quem foi) e confirma
  const other = await createUser(request, 'Olga Outra');
  await page.getByRole('button', { name: 'Voltar' }).filter({ visible: true }).first().click().catch(() => undefined);
  await page.evaluate(() => localStorage.clear());
  await login(page, other.email, other.password);
  await page.goto(`/lines/${id}/reports`);
  const card = visible(page.getByText(text));
  await expect(card).toBeVisible();
  await visible(page.getByRole('button', { name: 'Também passei por isso' })).first().click();
  await expect(visible(page.getByText('Você também relatou')).first()).toBeVisible();
});

test('US29 — compartilhar localização: link público mostra a posição', async ({ page, request, context }) => {
  await context.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write']);
  const u = await createUser(request, 'Sara Compartilha');
  await login(page, u.email, u.password);
  const id = await lineId(request, '175');
  const dest = (await (await request.get(`${API}/api/v1/lines/${id}`)).json()).data.stops.at(-1).id;
  await page.goto(`/share?lineId=${id}&destStopId=${dest}`);
  await visible(page.getByRole('button', { name: '1 h' })).click();
  const created = page.waitForResponse((r) => r.url().endsWith('/me/shares') && r.request().method() === 'POST');
  await visible(page.getByRole('button', { name: 'Compartilhar agora' })).click();
  const share = (await (await created).json()).data;
  expect(share.url).toMatch(/\/s\/[A-Za-z0-9_-]{32}$/);
  await expect(visible(page.getByText(/Link copiado|Compartilhamento ativo/))).toBeVisible();
  await expect(visible(page.getByText('Compartilhamentos ativos'))).toBeVisible();

  const pub = await context.newPage();
  await pub.goto(share.url);
  await expect(pub.getByText('Sara C. está compartilhando a localização')).toBeVisible();
  await expect(pub.getByText(/chegada prevista às \d\d:\d\d/)).toBeVisible();
  await pub.close();

  await visible(page.getByRole('button', { name: 'Parar' })).click();
  await expect(visible(page.getByText('Compartilhamentos ativos'))).toHaveCount(0);
});

test('US27 — baixar a rede e consultar linhas e horários sem internet', async ({ page, request, context }) => {
  const u = await createUser(request, 'Otto Offline');
  await login(page, u.email, u.password);
  await page.goto('/offline');
  await visible(page.getByRole('button', { name: 'Baixar linhas e horários' })).click();
  await expect(visible(page.getByText(/\d+ linhas e \d+ pontos com horários salvos no aparelho/))).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  // Navegação dentro do app (sem recarregar a página, que precisaria da rede)
  await visible(page.getByRole('button', { name: 'Voltar' })).first().click();
  await visible(page.getByRole('tab', { name: 'Linhas' })).click();
  // Busca sem acento, feita no aparelho sobre a lista salva
  await visible(page.getByLabel('Buscar linha')).fill('satelite');
  await expect(visible(page.getByText('Sem conexão — mostrando os dados salvos no aparelho'))).toBeVisible({ timeout: 20_000 });
  await expect(visible(page.getByText('Centro → Jd. Satélite')).first()).toBeVisible();
  await visible(page.getByRole('button', { name: /^Linha 232,/ })).click();
  await expect(visible(page.getByText(/pela programação, sem internet/))).toBeVisible();
  // A conexão volta: o app percebe sozinho (testa a API a cada 15 s) e a faixa some
  await context.setOffline(false);
  await expect(visible(page.getByText('Sem conexão — mostrando os dados salvos no aparelho'))).toHaveCount(0, { timeout: 30_000 });
});
