import { Platform, Share } from 'react-native';
import { buildMapHtml, MAX_CACHED_TILES, TILE_CACHE_NAME } from '../../components/map/html';
import { toMapState } from '../../components/map/state';
import { apiSession, request } from '../api';
import { countdown, delayLabel, isTomorrow, PLAN_TAG_LABEL, ratingLabel, REPORT_CATEGORIES, timeAgo, uniqueAlerts } from '../format';
import { network } from '../network';
import { presentLocal, registerPushToken, routeFor, setupNotifications } from '../notifications';
import { searchLinesOffline, searchStopsOffline } from '../offline';
import { isPersistable, keyFor } from '../query';
import { departures, formatHHMM, minutesOfDay, offlineArrivals, parseHHMM } from '../schedule';
import { openShareSheet, shareMessage } from '../share';
import type { LineSummary, LocationShare, StopSummary } from '../types';

describe('US27 — horários calculados no aparelho (offline)', () => {
  const line = { firstDeparture: '05:00', lastDeparture: '23:30', headwayMin: 18 };
  it('partidas do ponto inicial, inclusive linha da madrugada', () => {
    expect(departures(line).slice(0, 3)).toEqual([300, 318, 336]);
    const night = departures({ firstDeparture: '23:40', lastDeparture: '04:20', headwayMin: 40 });
    expect(night[0]).toBe(parseHHMM('23:40'));
    expect(formatHHMM(night.at(-1)!)).toBe('04:20');
    expect(departures({ ...line, headwayMin: 0 })).toEqual([]);
  });
  it('próximas passagens numa parada = partida + tempo até ela (mesmo cálculo da API)', () => {
    // 09:00, parada a 0 min do início: 09:12, 09:30, 09:48 (como no teste da API)
    expect(offlineArrivals(line, [0], 540).map((a) => a.at)).toEqual(['09:12', '09:30', '09:48']);
    expect(offlineArrivals(line, [0], 540)[0]).toMatchObject({ inMin: 12, live: false, offline: true, delayMin: 0 });
    // Depois do último: vai para o dia seguinte
    expect(offlineArrivals(line, [10], parseHHMM('23:50'), 1)[0]).toMatchObject({ at: '05:10' });
    expect(offlineArrivals(line, [], 540)).toEqual([]);
  });
  it('minutesOfDay usa o fuso de São Paulo', () => {
    expect(minutesOfDay(new Date('2026-09-21T12:00:00Z'))).toBe(540);
  });
});

describe('US27 — estado da conexão', () => {
  afterEach(() => network.reset());
  it('falha de rede marca offline; resposta do servidor volta para online', async () => {
    const seen: boolean[] = [];
    const off = network.subscribe(() => seen.push(network.isOnline()));
    const realFetch = globalThis.fetch;
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as never;
    await expect(request('GET', '/lines')).rejects.toMatchObject({ status: 0 });
    expect(network.isOnline()).toBe(false);
    expect(network.offlineSince()).toEqual(expect.any(Number));
    globalThis.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ data: [] }) }) as never;
    await request('GET', '/lines');
    expect(network.isOnline()).toBe(true);
    expect(seen).toEqual([false, true]);
    off();
    globalThis.fetch = realFetch;
    apiSession.setToken(null);
  });
});

describe('US27 — o que fica salvo no aparelho', () => {
  it('salva linhas, paradas e dados da conta; não salva ônibus ao vivo, planejamento nem compartilhamentos', () => {
    expect(isPersistable(keyFor('/lines'))).toBe(true);
    expect(isPersistable(keyFor('/stops/3'))).toBe(true);
    expect(isPersistable(keyFor('/me/dashboard'))).toBe(true);
    expect(isPersistable(keyFor('/me/notifications?limit=5'))).toBe(true);
    expect(isPersistable(keyFor('/lines/1/vehicles?stopId=2'))).toBe(false);
    expect(isPersistable(keyFor('/plan?fromStopId=1&toStopId=2'))).toBe(false);
    expect(isPersistable(keyFor('/me/shares'))).toBe(false);
  });
});

const L = (code: string, name: string, serviceType: LineSummary['serviceType'] = 'normal') => ({ code, name, origin: 'A', destination: 'B', serviceType }) as LineSummary;

describe('US27 — busca offline', () => {
  it('linhas: sem acento, número exato primeiro, filtro por tipo', () => {
    const all = [L('175B', 'Volta'), L('175', 'Terminal → Vila Ema'), L('232', 'Centro → Jd. Satélite'), L('E50', 'Executivo', 'executivo')];
    expect(searchLinesOffline(all, '175')!.map((l) => l.code)).toEqual(['175', '175B']);
    expect(searchLinesOffline(all, 'satelite')!.map((l) => l.code)).toEqual(['232']);
    expect(searchLinesOffline(all, '', 'executivo')!.map((l) => l.code)).toEqual(['E50']);
    expect(searchLinesOffline(undefined, 'x')).toBeUndefined();
  });
  it('paradas: filtro e ordenação por distância, nome e nº de linhas', () => {
    const s = (id: number, name: string, lat: number, lines: string[]) => ({ id, code: `P${id}`, name, lat, lng: -45.89, lines, distanceM: null }) as StopSummary;
    const all = [s(1, 'Zeta', -23.3, ['1']), s(2, 'Alfa', -23.19, ['1', '2', '3']), s(3, 'Beta', -23.2, [])];
    expect(searchStopsOffline(all, '', 'name')!.map((x) => x.name)).toEqual(['Alfa', 'Beta', 'Zeta']);
    expect(searchStopsOffline(all, '', 'lines')![0]!.name).toBe('Alfa');
    const near = searchStopsOffline(all, '', 'distance', { latitude: -23.2, longitude: -45.89 })!;
    expect(near.map((x) => x.name)).toEqual(['Beta', 'Alfa', 'Zeta']);
    expect(near[0]!.distanceM).toBe(0);
    expect(searchStopsOffline(all, 'alf', 'name')!.map((x) => x.id)).toEqual([2]);
  });
});

describe('textos da Sprint 2', () => {
  it('formatação', () => {
    expect(ratingLabel(4.25)).toBe('4,3');
    expect(delayLabel(0)).toBe('no horário');
    expect(delayLabel(6)).toBe('+6 min');
    expect(countdown(200)).toBe('03:20');
    expect(countdown(-5)).toBe('00:00');
    expect(countdown(3900)).toBe('1h05');
    const now = new Date('2026-09-21T12:00:00Z');
    expect(timeAgo('2026-09-21T11:59:40Z', now)).toBe('agora');
    expect(timeAgo('2026-09-21T11:48:00Z', now)).toBe('há 12 min');
    expect(timeAgo('2026-09-21T09:00:00Z', now)).toBe('há 3 h');
    expect(timeAgo('2026-09-20T10:00:00Z', now)).toBe('ontem');
    expect(timeAgo('2026-09-18T10:00:00Z', now)).toBe('há 3 dias');
    expect(PLAN_TAG_LABEL.fastest).toBe('Mais rápida');
    expect(REPORT_CATEGORIES).toHaveLength(8);
  });
});

describe('US17 — notificações no aparelho', () => {
  it('toque leva para a tela certa', () => {
    expect(routeFor({ type: 'proximity', lineId: 1, stopId: 2 })).toBe('/live/1?stopId=2');
    expect(routeFor({ type: 'delay', lineId: 3 })).toBe('/lines/3');
    expect(routeFor({ type: 'system', stopId: 9 })).toBe('/stops/9');
    expect(routeFor({ type: 'report', lineId: 1 })).toBe('/notifications');
    expect(routeFor(undefined)).toBe('/notifications');
  });
  it('configura canal e permissão e mostra a notificação local (Android)', async () => {
    const N = jest.requireMock('expo-notifications');
    const prev = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    try {
      expect(await setupNotifications()).toBe(true);
      expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('alertas', expect.objectContaining({ name: 'Atrasos e alertas de ônibus' }));
      await presentLocal({ id: 'n1', title: 'Linha 175 atrasada', body: 'x', lineId: 1, stopId: null, type: 'delay' });
      expect(N.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'n1', content: expect.objectContaining({ title: 'Linha 175 atrasada' }), trigger: { channelId: 'alertas' } }),
      );
      // Sem projectId do EAS (sem push remoto configurado) não registra token
      expect(await registerPushToken()).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => prev, configurable: true });
    }
  });
});

describe('US29 — mensagem de compartilhamento', () => {
  const s = {
    id: '1',
    url: 'https://mobilidade.app/s/abc',
    active: true,
    route: { line: { id: 1, code: '175', name: 'x', color: '#000000' }, dest: { id: 2, name: 'Vila Ema' }, eta: '08:42', etaInMin: 12 },
  } as LocationShare;
  it('inclui o primeiro nome, a rota e o link', () => {
    expect(shareMessage(s, 'Marina Alves')).toBe(
      'Marina está compartilhando a localização com você pelo Mobilidade Urbana. Estou no ônibus 175 indo para Vila Ema, chegada prevista às 08:42. Acompanhe: https://mobilidade.app/s/abc',
    );
    expect(shareMessage({ ...s, route: null }, 'Lucas')).toContain('Lucas está compartilhando');
  });
  it('abre a folha de compartilhamento do sistema', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as never);
    const prev = Platform.OS;
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    try {
      expect(await openShareSheet(s, 'Marina')).toBe('shared');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('https://mobilidade.app/s/abc') }));
    } finally {
      Object.defineProperty(Platform, 'OS', { get: () => prev, configurable: true });
      spy.mockRestore();
    }
  });
});

describe('US16/US28 — mapa', () => {
  const a = { latitude: -23.18, longitude: -45.88 };
  it('ônibus andando não mudam o enquadramento do mapa', () => {
    const stop = { id: 's1', coord: a, kind: 'stop' as const };
    const bus = (lat: number) => ({ id: 'v1', coord: { latitude: lat, longitude: -45.88 }, kind: 'vehicle' as const, badge: '175', heading: 90 });
    const s1 = toMapState({ points: [stop, bus(-23.19)] });
    const s2 = toMapState({ points: [stop, bus(-23.2)] });
    expect(s1.fitKey).toBe(s2.fitKey);
    expect(s1.fit).toHaveLength(1);
    expect(s1.points[1]).toMatchObject({ kind: 'vehicle', badge: '175', heading: 90 });
  });
  it('a página guarda os tiles no aparelho e escapa o texto dos ônibus', () => {
    const html = buildMapHtml();
    expect(html).toContain(JSON.stringify(TILE_CACHE_NAME));
    expect(html).toContain(`MAX_TILES = ${MAX_CACHED_TILES}`);
    expect(html).toContain('cache.put(url');
    expect(html).toContain("esc(p.badge)");
    expect(html).toContain("type === 'clearTiles'");
    // Cor só entra no HTML se for #RRGGBB
    expect(html).toContain('/^#[0-9a-fA-F]{6}$/');
  });
});

describe('avisos e horários na tela', () => {
  it('agrupa avisos iguais e reconhece horário de amanhã', () => {
    const a = { lineId: 1, kind: 'detour', title: 'Desvio', active: true };
    expect(uniqueAlerts([a, { ...a }, { ...a, lineId: 2 }])).toHaveLength(2);
    expect(uniqueAlerts(undefined)).toEqual([]);
    const night = new Date(2026, 9, 26, 22, 10);
    expect(isTomorrow('05:38', night)).toBe(true);
    expect(isTomorrow('22:30', night)).toBe(false);
    expect(isTomorrow('21:50', night)).toBe(false);
  });
});
