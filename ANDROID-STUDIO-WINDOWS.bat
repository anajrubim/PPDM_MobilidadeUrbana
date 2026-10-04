@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mobilidade Urbana - Android Studio (API + Metro)
echo.
echo  Mobilidade Urbana - Sprint 1 pelo Android Studio (botao Run)
echo  1. Este script sobe o banco, a API e o Metro e abre a pasta mobile\android no Android Studio.
echo  2. No Android Studio, espere o "Gradle sync" terminar, escolha o emulador e clique em Run.
echo  Deixe esta janela aberta enquanto usa o app (Ctrl+C para parar).
echo.
where node >nul 2>&1 || (echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
if not exist backend\node_modules call npm run setup || goto erro
if not exist mobile\node_modules call npm run setup || goto erro
call npm run db:up || goto erro
call npm run seed || goto erro
rem local.properties: diz ao Gradle onde esta o Android SDK
set SDK=%ANDROID_HOME%
if "%SDK%"=="" set SDK=%LOCALAPPDATA%\Android\Sdk
if not exist "mobile\android\local.properties" (echo sdk.dir=%SDK:\=\\%> "mobile\android\local.properties")
set STUDIO=%ProgramFiles%\Android\Android Studio\bin\studio64.exe
if exist "%STUDIO%" (start "" "%STUDIO%" "%~dp0mobile\android") else (echo Abra o Android Studio e use File ^> Open ^> %~dp0mobile\android)
call npm run dev:android
goto fim
:erro
echo.
echo Algo falhou (veja as mensagens acima). Docker Desktop esta aberto?
:fim
pause
