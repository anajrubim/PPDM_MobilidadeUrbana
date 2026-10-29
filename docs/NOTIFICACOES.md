# Notificações (US17, US18, US20, US25)

## Como funciona hoje
- A API grava cada notificação no histórico (`notifications`) e evita repetidas (chave de deduplicação).
- **Monitor** (`backend/src/modules/realtime/monitor.ts`, a cada `MONITOR_INTERVAL_S`, padrão 30 s):
  - avisos de serviço (desvio, atraso anunciado, suspensão) → quem tem a linha nos favoritos, até 12 h antes;
  - atraso de 5+ min numa linha favorita → no máximo um aviso por linha a cada hora;
  - alertas de proximidade → quando o próximo ônibus está a N minutos do ponto (uma vez por ônibus).
- Denúncia registrada → notificação de confirmação com o protocolo (US25).
- O app busca as novas a cada 20 s e as mostra como notificação do Android (canal "Atrasos e alertas de ônibus").
  No Android 13+ o app pede a permissão na primeira vez.

## Demonstrar
Com a API rodando: **http://localhost:3333/dev/simular** → escolha a linha (ex.: 175, favorita da Marina), o tipo e
"Criar aviso e notificar". Em segundos o sininho do Início mostra a notificação e o celular/emulador exibe o aviso.
(Ferramenta só de desenvolvimento: não existe em produção e só responde ao próprio computador.)

## Ligar o push remoto (app fechado)
1. Crie um projeto no [Firebase](https://console.firebase.google.com), adicione um app Android com o pacote
   `app.mobilidade.urbana` e baixe o `google-services.json` para `mobile/`.
2. Em `mobile/app.config.ts`, descomente `googleServicesFile: './google-services.json'` e coloque o
   `extra.eas.projectId` do seu projeto Expo (`npx eas init`); rode `npx expo prebuild --platform android`.
3. Envie a chave do FCM ao Expo (`npx eas credentials`).
4. Na API: `PUSH_PROVIDER=expo` (e `EXPO_ACCESS_TOKEN`, se o projeto exigir).

O app passa a registrar o token do aparelho (`PUT /me/devices`) e a API envia o push a cada notificação criada.
