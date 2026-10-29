import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEMO_HUBS } from '../src/db/demo-data.js';
import { planTrips, walkMinutes } from '../src/modules/planner/planner.js';
import { clockFor } from '../src/modules/realtime/simulation.js';
import { loadNetwork } from '../src/modules/transit/network.js';
import { FIXED_NOW, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);

async function stopId(name: string): Promise<number> {
  const { rows } = await ctx.deps.db.query<{ id: number }>('SELECT id FROM stops WHERE name = $1', [name]);
  return rows[0]!.id;
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
type Leg = { type: string; line?: { code: string }; departAt?: string; arriveAt?: string; waitMin?: number; rideMin?: number; durationMin?: number };
type Option = { departAt: string; arriveAt: string; durationMin: number; transfers: number; walkM: number; tags: string[]; legs: Leg[] };

describe('US15 — planejar viagem com baldeação', () => {
  it('rota direta entre duas paradas da mesma linha', async () => {
    const res = await api()
      .get(`/api/v1/plan?fromStopId=${await stopId('Rua das Flores, 120')}&toStopId=${await stopId('Shopping Colinas')}`)
      .expect(200);
    const { options, from, to } = res.body.data;
    expect(from.name).toBe('Rua das Flores, 120');
    expect(to.name).toBe('Shopping Colinas');
    expect(options.length).toBeGreaterThanOrEqual(1);
    const best: Option = options[0];
    expect(best.tags).toContain('fastest');
    expect(best.transfers).toBe(0);
    expect(best.legs).toEqual([expect.objectContaining({ type: 'bus', line: expect.objectContaining({ code: '08' }) })]);
    // Não sai antes de agora (09:00) e as opções vêm em ordem de chegada
    expect(toMin(best.departAt)).toBeGreaterThanOrEqual(540);
    const arrivals = options.map((o: Option) => toMin(o.arriveAt));
    expect([...arrivals].sort((a, b) => a - b)).toEqual(arrivals);
  });

  it('sem linha direta, propõe baldeação (301 até o Terminal + 08)', async () => {
    const res = await api()
      .get(`/api/v1/plan?fromStopId=${await stopId('Vila Industrial')}&toStopId=${await stopId('Shopping Colinas')}`)
      .expect(200);
    const best: Option = res.body.data.options[0];
    expect(best.transfers).toBe(1);
    const bus = best.legs.filter((l) => l.type === 'bus');
    expect(bus.map((l) => l.line!.code)).toEqual(['301', '08']);
    // O segundo ônibus sai depois de o primeiro chegar
    expect(toMin(bus[1]!.departAt!)).toBeGreaterThan(toMin(bus[0]!.arriveAt!));
    // US26 — tempo total = da saída à chegada, somando trechos e espera da baldeação
    expect(best.durationMin).toBe(toMin(best.arriveAt) - toMin(best.departAt));
    expect(best.durationMin).toBe(bus[0]!.rideMin! + bus[1]!.waitMin! + bus[1]!.rideMin!);
  });

  it('nunca sugere baldear para o mesmo ônibus que dava para pegar direto', async () => {
    const res = await api()
      .get(`/api/v1/plan?fromStopId=${await stopId('Rua das Flores, 120')}&toStopId=${await stopId('Shopping Colinas')}`)
      .expect(200);
    const options: Option[] = res.body.data.options;
    const direct = options.find((o) => o.transfers === 0)!;
    for (const o of options.filter((x) => x.transfers > 0 && !x.tags.includes('later'))) {
      expect(toMin(o.arriveAt)).toBeLessThan(toMin(direct.arriveAt));
    }
  });

  it('em linha circular embarca na passagem certa (sem dar a volta inteira)', async () => {
    const res = await api()
      .get(`/api/v1/plan?fromStopId=${await stopId('Santana')}&toStopId=${await stopId('Jd. Satélite')}`)
      .expect(200);
    const best: Option = res.body.data.options[0];
    const first = best.legs.find((l) => l.type === 'bus')!;
    expect(first.line!.code).toBe('875');
    // Santana → Praça da Matriz pela 2ª passagem: ~13 min, não ~30 dando a volta por Alto da Ponte
    expect(first.rideMin).toBeLessThan(20);
  });

  it('de uma localização qualquer: caminhada até o ponto e do ponto ao destino', async () => {
    const [lat, lng] = DEMO_HUBS.HM.pos;
    const res = await api().get(`/api/v1/plan?fromLat=-23.18900&fromLng=-45.88700&fromLabel=Casa&toLat=${lat}&toLng=${lng}&toLabel=Hospital`).expect(200);
    const { options, from, to } = res.body.data;
    expect(from).toMatchObject({ name: 'Casa', lat: -23.189, lng: -45.887 });
    expect(to.name).toBe('Hospital');
    const best: Option = options[0];
    expect(best.legs[0]).toMatchObject({ type: 'walk' });
    expect(best.walkM).toBeGreaterThan(0);
    expect(toMin(best.arriveAt) - toMin(best.departAt)).toBe(best.durationMin);
  });

  it('perto o suficiente: oferece ir a pé', async () => {
    const res = await api().get('/api/v1/plan?fromLat=-23.1865&fromLng=-45.8845&toLat=-23.1905&toLng=-45.8895').expect(200);
    const walk = res.body.data.options.find((o: Option) => o.tags.includes('walk_only'));
    expect(walk.legs).toEqual([expect.objectContaining({ type: 'walk' })]);
    // Terminal Central → Rua das Flores: ~680 m em linha reta, ~850 m pelas ruas
    expect(walk.walkM).toBeGreaterThan(700);
    expect(walk.walkM).toBeLessThan(1000);
    expect(walk.durationMin).toBe(Math.ceil(walk.walkM / 75));
    expect(walkMinutes(600)).toBe(10);
  });

  it('inclui próximos horários ("sair mais tarde") quando há poucas opções', async () => {
    const res = await api()
      .get(`/api/v1/plan?fromStopId=${await stopId('Vila Industrial')}&toStopId=${await stopId('Shopping Colinas')}`)
      .expect(200);
    const options: Option[] = res.body.data.options;
    expect(options.length).toBe(3);
    expect(options.slice(1).every((o) => o.tags.includes('later'))).toBe(true);
    expect(toMin(options[1]!.departAt)).toBeGreaterThan(toMin(options[0]!.departAt));
  });

  it('aceita horário de saída futuro e recusa fora da janela de 24 h', async () => {
    const o = await stopId('Rua das Flores, 120');
    const d = await stopId('Shopping Colinas');
    const later = new Date(FIXED_NOW.getTime() + 3 * 3600_000).toISOString();
    const res = await api().get(`/api/v1/plan?fromStopId=${o}&toStopId=${d}&at=${encodeURIComponent(later)}`).expect(200);
    expect(toMin(res.body.data.options[0].departAt)).toBeGreaterThanOrEqual(12 * 60);
    const tooFar = new Date(FIXED_NOW.getTime() + 30 * 3600_000).toISOString();
    await api().get(`/api/v1/plan?fromStopId=${o}&toStopId=${d}&at=${encodeURIComponent(tooFar)}`).expect(400);
  });

  it('valida origem e destino', async () => {
    await api().get('/api/v1/plan').expect(400);
    await api().get(`/api/v1/plan?fromStopId=${await stopId('Santana')}`).expect(400);
    await api().get(`/api/v1/plan?fromStopId=99999&toStopId=${await stopId('Santana')}`).expect(404);
    await api().get('/api/v1/plan?fromLat=999&fromLng=0&toStopId=1').expect(422);
  });

  it('longe de qualquer ponto: sem opções', async () => {
    const res = await api().get('/api/v1/plan?fromLat=-10&fromLng=-50&toLat=-10.01&toLng=-50.01').expect(200);
    // A pé ainda é possível (1,4 km em linha reta é perto), mas não há ônibus
    expect(res.body.data.options.every((o: Option) => o.tags.includes('walk_only'))).toBe(true);
    const far = await api().get('/api/v1/plan?fromLat=-10&fromLng=-50&toLat=-11&toLng=-51').expect(200);
    expect(far.body.data.options).toEqual([]);
  });

  it('linha inativa não entra no planejamento', async () => {
    const net = await loadNetwork(ctx.deps.db);
    const zl = [...net.stops.values()].find((s) => s.name === 'Zona Leste')!;
    const tc = [...net.stops.values()].find((s) => s.name === 'Terminal Central')!;
    const options = planTrips(net, { kind: 'stop', stop: zl }, { kind: 'stop', stop: tc }, clockFor(FIXED_NOW));
    // Só a 014 (inativa) atende a Zona Leste
    expect(options.flatMap((o) => o.legs).some((l) => l.type === 'bus' && l.line.code === '014')).toBe(false);
  });
});
