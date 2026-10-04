import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auth, lineId, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);

async function stopsOf(code: string) {
  const res = await api()
    .get(`/api/v1/lines/${await lineId(ctx, code)}`)
    .expect(200);
  return res.body.data as { id: number; stops: { id: number; name: string; offsetMin: number }[] };
}

describe('US12 — registro de viagens (base do resumo)', () => {
  it('registra a viagem calculando duração e distância pelo trajeto', async () => {
    const { token } = await registerAndLogin(ctx);
    const l = await stopsOf('175');
    const res = await api()
      .post('/api/v1/me/trips')
      .set(auth(token))
      .send({ lineId: l.id, originStopId: l.stops[0]!.id, destStopId: l.stops[11]!.id })
      .expect(201);
    expect(res.body.data).toMatchObject({
      lineCode: '175',
      originLabel: 'Terminal Central',
      destLabel: 'Vila Ema (final)',
      durationMin: l.stops[11]!.offsetMin,
    });
    expect(res.body.data.distanceM).toBeGreaterThan(2000);
    const list = await api().get('/api/v1/me/trips').set(auth(token)).expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('recusa desembarque antes do embarque ou parada de outra linha', async () => {
    const { token } = await registerAndLogin(ctx);
    const l = await stopsOf('175');
    const other = await stopsOf('E50');
    await api()
      .post('/api/v1/me/trips')
      .set(auth(token))
      .send({ lineId: l.id, originStopId: l.stops[5]!.id, destStopId: l.stops[1]!.id })
      .expect(400);
    await api()
      .post('/api/v1/me/trips')
      .set(auth(token))
      .send({ lineId: l.id, originStopId: l.stops[0]!.id, destStopId: other.stops.at(-1)!.id })
      .expect(400);
    await api().post('/api/v1/me/trips').set(auth(token)).send({ lineId: 99999, originStopId: 1, destStopId: 2 }).expect(404);
  });
});

describe('US12 — dashboard com resumo de viagens e favoritos', () => {
  it('conta nova: dashboard vazio mas válido', async () => {
    const { token } = await registerAndLogin(ctx);
    const res = await api().get('/api/v1/me/dashboard').set(auth(token)).expect(200);
    expect(res.body.data).toEqual({
      favorites: [],
      nextDepartures: [],
      trips: { last30Days: { trips: 0, minutes: 0, distance: 0 }, total: 0, mostUsedLine: null, recent: [] },
    });
  });

  it('resume favoritas, próximas partidas e viagens', async () => {
    const { token } = await registerAndLogin(ctx);
    const l175 = await stopsOf('175');
    const l232 = await stopsOf('232');
    await api().put(`/api/v1/me/favorites/${l175.id}`).set(auth(token)).expect(200);
    await api().put(`/api/v1/me/favorites/${l232.id}`).set(auth(token)).expect(200);

    const trip = (l: typeof l175, a: number, b: number) =>
      api()
        .post('/api/v1/me/trips')
        .set(auth(token))
        .send({ lineId: l.id, originStopId: l.stops[a]!.id, destStopId: l.stops[b]!.id })
        .expect(201);
    await trip(l175, 0, 11);
    await trip(l175, 2, 6);
    await trip(l232, 0, 5);
    // Viagem antiga (fora dos 30 dias) conta no total, não no mês
    await ctx.deps.db.query(
      "UPDATE trips SET created_at = created_at - interval '40 days' WHERE id = (SELECT id FROM trips ORDER BY created_at LIMIT 1)",
    );

    const res = await api().get('/api/v1/me/dashboard').set(auth(token)).expect(200);
    const d = res.body.data;
    expect(d.favorites.map((f: { code: string }) => f.code)).toEqual(['175', '232']);
    expect(d.nextDepartures).toHaveLength(2);
    expect(d.nextDepartures[0]).toMatchObject({
      line: { code: expect.any(String) },
      stop: { name: expect.any(String) },
      inMin: expect.any(Number),
      at: expect.stringMatching(/^\d\d:\d\d$/),
    });
    expect(d.nextDepartures[0].inMin).toBeLessThanOrEqual(d.nextDepartures[1].inMin);
    expect(d.trips.total).toBe(3);
    expect(d.trips.last30Days.trips).toBe(2);
    expect(d.trips.last30Days.minutes).toBeGreaterThan(0);
    expect(d.trips.last30Days.distance).toBeGreaterThan(0);
    expect(d.trips.mostUsedLine).toBe('175');
    expect(d.trips.recent).toHaveLength(3);
  });

  it('usa o ponto mais perto da localização para a próxima partida', async () => {
    const { token } = await registerAndLogin(ctx);
    const l175 = await stopsOf('175');
    await api().put(`/api/v1/me/favorites/${l175.id}`).set(auth(token)).expect(200);
    // Perto do Colégio Estadual
    const res = await api().get('/api/v1/me/dashboard?lat=-23.2005&lng=-45.9003').set(auth(token)).expect(200);
    expect(res.body.data.nextDepartures[0].stop.name).toBe('Colégio Estadual');
    const far = await api().get('/api/v1/me/dashboard').set(auth(token)).expect(200);
    expect(far.body.data.nextDepartures[0].stop.name).toBe('Terminal Central');
  });

  it('exige login', async () => {
    await api().get('/api/v1/me/dashboard').expect(401);
  });
});
