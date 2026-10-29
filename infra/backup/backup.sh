#!/bin/sh
# US30 — backup completo do PostgreSQL a cada 24 h, com retenção e verificação.
#
# Roda no container "backup" do docker-compose (imagem postgres:16-alpine) ou em qualquer máquina com pg_dump.
# Variáveis:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE   conexão com o banco
#   BACKUP_DIR            pasta dos arquivos (no compose: volume ligado ao servidor secundário)   [/backups]
#   BACKUP_INTERVAL_H     intervalo entre backups, em horas                                       [24]
#   BACKUP_KEEP_DAYS      apaga backups mais antigos que isso                                     [7]
#   BACKUP_ONCE=1         faz um backup e sai (usado por "npm run backup" e pelo CI)
#   BACKUP_POST_CMD       comando opcional depois de cada backup (ex.: rclone copy para outro servidor);
#                         recebe o caminho do arquivo em $1
set -eu

DIR="${BACKUP_DIR:-/backups}"
INTERVAL_H="${BACKUP_INTERVAL_H:-24}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
DB="${PGDATABASE:-dmr}"

log() { echo "[backup $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

run_backup() {
  mkdir -p "$DIR"
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  file="$DIR/${DB}-${stamp}.dump"
  tmp="$file.partial"
  # Formato custom (-Fc): compactado, restaura tabela a tabela com pg_restore
  if ! pg_dump -Fc --no-owner --no-privileges -d "$DB" -f "$tmp"; then
    rm -f "$tmp"
    log "ERRO: pg_dump falhou"
    return 1
  fi
  # Confere se o arquivo é um backup legível antes de considerá-lo válido
  if ! pg_restore --list "$tmp" > /dev/null; then
    rm -f "$tmp"
    log "ERRO: o arquivo gerado não é um backup válido"
    return 1
  fi
  mv "$tmp" "$file"
  size="$(du -h "$file" | cut -f1)"
  log "ok: $file ($size)"
  # Retenção: apaga os mais antigos que BACKUP_KEEP_DAYS (só arquivos deste banco)
  find "$DIR" -maxdepth 1 -name "${DB}-*.dump" -type f -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] removido (antigo): /'
  if [ -n "${BACKUP_POST_CMD:-}" ]; then
    sh -c "$BACKUP_POST_CMD" backup "$file" || log "AVISO: BACKUP_POST_CMD falhou"
  fi
}

if [ "${BACKUP_ONCE:-0}" = "1" ]; then
  run_backup
  exit $?
fi

log "backups de '$DB' a cada ${INTERVAL_H} h em $DIR (mantém ${KEEP_DAYS} dias)"
while true; do
  # Uma falha não derruba o serviço: tenta de novo em 15 min
  if run_backup; then sleep "$((INTERVAL_H * 3600))"; else sleep 900; fi
done
