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
- Armadilhas de Resposta: Bloqueador de Magia e Sete Ferramentas do Bandido; Força do Espelho, Armadura Sakuretsu, Tributo Torrencial e Buraco Armadilha Sem Fundo como Armadilhas Normais com janelas específicas.
- Correntes resolvem na ordem inversa, os custos são pagos na ativação e destruir uma carta não significa negar seu efeito.

## NPCs e laboratório

Yugi, Kaiba e Joey utilizam somente os seus decks de 30 cartas definidos em `src/npcContent.ts`, que podem ser vistos integralmente no portal `/npc ver`. O modo `/duelo laboratorio` contém uma seleção auditada de **24 cartas** para testar efeitos sem mudar o inventário do jogador.

A regra de prontidão para esses decks é calculada por `node scripts/duel-readiness.cjs --require-complete`. O comando testa somente os baralhos definidos pelo nosso RPG e **não** certifica suporte universal de cartas.

## Verificação

`npm ci`, `npm run check`, `npm test` e `npm run progress`. O GitHub Actions gera também prévias da arena e da galeria. Os percentuais representam marcos da implementação atual, documentados em [ENGINE_PROGRESS.md](ENGINE_PROGRESS.md). Antes de produção são necessários revisão humana no Discord e testes de desempenho no host.

## Pendências

Efeitos rápidos de monstros, outras categorias de invocação, resolução avançada de eventos simultâneos, várias cartas clássicas adicionais, animações e refinamentos finais da interface. O PR deve continuar em rascunho até aprovação técnica e visual.

## Resolução de corrente: Livro da Lua, Tributo Torrencial, Sakuretsu e Sem Fundo

- **Livro da Lua (14087893, Magia Rápida):** seleção de um monstro revelado, que é colocado virado para baixo em Defesa. Pode responder em corrente com Velocidade de Magia 2, mas não no turno em que foi baixado. Bloqueador de Magia pode negar sua ativação. Livro da Lua não é Invocação-Virar nem ativa o FLIP.
- **Tributo Torrencial (53582587):** pode responder às Invocações Normal, Virar e Especial; destrói todos os monstros, inclusive virados para baixo, por efeito (sem ativar gatilhos que exigem destruição em batalha). Invocação Especial abre resposta após resolução de Polimerização, Monster Reborn e recrutamento do Tomate Místico.
- **Armadura Sakuretsu (56120475):** somente na declaração de ataque, seleciona o monstro atacante. Se o alvo sair do campo ou se tornar inválido antes da resolução, o efeito não o destrói; Sete Ferramentas pode negar a Armadilha.
- **Buraco Armadilha Sem Fundo (29401950):** contra a Invocação do adversário com ATK 1500+, destrói o monstro invocado e o move à zona de banidas de seu **proprietário**. Não envia a carta ao Cemitério e não gera gatilho por envio ao Cemitério. Livro da Lua pode impedir que seu alvo satisfaça as condições na resolução.
- **Buraco de Armadilha (04206964):** também responde a Invocações-Virar além de Invocações Normais, obedecendo aos 1000+ ATK. Não responde a Invocações-Especiais.

**Proteção de layout:** `src/duelRenderer.ts` preserva o campo de duelo **original, em tons âmbar**. O padrão azul é aplicável aos comandos e painéis adjacentes, nunca uma mudança obrigatória no tabuleiro. `tests/azureUI.test.cjs` protege a aparência anterior.

Testes: `tests/classicSummonResponses.test.cjs`, `tests/classicSakuretsu.test.cjs`, `tests/classicBanishment.test.cjs`, `tests/classicQuickSpells.test.cjs` e `tests/duelExpansion.test.cjs`.

As janelas implementadas cobrem esses efeitos auditados e **não são uma engine TCG completa**; efeitos simultâneos/SEGOC, timing avançado e cartas com outros tipos de efeito continuam pendentes.


## Auditoria posterior — integridade e janela de cálculo de dano

A revisão em [ENGINE_AUDIT.md](ENGINE_AUDIT.md) mantém o formato fixo e a arena
original. Ela adiciona contratos de execução e persistência, corrige as respostas
de Sete Ferramentas e Magias Rápidas, conserva gatilhos de fim de turno no turno
correto e distingue a janela anterior ao cálculo de dano do cálculo em si.
Kuriboh é um efeito rápido de monstro com custo de descarte da própria mão;
seu efeito não pode ser negado por Bloqueador de Magia ou Sete Ferramentas.
O banco antigo de versão 1 continua aceito quando válido. Registros corrompidos
são recusados sem serem apagados nem gerar recompensas.

`npm run audit:engine` executa um teste isolado de 300 partidas após o build.
O script permite `--games 1000` diretamente. Não usa o banco real do jogador.

A ordenação completa de gatilhos simultâneos, efeitos rápidos arbitrários e
replays de batalha continuam pendentes. Testes verdes não certificam regras
universais nem substituem uma partida real no Discord.
