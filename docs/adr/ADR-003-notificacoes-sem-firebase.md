# ADR-003 — Notificações sem Firebase (pronto para push remoto)

**Status:** aceito (Sprint 2, US17/US18/US25) · **Decisão do PO:** Lucas Marins, 26/10/2026

## Contexto
Push remoto no Android passa pelo Firebase Cloud Messaging, que exige um projeto Firebase do dono do app
(`google-services.json`). O projeto ainda não tem um.

## Decisão
1. Toda notificação é **gravada no banco** primeiro (histórico, US20), com chave de deduplicação.
2. O app busca as novas a cada 20 s (e ao voltar para o primeiro plano) e as mostra como **notificação do sistema**
   com `expo-notifications` (canal "Atrasos e alertas de ônibus"). Funciona com o app aberto ou recém-minimizado.
3. A API já tem o envio pelo Expo Push Service (`PUSH_PROVIDER=expo`) e o registro dos aparelhos
   (`PUT /me/devices`). Ligar o push remoto = criar o projeto Firebase e seguir [NOTIFICACOES.md](../NOTIFICACOES.md).

## Consequências
- Com o app fechado há muito tempo, os avisos só aparecem ao abrir (ficam no histórico) até o FCM ser configurado.
- Nenhuma mudança de código para ligar o push: só configuração.
