# Acompanhamento — Engine clássica e redesign Duel Links

**Branch de trabalho:** `classic-engine-foundation` (não altera `main`).

**Métrica:** escopo da **primeira etapa de engine clássica adaptada** e da **futura reformulação visual**, cada uma com 100 pontos. Estes percentuais são **avaliações de marcos**, não uma porcentagem oficial de compatibilidade com todas as cartas da Konami. O comando `npm run progress` lê pontuações versionadas em `scripts/project-progress.cjs` e mede separadamente as cartas habilitadas do arquivo histórico real.

## Estado desta revisão

| Área | Concluído | Falta |
| --- | ---: | ---: |
| Engine clássica adaptada | **60%** | **40%** |
| Reformulação visual inspirada em Duel Links | **0%** | **100%** |

A base do bot já possui imagens e comandos, mas nenhum componente da **nova reformulação** foi aprovado como pronto. **Layout 0% não significa bot sem interface.**

### Critérios de pontuação da engine

| Entrega | Peso | Concluído | Observações |
| --- | ---: | ---: | --- |
| Formato 4000 PV, três zonas, 20–30 cartas | 10 | 10 | Implementado |
| Turnos, combate e encerramento | 9 | 9 | Implementado; mais detalhes de timing pendentes |
| Magias e Armadilhas | 9 | 6 | Primeiro lote, não o catálogo completo |
| Correntes, prioridades e respostas | 10 | 5 | LIFO e respostas; negações complexas ainda faltam |
| FLIP e cálculo de dano | 8 | 7 | Efeitos de cinco monstros reais; cenários raros pendentes |
| Ignição e custos | 8 | 7 | Cannon Soldier + mecanismo genérico de custo |
| Cemitério e buscas | 8 | 5 | Sangan / Witch, restrição por nome, fila de gatilhos |
| Gatilhos de invocação e invocações especiais | 7 | 2 | Despacho existe; efeitos reais adicionais pendentes |
| Outros gatilhos de destruição | 7 | 0 | Sem implementação ampla |
| Contínuos, rápidos, negações complexas | 8 | 0 | Pendentes |
| Primeiro lote histórico de cartas | 7 | 4 | Quantidades reais exibidas pelo `npm run progress` |
| IA dos NPCs | 4 | 2 | Heurísticas de FLIP/Tributo; estratégia incompleta |
| CI, regressão e aceite no Discord | 5 | 3 | Testes automatizados; aceite humano na hospedagem pendente |
| **Total** | **100** | **60** | |

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
