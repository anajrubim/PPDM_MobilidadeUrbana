import { buildMapHtml, mapHtml } from '../map/html';
import { toMapState } from '../map/state';

const a = { latitude: -23.1865, longitude: -45.8845 };
const b = { latitude: -23.2046, longitude: -45.9046 };

describe('US07/US10 — estado do mapa', () => {
  it('converte trajeto, paradas e usuário', () => {
    const s = toMapState({
      paths: [{ id: 'l1', coords: [a, b], color: '#123' }],
      points: [{ id: 's1', coord: a, kind: 'stop', label: 'Terminal' }],
      user: b,
    });
    expect(s.paths).toEqual([
      {
        id: 'l1',
        color: '#123',
        coords: [
          [a.latitude, a.longitude],
          [b.latitude, b.longitude],
        ],
      },
    ]);
    expect(s.points[0]).toMatchObject({ id: 's1', kind: 'stop', coord: [a.latitude, a.longitude] });
    expect(s.user).toEqual([b.latitude, b.longitude]);
    expect(s.fit.length).toBe(4); // 2 do trajeto + 1 parada + usuário perto
  });

  it('trajeto com um ponto só não é desenhado', () => {
    expect(toMapState({ paths: [{ id: 'x', coords: [a], color: '#000' }] }).paths).toEqual([]);
  });

  it('a chave de enquadramento não muda quando só o usuário se move (o mapa não "pula")', () => {
    const base = { paths: [{ id: 'l1', coords: [a, b], color: '#123' }] };
    expect(toMapState({ ...base, user: a }).fitKey).toBe(toMapState({ ...base, user: b }).fitKey);
    expect(toMapState({ user: a }).fitKey).not.toBe(toMapState({}).fitKey);
    expect(toMapState({ fitTo: [a] }).fitKey).toBe('fit:-23.1865,-45.8845');
  });

  it('sem nada para mostrar, não há usuário', () => {
    expect(toMapState({})).toMatchObject({ paths: [], points: [], user: null, fit: [] });
  });
});

describe('página do mapa (Leaflet embutido)', () => {
  it('traz o Leaflet, os tiles OpenStreetMap (com reserva da Esri) e a ponte de mensagens', () => {
    const html = buildMapHtml();
    expect(html).toContain('<div id="map">');
    expect(html).toContain('L.map(');
    expect(html).toContain('tile.openstreetmap.org');
    expect(html).toContain('World_Street_Map');
    expect(html).toContain('OpenStreetMap');
    expect(html).toContain('ReactNativeWebView');
    // O Leaflet embutido não pode fechar a tag <script> antes da hora
    const scripts = html
      .split('<script>')
      .slice(1)
      .map((s) => s.split('</script>')[0]);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]!.length).toBeGreaterThan(100_000);
  });
  it('rótulos entram como texto puro (sem injeção de HTML)', () => {
    const html = buildMapHtml();
    expect(html).toContain('tip.textContent = p.label');
    expect(html).not.toContain('bindTooltip(p.label');
  });
  it('é gerada uma vez só', () => {
    expect(mapHtml()).toBe(mapHtml());
  });
});
