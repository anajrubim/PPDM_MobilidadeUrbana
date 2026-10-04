@echo off
REM Verificacao completa da Sprint 1 no Windows: instala, sobe o banco, roda lint/tipos/testes,
REM sobe API + app, roda os testes ponta a ponta e grava o video. Resultado em verificacao.log.
REM Requer Node.js 22 e o Docker Desktop aberto.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo. & pause & exit /b 1)
call npm run verify -- --video
pause
