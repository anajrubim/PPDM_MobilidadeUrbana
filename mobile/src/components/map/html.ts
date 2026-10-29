import { LEAFLET_CSS, LEAFLET_JS } from './leaflet-assets';

/**
 * Página do mapa (Leaflet + tiles do OpenStreetMap, sem chave de API).
 * Se o servidor do OSM recusar/falhar, troca sozinho para o mapa de ruas da Esri (também sem chave).
 * A mesma página roda numa WebView (Android/iOS) e num iframe (navegador).
 * Recebe comandos {type:'state'|'locate'|'clearTiles'} e avisa {type:'ready'|'point'|'tiles'|'tileStats'}.
 *
 * US28 — cada tile baixado fica guardado no aparelho (Cache API, até MAX_CACHED_TILES): ao voltar à mesma
 * região o mapa abre do cache, sem gastar dados móveis, e continua aparecendo sem internet.
 */
export const TILE_CACHE_NAME = 'mu-tiles-v1';
/** ~1.500 tiles ≈ 25 MB: cobre a cidade nos zooms usados pelo app. */
export const MAX_CACHED_TILES = 1500;

export const TILE_PROVIDERS = [
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Mapa © Esri · dados © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
];

const MAP_SCRIPT = `
(function () {
  var send = function (msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    else if (window.parent !== window) window.parent.postMessage(Object.assign({ __mu: 'out' }, msg), '*');
  };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // Cor vinda dos dados só entra no HTML se for #RRGGBB
  var color = function (c, fallback) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback; };
  var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([-23.19, -45.89], 13);

  // ---------- US28: cache de tiles no aparelho ----------
  var CACHE = ${JSON.stringify(TILE_CACHE_NAME)}, MAX_TILES = ${MAX_CACHED_TILES};
  var canCache = !!(window.caches && window.fetch && window.URL && URL.createObjectURL);
  var cacheP = canCache ? caches.open(CACHE).catch(function () { canCache = false; return null; }) : Promise.resolve(null);
  var stats = { cached: 0, network: 0 }, statsTimer = null, puts = 0;
  function reportStats() {
    if (statsTimer) return;
    statsTimer = setTimeout(function () { statsTimer = null; send({ type: 'tileStats', cached: stats.cached, network: stats.network }); }, 1500);
  }
  function trim() {
    // Poda na 1ª gravação da sessão e depois a cada 50 (sessões curtas também podam)
    if (puts++ % 50) return;
    cacheP.then(function (c) {
      if (!c) return;
      c.keys().then(function (keys) { for (var i = 0; i < keys.length - MAX_TILES; i++) c.delete(keys[i]); });
    });
  }
  var CachedTiles = L.TileLayer.extend({
    createTile: function (coords, done) {
      var tile = document.createElement('img');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');
      var url = this.getTileUrl(coords);
      var show = function (src) {
        tile.onload = function () { done(null, tile); if (src.indexOf('blob:') === 0) URL.revokeObjectURL(src); };
        tile.onerror = function (e) { done(e, tile); };
        tile.src = src;
      };
      cacheP.then(function (cache) {
        if (!cache) return show(url);
        return cache.match(url).then(function (hit) {
          if (hit) return hit.blob().then(function (b) { stats.cached++; reportStats(); show(URL.createObjectURL(b)); });
          return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (res) {
            if (!res.ok) throw new Error('tile ' + res.status);
            stats.network++; reportStats();
            cache.put(url, res.clone()).then(trim).catch(function () {});
            return res.blob().then(function (b) { show(URL.createObjectURL(b)); });
          });
        });
      }).catch(function () { show(url); });
      return tile;
    }
  });
  map.attributionControl.setPrefix(false);
  var providers = ${JSON.stringify(TILE_PROVIDERS)};
  var provider = 0, okTiles = 0, badTiles = 0, reported = null, base = null;
  var report = function () {
    var ok = okTiles > 0 || badTiles < 4;
    // Provedor falhando sem nenhum tile carregado: tenta o próximo antes de declarar "sem mapa"
    if (!ok && provider < providers.length - 1) { useProvider(provider + 1); return; }
    document.body.classList.toggle('offline', !ok);
    if (reported !== ok) { reported = ok; send({ type: 'tiles', ok: ok }); }
  };
  function useProvider(i) {
    provider = i; okTiles = 0; badTiles = 0;
    if (base) map.removeLayer(base);
    var p = providers[i];
    base = new CachedTiles(p.url, { maxZoom: p.maxZoom, attribution: p.attribution })
      .on('tileload', function () { okTiles++; report(); })
      .on('tileerror', function () { badTiles++; report(); })
      .addTo(map);
  }
  useProvider(0);

  var layer = L.layerGroup().addTo(map);
  var userLayer = L.layerGroup().addTo(map);
  // Ônibus ficam numa camada própria e só mudam de posição (não piscam a cada atualização)
  var busLayer = L.layerGroup().addTo(map);
  var buses = {};
  function busIcon(p) {
    return L.divIcon({
      className: '',
      html: '<div class="bus" style="background:' + color(p.color, '#219653') + '"><i style="transform:rotate(' + (Number(p.heading) || 0) + 'deg)"></i><b>' + esc(p.badge) + '</b></div>',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
  }
  var current = null, lastFitKey = null;

  function fit(points) {
    if (!points.length) return;
    if (points.length === 1) { map.setView(points[0], 16); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
  }

  function draw(state) {
    current = state;
    layer.clearLayers();
    state.paths.forEach(function (p) {
      L.polyline(p.coords, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(layer);
      L.polyline(p.coords, { color: p.color, weight: 5, opacity: 1, lineJoin: 'round' }).addTo(layer);
    });
    var seen = {};
    state.points.forEach(function (p) {
      var m;
      if (p.kind === 'vehicle') {
        seen[p.id] = true;
        var b = buses[p.id];
        if (b) {
          b.setLatLng(p.coord); b.setIcon(busIcon(p));
          if (p.label && b.getTooltip()) { var tt = document.createElement('span'); tt.textContent = p.label; b.setTooltipContent(tt); }
          return;
        }
        m = buses[p.id] = L.marker(p.coord, { icon: busIcon(p), zIndexOffset: 1000, keyboard: false });
        if (p.label) { var t = document.createElement('span'); t.textContent = p.label; m.bindTooltip(t, { direction: 'top', offset: [0, -14] }); }
        m.on('click', function () { send({ type: 'point', id: p.id }); });
        m.addTo(busLayer);
        return;
      }
      if (p.kind === 'highlight') {
        m = L.marker(p.coord, { icon: L.divIcon({ className: '', html: '<div class="pin" style="background:' + color(p.color, '#E74C3C') + '"></div>', iconSize: [26, 26], iconAnchor: [13, 26] }) });
      } else {
        m = L.circleMarker(p.coord, { radius: 6, color: color(p.color, '#1B4F72'), weight: 3, fillColor: '#fff', fillOpacity: 1 });
      }
      if (p.label) {
        // Texto puro (textContent): um nome com HTML nunca vira código dentro do mapa
        var tip = document.createElement('span');
        tip.textContent = p.label;
        m.bindTooltip(tip, { direction: 'top', offset: [0, -6] });
      }
      m.on('click', function () { send({ type: 'point', id: p.id }); });
      m.addTo(layer);
    });
    Object.keys(buses).forEach(function (id) { if (!seen[id]) { busLayer.removeLayer(buses[id]); delete buses[id]; } });
    userLayer.clearLayers();
    if (state.user) {
      L.marker(state.user, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="me"><div></div></div>', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(userLayer);
    }
    if (state.fitKey !== lastFitKey) { lastFitKey = state.fitKey; fit(state.fit); }
  }

  function handle(cmd) {
    if (!cmd || typeof cmd !== 'object') return;
    if (cmd.type === 'state') draw(cmd.state);
    if (cmd.type === 'locate' && current && current.user) map.setView(current.user, 16);
    if (cmd.type === 'clearTiles' && window.caches) caches.delete(CACHE).then(function () { cacheP = caches.open(CACHE); stats = { cached: 0, network: 0 }; });
  }
  window.__mu = handle;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
    if (d && d.__mu === 'in') handle(d);
  });
  send({ type: 'ready' });
})();
`;

const MAP_CSS = `
html, body, #map { height: 100%; margin: 0; padding: 0; background: #E8EEF2; }
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
body.offline #map { background-color: #E8EEF2; background-image: linear-gradient(#F4F7F9 2px, transparent 2px), linear-gradient(90deg, #F4F7F9 2px, transparent 2px); background-size: 46px 46px; }
body.offline .note { display: block; }
.note { display: none; position: absolute; z-index: 1000; left: 56px; right: 8px; top: 10px; background: rgba(255,255,255,.92); color: #566573; font-size: 11px; padding: 4px 8px; border-radius: 8px; }
.leaflet-container { font: inherit; }
.leaflet-tooltip { font-weight: 700; color: #1C2833; border-radius: 8px; }
.pin { width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); margin: 0 0 0 2px; }
.bus { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; position: relative; }
.bus b { color: #fff; font-size: 10px; font-weight: 800; letter-spacing: -.2px; }
.bus i { position: absolute; inset: -9px; pointer-events: none; }
.bus i::before { content: ''; position: absolute; left: 50%; top: 0; margin-left: -5px; border: 5px solid transparent; border-bottom: 7px solid #1C2833; border-top: 0; }
.me { width: 34px; height: 34px; border-radius: 50%; background: rgba(46,110,150,.22); display: flex; align-items: center; justify-content: center; animation: pulse 2s infinite; }
.me div { width: 14px; height: 14px; border-radius: 50%; background: #2E6E96; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(46,110,150,.35); } 70% { box-shadow: 0 0 0 12px rgba(46,110,150,0); } 100% { box-shadow: 0 0 0 0 rgba(46,110,150,0); } }
`;

/** `</script>` dentro do Leaflet embutido fecharia a tag antes da hora. */
const safeScript = (js: string) => js.replace(/<\/script/gi, '<\\/script');

export function buildMapHtml(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<base target="_blank">
<style>${LEAFLET_CSS}</style><style>${MAP_CSS}</style></head>
<body><div id="map"></div><div class="note">Mapa base indisponível (sem internet) — trajeto e paradas continuam visíveis</div>
<script>${safeScript(LEAFLET_JS)}</script><script>${MAP_SCRIPT}</script></body></html>`;
}

let cached: string | null = null;
export const mapHtml = () => (cached ??= buildMapHtml());
