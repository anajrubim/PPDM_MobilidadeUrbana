// Copia os .sql das migrações para dist/ (o tsc só compila .ts). Multiplataforma.
import { cpSync } from 'node:fs';
cpSync('src/db/migrations', 'dist/db/migrations', { recursive: true });
console.log('Migrações copiadas para dist/db/migrations');
