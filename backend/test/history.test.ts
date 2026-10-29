import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auth, FIXED_NOW, lineId, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);
const days = (n: number) => new Date(FIXED_NOW.getTime() - n * 86_400_000);

async function stops(code: string) {
  return (await api().get(`/api/v1/lines/${await lineId(ctx, code)}`).expect(200)).body.data.stops as { id: number; name: string }[];
}

describe('US19 — histórico de viagens planejadas e realizadas', () => {
  it('guarda uma opção do planejador (com baldeação) como planejada e depois como realizada', async () => {
    const { token } = await registerAndLogin(ctx);
    const s301 = await stops('301');
    const s08 = await stops('08');
    const body = {
      legs: [
        { lineId: await lineId(ctx, '301'), originStopId: s301[0]!.id, destStopId: s301.find((s) => s.name === 'Terminal Central')!.id },
        { lineId: await lineId(ctx, '08'), originStopId: s08[0]!.id, destStopId: s08.at(-1)!.id },
      ],
      walkMin: 4,
    };
    const res = await api().post('/api/v1/me/trips/planned').set(auth(token)).send(body).expect(201);
    const trip = res.body.data;
    expect(trip).toMatchObject({
      kind: 'planned',
      lineCode: '301 + 08',
      originLabel: 'Vila Industrial',
      destLabel: 'Shopping Colinas',
      transfers: 1,
      walkMin: 4,
      completedAt: null,
    });
    expect(trip.legs).toHaveLength(2);
    expect(trip.durationMin).toBe(trip.legs[0].durationMin + trip.legs[1].durationMin + 4);
    expect(trip.distanceM).toBe(trip.legs[0].distanceM + trip.legs[1].distanceM);

    // Planejada não conta no resumo do dashboard
    let dash = (await api().get('/api/v1/me/dashboard').set(auth(token)).expect(200)).body.data;
    expect(dash.trips.total).toBe(0);
    expect(dash.trips.recent).toEqual([]);

    const done = await api().post(`/api/v1/me/trips/${trip.id}/complete`).set(auth(token)).expect(200);
    expect(done.body.data).toMatchObject({ kind: 'completed', completedAt: FIXED_NOW.toISOString() });
    dash = (await api().get('/api/v1/me/dashboard').set(auth(token)).expect(200)).body.data;
    expect(dash.trips.total).toBe(1);
    // A linha mais usada conta cada trecho
    expect(['301', '08']).toContain(dash.trips.mostUsedLine);
  });

  it('lista com filtros (tipo, período, linha), resumo e paginação', async () => {
    const { token, id } = await registerAndLogin(ctx);
    const s175 = await stops('175');
    const l175 = await lineId(ctx, '175');
    const l232 = await lineId(ctx, '232');
    const s232 = await stops('232');
    for (const [i, line, st] of [
      [0, l175, s175],
      [1, l232, s232],
      [2, l175, s175],
      [10, l175, s175],
    ] as const) {
      ctx.now.value = days(i);
      await api().post('/api/v1/me/trips').set(auth(token)).send({ lineId: line, originStopId: st[0]!.id, destStopId: st[3]!.id }).expect(201);
    }
    ctx.now.value = FIXED_NOW;
    await api()
      .post('/api/v1/me/trips/planned')
      .set(auth(token))
      .send({ legs: [{ lineId: l175, originStopId: s175[0]!.id, destStopId: s175[5]!.id }] })
      .expect(201);

    const all = await api().get('/api/v1/me/trips').set(auth(token)).expect(200);
    expect(all.body.data).toHaveLength(5);
    expect(all.body.meta.summary).toMatchObject({ trips: 4, planned: 1 });

    const completed = await api().get('/api/v1/me/trips?kind=completed').set(auth(token)).expect(200);
    expect(completed.body.data.every((t: { kind: string }) => t.kind === 'completed')).toBe(true);

    const only232 = await api().get(`/api/v1/me/trips?lineId=${l232}`).set(auth(token)).expect(200);
    expect(only232.body.data.map((t: { lineCode: string }) => t.lineCode)).toEqual(['232']);

    // Período: últimos 3 dias (datas de São Paulo)
    const recent = await api().get('/api/v1/me/trips?from=2026-09-19&to=2026-09-21').set(auth(token)).expect(200);
    expect(recent.body.data).toHaveLength(4);
    expect(recent.body.meta.summary.trips).toBe(3);

    // Paginação: 2 por página até acabar; o resumo não muda entre as páginas
    const p1 = await api().get('/api/v1/me/trips?limit=2').set(auth(token)).expect(200);
    expect(p1.body.data).toHaveLength(2);
    const p2 = await api().get(`/api/v1/me/trips?limit=2&before=${encodeURIComponent(p1.body.meta.nextBefore)}`).set(auth(token)).expect(200);
    expect(p2.body.meta.summary).toEqual(p1.body.meta.summary);
    const p3 = await api().get(`/api/v1/me/trips?limit=2&before=${encodeURIComponent(p2.body.meta.nextBefore)}`).set(auth(token)).expect(200);
    expect(p3.body.data).toHaveLength(1);
    expect(p3.body.meta.nextBefore).toBeNull();
    const ids = [...p1.body.data, ...p2.body.data, ...p3.body.data].map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(5);
    expect(id).toBeTruthy();
  });

  it('apaga viagens só do próprio usuário; valida trechos', async () => {
    const a = await registerAndLogin(ctx);
    const b = await registerAndLogin(ctx, { email: 'b@email.com' });
    const s175 = await stops('175');
    const l175 = await lineId(ctx, '175');
    const t = await api().post('/api/v1/me/trips').set(auth(a.token)).send({ lineId: l175, originStopId: s175[0]!.id, destStopId: s175[2]!.id }).expect(201);
    await api().delete(`/api/v1/me/trips/${t.body.data.id}`).set(auth(b.token)).expect(404);
    await api().post(`/api/v1/me/trips/${t.body.data.id}/complete`).set(auth(b.token)).expect(404);
    await api().delete(`/api/v1/me/trips/${t.body.data.id}`).set(auth(a.token)).expect(204);
    await api().post('/api/v1/me/trips/planned').set(auth(a.token)).send({ legs: [] }).expect(422);
    await api()
      .post('/api/v1/me/trips/planned')
      .set(auth(a.token))
      .send({ legs: [{ lineId: l175, originStopId: s175[5]!.id, destStopId: s175[1]!.id }] })
      .expect(400);
    await api().get('/api/v1/me/trips?from=21/09/2026').set(auth(a.token)).expect(422);
  });

  it('viagens da Sprint 1 (sem trechos) aparecem com o trecho equivalente', async () => {
    const { token, id } = await registerAndLogin(ctx);
    const s = await stops('175');
    await ctx.deps.db.query(
      `INSERT INTO trips (user_id, line_id, line_code, origin_stop_id, dest_stop_id, origin_label, dest_label, duration_min, distance_m)
       VALUES ($1, $2, '175', $3, $4, 'A', 'B', 10, 1000)`,
      [id, await lineId(ctx, '175'), s[0]!.id, s[3]!.id],
    );
    const list = await api().get('/api/v1/me/trips').set(auth(token)).expect(200);
    expect(list.body.data[0]).toMatchObject({ kind: 'completed', transfers: 0, legs: [] });
  });
});
