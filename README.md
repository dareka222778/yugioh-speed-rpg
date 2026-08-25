# Yu-Gi-Oh! Speed RPG

Bot de Discord para um RPG de cartas inspirado em Speed Duel.

## V0

- `/ping`
- `/start` com escolha de deck inicial
- `/perfil`
- Persistência local em SQLite
- Base pronta para coleção, loja, mercado e duelos

## Rodando localmente

1. Instale Node.js 20+.
2. Copie `.env.example` para `.env`.
3. Preencha `DISCORD_TOKEN` e `DISCORD_CLIENT_ID`.
4. Rode `npm install`.
5. Rode `npm run dev`.

> Nunca envie seu token do Discord para ninguém e nunca coloque o `.env` no GitHub.

## Próximas etapas

1. Importador de cartas Speed Duel / primeira geração.
2. Coleção e editor de deck.
3. Motor de duelo 1v1.
4. Renderer visual do campo.
5. NPCs e recompensas.
6. Loja rotativa.
7. Market entre jogadores.
8. Eventos, PvP e Tag Duel 2v2.
