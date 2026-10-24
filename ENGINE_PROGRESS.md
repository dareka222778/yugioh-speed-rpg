# Acompanhamento — Engine clássica e redesign Duel Links

**Branch de trabalho:** `classic-engine-foundation` (não altera `main`).

**Métrica:** escopo da **primeira etapa de engine clássica adaptada** e da **futura reformulação visual**, cada uma com 100 pontos. Estes percentuais são **avaliações de marcos**, não uma porcentagem oficial de compatibilidade com todas as cartas da Konami. O comando `npm run progress` lê pontuações versionadas em `scripts/project-progress.cjs` e verifica separadamente a prontidão dos decks realmente jogáveis de Yugi, Kaiba e Joey.

## Estado desta revisão

| Área | Concluído | Falta |
| --- | ---: | ---: |
| Engine clássica adaptada | **78%** | **22%** |
| Reformulação visual inspirada em Duel Links | **56%** | **44%** |

A reformulação Azure está implementada parcialmente na arena, na mão, na galeria de NPCs e no editor de decks. Os **56 pontos representam trabalho funcional e testado automaticamente**, mas não substituem revisões humanas em desktop/mobile e ajustes gráficos finais.

### Critérios de pontuação da engine

| Entrega | Peso | Concluído | Observações |
| --- | ---: | ---: | --- |
| Formato 4000 PV, três zonas, 20–30 cartas | 10 | 10 | Implementado |
| Turnos, combate e encerramento | 9 | 9 | Implementado; mais detalhes de timing pendentes |
| Magias e Armadilhas | 9 | 8 | Bloqueador de Magia, Sete Ferramentas, Pote, Raigeki e Tufão jogáveis; outras cartas faltam |
| Correntes, prioridades e respostas | 10 | 8 | Correntes Speed 2/3, negação real e MST: destruir não nega; timing TCG completo falta |
| FLIP e cálculo de dano | 8 | 7 | Efeitos de cinco monstros reais; cenários raros pendentes |
| Ignição e custos | 8 | 7 | Cannon Soldier + mecanismo genérico de custo |
| Cemitério e buscas | 8 | 6 | Sangan/Witch e Tomate Místico; fila de eventos e busca/Invocação-Especial |
| Gatilhos de invocação e invocações especiais | 7 | 5 | Reações Normais/Virar e recrutamento DARK do Tomate Místico; especiais avançadas pendentes |
| Outros gatilhos de destruição | 7 | 2 | Causa de destruição em batalha separada de custo/efeito; regras amplas pendentes |
| Contínuos, rápidos, negações complexas | 8 | 4 | Jinzo, MST Rápido e negações; monstros rápidos e efeitos avançados pendentes |
| Catálogo de cartas utilizáveis no RPG | 7 | 4 | Registro de cartas executáveis e validação dos decks dos NPCs |
| IA dos NPCs | 4 | 4 | Reações, descarte, recrutamento, Magias Rápidas e decks de 30; heurística não exaustiva |
| CI, regressão e aceite no Discord | 5 | 4 | Testes de motor/UI e 30 partidas simuladas; aceite humano na hospedagem pendente |
| **Total** | **100** | **78** | |

O progresso de regras é **deliberadamente independente do total de cartas habilitadas**, pois um catálogo com muitos monstros normais não representa toda a complexidade de efeitos e correntes.

### Critérios da futura fase de layout

| Entrega | Peso | Concluído |
| --- | ---: | ---: |
| Sistema visual (azul, tipografia e hierarquia) | 12 | 9 |
| Retratos e identidade dos duelistas | 15 | 8 |
| Navegação individual de cartas e decks | 15 | 11 |
| Arena com HUD e campo de duelo | 20 | 13 |
| Feedback de efeitos e invocações | 12 | 4 |
| Responsividade e integração com Discord | 10 | 3 |
| Usabilidade e acessibilidade | 10 | 5 |
| Capturas, testes e revisão humana | 6 | 3 |
| **Total** | **100** | **56** |

## Regras para avançar pontuações

1. Entregas ganham pontos somente junto a código funcional, testes, documentação e/ou validação visual pertinentes.
2. A prontidão dos decks do nosso RPG é medida em `scripts/duel-readiness.cjs` e `npm run progress`, a partir do registro de efeitos que realmente funcionam.
3. Um resultado verde de CI confirma regressões testadas, **não** suporte integral às regras do jogo.
4. O redesenho só ganha pontos quando seus novos componentes forem realmente implementados e revisados; não se contabiliza layout legado.
5. Ao fim de cada bloco de desenvolvimento, executar `npm ci`, `npm run check`, `npm test`, `npm run progress`. No GitHub Actions, essas etapas rodam automaticamente para a branch.
6. Antes de incorporar à `main`, testar manualmente jogabilidade, resultados, cartas ocultas, persistência e apresentação no Discord.

## Próximos itens de maior impacto

- Resolver gatilhos adicionais de invocação e destruição com cartas clássicas verificadas.
- Ampliar efeitos rápidos, contínuos, condições de ativação, resolução e negação real de elos.
- Fazer testes simultâneos com mais efeitos encadeados, deck-out, alvos ausentes e partidas completas.
- Ampliar o conjunto de cartas jogáveis do RPG com implementação e teste de cada efeito novo, respeitando o formato de três zonas.
- Iniciar posteriormente o sistema de design azul e a galeria navegável, **um duelista/carta por vez**, com personagens e imagens consistentes.

## Efeito contínuo habilitado

**Jinzo (77585513):** no campo com a face para cima, impede a ativação de Armadilhas dos dois duelistas e nega efeitos de Armadilhas já ativadas que resolveriam enquanto ele ainda estiver em campo. Com a face para baixo ou ao sair do campo, a restrição não se aplica. A implementação segue o texto oficial do card (<https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4758&request_locale=pt>) e possui testes de invocação, virada, controle de ambos os lados, corrente e restauração após deixar o campo.

## Correntes com Armadilhas de Resposta e gatilhos de invocação

- **Bloqueador de Magia (77414722):** na resposta direta à ativação de uma Magia, descarta uma carta como custo; se a ativação não for negada por outra Armadilha, cancela a Magia, envia-a ao Cemitério e impede sua resolução. Aplica-se a Magias Normais, de Campo e à Polimerização.
- **Sete Ferramentas do Bandido (03819470):** responde diretamente à última ativação de Armadilha, custa 1000 PV pagos antes da corrente e impede a resolução do elo negado; também pode responder a outras Armadilhas de Resposta.
- **Prioridade de resposta:** Armadilhas comuns não podem responder a uma Armadilha de Resposta recém-ativada (Velocidade de Magia 3). As correntes são resolvidas do último elo para o primeiro, conservando custos já pagos.
- **Ventríloco Misterioso (54098121):** quando outro monstro de qualquer duelista é Invocado normalmente ou por Virar, ganha 500 PV para o controlador. Não ativa ao ser ele próprio invocado, por baixar monstro com a face para baixo ou por revelar um monstro durante batalha. Múltiplas cópias geram gatilhos em fila; interações simultâneas complexas continuam fora do escopo completo.
- O laboratório gratuito de cartas virtuais passa a conter os três itens acima, mantendo **20 cartas** e a Fusão demonstrativa.

**Limite conhecido:** essa implementação modela correntes e janelas de resposta das cartas acima, mas ainda não é um sistema TCG universal (por exemplo, efeitos rápidos arbitrários, regras integrais de simultaneidade/SEGOC e janelas de timing não implementadas).

## Gatilho de destruição em batalha e recrutamento

**Tomate Místico (83011277):** somente quando é destruído **em batalha** e enviado ao Cemitério, permite escolher 1 monstro **TREVAS** de até **1500 ATK** no Deck do dono e Invocá-lo por Invocação-Especial, com a face para cima em Ataque. A escolha apresenta uma opção explícita de recusa. Uma carta enviada ao Cemitério por Magia ou Tributo não dispara o efeito. Se não houver monstro elegível ou zona livre, a engine continua a batalha sem opção inválida. A Invocação-Especial não consome a quota de Invocação-Normal e não ativa o Ventríloco Misterioso (que exige Normal/Virar). Base oficial: <https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4930&request_locale=pt>.

Testes: `tests/classicBattleRecruiters.test.cjs`, cenários com compra pelo dono (inclusive carta sob controle adversário), alvo válido/inválido, recusa, batalha e distinção de causas de destruição.

## Segunda grande entrega — Azure / Decks / Magias Rápidas

**Engine (78%)**

- Pote da Ganância (55144522) compra duas cartas; Raigeki (12580477) destrói os monstros adversários e diferencia efeitos que disparam ao enviar cartas ao Cemitério de efeitos de batalha.
- Tufão Espacial Místico (05318639) é uma Magia Rápida: jogável da mão durante o próprio turno ou previamente baixada, inclusive como resposta; respeita a Velocidade de Magia 3, pode ser negado por Bloqueador de Magia e **não nega automaticamente o efeito** de outra Magia/Armadilha apenas por destruí-la.
- Joey, Yugi e Kaiba possuem **decks próprios de 30 cartas jogáveis**, usando somente cartas auditadas pelo motor. O portal exibe exclusivamente esses decks. Testes de partidas simuladas conferem conservação global das cartas quando elas mudam de controlador.

**Layout Azure (56%)**

- src/duelTheme.ts: sistema azul neutro, tokens compartilhados e medição de contraste.
- src/duelRenderer.ts: arena azul com efeitos luminosos moderados, zonas táticas, LP, fases e correntes, cartas da mão privada e retratos locais de NPCs; dimensões compatíveis com os painéis de Discord.
- src/duelUI.ts e src/index.ts: **inspeção privada carta por carta**, imagem ampliada, texto e estatísticas, ações legais diretamente relacionadas à carta, anterior/próxima e retorno ao painel. Componente vinculado ao duelista e à revisão do duelo.
- src/npcRenderer.ts e src/npcUI.ts: apresentação de Yugi, Joey e Kaiba, retratos e navegação individual por todas as cartas dos seus decks jogáveis.
- src/deckRenderer.ts e src/deckUI.ts: editor de decks azul com painel individual, cópias, quantidade possuída e distinção entre monstro normal e de efeito.
- Testes novos de contraste, privacidade de cartas escondidas, comportamento real dos botões, formato dos PNGs e pixels dos retratos: tests/azureUI.test.cjs, tests/duelUI.test.cjs e tests/interactions.test.cjs.

**Ainda não concluído:** engine geral do TCG/anime além das cartas implementadas, efeitos rápidos de monstros com variedade de timings, outros efeitos e cartas que ainda não foram programados, animações avançadas, revisão manual em dispositivos reais, otimização de performance no host e deploy efetivo. A porcentagem NÃO implica que 78% de todas as regras/cartas oficiais estejam implementadas nem que 56% de todas as telas imagináveis tenham sido verificadas.
