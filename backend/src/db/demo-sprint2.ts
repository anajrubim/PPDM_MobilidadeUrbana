import { hashPassword } from '../lib/password.js';
import { insertServiceAlert } from '../modules/realtime/service-alerts.js';
import { tripSegment } from '../modules/me/routes.js';
import { loadNetwork } from '../modules/transit/network.js';
import type { Db } from './pool.js';

/**
 * Dados de demonstração da Sprint 2 (idempotente): outros usuários com avaliações e denúncias (US21–US24),
 * avisos de serviço (US17), alerta de proximidade e viagem planejada da conta de demonstração (US18, US19).
 */
export async function seedSprint2(db: Db, demoEmail: string): Promise<void> {
  const net = await loadNetwork(db);
  const line = (code: string) => net.lines.find((l) => l.code === code)!;
  const demo = (await db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [demoEmail])).rows[0];
  if (!demo) return;

  // Outros passageiros (senha Senha@123), autores das avaliações e denúncias da comunidade
  const people = [
    ['Pedro Santos', 'pedro@email.com'],
    ['Carla Mendes', 'carla@email.com'],
    ['João Lima', 'joao@email.com'],
  ] as const;
  const ids: string[] = [];
  const hash = await hashPassword('Senha@123');
  for (const [name, email] of people) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT ((lower(email))) DO UPDATE SET name = users.name RETURNING id`,
      [name, email, hash],
    );
    ids.push(rows[0]!.id);
  }
  const [pedro, carla, joao] = ids as [string, string, string];

  const hasRatings = (await db.query('SELECT 1 FROM line_ratings LIMIT 1')).rowCount;
  if (!hasRatings) {
    const ratings: [string, string, number, string | null][] = [
      [pedro, '175', 4, 'Pontual, mas bem cheio no horário de pico.'],
      [carla, '175', 5, 'Motoristas educados e ônibus limpo.'],
      [joao, '175', 3, null],
      [pedro, '232', 3, 'Atrasa bastante na Av. Brasil por causa da obra.'],
      [carla, '232', 2, 'Esperei 25 minutos hoje cedo.'],
      [joao, '08', 5, 'Rápido até o shopping.'],
      [carla, 'E50', 5, 'Confortável, com ar-condicionado e tomada.'],
      [pedro, '875', 4, null],
    ];
    for (const [u, code, score, comment] of ratings) {
      await db.query(
        `INSERT INTO line_ratings (user_id, line_id, score, comment, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now() - random() * interval '6 days', now() - random() * interval '6 days')
         ON CONFLICT DO NOTHING`,
        [u, line(code).id, score, comment],
      );
    }
  }

  const hasReports = (await db.query('SELECT 1 FROM reports LIMIT 1')).rowCount;
  if (!hasReports) {
    const reports: [string, string, string, number | null, string | null, number, string[]][] = [
      // [autor, linha, tipo, índice da parada, descrição, horas atrás, quem confirmou]
      [pedro, '175', 'vehicle', null, 'Ar-condicionado quebrado e uma porta travando ao abrir.', 2, [carla, joao]],
      [carla, '175', 'delay', 1, 'Faixa das 7h às 9h sempre atrasa uns 10 minutos.', 26, [pedro]],
      [joao, '175', 'stop', 1, 'Ponto sem cobertura: quem espera toma chuva.', 50, []],
      [pedro, '232', 'overcrowding', null, 'Muito cheio depois das 17h.', 5, [joao]],
    ];
    for (const [u, code, category, stopIdx, description, hoursAgo, supporters] of reports) {
      const l = line(code);
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO reports (protocol, user_id, line_id, stop_id, category, description, created_at)
         VALUES ('DEN-' || extract(year FROM now())::int || '-' || lpad(nextval('report_protocol_seq')::text, 6, '0'),
                 $1, $2, $3, $4, $5, now() - make_interval(hours => $6)) RETURNING id`,
        [u, l.id, stopIdx == null ? null : l.stops[stopIdx]!.stopId, category, description, hoursAgo],
      );
      for (const s of supporters) await db.query('INSERT INTO report_supports (report_id, user_id) VALUES ($1, $2)', [rows[0]!.id, s]);
    }
  }

  // Avisos: atraso por obra na 232 (agora) e desvio da 08 no próximo sábado de manhã
  const hasAlerts = (await db.query("SELECT 1 FROM service_alerts WHERE ends_at > now() LIMIT 1")).rowCount;
  if (!hasAlerts) {
    const now = new Date();
    await insertServiceAlert(db, {
      lineId: line('232').id,
      kind: 'delay',
      title: 'Obra na Av. Brasil',
      message: 'Faixa interditada perto do Hospital Municipal: viagens até 6 min mais longas.',
      extraDelayMin: 6,
      startsAt: new Date(now.getTime() - 2 * 3600_000),
      endsAt: new Date(now.getTime() + 3 * 86_400_000),
    });
    const sat = new Date(now);
    sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
    const start = new Date(`${sat.toISOString().slice(0, 10)}T09:00:00Z`); // 06:00 em São Paulo
    await insertServiceAlert(db, {
      lineId: line('08').id,
      kind: 'detour',
      title: 'Desvio de itinerário no sábado',
      message: 'Das 6h às 14h a linha não passa pela Av. Brasil, 450. Use a linha 875 como alternativa.',
      startsAt: start,
      endsAt: new Date(start.getTime() + 8 * 3600_000),
    });
  }

  // Conta de demonstração: alerta de proximidade e uma viagem planejada com baldeação
  const l175 = line('175');
  await db.query(
    `INSERT INTO proximity_alerts (user_id, line_id, stop_id, minutes_before, window_start, window_end)
     VALUES ($1, $2, $3, 5, '06:00', '22:00') ON CONFLICT DO NOTHING`,
    [demo.id, l175.id, l175.stops[1]!.stopId],
  );
  const hasPlanned = (await db.query("SELECT 1 FROM trips WHERE user_id = $1 AND kind = 'planned'", [demo.id])).rowCount;
  if (!hasPlanned) {
    const l301 = line('301');
    const l08 = line('08');
    const terminal = l08.stops[0]!.stopId;
    const legs = [
      tripSegment(net, l301.id, l301.stops[0]!.stopId, terminal),
      tripSegment(net, l08.id, terminal, l08.stops.at(-1)!.stopId),
    ].map((seg) => ({
      lineId: seg.line.id,
      lineCode: seg.line.code,
      originStopId: seg.origin.id,
      destStopId: seg.dest.id,
      originLabel: seg.origin.name,
      destLabel: seg.dest.name,
      durationMin: seg.durationMin,
      distanceM: seg.distanceM,
    }));
    await db.query(
      `INSERT INTO trips (user_id, kind, line_id, line_code, origin_stop_id, dest_stop_id, origin_label, dest_label,
                          duration_min, distance_m, legs, transfers, walk_min, created_at)
       VALUES ($1, 'planned', $2, '301 + 08', $3, $4, $5, $6, $7, $8, $9, 1, 0, now() - interval '1 day')`,
      [
        demo.id,
        l301.id,
        legs[0]!.originStopId,
        legs[1]!.destStopId,
        legs[0]!.originLabel,
        legs[1]!.destLabel,
        legs[0]!.durationMin + legs[1]!.durationMin,
        legs[0]!.distanceM + legs[1]!.distanceM,
        JSON.stringify(legs),
      ],
    );
  }
  console.log('Sprint 2: avaliações, denúncias, avisos de serviço e alerta de proximidade de demonstração prontos.');
}
