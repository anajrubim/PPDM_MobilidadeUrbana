#!/usr/bin/env sh
# Prepara e inicia o Mobilidade Urbana (Sprint 1) no Linux/macOS. Requer Node.js 22 e Docker.
# Uso: ./iniciar-linux.sh            (app no navegador)
#      ./iniciar-linux.sh --mobile   (QR Code para o Expo Go no celular)
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js não encontrado. Instale o Node 22: https://nodejs.org"; exit 1; }
exec npm start -- "$@"
