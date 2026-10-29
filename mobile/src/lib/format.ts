export function minutesLabel(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min <= 0) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Rótulo de dia para o histórico: HOJE · 08:02 / ONTEM · 18:24 / TER · 17:40 */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const day =
    days === 0
      ? 'HOJE'
      : days === 1
        ? 'ONTEM'
        : days < 7
          ? ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][d.getDay()]!
          : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${day} · ${time}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 1)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const SERVICE_LABEL = { normal: 'Comum', executivo: 'Executivo', noturno: 'Noturno', expresso: 'Expresso' } as const;

/** Previsão longa vira horário: "283 min" é ilegível, "05:03" não. */
export function etaLabel(min: number | null | undefined, now = new Date()): string {
  if (min == null) return '—';
  if (min <= 0) return 'agora';
  if (min <= 90) return `${String(min).padStart(2, '0')} min`;
  return new Date(now.getTime() + min * 60_000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Sprint 2 ----------

/** Nota média com uma casa e vírgula: 4,2 */
export const ratingLabel = (avg: number) => avg.toFixed(1).replace('.', ',');

/** "agora", "há 5 min", "há 2 h", "ontem", "há 3 dias", ou a data. */
export function timeAgo(iso: string, now = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export const PLAN_TAG_LABEL = {
  fastest: 'Mais rápida',
  least_walk: 'Menos caminhada',
  fewest_transfers: 'Menos baldeações',
  walk_only: 'A pé',
  later: 'Mais tarde',
} as const;

export const REPORT_CATEGORIES = [
  { key: 'overcrowding', label: 'Superlotação', icon: 'users' },
  { key: 'delay', label: 'Atraso grande', icon: 'clock' },
  { key: 'vehicle', label: 'Veículo com defeito', icon: 'wrench' },
  { key: 'driver', label: 'Comportamento do motorista', icon: 'user' },
  { key: 'cleanliness', label: 'Falta de limpeza', icon: 'trash' },
  { key: 'safety', label: 'Segurança', icon: 'shield' },
  { key: 'stop', label: 'Problema no ponto', icon: 'pin' },
  { key: 'other', label: 'Outro', icon: 'dots' },
] as const;

export const REPORT_STATUS_LABEL = { received: 'Recebida', in_review: 'Em análise', resolved: 'Resolvida', dismissed: 'Arquivada' } as const;

/** Atraso para mostrar ao lado da previsão: "+6 min" / "no horário". */
export function delayLabel(delayMin: number | undefined): string {
  if (!delayMin) return 'no horário';
  return `+${delayMin} min`;
}

/** Contagem regressiva grande do "Acompanhar ônibus": 03:20 (min:seg). */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Um aviso por linha + tipo + título (o mesmo desvio cadastrado duas vezes aparece uma vez só). */
export function uniqueAlerts<A extends { lineId: number; kind: string; title: string; active?: boolean }>(list: A[] | undefined): A[] {
  const seen = new Set<string>();
  return (list ?? []).filter((a) => {
    const k = `${a.lineId}|${a.kind}|${a.title}|${a.active ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** "amanhã" quando o horário HH:MM já passou hoje (ex.: sair às 05:38 sendo 22:10 agora). */
export function isTomorrow(hhmm: string, now = new Date()): boolean {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (h ?? 0) * 60 + (m ?? 0);
  const cur = now.getHours() * 60 + now.getMinutes();
  return t < cur - 60;
}
