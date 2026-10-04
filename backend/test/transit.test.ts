import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { auth, lineId, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);

interface LineDto {
  id: number;
  code: string;
  name: string;
  status: string;
  isFavorite: boolean;
}

describe('US05 — lista de todas as linhas', () => {
  it('lista as linhas ativas em ordem de código', async () => {
    const res = await api().get('/api/v1/lines').expect(200);
    const codes = res.body.data.map((l: LineDto) => l.code);
    expect(codes).toEqual(['08', '175', '175B', '175E', '232', '301', '875', 'E50', 'N10']);
    expect(res.body.data[0]).toMatchObject({
      code: '08',
      name: 'Terminal → Shopping Colinas',
      origin: 'Terminal',
      destination: 'Shopping Colinas',
      color: expect.stringMatching(/^#/),
      stopsCount: 9,
      headwayMin: 20,
      firstDeparture: '06:00',
      lastDeparture: '22:00',
      operating: true,
      isFavorite: false,
    });
  });

  it('linhas desativadas só aparecem quando pedidas', async () => {
    const res = await api().get('/api/v1/lines?includeInactive=true').expect(200);
    expect(res.body.data.find((l: LineDto) => l.code === '014')).toMatchObject({ status: 'inactive', operating: false });
  });

  it('filtra por tipo de serviço', async () => {
    const res = await api().get('/api/v1/lines?serviceType=noturno').expect(200);
    expect(res.body.data.map((l: LineDto) => l.code)).toEqual(['N10']);
  });
});

describe('US06 — busca por nome ou número', () => {
  it('número exato vem primeiro, depois os que começam com ele', async () => {
    const res = await api().get('/api/v1/lines?q=175').expect(200);
    expect(res.body.data.map((l: LineDto) => l.code)).toEqual(['175', '175B', '175E']);
  });

  it('busca pelo nome sem acento e sem diferenciar maiúsculas', async () => {
    const res = await api().get('/api/v1/lines?q=SATELITE').expect(200);
    expect(res.body.data.map((l: LineDto) => l.code)).toEqual(['232']);
  });

  it('busca por origem/destino', async () => {
    const res = await api().get('/api/v1/lines?q=aeroporto').expect(200);
    expect(res.body.data.map((l: LineDto) => l.code)).toEqual(['E50']);
  });

  it('sem resultado devolve lista vazia', async () => {
    const res = await api().get('/api/v1/lines?q=xyz123').expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('valida o tamanho do termo', async () => {
    await api()
      .get(`/api/v1/lines?q=${'a'.repeat(61)}`)
      .expect(422);
  });
});

describe('US07/US08 — trajeto e paradas da linha', () => {
  it('devolve o trajeto (lat/lng) e as paradas em ordem', async () => {
    const id = await lineId(ctx, '175');
    const res = await api().get(`/api/v1/lines/${id}`).expect(200);
    const l = res.body.data;
    expect(l.code).toBe('175');
    expect(l.shape.length).toBeGreaterThanOrEqual(2);
    for (const [lat, lng] of l.shape) {
      expect(lat).toBeGreaterThan(-24);
      expect(lat).toBeLessThan(-23);
      expect(lng).toBeGreaterThan(-46);
      expect(lng).toBeLessThan(-45.8);
    }
    expect(l.stops).toHaveLength(12);
    expect(l.stops.map((s: { seq: number }) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(l.stops[0]).toMatchObject({ name: 'Terminal Central', offsetMin: 0 });
    expect(l.stops.at(-1).name).toBe('Vila Ema (final)');
    expect(l.lengthM).toBeGreaterThan(2000);
    expect(l.durationMin).toBe(l.stops.at(-1).offsetMin);
  });

  it('cada parada traz o próximo horário previsto', async () => {
    const id = await lineId(ctx, '175');
    const res = await api().get(`/api/v1/lines/${id}`).expect(200);
    // 09:00 em São Paulo; partidas 05:00 + n×18 min → 09:12 sai do terminal
    expect(res.body.data.stops[0].nextArrival).toEqual({ inMin: 12, at: '09:12' });
  });

  it('linha inexistente → 404; id inválido → 422', async () => {
    await api().get('/api/v1/lines/99999').expect(404);
    await api().get('/api/v1/lines/abc').expect(422);
  });
});

describe('US08 — lista de pontos de parada', () => {
  it('lista em ordem alfabética com as linhas de cada ponto', async () => {
    const res = await api().get('/api/v1/stops').expect(200);
    const names = res.body.data.map((s: { name: string }) => s.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, 'pt-BR')));
    const terminal = res.body.data.find((s: { name: string }) => s.name === 'Terminal Central');
    expect(terminal.lines).toEqual(expect.arrayContaining(['175', '175B', '08', '875']));
    expect(terminal.lines).not.toContain('014'); // linha desativada não aparece
  });

  it('ordena pela distância até a localização informada', async () => {
    const res = await api().get('/api/v1/stops?sort=distance&lat=-23.1866&lng=-45.8846&limit=5').expect(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0].name).toBe('Terminal Central');
    const d = res.body.data.map((s: { distanceM: number }) => s.distanceM);
    expect(d).toEqual([...d].sort((a: number, b: number) => a - b));
  });

  it('ordena por número de linhas e busca por nome', async () => {
    const byLines = await api().get('/api/v1/stops?sort=lines').expect(200);
    expect(byLines.body.data[0].lines.length).toBeGreaterThanOrEqual(byLines.body.data[1].lines.length);
    const res = await api().get('/api/v1/stops?q=praca da matriz').expect(200);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(['Praça da Matriz']);
  });
});

describe('US09 — linhas da parada e horários previstos', () => {
  it('mostra as linhas que passam com os próximos horários e a tabela do dia', async () => {
    const list = await api().get('/api/v1/stops?q=Terminal Central').expect(200);
    const res = await api().get(`/api/v1/stops/${list.body.data[0].id}`).expect(200);
    const s = res.body.data;
    expect(s.name).toBe('Terminal Central');
    const l175 = s.lines.find((l: { code: string }) => l.code === '175');
    expect(l175.arrivals).toEqual([
      { inMin: 12, at: '09:12' },
      { inMin: 30, at: '09:30' },
      { inMin: 48, at: '09:48' },
    ]);
    expect(l175.timetable[0]).toBe('05:00');
    expect(l175.timetable).toContain('23:18');
    // ordenadas pela próxima chegada
    const next = s.lines.map((l: { arrivals: { inMin: number }[] }) => l.arrivals[0]?.inMin ?? 9999);
    expect(next).toEqual([...next].sort((a: number, b: number) => a - b));
  });

  it('linha circular passando duas vezes pelo ponto aparece uma vez só', async () => {
    const list = await api().get('/api/v1/stops?q=Terminal Central').expect(200);
    const res = await api().get(`/api/v1/stops/${list.body.data[0].id}`).expect(200);
    expect(res.body.data.lines.filter((l: { code: string }) => l.code === '875')).toHaveLength(1);
  });

  it('parada inexistente → 404', async () => {
    await api().get('/api/v1/stops/99999').expect(404);
  });
});

describe('US11 — favoritar linha', () => {
  it('favorita, aparece marcada na lista e pode ser removida', async () => {
    const { token } = await registerAndLogin(ctx);
    const id = await lineId(ctx, '232');
    const put = await api().put(`/api/v1/me/favorites/${id}`).set(auth(token)).expect(200);
    expect(put.body.data.map((l: LineDto) => l.code)).toEqual(['232']);
    // repetir não duplica
    await api().put(`/api/v1/me/favorites/${id}`).set(auth(token)).expect(200);

    const lines = await api().get('/api/v1/lines').set(auth(token)).expect(200);
    expect(lines.body.data.find((l: LineDto) => l.code === '232').isFavorite).toBe(true);
    expect(lines.body.data.find((l: LineDto) => l.code === '175').isFavorite).toBe(false);
    const detail = await api().get(`/api/v1/lines/${id}`).set(auth(token)).expect(200);
    expect(detail.body.data.isFavorite).toBe(true);

    const favs = await api().get('/api/v1/me/favorites').set(auth(token)).expect(200);
    expect(favs.body.data).toHaveLength(1);

    await api().delete(`/api/v1/me/favorites/${id}`).set(auth(token)).expect(204);
    const after = await api().get('/api/v1/me/favorites').set(auth(token)).expect(200);
    expect(after.body.data).toEqual([]);
  });

  it('favoritos são de cada usuário', async () => {
    const a = await registerAndLogin(ctx);
    const b = await registerAndLogin(ctx, { email: 'joao@email.com' });
    await api()
      .put(`/api/v1/me/favorites/${await lineId(ctx, '175')}`)
      .set(auth(a.token))
      .expect(200);
    const favs = await api().get('/api/v1/me/favorites').set(auth(b.token)).expect(200);
    expect(favs.body.data).toEqual([]);
  });

  it('linha inexistente → 404; sem login → 401', async () => {
    const { token } = await registerAndLogin(ctx);
    await api().put('/api/v1/me/favorites/99999').set(auth(token)).expect(404);
    await api().put('/api/v1/me/favorites/1').expect(401);
  });
});
