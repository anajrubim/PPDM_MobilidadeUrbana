import { describe, expect, it } from 'vitest';
import { buildNetwork, type NetLine } from '../src/modules/transit/network.js';
import {
  formatHHMM,
  minutesOfDay,
  nextArrivalsAtStop,
  parseHHMM,
  serviceDepartures,
  timetableAtStop,
} from '../src/modules/transit/schedule.js';
import { haversine, polylineLength } from '../src/lib/geo.js';

const line = (over: Partial<NetLine> = {}): NetLine => ({
  id: 1,
  code: 'T1',
  name: 'Teste',
  origin: 'A',
  destination: 'C',
  mode: 'bus',
  serviceType: 'normal',
  status: 'active',
  color: '#000',
  headwayMin: 30,
  firstDeparture: '06:00',
  lastDeparture: '08:00',
  shape: [],
  stops: [
    { stopId: 1, seq: 1, offsetMin: 0 },
    { stopId: 2, seq: 2, offsetMin: 10 },
    { stopId: 3, seq: 3, offsetMin: 25 },
  ],
  ...over,
});

describe('programação de horários (US09)', () => {
  it('converte HH:MM', () => {
    expect(parseHHMM('05:07')).toBe(307);
    expect(formatHHMM(307)).toBe('05:07');
    expect(formatHHMM(1440 + 5)).toBe('00:05');
    expect(formatHHMM(-10)).toBe('23:50');
  });

  it('gera as partidas do dia, inclusive virando a meia-noite', () => {
    expect(serviceDepartures(line()).map(formatHHMM)).toEqual(['06:00', '06:30', '07:00', '07:30', '08:00']);
    const night = line({ firstDeparture: '23:30', lastDeparture: '00:30' });
    expect(serviceDepartures(night).map(formatHHMM)).toEqual(['23:30', '00:00', '00:30']);
  });

  it('próximas chegadas somam o tempo até a parada', () => {
    expect(nextArrivalsAtStop(line(), 2, parseHHMM('06:15'))).toEqual([
      { inMin: 25, at: '06:40' },
      { inMin: 55, at: '07:10' },
      { inMin: 85, at: '07:40' },
    ]);
  });

  it('depois do último ônibus, mostra o primeiro do dia seguinte', () => {
    const [next] = nextArrivalsAtStop(line(), 3, parseHHMM('22:00'), 1);
    expect(next).toEqual({ inMin: 505, at: '06:25' });
  });

  it('parada que não é da linha → sem horários', () => {
    expect(nextArrivalsAtStop(line(), 99, 0)).toEqual([]);
  });

  it('linha circular: considera as duas passagens pela parada', () => {
    const circ = line({
      headwayMin: 60,
      lastDeparture: '06:00',
      stops: [
        { stopId: 1, seq: 1, offsetMin: 0 },
        { stopId: 2, seq: 2, offsetMin: 20 },
        { stopId: 1, seq: 3, offsetMin: 40 },
      ],
    });
    expect(timetableAtStop(circ, 1)).toEqual(['06:00', '06:40']);
  });

  it('minutos do dia no fuso de São Paulo', () => {
    expect(minutesOfDay(new Date('2026-09-21T12:00:00Z'))).toBe(9 * 60);
  });

  it('rede: linha circular registrada uma vez por parada', () => {
    const circ = line({
      stops: [
        { stopId: 1, seq: 1, offsetMin: 0 },
        { stopId: 1, seq: 2, offsetMin: 30 },
      ],
    });
    const net = buildNetwork([circ], [{ id: 1, code: 'P1', name: 'A', lat: 0, lng: 0 }]);
    expect(net.linesByStop.get(1)).toHaveLength(1);
  });
});

describe('geografia', () => {
  it('haversine e comprimento de polilinha', () => {
    const d = haversine([-23.1865, -45.8845], [-23.1905, -45.8895]);
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(700);
    expect(polylineLength([[0, 0]])).toBe(0);
    expect(
      polylineLength([
        [-23.1865, -45.8845],
        [-23.1905, -45.8895],
        [-23.1865, -45.8845],
      ]),
    ).toBeCloseTo(2 * d, 5);
  });
});
