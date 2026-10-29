# ADR-002 — Tempo real simulado a partir da programação

**Status:** aceito (Sprint 2, US16/US17/US18)

## Contexto
Não há GPS embarcado nem feed GTFS-Realtime para a rede de demonstração. Mesmo assim o app precisa mostrar ônibus no
mapa, previsões com atraso e disparar avisos de atraso e de proximidade.

## Decisão
`backend/src/modules/realtime/simulation.ts` gera as viagens do dia a partir da programação (primeira/última partida
e intervalo). Cada viagem recebe um atraso **determinístico** (hash de linha + data + partida: 60 % no horário,
25 % 1–3 min, 12 % 4–7 min, 3 % 8–12 min) somado ao atraso dos avisos de serviço ativos. A posição é interpolada
entre as paradas pelo tempo decorrido.

- Viagens que já saíram usam o atraso atual (`live: true`); as que ainda não saíram usam a programação (+ aviso).
- Determinístico = os testes têm resultado fixo e todos os usuários veem o mesmo ônibus no mesmo lugar.

## Consequências
- A API (`/lines/:id/vehicles`, previsões com `live/delayMin/scheduledAt`) e o app já são os definitivos: ligar um
  feed real é reimplementar `tripInstances`/`vehicleOf` (RNF10), sem mudar contratos.
- O app deixa claro: "Posição simulada a partir da programação".
