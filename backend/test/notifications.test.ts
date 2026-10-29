import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DELAY_THRESHOLD_MIN } from '../src/modules/realtime/monitor.js';
import { insertServiceAlert } from '../src/modules/realtime/service-alerts.js';
import { notify } from '../src/modules/notifications/service.js';
import { noPush } from '../src/modules/notifications/push.js';
import { auth, FIXED_NOW, lineId, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);
const minutes = (n: number) => new Date(FIXED_NOW.getTime() + n * 60_000);

async function favorite(token: string, code: string) {
  await api().put(`/api/v1/me/favorites/${await lineId(ctx, code)}`).set(auth(token)).expect(200);
}
const list = async (token: string, q = '') => (await api().get(`/api/v1/me/notifications${q}`).set(auth(token)).expect(200)).body.data;

describe('US17 — notificações de atrasos e mudanças de itinerário', () => {
  it('aviso de itinerário na linha favorita gera uma notificação (uma vez só) e o push', async () => {
    const { token, id } = await registerAndLogin(ctx);
    await favorite(token, '08');
    await api().put('/api/v1/me/devices').set(auth(token)).send({ token: 'ExponentPushToken[abc123xyz]', platform: 'android' }).expect(204);
    await insertServiceAlert(ctx.deps.db, {
      lineId: await lineId(ctx, '08'),
      kind: 'detour',
      title: 'Desvio na Av. Brasil',
      message: 'Obra na via até as 14h',
      startsAt: minutes(60),
      endsAt: minutes(300),
    });
    ctx.app.services.alerts.invalidate();
    const first = await ctx.app.services.monitor.tick();
    expect(first.serviceAlerts).toBe(1);
    const again = await ctx.app.services.monitor.tick();
    expect(again.serviceAlerts).toBe(0);

    const d = await list(token);
    const alert = d.items.find((n: { type: string }) => n.type === 'service_alert');
    expect(alert).toMatchObject({ title: 'Mudança de itinerário · Linha 08', read: false, lineId: await lineId(ctx, '08') });
    expect(alert.body).toContain('Desvio na Av. Brasil');
    expect(ctx.pushes.some((p) => p.tokens.includes('ExponentPushToken[abc123xyz]') && p.msg.title.includes('Linha 08'))).toBe(true);
    // Outra conta, sem a favorita, não recebe nada
    const other = await registerAndLogin(ctx, { email: 'outra@email.com' });
    expect((await list(other.token)).items).toEqual([]);
    expect(id).toBeTruthy();
  });

  it('aviso que começa daqui a mais de 12 h ainda não notifica', async () => {
    const { token } = await registerAndLogin(ctx);
    await favorite(token, '232');
    await insertServiceAlert(ctx.deps.db, { lineId: await lineId(ctx, '232'), kind: 'detour', title: 'Obra', message: 'x', startsAt: minutes(20 * 60), endsAt: minutes(26 * 60) });
    ctx.app.services.alerts.invalidate();
    expect((await ctx.app.services.monitor.tick()).serviceAlerts).toBe(0);
  });

  it(`atraso de ${DELAY_THRESHOLD_MIN}+ min numa favorita avisa no máximo uma vez por hora`, async () => {
    const { token } = await registerAndLogin(ctx);
    await favorite(token, '175');
    // Atraso anunciado garante ônibus atrasados agora
    await insertServiceAlert(ctx.deps.db, {
      lineId: await lineId(ctx, '175'),
      kind: 'delay',
      title: 'Trânsito',
      message: 'Lento',
      extraDelayMin: 9,
      startsAt: minutes(-90),
      endsAt: minutes(120),
    });
    ctx.app.services.alerts.invalidate();
    const t = await ctx.app.services.monitor.tick();
    expect(t.delays).toBe(1);
    expect((await ctx.app.services.monitor.tick()).delays).toBe(0);
    const delay = (await list(token, '?type=delay')).items[0];
    expect(delay.title).toBe('Linha 175 atrasada');
    expect(delay.body).toMatch(/cerca de \d+ min de atraso/);
    expect(delay.data.delayMin).toBeGreaterThanOrEqual(DELAY_THRESHOLD_MIN);
    // Uma hora depois, se continuar atrasada, avisa de novo
    ctx.now.value = minutes(61);
    expect((await ctx.app.services.monitor.tick()).delays).toBe(1);
  });

  it('respeita as preferências de notificação', async () => {
    const { token } = await registerAndLogin(ctx);
    await favorite(token, '175');
    const prefs = await api().get('/api/v1/me/notification-settings').set(auth(token)).expect(200);
    expect(prefs.body.data).toEqual({ delays: true, serviceAlerts: true, proximity: true });
    const off = await api().patch('/api/v1/me/notification-settings').set(auth(token)).send({ delays: false, serviceAlerts: false }).expect(200);
    expect(off.body.data).toEqual({ delays: false, serviceAlerts: false, proximity: true });
    await api().patch('/api/v1/me/notification-settings').set(auth(token)).send({ outra: true }).expect(422);
    await insertServiceAlert(ctx.deps.db, {
      lineId: await lineId(ctx, '175'),
      kind: 'delay',
      title: 'Trânsito',
      message: 'Lento',
      extraDelayMin: 9,
      startsAt: minutes(-90),
      endsAt: minutes(120),
    });
    ctx.app.services.alerts.invalidate();
    const t = await ctx.app.services.monitor.tick();
    expect(t).toEqual({ serviceAlerts: 0, delays: 0, proximity: 0 });
  });
});

describe('US18 — alertas de proximidade do ônibus', () => {
  async function terminal175() {
    const id = await lineId(ctx, '175');
    const l = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data;
    return { lineId: id, stop: l.stops[0] };
  }

  it('cria, lista, edita e apaga alertas; avisa quando o ônibus está a N minutos', async () => {
    const { token } = await registerAndLogin(ctx);
    const { lineId: id, stop } = await terminal175();
    const created = await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: stop.id, minutesBefore: 5 }).expect(201);
    const a = created.body.data;
    expect(a).toMatchObject({ line: { code: '175' }, stop: { id: stop.id }, minutesBefore: 5, active: true, windowStart: null });
    // Próxima partida do terminal: 09:12 (12 min) — ainda não avisa
    expect(a.nextArrival).toMatchObject({ scheduledAt: '09:12' });
    expect((await ctx.app.services.monitor.tick()).proximity).toBe(0);
    // 09:08: faltam 4 min → avisa uma vez
    ctx.now.value = minutes(8);
    expect((await ctx.app.services.monitor.tick()).proximity).toBe(1);
    expect((await ctx.app.services.monitor.tick()).proximity).toBe(0);
    const n = (await list(token, '?type=proximity')).items[0];
    expect(n).toMatchObject({ title: 'Linha 175 chegando', stopId: stop.id });
    expect(n.body).toContain(stop.name);

    // Criar de novo para a mesma linha+parada atualiza (200)
    const upd = await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: stop.id, minutesBefore: 10 }).expect(200);
    expect(upd.body.data.id).toBe(a.id);
    expect(upd.body.data.minutesBefore).toBe(10);

    const patched = await api().patch(`/api/v1/me/alerts/${a.id}`).set(auth(token)).send({ active: false, windowStart: '07:00', windowEnd: '08:30' }).expect(200);
    expect(patched.body.data).toMatchObject({ active: false, windowStart: '07:00', windowEnd: '08:30' });
    expect((await api().get('/api/v1/me/alerts').set(auth(token)).expect(200)).body.data).toHaveLength(1);
    await api().delete(`/api/v1/me/alerts/${a.id}`).set(auth(token)).expect(204);
    await api().delete(`/api/v1/me/alerts/${a.id}`).set(auth(token)).expect(404);
  });

  it('fora da janela de horário não avisa', async () => {
    const { token } = await registerAndLogin(ctx);
    const { lineId: id, stop } = await terminal175();
    await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: stop.id, minutesBefore: 30, windowStart: '17:00', windowEnd: '19:00' }).expect(201);
    expect((await ctx.app.services.monitor.tick()).proximity).toBe(0);
  });

  it('valida linha, parada, minutos e janela; não mexe no alerta de outra pessoa', async () => {
    const { token } = await registerAndLogin(ctx);
    const { lineId: id, stop } = await terminal175();
    const e50 = (await api().get(`/api/v1/lines/${await lineId(ctx, 'E50')}`).expect(200)).body.data.stops.at(-1);
    await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: e50.id }).expect(400);
    await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: 99999, stopId: stop.id }).expect(404);
    await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: await lineId(ctx, '014'), stopId: stop.id }).expect(409);
    await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: stop.id, minutesBefore: 0 }).expect(422);
    await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: stop.id, windowStart: '07:00' }).expect(400);
    await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: stop.id, windowStart: '7h', windowEnd: '9h' }).expect(422);
    const mine = await api().post('/api/v1/me/alerts').set(auth(token)).send({ lineId: id, stopId: stop.id }).expect(201);
    const other = await registerAndLogin(ctx, { email: 'b@email.com' });
    await api().patch(`/api/v1/me/alerts/${mine.body.data.id}`).set(auth(other.token)).send({ active: false }).expect(404);
    await api().delete(`/api/v1/me/alerts/${mine.body.data.id}`).set(auth(other.token)).expect(404);
    await api().get('/api/v1/me/alerts').expect(401);
  });
});

describe('US20 — histórico de notificações', () => {
  async function seedNotifications(userId: string, n: number) {
    for (let i = 0; i < n; i++) {
      await notify(ctx.deps.db, noPush, { userId, type: 'system', title: `Aviso ${i}`, body: 'x', at: minutes(i), dedupeKey: `t${i}` });
    }
  }

  it('lista da mais nova para a mais antiga, conta não lidas, marca lidas, apaga e limpa', async () => {
    const { token, id } = await registerAndLogin(ctx);
    await seedNotifications(id, 5);
    let d = await list(token);
    expect(d.unread).toBe(5);
    expect(d.items.map((n: { title: string }) => n.title)).toEqual(['Aviso 4', 'Aviso 3', 'Aviso 2', 'Aviso 1', 'Aviso 0']);

    const page = await list(token, `?limit=2&before=${encodeURIComponent(d.items[1].createdAt)}`);
    expect(page.items.map((n: { title: string }) => n.title)).toEqual(['Aviso 2', 'Aviso 1']);
    const since = await list(token, `?since=${encodeURIComponent(d.items[1].createdAt)}`);
    expect(since.items.map((n: { title: string }) => n.title)).toEqual(['Aviso 4']);

    const r1 = await api().post('/api/v1/me/notifications/read').set(auth(token)).send({ ids: [d.items[0].id] }).expect(200);
    expect(r1.body.data.unread).toBe(4);
    expect((await list(token, '?unread=true')).items).toHaveLength(4);
    await api().post('/api/v1/me/notifications/read').set(auth(token)).send({ all: true }).expect(200);
    expect((await list(token)).unread).toBe(0);

    await api().delete(`/api/v1/me/notifications/${d.items[0].id}`).set(auth(token)).expect(204);
    await api().delete(`/api/v1/me/notifications/${d.items[0].id}`).set(auth(token)).expect(404);
    d = await list(token);
    expect(d.items).toHaveLength(4);
    await api().delete('/api/v1/me/notifications').set(auth(token)).expect(204);
    expect((await list(token)).items).toEqual([]);
  });

  it('cada um só vê e mexe nas próprias notificações', async () => {
    const a = await registerAndLogin(ctx);
    const b = await registerAndLogin(ctx, { email: 'b@email.com' });
    await seedNotifications(a.id, 1);
    const n = (await list(a.token)).items[0];
    expect((await list(b.token)).items).toEqual([]);
    await api().delete(`/api/v1/me/notifications/${n.id}`).set(auth(b.token)).expect(404);
    await api().post('/api/v1/me/notifications/read').set(auth(b.token)).send({ ids: [n.id] }).expect(200);
    expect((await list(a.token)).unread).toBe(1);
    await api().get('/api/v1/me/notifications').expect(401);
    await api().delete('/api/v1/me/notifications/nao-e-uuid').set(auth(a.token)).expect(422);
  });

  it('guarda no máximo 200 por usuário (as mais antigas saem)', async () => {
    const { token, id } = await registerAndLogin(ctx);
    await ctx.deps.db.query(
      `INSERT INTO notifications (user_id, type, title, body, created_at)
       SELECT $1, 'system', 'Antiga ' || g, 'x', $2::timestamptz - make_interval(mins => g) FROM generate_series(1, 200) g`,
      [id, FIXED_NOW],
    );
    await notify(ctx.deps.db, noPush, { userId: id, type: 'system', title: 'Nova', body: 'x', at: minutes(1) });
    const { rows } = await ctx.deps.db.query<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1', [id]);
    expect(rows[0]!.n).toBe(200);
    const d = await list(token, '?limit=1');
    expect(d.items[0].title).toBe('Nova');
  });

  it('aparelhos: registra, troca de dono e remove; valida o token', async () => {
    const a = await registerAndLogin(ctx);
    const b = await registerAndLogin(ctx, { email: 'b@email.com' });
    const tok = 'ExponentPushToken[device-1]';
    await api().put('/api/v1/me/devices').set(auth(a.token)).send({ token: tok, platform: 'android' }).expect(204);
    await api().put('/api/v1/me/devices').set(auth(b.token)).send({ token: tok, platform: 'android' }).expect(204);
    const { rows } = await ctx.deps.db.query<{ user_id: string }>('SELECT user_id FROM push_devices WHERE token = $1', [tok]);
    expect(rows[0]!.user_id).toBe(b.id);
    await api().put('/api/v1/me/devices').set(auth(a.token)).send({ token: 'x', platform: 'android' }).expect(422);
    await api().put('/api/v1/me/devices').set(auth(a.token)).send({ token: tok, platform: 'symbian' }).expect(422);
    await api().delete('/api/v1/me/devices').set(auth(b.token)).send({ token: tok }).expect(204);
    expect((await ctx.deps.db.query('SELECT 1 FROM push_devices')).rowCount).toBe(0);
  });

  it('o dashboard mostra quantas não lidas', async () => {
    const { token, id } = await registerAndLogin(ctx);
    await seedNotifications(id, 3);
    const dash = await api().get('/api/v1/me/dashboard').set(auth(token)).expect(200);
    expect(dash.body.data.unreadNotifications).toBe(3);
  });
});
