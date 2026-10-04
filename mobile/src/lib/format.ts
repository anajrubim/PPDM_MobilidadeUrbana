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
