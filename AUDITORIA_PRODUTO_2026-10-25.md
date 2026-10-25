# Auditoria e roteiro do Yu-Gi-Oh Speed RPG — 25/10/2026

Estado: avaliação do código da branch classic-engine-foundation (v0.7.2, fonte cb9d0ed), das capturas de teste reais e do console hospedado. Este arquivo é um diagnóstico, não uma alteração da engine. O commit posterior 72561bd afetou somente allowScripts.

## Requisitos acordados com o proprietário

1. Nenhuma carta extra da coleção deve ser concedida por vencer NPC, primeira vitória ou bônus diário. Apenas eventos especiais cuja distribuição de cartas seja ativada explicitamente por Matheus. O conjunto inicial de 20 cartas escolhido ativamente via /start é separado desse caso, por enquanto preservado.
2. Limite de mão **7**. Antes de qualquer compra que exceda sete, jogador escolhe carta a descartar; isso vale para NPCs também. Não usar a regra legada de seis no fim do turno.
3. Nomes e descrições completas das cartas em português brasileiro no texto do bot, mesmo quando a foto original continuar em inglês. Textos devem descrever o efeito realmente implementado, com custo, alvo, momento e exceções.
4. Visualização/zoom para cartas da mão e para cartas das zonas onde sua identidade é legitimamente visível; manter sigilo da mão e baixadas adversárias.
5. Primeiro terminar engine e homologá-la, depois padronizar os demais comandos. Não alterar layout âmbar da arena; sem decks históricos de 50 cartas.

## Defeitos confirmados

### P0-01: entrega de cartas indevida
- Captura do usuário mostra vitória sobre Kaiba creditando Dragão Branco de Olhos Azuis, Sogen e Armadura Sakuretsu.
- Causa: src/npcContent.ts define reward.cards para Joey/Yugi/Kaiba; src/npcProgress.ts concede o pacote de primeira vitória e bônus diário automaticamente por transação; src/duelUI.ts anuncia recompensa.
- Corrigir: retirar entrega de cartas do caminho normal de NPC/diário, mantendo separadamente DP/XP (política ainda a decidir). Criar gate administrativo persistente de eventos, autorização por ID, lista exata de cartas, quantidade, período, quotas, confirmação e recibos idempotentes. Preservar inventário atual; eventual retirada dos três cards do teste exige operação explícita, backup e conferência.

### P0-02: cartas que não abrem
- Captura mostra resposta “Não foi possível concluir. Tente novamente.”
- **Erro exato do console:** DiscordAPIError[50035] / Invalid Form Body / components[0].components[2].custom_id[COMPONENT_CUSTOM_ID_DUPLICATED].
- Causa reproduzível por leitura: src/duelUI.ts, duelCardMessage, monta Anterior e Próxima apontando para o mesmo custom ID quando há apenas **uma ou duas cartas na mão**. Discord rejeita todos os componentes da resposta.
- Corrigir: adaptar carrossel para mão 0, 1, 2, 3 e 7; nunca colocar dois custom IDs iguais na mesma mensagem; validar payload antes de enviar; recuperar painel em caso de erro. Uma carta: sem setas. Duas: somente um controle de troca ou IDs distintos com ação útil. Captura não prova que Sogen e Hane-Hane falharam pelo mesmo motivo em todos os cliques.

### P0-03: IA fraca/sem estratégia defensiva
- Causa: src/duelStore.ts, chooseNPC, filtra summons apenas com position=atk e ordena pelo ATK impresso, mesmo sob monstro inimigo mais forte. Não faz avaliação de tabuleiro antes de baixar o monstro.
- Melhorar score de estados/jogadas (ATK e DEF atuais após Sogen, equipamentos e efeitos; risco de batalha, dano esperado, permanência, cartas de remoção, armadilhas, FLIP, tributos, sinergias, recursos e objetivos).
- Priorizar set em Defesa se perderia confronto e não houver razão tática explícita; não consultar cartas ocultas do rival. Dar níveis de dificuldade e testar com 3 decks de NPC de 30 cartas reconstruídos e equilibrados.
- Aceite: contra 2500 ATK aberto, NPC não invoca 1200 ATK em Ataque desprotegido sem justificativa técnica; não realiza ataques suicidas gratuitos.

### P0-04: limite de mão incorreto
- src/rulesProfile.ts define handLimit:6. src/duelEngine.ts completeEndTurn exige descarte ao fim do turno até seis, e nextTurn compra sem pré-checar sete. tests/duelEngine.test.cjs ainda exige seis.
- Criar fase/decisão privada e persistida de descarte ANTES de comprar a carta que ultrapassaria sete; controlar compra pendente de efeitos de duas ou mais cartas, cadeia, cartas de busca e mão resultante de Hane-Hane. Escolha humana explícita, NPC usa prioridade estratégica. Cobrir versão de regra, snapshot, retomada pós-reinício e W.O.
- Decisão pendente de detalhe: caso Hane-Hane ou busca acrescente carta à mão cheia, definir com proprietário se deve descartar antes, após efeito ou se há exceção. Não assumir sem definir.

### P1-05: inspeção por zona insuficiente
- src/duelUI.ts só tem visualDuelCard por índice de sua mão, não uma inspeção geral de Sogen já ativado, monstro virado para cima do oponente, própria carta baixada, cemitérios e zonas.
- Criar inspector por ID/UID e zona, com permissões no servidor, estados de carta oculta, texto completo e fallback de imagem. Testes reais para Hane-Hane na mão e Sogen na mão/campo.

### P1-06: localização curta e arte inglesa
- src/cardArt.ts usa JPEG do YGOProDeck, naturalmente com texto impresso em inglês.
- O modelo Card só guarda summary; src/cardCatalog.ts e src/classicEngineCards.ts colocam “Monstro Normal: sem efeito” até em monstros normais que deveriam ter descrição/flavor visível, e descrições de efeitos são resumos incompletos.
- Criar campo de explicação pt-BR completo para as **130 cartas habilitadas** (descrição de regras, timing, alvo, custo e observações da adaptação), traduzir raça/atributo e tornar o inglês secundário. Não prometer texto oficial integral sem política de uso/autorização.

### P1-07: erro opaco
- src/index.ts apresenta mensagem genérica em falhas Discord API; log não carrega correlação por ação. Associar tipo de interação, versão, card/UID autorizado, duração e causa sem registrar cartas ocultas nem token; garantir fallback acessível mesmo sem JPEG.

### P1-08: decks e progressão
- src/npcContent.ts forma decks temáticos por starter decks e substituições, não por avaliação real de qualidade estratégica. Há opções fracas de mão/curva, efeito e tributos sem planejamento.
- Distinguir treino, NPC normal, chefe, evento. Balanceamento progressivo, sem trapacear com dados privados, e sem vincular vitória a novos cards por padrão.

## Critérios da engine, por etapa

### E0 — Hotfix de produção, sem reset
- Desativar prêmios de cartas automáticos no futuro; preparar console/admin de evento.
- Corrigir custom IDs duplicados, recuperar visualização e tratar componentes expirados.
- Garantir Sogen e Hane-Hane consultáveis com fallback.
- Preservar coleção, SQLite, arena âmbar, dados do jogador e comportamento dos efeitos já testados.
- Teste manual no Discord: vencer Kaiba não muda player_cards, carrossel 0–7, efeito FLIP continua.

### E1 — Regra da mão e integridade
- Codificar regra de sete, descarte ANTES de compra, escolhas privadas, efeitos de compra múltipla e continuação em estado serializado.
- Unificar com busca e devolução; guardar em SQLite sem quebrar duelos em andamento.
- Testar NPC e jogador, correntes, deck-out, snapshots, idempotência e W.O.

### E2 — IA e combate
- Pontuar cada ação legal por estado/risco futuro, ordem do turno e informação permitida.
- Uso de Defesa, tributos, FLIP, cartas de campo, magias, armadilhas e respostas relevantes; equilíbrio dos 3 NPCs.
- Auditoria contra bots referência, cenários determinísticos com inimigo superior, taxa de erro tático, uso de cartas, vitórias e duração. Dificuldade ajustável.

### E3 — Catálogo e efeitos restantes
- Completar português operacional e terminologia comum para 130 cartas atuais, imagem original com texto abaixo completo.
- Migrar handlers legados para motor de efeitos declarativos/exceções; ampliar cartas apenas depois de testar a mecânica.
- Fechar famílias ainda não cobertas (por exemplo rituais, negações avançadas, novos tipos de invocação e condições especiais) somente se incluídas no escopo combinado, sem declarar suporte irrestrito a todas as cartas do clássico.

### E4 — Homologação profissional
- E2E: start, perfil, deck, coleção, NPC, evento desligado, laboratório, PvP, mão privada, todos botões e select menus, reinício, timeout, rollback e backup.
- Segurança: permissões, segredos, autorização de operador, anti-replay, idempotência, proteção de estado oculto, rate limits.
- Hospedagem: backups SQLite consistentes inclusive WAL, teste de restauração isolado, logs estruturados/alertas, deploy rastreável, migração versionada.
- Usabilidade: feedback de decisões, mensagens de falha acionáveis, performance com defer, fallback sem arte e acessibilidade mobile.
- Gate engine: nenhum P0, testes automáticos e rodada prática no Discord verdes, conjunto de regras delimitado e inventário preservado.

## Visual, só depois da engine

L1. Design system para todos os comandos fora da arena: tipografia, hierarquia, cor, margem, cartões, feedback, legibilidade.
L2. /perfil /personalizar, /colecao /carta, /deck, /npc e futuros /evento /loja com componentes reutilizáveis.
L3. Visualizador por carta/zona com imagem ampliada e descrição pt-BR visível e completa, estados ocultos seguros.
L4. Responsividade Discord desktop/mobile, acessibilidade, regressão visual e aceite humano.
**Invariável:** não alterar a arena âmbar existente nem trazer galeria/histórico de decks 50 cards.

## Medição e qualidade

- ENGINE_PROGRESS.md tinha engine 92% e design de comandos 47% por pontos de marcos. **São registros históricos autoavaliados**, não certificação de produção: bugs P0 desta sessão impedem afirmar conclusão. Recalcular após E0–E4 e por gate, não somando cartas.
- v0.7.2 anteriormente relatou 334 testes passando e 130 cartas habilitadas. Isso mede escopo de testes, não cobertura total de regras nem UX real.
- Base observada da Bot-Hosting está rodando com banco em data/game.sqlite, dados persistidos após reinício e backups automáticos incluindo SQLite, WAL/SHM e card-art. Restauração ainda não validada.
- Código analisado localmente é cb9d0ed, correspondente ao executável publicado; houve commit de allowScripts depois, sem alterações de engine.
- Nenhuma correção de código ou remoção de card decorre deste documento. Este registro fixa prioridades para as próximas etapas e evita esquecer as decisões do usuário.
