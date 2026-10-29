import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { cleanText, publicAuthor } from '../src/modules/community/text.js';
import { MAX_REPORTS_PER_HOUR } from '../src/modules/community/reports.js';
import { auth, FIXED_NOW, lineId, registerAndLogin, useTestApp } from './helpers.js';

const ctx = useTestApp({ withNetwork: true });
const api = () => request(ctx.app);
const minutes = (n: number) => new Date(FIXED_NOW.getTime() + n * 60_000);

describe('textos de usuário', () => {
  it('limpa controles e invisíveis, mantém quebras de linha e vira null quando vazio', () => {
    const s = cleanText(50);
    expect(s.parse('  Ônibus​   lotado\r\n\r\n\r\n\r\nde novo\u0007 ')).toBe('Ônibus lotado\n\nde novo');
    expect(s.parse('   ')).toBeNull();
    expect(s.safeParse('x'.repeat(51)).success).toBe(false);
  });
  it('nome público: primeiro nome + inicial', () => {
    expect(publicAuthor('Marina Alves')).toBe('Marina A.');
    expect(publicAuthor('Marina de Souza Alves')).toBe('Marina A.');
    expect(publicAuthor('Lucas')).toBe('Lucas');
    expect(publicAuthor('  ')).toBe('Usuário');
  });
});

describe('US21/US22 — avaliação de linhas e média', () => {
  it('avalia com nota e comentário, reavalia (substitui) e a média aparece na linha e na lista', async () => {
    const id = await lineId(ctx, '175');
    const a = await registerAndLogin(ctx);
    const b = await registerAndLogin(ctx, { name: 'Pedro Santos', email: 'pedro@email.com' });

    const r1 = await api().put(`/api/v1/lines/${id}/rating`).set(auth(a.token)).send({ score: 4, comment: 'Pontual, mas cheio no pico' }).expect(201);
    expect(r1.body.data.rating).toMatchObject({ score: 4, comment: 'Pontual, mas cheio no pico', author: 'Marina A.', mine: true });
    expect(r1.body.data.summary).toMatchObject({ average: 4, count: 1 });

    await api().put(`/api/v1/lines/${id}/rating`).set(auth(b.token)).send({ score: 1 }).expect(201);
    // Reavaliar substitui (continua 2 avaliações)
    ctx.now.value = minutes(5);
    const r2 = await api().put(`/api/v1/lines/${id}/rating`).set(auth(a.token)).send({ score: 5, comment: 'Melhorou!' }).expect(200);
    expect(r2.body.data.summary).toMatchObject({ average: 3, count: 2, distribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 } });

    const pub = await api().get(`/api/v1/lines/${id}/ratings`).expect(200);
    expect(pub.body.data.summary).toMatchObject({ average: 3, count: 2 });
    expect(pub.body.data.mine).toBeNull();
    // Só avaliações com comentário aparecem na lista; sem e-mail ou id de quem avaliou
    expect(pub.body.data.items).toEqual([expect.objectContaining({ score: 5, comment: 'Melhorou!', author: 'Marina A.', mine: false })]);
    expect(JSON.stringify(pub.body.data)).not.toContain('@email.com');

    const mine = await api().get(`/api/v1/lines/${id}/ratings`).set(auth(a.token)).expect(200);
    expect(mine.body.data.mine).toMatchObject({ score: 5, mine: true });

    const lines = await api().get('/api/v1/lines').expect(200);
    expect(lines.body.data.find((l: { id: number }) => l.id === id).rating).toEqual({ average: 3, count: 2 });
    expect(lines.body.data.find((l: { code: string }) => l.code === '232').rating).toEqual({ average: null, count: 0 });
    const detail = await api().get(`/api/v1/lines/${id}`).expect(200);
    expect(detail.body.data.rating).toEqual({ average: 3, count: 2 });

    await api().delete(`/api/v1/lines/${id}/rating`).set(auth(a.token)).expect(204);
    const after = await api().get(`/api/v1/lines/${id}/ratings`).expect(200);
    expect(after.body.data.summary).toMatchObject({ average: 1, count: 1 });
  });

  it('valida nota, comentário, login e linha', async () => {
    const id = await lineId(ctx, '175');
    const { token } = await registerAndLogin(ctx);
    await api().put(`/api/v1/lines/${id}/rating`).send({ score: 4 }).expect(401);
    for (const score of [0, 6, 3.5, '5']) await api().put(`/api/v1/lines/${id}/rating`).set(auth(token)).send({ score }).expect(422);
    await api().put(`/api/v1/lines/${id}/rating`).set(auth(token)).send({ score: 3, comment: 'x'.repeat(501) }).expect(422);
    await api().put('/api/v1/lines/99999/rating').set(auth(token)).send({ score: 3 }).expect(404);
    await api().put(`/api/v1/lines/${await lineId(ctx, '014')}/rating`).set(auth(token)).send({ score: 3 }).expect(409);
    // Comentário só com espaços vira "sem comentário"
    const r = await api().put(`/api/v1/lines/${id}/rating`).set(auth(token)).send({ score: 3, comment: '   ' }).expect(201);
    expect(r.body.data.rating.comment).toBeNull();
  });
});

describe('US23–US25 — denúncias', () => {
  async function stopOf(code: string, i = 2) {
    return (await api().get(`/api/v1/lines/${await lineId(ctx, code)}`).expect(200)).body.data.stops[i];
  }

  it('denuncia, recebe protocolo e notificação de confirmação (US25)', async () => {
    const { token } = await registerAndLogin(ctx);
    const id = await lineId(ctx, '175');
    const stop = await stopOf('175');
    const res = await api()
      .post('/api/v1/reports')
      .set(auth(token))
      .send({ lineId: id, stopId: stop.id, category: 'overcrowding', description: 'Muito cheio às 8h' })
      .expect(201);
    const r = res.body.data;
    expect(r).toMatchObject({
      protocol: expect.stringMatching(/^DEN-2026-\d{6}$/),
      line: { code: '175' },
      stop: { id: stop.id },
      category: 'overcrowding',
      categoryLabel: 'Superlotação',
      status: 'received',
      people: 1,
      mine: true,
    });
    const notes = (await api().get('/api/v1/me/notifications').set(auth(token)).expect(200)).body.data.items;
    expect(notes[0]).toMatchObject({ type: 'report', title: 'Denúncia registrada' });
    expect(notes[0].body).toContain(r.protocol);
    const mine = await api().get('/api/v1/me/reports').set(auth(token)).expect(200);
    expect(mine.body.data).toEqual([expect.objectContaining({ id: r.id, protocol: r.protocol })]);
  });

  it('US24 — vê denúncias de outros (anônimas), com resumo por tipo e "também passei por isso"', async () => {
    const id = await lineId(ctx, '175');
    const a = await registerAndLogin(ctx);
    const b = await registerAndLogin(ctx, { email: 'b@email.com' });
    const c = await registerAndLogin(ctx, { email: 'c@email.com' });
    const vehicle = await api().post('/api/v1/reports').set(auth(a.token)).send({ lineId: id, category: 'vehicle', description: 'Ar quebrado' }).expect(201);
    ctx.now.value = minutes(1);
    await api().post('/api/v1/reports').set(auth(b.token)).send({ lineId: id, category: 'delay' }).expect(201);
    ctx.now.value = minutes(2);
    await api().put(`/api/v1/reports/${vehicle.body.data.id}/support`).set(auth(b.token)).expect(204);
    await api().put(`/api/v1/reports/${vehicle.body.data.id}/support`).set(auth(c.token)).expect(204);
    // Repetir não conta duas vezes; o autor não pode apoiar a própria
    await api().put(`/api/v1/reports/${vehicle.body.data.id}/support`).set(auth(c.token)).expect(204);
    await api().put(`/api/v1/reports/${vehicle.body.data.id}/support`).set(auth(a.token)).expect(400);

    const pub = await api().get(`/api/v1/lines/${id}/reports`).expect(200);
    const d = pub.body.data;
    expect(d.total).toBe(2);
    expect(d.summary[0]).toMatchObject({ category: 'vehicle', label: 'Veículo com defeito', reports: 1, people: 3 });
    expect(d.summary[1]).toMatchObject({ category: 'delay', people: 1 });
    // Ninguém vê o protocolo nem quem denunciou
    expect(d.items.every((it: { protocol?: string; mine: boolean }) => it.protocol === undefined && !it.mine)).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/@email\.com|user_id|userId/);

    const asC = await api().get(`/api/v1/lines/${id}/reports`).set(auth(c.token)).expect(200);
    expect(asC.body.data.items.find((it: { id: string }) => it.id === vehicle.body.data.id).supportedByMe).toBe(true);
    await api().delete(`/api/v1/reports/${vehicle.body.data.id}/support`).set(auth(c.token)).expect(204);
    const again = await api().get(`/api/v1/lines/${id}/reports`).expect(200);
    expect(again.body.data.summary[0].people).toBe(2);

    // Fora da janela de dias não aparece
    ctx.now.value = minutes(8 * 1440);
    expect((await api().get(`/api/v1/lines/${id}/reports`).expect(200)).body.data.total).toBe(0);
    expect((await api().get(`/api/v1/lines/${id}/reports?days=30`).expect(200)).body.data.total).toBe(2);
  });

  it('impede denúncia repetida em pouco tempo e excesso por hora', async () => {
    const { token } = await registerAndLogin(ctx);
    const id = await lineId(ctx, '175');
    await api().post('/api/v1/reports').set(auth(token)).send({ lineId: id, category: 'delay' }).expect(201);
    const dup = await api().post('/api/v1/reports').set(auth(token)).send({ lineId: id, category: 'delay' }).expect(409);
    expect(dup.body.error.code).toBe('duplicate_report');
    ctx.now.value = minutes(31);
    await api().post('/api/v1/reports').set(auth(token)).send({ lineId: id, category: 'delay' }).expect(201);
    const cats = ['overcrowding', 'vehicle', 'driver', 'cleanliness', 'safety', 'stop', 'other'];
    let created = 2;
    for (const [i, category] of cats.entries()) {
      for (const lineCode of ['232', '08']) {
        if (created >= MAX_REPORTS_PER_HOUR) break;
        const r = await api()
          .post('/api/v1/reports')
          .set(auth(token))
          .send({ lineId: await lineId(ctx, lineCode), category, description: `teste ${i}` });
        expect(r.status).toBe(201);
        created++;
      }
    }
    const tooMany = await api().post('/api/v1/reports').set(auth(token)).send({ lineId: await lineId(ctx, '875'), category: 'other', description: 'x' }).expect(429);
    expect(tooMany.body.error.code).toBe('rate_limited');
  });

  it('valida linha, parada da linha, tipo e descrição', async () => {
    const { token } = await registerAndLogin(ctx);
    const id = await lineId(ctx, '175');
    const e50Stop = await stopOf('E50', 3);
    await api().post('/api/v1/reports').send({ lineId: id, category: 'delay' }).expect(401);
    await api().post('/api/v1/reports').set(auth(token)).send({ lineId: 99999, category: 'delay' }).expect(404);
    await api().post('/api/v1/reports').set(auth(token)).send({ lineId: id, stopId: e50Stop.id, category: 'delay' }).expect(400);
    await api().post('/api/v1/reports').set(auth(token)).send({ lineId: id, category: 'alien' }).expect(422);
    // "Outro" precisa de descrição
    const other = await api().post('/api/v1/reports').set(auth(token)).send({ lineId: id, category: 'other' }).expect(422);
    expect(other.body.error.details[0].field).toBe('description');
    await api().post('/api/v1/reports').set(auth(token)).send({ lineId: id, category: 'delay', description: 'x'.repeat(1001) }).expect(422);
    await api().put('/api/v1/reports/00000000-0000-0000-0000-000000000000/support').set(auth(token)).expect(404);
    await api().get('/api/v1/lines/99999/reports').expect(404);
  });
});
