# ADR-004 — Offline com o cache do React Query persistido

**Status:** aceito (Sprint 2, US27/US28)

## Decisão
- O cache do React Query é salvo no aparelho (AsyncStorage) por 7 dias, com `networkMode: 'offlineFirst'`: o que
  já foi aberto aparece na hora, mesmo sem rede. Ficam de fora ônibus ao vivo, planejamento e compartilhamentos.
- O estado da conexão vem das próprias requisições (`lib/network.ts`), sem biblioteca nativa nova; sem conexão, a API
  é testada a cada 15 s e, quando volta, tudo é buscado de novo.
- "Usar sem internet" baixa a rede inteira com as mesmas chaves de cache das telas.
- Sem conexão (ou com dado salvo há mais de 5 min), os próximos horários são calculados no aparelho pela programação
  (`lib/schedule.ts`, mesmo algoritmo da API) — sem atrasos.
- Mapa: a página Leaflet guarda cada tile na Cache API (até 1.500) e a WebView usa `LOAD_CACHE_ELSE_NETWORK`.
- Sair da conta apaga o cache salvo; depois de restaurar o cache, tudo é revalidado (evita mostrar dado velho como novo).
