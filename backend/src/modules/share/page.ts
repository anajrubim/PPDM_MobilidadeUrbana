const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface PublicShare {
  name: string;
  active: boolean;
  position: { lat: number; lng: number; at: string } | null;
  expiresAt: string;
  route: { line: { code: string; name: string; color: string }; dest: { name: string } | null; eta: string | null; etaInMin: number | null } | null;
}

const ago = (iso: string, now: Date) => {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? 'agora há pouco' : min === 1 ? 'há 1 minuto' : `há ${min} minutos`;
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** US29 — página aberta pelo contato: posição no mapa (OpenStreetMap embutido), linha e chegada prevista. */
export function sharePage(s: PublicShare | null, now: Date): string {
  let body: string;
  if (!s) {
    body = `<h1>Link inválido</h1><p class="sub">Este compartilhamento não existe. Confira o link recebido.</p>`;
  } else if (!s.active || !s.position) {
    body = `<h1>${esc(s.name)} parou de compartilhar</h1><p class="sub">O compartilhamento terminou. A localização não é mais exibida.</p>`;
  } else {
    const { lat, lng } = s.position;
    const d = 0.006;
    const bbox = [lng - d, lat - d, lng + d, lat + d].map((v) => v.toFixed(5)).join('%2C');
    const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&amp;layer=mapnik&amp;marker=${lat.toFixed(5)}%2C${lng.toFixed(5)}`;
    const big = `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&amp;mlon=${lng.toFixed(5)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`;
    const route = s.route
      ? `<div class="card"><span class="badge" style="background:${/^#[0-9a-f]{6}$/i.test(s.route.line.color) ? s.route.line.color : '#1B4F72'}">${esc(s.route.line.code)}</span>
         <div><strong>${esc(s.route.line.name)}</strong>${
           s.route.dest
             ? `<div class="sub">Indo para ${esc(s.route.dest.name)}${s.route.eta ? ` · chegada prevista às <strong>${esc(s.route.eta)}</strong> (~${s.route.etaInMin} min)` : ''}</div>`
             : ''
         }</div></div>`
      : '';
    body = `<h1>${esc(s.name)} está compartilhando a localização</h1>
<p class="sub">Atualizado ${ago(s.position.at, now)} · disponível até ${hhmm(s.expiresAt)}</p>
${route}
<iframe title="Mapa" src="${embed}" loading="lazy"></iframe>
<p><a href="${big}" rel="noopener noreferrer">Abrir no mapa</a></p>
<p class="foot">A página atualiza sozinha a cada 20 segundos.</p>`;
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${s?.active ? '<meta http-equiv="refresh" content="20">' : ''}
<meta name="robots" content="noindex,nofollow"><title>Localização compartilhada · Mobilidade Urbana</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F5F7FA;color:#1C2833;margin:0;padding:20px;max-width:720px;margin:auto}
.brand{color:#1B4F72;font-weight:800;font-size:14px;margin-bottom:14px}h1{font-size:20px;margin:0 0 4px}
.sub{color:#566573;font-size:14px;margin:0 0 14px}.card{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #E4E9EE;border-radius:14px;padding:12px;margin-bottom:14px}
.badge{color:#fff;font-weight:800;border-radius:9px;padding:6px 10px;min-width:30px;text-align:center}
iframe{width:100%;height:360px;border:1px solid #E4E9EE;border-radius:14px;background:#E8EEF2}a{color:#1B4F72;font-weight:700}.foot{color:#93A0AC;font-size:12px}
</style></head><body><div class="brand">Mobilidade Urbana</div>${body}</body></html>`;
}
