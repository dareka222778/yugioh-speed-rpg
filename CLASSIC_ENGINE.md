# Motor de duelos — Speed RPG

## Objetivo

Uma adaptação própria de Yu-Gi-Oh! para bot Discord, com **4.000 PV**, três zonas de monstros, três de Magia/Armadilha, Deck Principal de **20–30 cartas**, fase de batalha e sem Skills nesta etapa. Esta engine não promete suporte integral ao TCG/anime.

O **catálogo jogável** é `src/effectRegistry.ts`, composto pelos monstros normais explicitamente identificados em `src/cardCatalog.ts`/`src/classicEngineCards.ts` e cartas com efeitos programados individualmente. A engine nunca executa genericamente um efeito que não tenha definição.

## Efeitos implementados

- FLIP: Inseto Devorador de Homens, Hane-Hane, Mago da Fé, Máscara das Trevas e Anjo Esquelético.
- Ignição e custo: Soldado Canhão; Tributos, descarte e pagamentos de PV.
- Cemitério: Sangan e Bruxa da Floresta Negra; busca privada no Deck.
- Destruição em batalha: Tomate Místico e Invocação-Especial de monstro elegível do Deck.
- Eventos de invocação: Ventríloco Misterioso.
- Contínuo: Jinzo bloqueia Armadilhas conforme seu estado no campo.
- Magias: Pote da Ganância, Raigeki, Tufão Espacial Místico, Polimerização e outras operações explicitamente definidas.
- Armadilhas de Resposta: Bloqueador de Magia e Sete Ferramentas do Bandido.
- Correntes resolvem na ordem inversa, os custos são pagos na ativação e destruir uma carta não significa negar seu efeito.

## NPCs e laboratório

Yugi, Kaiba e Joey utilizam somente os seus decks de 30 cartas definidos em `src/npcContent.ts`, que podem ser vistos integralmente no portal `/npc ver`. O modo `/duelo laboratorio` contém uma seleção auditada de 20 cartas para testar efeitos sem mudar o inventário do jogador.

A regra de prontidão para esses decks é calculada por `node scripts/duel-readiness.cjs --require-complete`. O comando testa somente os baralhos definidos pelo nosso RPG e **não** certifica suporte universal de cartas.

## Verificação

`npm ci`, `npm run check`, `npm test` e `npm run progress`. O GitHub Actions gera também prévias da arena e da galeria. Os percentuais representam marcos da implementação atual, documentados em [ENGINE_PROGRESS.md](ENGINE_PROGRESS.md). Antes de produção são necessários revisão humana no Discord e testes de desempenho no host.

## Pendências

Efeitos rápidos de monstros, outras categorias de invocação, resolução avançada de eventos simultâneos, várias cartas clássicas adicionais, animações e refinamentos finais da interface. O PR deve continuar em rascunho até aprovação técnica e visual.
