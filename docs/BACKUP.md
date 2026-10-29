# Backups do banco (US30)

## Automático, a cada 24 h (produção)

`docker compose --profile prod up -d` sobe também o serviço **`backup`** (`infra/backup/backup.sh`):

1. `pg_dump -Fc` do banco inteiro a cada `BACKUP_INTERVAL_H` horas (padrão 24);
2. confere o arquivo com `pg_restore --list` antes de considerá-lo válido (arquivo quebrado é descartado);
3. apaga os mais antigos que `BACKUP_KEEP_DAYS` dias (padrão 7);
4. roda `BACKUP_POST_CMD` (opcional) com o caminho do arquivo — para copiar a outro servidor.

Uma falha não derruba o serviço: ele tenta de novo em 15 minutos e registra no log (`docker compose logs backup`).

### Servidor secundário (RNF6)
Escolha um dos jeitos (no `.env` da raiz):

- **Pasta de rede montada** no servidor da API (NFS/SMB do servidor secundário): `BACKUP_DIR=/mnt/backup-secundario`
- **Cópia depois de cada backup**, ex. com rclone ou scp instalados numa imagem própria:
  `BACKUP_POST_CMD='rclone copy "$1" secundario:mobilidade-backups'`

Só os backups, sem a API (ex.: homologação): `docker compose --profile backup up -d backup`.

## Manual (desenvolvimento)

```bash
npm run backup                                          # backups/dmr-AAAAMMDD-HHMMSS.dump
npm run backup:list
npm run restore -- backups/dmr-20261026-220000.dump --sim   # APAGA os dados atuais e restaura
```

Sem Docker, com PostgreSQL instalado: acrescente `-- --no-docker` (usa `DATABASE_URL` do `backend/.env`).
A restauração roda numa transação só: se falhar, o banco fica como estava.

## Testes
O CI gera um backup do banco de testes a cada execução e confere com `pg_restore --list`. A restauração foi
testada num banco novo (todas as tabelas e as migrações voltaram).
