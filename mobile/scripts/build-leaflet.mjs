// Gera src/components/map/leaflet-assets.ts com o Leaflet (JS + CSS) embutido como texto.
// Assim o mapa funciona no Expo Go e no navegador sem depender de CDN — só os tiles vêm da internet.
// Rode de novo apenas se atualizar a versão do pacote "leaflet".
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('leaflet/dist/leaflet.js'));
const js = readFileSync(path.join(dist, 'leaflet.js'), 'utf8');
const css = readFileSync(path.join(dist, 'leaflet.css'), 'utf8');
const version = JSON.parse(readFileSync(path.join(dist, '..', 'package.json'), 'utf8')).version;
const out = path.join('src', 'components', 'map', 'leaflet-assets.ts');
writeFileSync(
  out,
  `// Gerado por scripts/build-leaflet.mjs a partir de leaflet@${version} (BSD-2-Clause). Não edite.\n` +
    `export const LEAFLET_VERSION = ${JSON.stringify(version)};\n` +
    `export const LEAFLET_CSS = ${JSON.stringify(css)};\n` +
    `export const LEAFLET_JS = ${JSON.stringify(js)};\n`,
);
console.log(`Leaflet ${version} embutido em ${out}`);
