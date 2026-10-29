import { describe, expect, it } from 'vitest';
import { inWindow } from '../src/modules/realtime/monitor.js';
import { addDays, clockFor, predictedArrivals, simulatedDelay, tripInstances, vehicleOf, vehiclesOfLine } from '../src/modules/realtime/simulation.js';
import { buildNetwork, type NetLine } from '../src/modules/transit/network.js';
import { parseHHMM } from '../src/modules/transit/schedule.js';

// Linha reta de 3 paradas: 0 → 10 min → 20 min, saídas 06:00 a 08:00 a cada 30 min
const line = (over: Partial<NetLine> = {}): NetLine => ({
  id: 1,
  code: 'T1',
  name: 'Teste',
  origin: 'A',
  destination: 'C',
  mode: 'bus',
  serviceType: 'normal',
  status: 'active',
  color: '#123456',
  headwayMin: 30,
  firstDeparture: '06:00',
  lastDeparture: '08:00',
  shape: [],
  stops: [
    { stopId: 1, seq: 1, offsetMin: 0 },
    { stopId: 2, seq: 2, offsetMin: 10 },
    { stopId: 3, seq: 3, offsetMin: 20 },
  ],
  ...over,
});
const net = (l = line()) =>
  buildNetwork(
    [l],
    [
      { id: 1, code: 'P1', name: 'A', lat: -23.0, lng: -45.0 },
      { id: 2, code: 'P2', name: 'B', lat: -23.01, lng: -45.0 },
      { id: 3, code: 'P3', name: 'C', lat: -23.02, lng: -45.0 },
    ],
  );
const at = (hhmm: string) => ({ nowMin: parseHHMM(hhmm), today: '2026-09-21' });

describe('US16 — simulação de tempo real', () => {
  it('atraso é determinístico e fica entre 0 e 12 min', () => {
    const values = new Set<number>();
    for (let dep = 0; dep < 1440; dep += 7) {
      const d = simulatedDelay('175', '2026-09-21', dep);
      expect(d).toBe(simulatedDelay('175', '2026-09-21', dep));
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(12);
      values.add(d);
    }
    // Varia de verdade (não é sempre 0)
    expect(values.size).toBeGreaterThan(3);
    expect(values.has(0)).toBe(true);
  });

  it('clockFor usa o fuso de São Paulo', () => {
    expect(clockFor(new Date('2026-09-21T12:00:00Z'))).toEqual({ nowMin: 540, today: '2026-09-21', epochMs: Date.parse('2026-09-21T12:00:00Z') });
    // 02:30 UTC ainda é dia 20 em São Paulo
    expect(clockFor(new Date('2026-09-21T02:30:00Z')).today).toBe('2026-09-20');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('viagens em andamento viram ônibus no mapa, entre as paradas certas', () => {
    const l = line();
    const n = net(l);
    // Sem atraso (extra força: a simulação nunca soma negativo, então basta checar com atraso conhecido)
    const c = at('06:15');
    const trips = tripInstances(l, c);
    const t0600 = trips.find((t) => t.startMin === 360)!;
    expect(t0600.running).toBe(t0600.startMin + t0600.delayMin <= c.nowMin);
    const v = vehicleOf(n, { ...t0600, delayMin: 0, started: true, running: true }, c)!;
    // 15 min de viagem: metade do caminho entre B (10) e C (20)
    expect(v.lat).toBeCloseTo(-23.015, 4);
    expect(v.nextStop).toMatchObject({ id: 3, inMin: 5 });
    expect(v.progress).toBe(0.75);
    expect(v.heading).toBe(180);
    expect(v.departedAt).toBe('06:00');
  });

  it('linha inativa ou fora do horário não tem ônibus', () => {
    expect(vehiclesOfLine(net(line({ status: 'inactive' })), line({ status: 'inactive' }), at('07:00'))).toEqual([]);
    expect(vehiclesOfLine(net(), line(), at('03:00'))).toEqual([]);
  });

  it('previsão: viagem em andamento soma o atraso; a que não saiu usa a programação', () => {
    const l = line();
    const c = at('06:05');
    const preds = predictedArrivals(l, 2, c, 3);
    const first = preds[0]!;
    const trip0600 = tripInstances(l, c).find((t) => t.startMin === 360)!;
    if (trip0600.started) {
      expect(first).toMatchObject({ scheduledAt: '06:10', live: true, delayMin: trip0600.delayMin });
    } else {
      expect(first).toMatchObject({ scheduledAt: '06:10', live: false, delayMin: 0 });
    }
    // As seguintes ainda não saíram do ponto inicial
    expect(preds.find((p) => p.scheduledAt === '07:10')).toMatchObject({ live: false, delayMin: 0, at: '07:10' });
  });

  it('aviso de atraso ativo soma minutos até nas viagens que ainda não saíram', () => {
    const l = line();
    const preds = predictedArrivals(l, 1, at('06:35'), 2, new Map([[1, 10]]));
    // O das 06:30 ainda não saiu (atraso ≥ 10 min): previsto 06:40; o das 07:00, 07:10
    expect(preds[0]).toMatchObject({ scheduledAt: '06:30', at: '06:40', delayMin: 10, live: false, inMin: 5 });
    expect(preds[1]).toMatchObject({ scheduledAt: '07:00', at: '07:10', delayMin: 10, live: false, inMin: 35 });
  });

  it('parada fora da linha não tem previsão', () => {
    expect(predictedArrivals(line(), 99, at('06:00'))).toEqual([]);
  });
});

describe('US18 — janela de horário do alerta', () => {
  it('sem janela vale o dia todo; janela normal e que vira a meia-noite', () => {
    expect(inWindow(0, null, null)).toBe(true);
    expect(inWindow(parseHHMM('07:30'), '07:00', '09:00')).toBe(true);
    expect(inWindow(parseHHMM('09:00'), '07:00', '09:00')).toBe(false);
    expect(inWindow(parseHHMM('23:30'), '22:00', '02:00')).toBe(true);
    expect(inWindow(parseHHMM('01:00'), '22:00', '02:00')).toBe(true);
    expect(inWindow(parseHHMM('12:00'), '22:00', '02:00')).toBe(false);
  });
});
