import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../../app.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, parse } from '../../lib/http.js';
import type { Services } from '../realtime/services.js';
import { clockFor } from '../realtime/simulation.js';
import type { NetworkCache, Network } from '../transit/network.js';
import { planTrips, type Place } from './planner.js';

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const label = z.string().trim().max(80).optional();

const querySchema = z.object({
  fromStopId: idParam.optional(),
  fromLat: lat.optional(),
  fromLng: lng.optional(),
  fromLabel: label,
  toStopId: idParam.optional(),
  toLat: lat.optional(),
  toLng: lng.optional(),
  toLabel: label,
  /** Horário de saída (ISO 8601). Padrão: agora. */
  at: z.iso.datetime({ offset: true }).optional(),
});

function placeFrom(net: Network, side: 'from' | 'to', q: z.infer<typeof querySchema>): Place {
  const stopId = side === 'from' ? q.fromStopId : q.toStopId;
  const la = side === 'from' ? q.fromLat : q.toLat;
  const ln = side === 'from' ? q.fromLng : q.toLng;
  const name = side === 'from' ? q.fromLabel : q.toLabel;
  const what = side === 'from' ? 'origem' : 'destino';
  if (stopId != null) {
    const stop = net.stops.get(stopId);
    if (!stop) throw notFound(`Ponto de ${what}`);
    return { kind: 'stop', stop };
  }
  if (la == null || ln == null) throw badRequest(`Informe a ${what}: um ponto de parada ou uma localização`);
  return { kind: 'point', pos: [la, ln], label: name || (side === 'from' ? 'Sua localização' : 'Destino') };
}

/** US15/US26 — GET /plan: opções de rota com baldeação e tempo estimado. Público (o app usa logado ou não). */
export function plannerRoutes(deps: Deps, cache: NetworkCache, services: Services): Router {
  const r = Router();
  r.get('/plan', async (req, res) => {
    const q = parse(querySchema, req.query);
    const net = await cache.get();
    const from = placeFrom(net, 'from', q);
    const to = placeFrom(net, 'to', q);
    const now = deps.clock();
    const at = q.at ? new Date(q.at) : now;
    // A previsão só faz sentido de agora até o dia seguinte
    if (at.getTime() < now.getTime() - 60 * 60_000 || at.getTime() > now.getTime() + 24 * 60 * 60_000) {
      throw badRequest('Escolha um horário entre agora e as próximas 24 horas');
    }
    const extra = await services.alerts.extraDelay(at);
    const options = planTrips(net, from, to, clockFor(at), extra);
    res.json({
      data: {
        from: from.kind === 'stop' ? { stopId: from.stop.id, name: from.stop.name, lat: from.stop.lat, lng: from.stop.lng } : { name: from.label, lat: from.pos[0], lng: from.pos[1] },
        to: to.kind === 'stop' ? { stopId: to.stop.id, name: to.stop.name, lat: to.stop.lat, lng: to.stop.lng } : { name: to.label, lat: to.pos[0], lng: to.pos[1] },
        at: at.toISOString(),
        options,
      },
    });
  });
  return r;
}
