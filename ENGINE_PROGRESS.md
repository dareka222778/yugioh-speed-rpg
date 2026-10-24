# Acompanhamento — Engine clássica e redesign Duel Links

**Branch de trabalho:** `classic-engine-foundation` (não altera `main`).

**Métrica:** escopo da **primeira etapa de engine clássica adaptada** e da **futura reformulação visual**, cada uma com 100 pontos. Estes percentuais são **avaliações de marcos**, não uma porcentagem oficial de compatibilidade com todas as cartas da Konami. O comando `npm run progress` lê pontuações versionadas em `scripts/project-progress.cjs` e mede separadamente as cartas habilitadas do arquivo histórico real.

## Estado desta revisão

| Área | Concluído | Falta |
| --- | ---: | ---: |
| Engine clássica adaptada | **68%** | **32%** |
| Reformulação visual inspirada em Duel Links | **0%** | **100%** |

A base do bot já possui imagens e comandos, mas nenhum componente da **nova reformulação** foi aprovado como pronto. **Layout 0% não significa bot sem interface.**

### Critérios de pontuação da engine

| Entrega | Peso | Concluído | Observações |
| --- | ---: | ---: | --- |
| Formato 4000 PV, três zonas, 20–30 cartas | 10 | 10 | Implementado |
| Turnos, combate e encerramento | 9 | 9 | Implementado; mais detalhes de timing pendentes |
| Magias e Armadilhas | 9 | 7 | Bloqueador de Magia e Sete Ferramentas jogáveis; lote incompleto |
| Correntes, prioridades e respostas | 10 | 7 | Negação de ativação, custos prévios, correntes Speed 3; casos avançados pendentes |
| FLIP e cálculo de dano | 8 | 7 | Efeitos de cinco monstros reais; cenários raros pendentes |
| Ignição e custos | 8 | 7 | Cannon Soldier + mecanismo genérico de custo |
| Cemitério e buscas | 8 | 5 | Sangan / Witch, restrição por nome, fila de gatilhos |
| Gatilhos de invocação e invocações especiais | 7 | 4 | Ventríloco Misterioso reage a Invocações Normais/Virar; especiais avançadas pendentes |
| Outros gatilhos de destruição | 7 | 0 | Sem implementação ampla |
| Contínuos, rápidos, negações complexas | 8 | 2 | Jinzo contínuo habilitado; efeitos rápidos e negações complexas pendentes |
| Primeiro lote histórico de cartas | 7 | 4 | Quantidades reais exibidas pelo `npm run progress` |
| IA dos NPCs | 4 | 3 | Escolha de contra-armadilhas e custo de descarte; estratégia incompleta |
| CI, regressão e aceite no Discord | 5 | 3 | Testes automatizados; aceite humano na hospedagem pendente |
| **Total** | **100** | **68** | |

O progresso de regras é **deliberadamente menor que a porcentagem de cartas habilitadas**, pois boa parte do lote histórico é de monstros sem efeitos e não representa todo o trabalho de regras.

### Critérios da futura fase de layout

| Entrega | Peso | Concluído |
| --- | ---: | ---: |
| Sistema visual (azul, tipografia e hierarquia) | 12 | 0 |
| Retratos e identidade dos duelistas | 15 | 0 |
| Navegação individual de cartas e decks | 15 | 0 |
| Arena com HUD e campo de duelo | 20 | 0 |
| Feedback de efeitos e invocações | 12 | 0 |
| Responsividade e integração com Discord | 10 | 0 |
| Usabilidade e acessibilidade | 10 | 0 |
| Capturas, testes e revisão humana | 6 | 0 |
| **Total** | **100** | **0** |

## Regras para avançar pontuações

1. Entregas ganham pontos somente junto a código funcional, testes, documentação e/ou validação visual pertinentes.
2. O lote histórico é medido automaticamente pela lista real em `classicCoverage()`, não por contagem declarada.
3. Um resultado verde de CI confirma regressões testadas, **não** suporte integral às regras do jogo.
4. O redesenho só ganha pontos quando seus novos componentes forem realmente implementados e revisados; não se contabiliza layout legado.
5. Ao fim de cada bloco de desenvolvimento, executar `npm ci`, `npm run check`, `npm test`, `npm run progress`. No GitHub Actions, essas etapas rodam automaticamente para a branch.
6. Antes de incorporar à `main`, testar manualmente jogabilidade, resultados, cartas ocultas, persistência e apresentação no Discord.

## Próximos itens de maior impacto

- Resolver gatilhos adicionais de invocação e destruição com cartas clássicas verificadas.
- Ampliar efeitos rápidos, contínuos, condições de ativação, resolução e negação real de elos.
- Fazer testes simultâneos com mais efeitos encadeados, deck-out, alvos ausentes e partidas completas.
- Fechar cobertura do primeiro lote histórico, respeitando incompatibilidades explícitas do formato de três zonas.
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
