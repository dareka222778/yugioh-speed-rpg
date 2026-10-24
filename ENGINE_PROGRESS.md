# Acompanhamento — Engine clássica e padrão visual dos comandos

**Branch de trabalho:** `classic-engine-foundation` (não altera `main`).

**Métrica:** escopo da **engine clássica adaptada** e da **padronização visual dos comandos sem modificar o tabuleiro de duelo**, cada uma com 100 pontos. Estes percentuais são **avaliações de marcos**, não uma porcentagem oficial de compatibilidade com todas as cartas da Konami. O comando `npm run progress` lê pontuações versionadas em `scripts/project-progress.cjs` e verifica separadamente a prontidão dos decks realmente jogáveis de Yugi, Kaiba e Joey.

## Estado desta revisão

| Área | Concluído | Falta |
| --- | ---: | ---: |
| Engine clássica adaptada | **87%** | **13%** |
| Padrão visual compartilhado dos comandos | **47%** | **53%** |

**O campo de duelo original (âmbar) foi restaurado integralmente.** Ele não faz parte do redesign dos comandos e há teste de regressão impedindo que a aparência seja alterada. O padrão visual azul é aplicado aos painéis e comandos do bot, como galeria de NPCs, editor do jogador e controles de cartas. Os **47 pontos representam somente o trabalho já funcional e testado nesses comandos**, não mudanças no campo nem aceite humano.

### Critérios de pontuação da engine

| Entrega | Peso | Concluído | Observações |
| --- | ---: | ---: | --- |
| Formato 4000 PV, três zonas, 20–30 cartas | 10 | 10 | Implementado |
| Turnos, combate e encerramento | 9 | 9 | Implementado; mais detalhes de timing pendentes |
| Magias e Armadilhas | 9 | 8 | Bloqueador de Magia, Sete Ferramentas, Pote, Raigeki e Tufão jogáveis; outras cartas faltam |
| Correntes, prioridades e respostas | 10 | 9 | Magias Rápidas compartilhadas, Livro da Lua e MST em correntes, Bloqueador/Sete Ferramentas; timing completo ainda falta |
| FLIP e cálculo de dano | 8 | 7 | Efeitos de cinco monstros reais; cenários raros pendentes |
| Ignição e custos | 8 | 7 | Cannon Soldier + mecanismo genérico de custo |
| Cemitério e buscas | 8 | 7 | Sangan/Witch e Tomate Místico; fila de eventos e busca/Invocação-Especial |
| Gatilhos de invocação e invocações especiais | 7 | 6 | Janelas reativas após Normal, Virar, Fusão, Monster Reborn e recrutamento do Deck; especiais avançadas pendentes |
| Outros gatilhos de destruição | 7 | 5 | Força do Espelho, Tributo Torrencial, Sakuretsu e banimento do Sem Fundo; causas de destruição distintas |
| Contínuos, rápidos, negações complexas | 8 | 5 | Jinzo, MST Rápido e negações; monstros rápidos e efeitos avançados pendentes |
| Catálogo de cartas utilizáveis no RPG | 7 | 6 | Registro auditado, quatro novas cartas com regras reais e laboratório com 24; decks de 30 válidos |
| IA dos NPCs | 4 | 4 | Reações, descarte, recrutamento, Magias Rápidas e decks de 30; heurística não exaustiva |
| CI, regressão e aceite no Discord | 5 | 4 | Testes de motor/UI e 30 partidas simuladas; aceite humano na hospedagem pendente |
| **Total** | **100** | **87** | |

O progresso de regras é **deliberadamente independente do total de cartas habilitadas**, pois um catálogo com muitos monstros normais não representa toda a complexidade de efeitos e correntes.

### Critérios do padrão visual compartilhado (sem alterar a arena)

| Entrega | Peso | Concluído |
| --- | ---: | ---: |
| Sistema visual (azul, tipografia e hierarquia) | 12 | 9 |
| Retratos e identidade dos duelistas | 15 | 8 |
| Navegação individual de cartas e decks | 15 | 14 |
| Padronização de painéis dos comandos, mantendo arena original | 20 | 2 |
| Feedback de ações e resultados fora do tabuleiro | 12 | 1 |
| Responsividade e integração com Discord | 10 | 3 |
| Usabilidade e acessibilidade | 10 | 6 |
| Capturas, testes e revisão humana | 6 | 4 |
| **Total** | **100** | **47** |

## Regras para avançar pontuações

1. Entregas ganham pontos somente junto a código funcional, testes, documentação e/ou validação visual pertinentes.
2. A prontidão dos decks do nosso RPG é medida em `scripts/duel-readiness.cjs` e `npm run progress`, a partir do registro de efeitos que realmente funcionam.
3. Um resultado verde de CI confirma regressões testadas, **não** suporte integral às regras do jogo.
4. A padronização visual só ganha pontos quando aplicada e verificada nos comandos; **nenhuma modificação no tabuleiro original será contabilizada ou feita sem solicitação específica**.
5. Ao fim de cada bloco de desenvolvimento, executar `npm ci`, `npm run check`, `npm test`, `npm run progress`. No GitHub Actions, essas etapas rodam automaticamente para a branch.
6. Antes de incorporar à `main`, testar manualmente jogabilidade, resultados, cartas ocultas, persistência e apresentação no Discord.

## Próximos itens de maior impacto

- Resolver gatilhos adicionais de invocação e destruição com cartas clássicas verificadas.
- Ampliar efeitos rápidos, contínuos, condições de ativação, resolução e negação real de elos.
- Fazer testes simultâneos com mais efeitos encadeados, deck-out, alvos ausentes e partidas completas.
- Ampliar o conjunto de cartas jogáveis do RPG com implementação e teste de cada efeito novo, respeitando o formato de três zonas.
- Refinar a identidade visual Azure, a navegação responsiva, as animações e o aceite humano, preservando o fluxo de inspeção carta por carta já implementado.

## Efeito contínuo habilitado

**Jinzo (77585513):** no campo com a face para cima, impede a ativação de Armadilhas dos dois duelistas e nega efeitos de Armadilhas já ativadas que resolveriam enquanto ele ainda estiver em campo. Com a face para baixo ou ao sair do campo, a restrição não se aplica. A implementação segue o texto oficial do card (<https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4758&request_locale=pt>) e possui testes de invocação, virada, controle de ambos os lados, corrente e restauração após deixar o campo.

## Correntes com Armadilhas de Resposta e gatilhos de invocação

- **Bloqueador de Magia (77414722):** na resposta direta à ativação de uma Magia, descarta uma carta como custo; se a ativação não for negada por outra Armadilha, cancela a Magia, envia-a ao Cemitério e impede sua resolução. Aplica-se a Magias Normais, de Campo e à Polimerização.
- **Sete Ferramentas do Bandido (03819470):** responde diretamente à última ativação de Armadilha, custa 1000 PV pagos antes da corrente e impede a resolução do elo negado; também pode responder a outras Armadilhas de Resposta.
- **Prioridade de resposta:** Armadilhas comuns não podem responder a uma Armadilha de Resposta recém-ativada (Velocidade de Magia 3). As correntes são resolvidas do último elo para o primeiro, conservando custos já pagos.
- **Ventríloco Misterioso (54098121):** quando outro monstro de qualquer duelista é Invocado normalmente ou por Virar, ganha 500 PV para o controlador. Não ativa ao ser ele próprio invocado, por baixar monstro com a face para baixo ou por revelar um monstro durante batalha. Múltiplas cópias geram gatilhos em fila; interações simultâneas complexas continuam fora do escopo completo.
- O laboratório mantém a Fusão demonstrativa e, nesta etapa, foi ampliado para **24 cartas virtuais**, incluindo Livro da Lua, Tributo Torrencial, Sakuretsu e Sem Fundo.

**Limite conhecido:** essa implementação modela correntes e janelas de resposta das cartas acima, mas ainda não é um sistema TCG universal (por exemplo, efeitos rápidos arbitrários, regras integrais de simultaneidade/SEGOC e janelas de timing não implementadas).

## Gatilho de destruição em batalha e recrutamento

**Tomate Místico (83011277):** somente quando é destruído **em batalha** e enviado ao Cemitério, permite escolher 1 monstro **TREVAS** de até **1500 ATK** no Deck do dono e Invocá-lo por Invocação-Especial, com a face para cima em Ataque. A escolha apresenta uma opção explícita de recusa. Uma carta enviada ao Cemitério por Magia ou Tributo não dispara o efeito. Se não houver monstro elegível ou zona livre, a engine continua a batalha sem opção inválida. A Invocação-Especial não consome a quota de Invocação-Normal e não ativa o Ventríloco Misterioso (que exige Normal/Virar). Base oficial: <https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4930&request_locale=pt>.

Testes: `tests/classicBattleRecruiters.test.cjs`, cenários com compra pelo dono (inclusive carta sob controle adversário), alvo válido/inválido, recusa, batalha e distinção de causas de destruição.

## Segunda grande entrega — Comandos / Decks / Magias Rápidas

**Engine (85%, etapa atual)**

- Pote da Ganância (55144522) compra duas cartas; Raigeki (12580477) destrói os monstros adversários e diferencia efeitos que disparam ao enviar cartas ao Cemitério de efeitos de batalha.
- Tufão Espacial Místico (05318639) é uma Magia Rápida: jogável da mão durante o próprio turno ou previamente baixada, inclusive como resposta; respeita a Velocidade de Magia 3, pode ser negado por Bloqueador de Magia e **não nega automaticamente o efeito** de outra Magia/Armadilha apenas por destruí-la.
- Joey, Yugi e Kaiba possuem **decks próprios de 30 cartas jogáveis**, usando somente cartas auditadas pelo motor. O portal exibe exclusivamente esses decks. Testes de partidas simuladas conferem conservação global das cartas quando elas mudam de controlador.

**Padrão Azure nos comandos (47%, etapa atual)**

- src/duelTheme.ts: sistema azul neutro, tokens compartilhados e medição de contraste.
- src/duelRenderer.ts: **restaurado ao campo de duelo original anterior à reformulação azul**, preservando zonas, PV e cartas privadas, sem retratos adicionados. Teste protege a aparência anterior.
- src/duelUI.ts e src/index.ts: **inspeção privada carta por carta**, imagem ampliada, texto e estatísticas, ações legais diretamente relacionadas à carta, anterior/próxima e retorno ao painel. Componente vinculado ao duelista e à revisão do duelo.
- src/npcRenderer.ts e src/npcUI.ts: apresentação de Yugi, Joey e Kaiba, retratos e navegação individual por todas as cartas dos seus decks jogáveis.
- src/deckRenderer.ts e src/deckUI.ts: editor de decks azul com painel individual, cópias, quantidade possuída e distinção entre monstro normal e de efeito.
- Testes novos de contraste, privacidade de cartas escondidas, comportamento real dos botões, formato dos PNGs e pixels dos retratos: tests/azureUI.test.cjs, tests/duelUI.test.cjs e tests/interactions.test.cjs.

**Ainda não concluído:** engine geral do TCG/anime além das cartas implementadas, efeitos rápidos de monstros com variedade de timings, outros efeitos e cartas que ainda não foram programados, animações avançadas, revisão manual em dispositivos reais, otimização de performance no host e deploy efetivo. A porcentagem NÃO implica que 85% das regras/cartas oficiais estejam implementadas nem que 47% de todas as telas possíveis tenham sido verificadas.

## Terceira entrega — catálogo unificado, carta individual e reação à batalha

**Escopo do RPG:** não existem mais decks paralelos de consulta. `/npc ver` mostra somente as 30 cartas que o personagem utiliza (e seu eventual Deck Adicional). Os arquivos dessas listas anteriores e as validações associadas foram retirados. A prontidão dos decks atuais é medida por `node scripts/duel-readiness.cjs --require-complete`. Nenhuma alteração de coleção é feita ao navegar.

**Carta por carta no próprio deck:** `/deck ver` ganhou botão **Ver carta**, com painel azul de 1200×720 gerado em `renderOwnedCard`. Ele exibe arte (ou fallback local), tipo, atributos, efeito, quantidade possuída e quantidade no deck. O jogador pode navegar para anterior/próxima e retornar ao editor, sempre com ID, proprietário e revisão validados.

**Engine:** Força do Espelho (44095762) entra como Armadilha Normal de declaração de ataque; destrói apenas monstros adversários em Ataque, enquanto os de Defesa permanecem. Resolve em correntes com Sete Ferramentas, Tufão Espacial Místico e Jinzo; destruição por efeito não ativa a habilidade de batalha do Tomate Místico. Joey utiliza a carta no seu deck de 30 e pode entregá-la como recompensa da primeira vitória.

**Qualidade:** CI executa testes de permissões, duelos completos, efeitos, indicadores de legalidade e renderização; gera seis imagens de prévia da arena, duelistas e decks. Esses testes não equivalem a uma análise de layout em aparelhos reais nem à publicação da branch na hospedagem.

## Quarta entrega — restauração visual e janelas de resposta avançadas

**Correção de direção:** o renderer do tabuleiro foi revertido para o visual âmbar anterior à reformulação Azure (mesmas cartas de verso, zonas e tamanhos). As telas de comandos continuam usando o tema compartilhado. A mudança reduziu de propósito a pontuação visual: o trabalho removido da arena não conta para o padrão de comandos.

**Engine (85% dos marcos definidos):**

- **Livro da Lua (14087893):** Magia Rápida jogável na mão no próprio turno ou previamente baixada; escolhe um monstro revelado e o coloca em Defesa com a face para baixo. Baixada no turno atual, a Magia Rápida não pode ser ativada. Bloqueador de Magia consegue negar o elo, e o card pode proteger contra destruição que exija monstro revelado.
- **Tributo Torrencial (53582587):** Armadilha Normal que reage a Invocações Normais, por Virar e Especiais e destrói todos os monstros em campo. As janelas de Fusão, Monster Reborn e recrutamento passam a permitir respostas antes de seguir a partida.
- **Armadura Sakuretsu (56120475):** escolhe o monstro atacante durante a declaração de ataque e o destrói se ainda for um alvo válido; Livro da Lua e Sete Ferramentas podem interromper a resolução.
- **Buraco Armadilha Sem Fundo (29401950):** Invocações do adversário com 1500+ ATK permitem destruir **e banir** o monstro; o banimento vai para o verdadeiro dono da carta, não ao Cemitério, e não ativa gatilhos que exigem envio ao Cemitério.
- Efeitos FLIP passam a conservar os dados do monstro fonte quando destruído durante resposta à Invocação-Virar, evitando perder um gatilho válido.
- O laboratório de efeitos agora possui 24 cartas; Yugi, Kaiba e Joey têm cartas e decisões de IA associadas às novas reações.

A entrega possui testes automatizados de encadeamentos, timing, banimento, preservação de propriedade, estatísticas, efeitos FLIP e permanência do campo original. **Ainda faltam** SEGOC/timing completo, efeitos de monstro de Velocidade 2 mais complexos, categorias adicionais de invocação, suporte amplo a outras cartas e homologação no Discord.


## Quinta entrega — auditoria de integridade e efeitos rápidos de monstro

**Engine: 87% dos marcos versionados; padrão dos comandos permanece 47%.**
A pontuação não representa compatibilidade geral com o TCG. A arena permaneceu
byte a byte inalterada; os decks atuais não foram editados nesta entrega.

- Corrigidos Sete Ferramentas contra Magias Rápidas, ativação de Magias Rápidas
  entre ataques, preservação da fase, resets de Livro da Lua e gatilhos de fim de turno.
- Ventríloco Misterioso entra na corrente da Invocação antes das respostas e
  seu efeito já ativado resolve mesmo depois de ser destruído ou colocado com a face para baixo.
- Kuriboh implementado com descarte de si mesmo, janela própria de cálculo de
  dano, proteção somente para aquele combate e IA que evita gastar a carta sem dano previsto.
- Contratos de estado/transição impedem UID duplicado, carta perdida ou
  transformada, fases/dados inválidos e zonas excedidas. O banco valida antes
  de persistir, antes de conceder recompensa e ao reabrir uma partida.
- Node 22 fixado como runtime testado; o teste de carga isolado foi adicionado ao CI.

Validação local: 268 testes; 1.000 partidas extras, 49.161 jogadas e 3.329
restaurações serializadas. Isto não mede latência do Discord/Botkeep.
Veja [ENGINE_AUDIT.md](ENGINE_AUDIT.md) para escopo, evidências e limitações.
