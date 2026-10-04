@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mobilidade Urbana - Android
echo.
echo  Mobilidade Urbana - Sprint 1 no Android (emulador do Android Studio)
echo  Sobe banco + API, compila o APK (5 a 20 min na 1a vez), liga o emulador, instala e abre o app.
echo  Pre-requisitos: Node.js 22, Docker Desktop aberto, Android Studio com um emulador criado.
echo  Registro completo em android.log
echo.
where node >nul 2>&1 || (echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
node scripts/android.mjs tudo --log=android.log %*
echo.
findstr /c:"PRONTO" android.log >nul && echo Tudo certo: o app esta aberto no emulador. || echo Algo falhou. Veja android.log
if defined SEM_PAUSA exit /b
pause
