# Portal de duelistas — Speed RPG

## Escopo do produto

O portal `/npc ver` mostra **somente as cartas que os duelistas usam no nosso RPG**. Joey, Yami Yugi e Seto Kaiba possuem **30 cartas no Deck Principal**, com Deck Adicional somente quando a engine oferece a Fusão correspondente. Não há listas alternativas de decks, nem navegação por cartas não implementadas.

## Experiência do jogador

1. Abra `/npc ver`: um duelista por vez, retrato grande, identidade própria, recompensa e desafio diário.
2. Use **Ver deck** para inspecionar as cartas do baralho jogável, em grupos de até 10.
3. Escolha **Ampliar carta** para visualizar uma carta individual, com arte, nome, tipo, nível, ATK/DEF e resumo do efeito usado no RPG.
4. Use **Anterior / Próxima / Voltar ao deck** para navegar. As cartas são lidas diretamente de `src/npcContent.ts`.
5. Clique em **Duelar** para enfrentar o personagem com aquele mesmo baralho. O acesso aos controles de navegação é restrito ao dono do painel.

O portal é uma interface de consulta: inspecionar uma carta não concede cartas, não altera a coleção e não modifica partidas existentes. Recompensas são creditadas apenas pelas regras de vitória/evento.

## Design

- `src/npcContent.ts` define os duelistas, suas 30 cartas jogáveis e recompensas.
- `src/npcUI.ts` valida o jogador, a página, o modo de exibição e a seleção.
- `src/npcRenderer.ts` gera a arte visual com retratos e identidade azul Azure.
- `src/npcPortraits.ts` contém retratos incorporados ao projeto; os pixels renderizam sem baixar retratos em runtime.
- `src/index.ts` roteia as interações do Discord. IDs antigos apontam para o navegador jogável ou falham na validação; não recriam listas paralelas.
- `src/cardArt.ts` só aceita imagens de cartas incluídas no catálogo habilitado do RPG.

Retratos/arte dos personagens: © Studio Dice / SHUEISHA, TV TOKYO, KONAMI. Projeto de fã não afiliado à Konami; o uso de ilustrações não implica licença para redistribuição comercial. A identidade visual e a estrutura de navegação foram feitas para este bot.

## Conteúdo exclusivo do nosso jogo

O Joey agora inclui **Força do Espelho** no deck de 30 cartas. O efeito funciona durante a declaração de ataque; a primeira vitória também pode conceder a carta. O deck não é uma reprodução de produto oficial, e o portal não oferece outra lista.

## Validação

Os testes em `tests/npcGallery.test.cjs`, `tests/interactions.test.cjs` e `tests/npc.test.cjs` verificam a identidade dos decks, navegação por índice, autoria dos botões, limites Discord e 30 partidas simuladas. O workflow também produz prévias PNG sem buscar artes na internet. Aceite visual humano no Discord ainda precisa acontecer antes de integrar à `main`.
