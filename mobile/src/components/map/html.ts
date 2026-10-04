import { LEAFLET_CSS, LEAFLET_JS } from './leaflet-assets';

/**
 * Página do mapa (Leaflet + tiles do OpenStreetMap, sem chave de API).
 * Se o servidor do OSM recusar/falhar, troca sozinho para o mapa de ruas da Esri (também sem chave).
 * A mesma página roda numa WebView (Android/iOS) e num iframe (navegador).
 * Recebe comandos {type:'state'|'locate'} e avisa {type:'ready'|'point'|'tiles'}.
 */
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
  var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([-23.19, -45.89], 13);
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
    base = L.tileLayer(p.url, { maxZoom: p.maxZoom, attribution: p.attribution })
      .on('tileload', function () { okTiles++; report(); })
      .on('tileerror', function () { badTiles++; report(); })
      .addTo(map);
  }
  useProvider(0);

  var layer = L.layerGroup().addTo(map);
  var userLayer = L.layerGroup().addTo(map);
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
    state.points.forEach(function (p) {
      var m;
      if (p.kind === 'highlight') {
        m = L.marker(p.coord, { icon: L.divIcon({ className: '', html: '<div class="pin" style="background:' + (p.color || '#E74C3C') + '"></div>', iconSize: [26, 26], iconAnchor: [13, 26] }) });
      } else {
        m = L.circleMarker(p.coord, { radius: 6, color: p.color || '#1B4F72', weight: 3, fillColor: '#fff', fillOpacity: 1 });
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
.me { width: 34px; height: 34px; border-radius: 50%; background: rgba(46,110,150,.22); display: flex; align-items: center; justify-content: center; animation: pulse 2s infinite; }
.me div { width: 14px; height: 14px; border-radius: 50%; background: #2E6E96; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(46,110,150,.35); } 70% { box-shadow: 0 0 0 12px rgba(46,110,150,0); } 100% { box-shadow: 0 0 0 0 rgba(46,110,150,0); } }
`;

/** `</script>` dentro do Leaflet embutido fecharia a tag antes da hora. */
const safeScript = (js: string) => js.replace(/<\/script/gi, '<\\/script');

export function buildMapHtml(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${LEAFLET_CSS}</style><style>${MAP_CSS}</style></head>
<body><div id="map"></div><div class="note">Mapa base indisponível (sem internet) — trajeto e paradas continuam visíveis</div>
<script>${safeScript(LEAFLET_JS)}</script><script>${MAP_SCRIPT}</script></body></html>`;
}

let cached: string | null = null;
export const mapHtml = () => (cached ??= buildMapHtml());
