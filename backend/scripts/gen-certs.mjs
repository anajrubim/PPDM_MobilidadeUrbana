// US13 — gera um certificado autoassinado para o HTTPS local (Windows, Linux e macOS, sem OpenSSL).
// Uso: npm run certs   (cria certs/dev-cert.pem e certs/dev-key.pem; não sobrescreve sem --force)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'certs');
const cert = path.join(dir, 'dev-cert.pem');
const key = path.join(dir, 'dev-key.pem');

if (existsSync(cert) && existsSync(key) && !process.argv.includes('--force')) {
  console.log(`Certificado já existe em ${dir} (use --force para gerar outro).`);
  process.exit(0);
}

// Vale para localhost, para o emulador Android (10.0.2.2) e para os IPs da máquina na rede local
const ips = new Set(['127.0.0.1', '10.0.2.2']);
for (const list of Object.values(networkInterfaces())) for (const n of list ?? []) if (n.family === 'IPv4') ips.add(n.address);

const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
  keySize: 2048,
  algorithm: 'sha256',
  extensions: [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, ...[...ips].map((ip) => ({ type: 7, ip }))] },
  ],
});
mkdirSync(dir, { recursive: true });
writeFileSync(cert, pems.cert);
// Chave só de desenvolvimento: legível também pelo usuário do container da API (docker compose --profile prod)
writeFileSync(key, pems.private, { mode: 0o644 });
console.log(`Certificado de desenvolvimento criado em ${dir} (válido por 365 dias).`);
