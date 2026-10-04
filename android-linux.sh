#!/usr/bin/env sh
# Mobilidade Urbana — Sprint 1 no Android (emulador do Android Studio), no Linux/macOS.
# Sobe banco + API, compila o APK, liga o emulador, instala e abre o app. Registro em android.log.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js não encontrado. Instale o Node 22: https://nodejs.org"; exit 1; }
exec node scripts/android.mjs tudo --log=android.log "$@"
