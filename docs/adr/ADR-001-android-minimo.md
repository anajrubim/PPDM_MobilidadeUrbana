# ADR-001 — Android mínimo: 7.0 (API 24)

**Status:** aceito (Sprint 2, US31) · **Decisão do PO:** Lucas Marins, 26/10/2026

## Contexto
O RNF8 e a US31 pedem suporte a partir do Android 5.0 (API 21). O app usa React Native 0.86 com Expo SDK 57,
que exigem **minSdk 24 (Android 7.0)**: o próprio React Native, o Hermes e as bibliotecas nativas (expo-location,
expo-notifications, react-native-webview) não compilam nem rodam abaixo disso.

## Opções
1. **Manter API 24 e documentar** — versões atuais e com suporte de segurança; nada a reescrever.
2. Voltar para RN 0.72/Expo 49 (último com API 21) — biblioteca de 2023 sem suporte, sem a nova arquitetura,
   várias dependências incompatíveis; retrabalho grande nas Sprints 1 e 2 e risco de falhas conhecidas.
3. Versão web (PWA) para aparelhos antigos — o Chrome atual também não roda mais em Android 5/6.

## Decisão
Opção 1. O mínimo fica declarado em `app.config.ts` (`expo-build-properties → minSdkVersion: 24`) e no projeto nativo
versionado (`android/gradle.properties`), e o teste `mobile/tests/compat.test.ts` confere os dois, a versão do app e a
permissão de notificações (Android 13+).

## Consequências
- Atende os aparelhos com Android 7.0 ou mais novo — a grande maioria dos celulares em uso no Brasil hoje.
- Android 5.0/6.0 ficam de fora; se for exigência contratual, só a opção 2 resolve (estimar como história própria).
