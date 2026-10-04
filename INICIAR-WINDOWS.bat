@echo off
REM Duplo clique: prepara e inicia o Mobilidade Urbana (Sprint 1) no Windows.
REM Requer Node.js 22 e o Docker Desktop aberto. Ctrl+C para parar.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo. & pause & exit /b 1)
call npm start
pause
