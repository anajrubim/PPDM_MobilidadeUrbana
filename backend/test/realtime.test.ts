import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { insertServiceAlert } from '../src/modules/realtime/service-alerts.js';
import { FIXED_NOW, lineId, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);
const minutes = (n: number) => new Date(FIXED_NOW.getTime() + n * 60_000);

describe('US16 — ônibus em tempo real', () => {
  it('lista os ônibus da linha em circulação com posição, atraso e próxima parada', async () => {
    const id = await lineId(ctx, '175');
    const res = await api().get(`/api/v1/lines/${id}/vehicles`).expect(200);
    const d = res.body.data;
    expect(res.headers['cache-control']).toBe('no-store');
    expect(d.line).toMatchObject({ id, code: '175' });
    expect(d.updatedAt).toBe(FIXED_NOW.toISOString());
    // 09:00, saídas a cada 18 min e ~25 min de viagem: há ônibus na rua
    expect(d.vehicles.length).toBeGreaterThan(0);
    for (const v of d.vehicles) {
      expect(v).toMatchObject({ lineId: id, lineCode: '175', delayMin: expect.any(Number), progress: expect.any(Number) });
      expect(v.lat).toBeGreaterThan(-23.3);
      expect(v.lat).toBeLessThan(-23.1);
      expect(v.progress).toBeGreaterThanOrEqual(0);
      expect(v.progress).toBeLessThanOrEqual(1);
    }
  });

  it('os ônibus andam com o tempo', async () => {
    const id = await lineId(ctx, '232');
    const before = (await api().get(`/api/v1/lines/${id}/vehicles`).expect(200)).body.data.vehicles;
    ctx.now.value = minutes(2);
    const after = (await api().get(`/api/v1/lines/${id}/vehicles`).expect(200)).body.data.vehicles;
    const same = before.find((v: { id: string }) => after.some((a: { id: string }) => a.id === v.id));
    const moved = after.find((a: { id: string }) => a.id === same.id);
    expect(moved.progress).toBeGreaterThan(same.progress);
  });

  it('com stopId traz a chegada prevista no ponto; parada de outra linha dá 404', async () => {
    const id = await lineId(ctx, '175');
    const line = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data;
    const stop = line.stops[5];
    const res = await api().get(`/api/v1/lines/${id}/vehicles?stopId=${stop.id}`).expect(200);
    expect(res.body.data.stop).toMatchObject({ id: stop.id, name: stop.name });
    expect(res.body.data.stop.arrivals.length).toBe(3);
    expect(res.body.data.stop.arrivals[0]).toMatchObject({ inMin: expect.any(Number), at: expect.stringMatching(/^\d\d:\d\d$/), live: expect.any(Boolean) });
    const other = (await api().get(`/api/v1/lines/${await lineId(ctx, 'E50')}`).expect(200)).body.data.stops.at(-1);
    await api().get(`/api/v1/lines/${id}/vehicles?stopId=${other.id}`).expect(404);
    await api().get('/api/v1/lines/99999/vehicles').expect(404);
  });

  it('linha inativa não tem ônibus', async () => {
    const res = await api().get(`/api/v1/lines/${await lineId(ctx, '014')}/vehicles`).expect(200);
    expect(res.body.data.vehicles).toEqual([]);
  });

  it('detalhe da linha informa quantos ônibus circulam e as previsões levam o atraso', async () => {
    const id = await lineId(ctx, '175');
    const d = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data;
    expect(d.vehiclesCount).toBeGreaterThan(0);
    const live = d.stops.filter((s: { nextArrival: { live: boolean } | null }) => s.nextArrival?.live);
    expect(live.length).toBeGreaterThan(0);
    for (const s of live) {
      const [h, m] = s.nextArrival.scheduledAt.split(':').map(Number);
      const [h2, m2] = s.nextArrival.at.split(':').map(Number);
      expect(h2 * 60 + m2 - (h * 60 + m)).toBe(s.nextArrival.delayMin);
    }
  });
});

describe('US17 — avisos de serviço (atraso anunciado e mudança de itinerário)', () => {
  it('aviso ativo aparece na linha, na parada e soma o atraso às previsões', async () => {
    const id = await lineId(ctx, '175');
    const stops = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data.stops;
    const terminal = stops[0];
    await insertServiceAlert(ctx.deps.db, {
      lineId: id,
      kind: 'delay',
      title: 'Trânsito intenso',
      message: 'Acidente na Av. Brasil',
      extraDelayMin: 10,
      startsAt: minutes(-30),
      endsAt: minutes(60),
    });
    ctx.app.services.alerts.invalidate();

    const line = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data;
    expect(line.alerts).toEqual([
      expect.objectContaining({ kind: 'delay', title: 'Trânsito intenso', extraDelayMin: 10, active: true }),
    ]);
    // Com 10 min de atraso anunciado, o ônibus das 08:54 ainda não saiu do terminal: previsto 09:04
    expect(line.stops[0].nextArrival).toMatchObject({ scheduledAt: '08:54', at: '09:04', delayMin: 10, live: false });

    const stop = (await api().get(`/api/v1/stops/${terminal.id}`).expect(200)).body.data;
    const l175 = stop.lines.find((l: { code: string }) => l.code === '175');
    expect(l175.alerts).toHaveLength(1);

    const all = (await api().get('/api/v1/service-alerts').expect(200)).body.data;
    expect(all).toEqual([expect.objectContaining({ line: expect.objectContaining({ code: '175' }), active: true })]);
  });

  it('aviso programado aparece na lista mas não altera as previsões; o que já terminou some', async () => {
    const id = await lineId(ctx, '08');
    await insertServiceAlert(ctx.deps.db, {
      lineId: id,
      kind: 'detour',
      title: 'Desvio sábado',
      message: 'Obra',
      startsAt: minutes(24 * 60),
      endsAt: minutes(30 * 60),
    });
    await insertServiceAlert(ctx.deps.db, { lineId: id, kind: 'delay', title: 'Velho', message: 'x', startsAt: minutes(-120), endsAt: minutes(-60) });
    ctx.app.services.alerts.invalidate();
    const line = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data;
    expect(line.alerts).toEqual([expect.objectContaining({ title: 'Desvio sábado', active: false })]);
    expect(line.stops[0].nextArrival.delayMin).toBe(0);
  });
});

describe('US16 — instante exato da chegada', () => {
  it('etaAt traz o horário previsto com segundos (base da contagem regressiva)', async () => {
    const id = await lineId(ctx, '175');
    const stop = (await api().get(`/api/v1/lines/${id}`).expect(200)).body.data.stops[0];
    const res = await api().get(`/api/v1/lines/${id}/vehicles?stopId=${stop.id}`).expect(200);
    const a = res.body.data.stop.arrivals[0];
    // 09:12 programado, a partir das 09:00 do relógio fixo
    expect(a).toMatchObject({ scheduledAt: '09:12', etaAt: '2026-09-21T12:12:00.000Z' });
  });
});
