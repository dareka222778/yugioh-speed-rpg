# Release 0.8.0 — correções E1–E4

Escopo: 130 cartas habilitadas no formato próprio Speed RPG. Não é suporte integral a todas as cartas do anime nem certificação de torneio. Arena âmbar preservada, sem alteração em src/duelRenderer.ts (SHA-256 01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c).

## Entregas

| Bloco | Código e comportamento | Estado |
| --- | --- | --- |
| E0 | Sem cartas automáticas; carrossel privado sem IDs repetidos; inspeção por zonas | Aceito pelo usuário em 0.7.3, regressões preservadas |
| E1 | handFlow.ts, economicOperations.ts, duelEngine.ts: sete cartas; descarte antes de cada compra; compras múltiplas e continuadas; descarte de excedente após busca/devolução/recuperação | Implementado, testes locais e persistência em processo novo |
| E2 | npcStrategy.ts e duelStore.ts: ameaça pública, bônus atuais, posição defensiva, valor dos Tributos, ataque letal e risco; npcContent.ts: três decks explícitos de 30 cartas com curvas e repetições revisadas | Implementado; ganho forte dos decks, força geral da política ainda não demonstrada |
| E3 | cardText.ts: explicação operacional em pt-BR de todas as 130 definições; tipos/atributos traduzidos; consultas de coleção, duelo, zonas, NPC e editor exibem o texto completo | Implementado e cobertura das 130 verificada; arte externa continua original |
| Eventos | cardEvents.ts e /evento: administrador no servidor; rascunho e confirmação do criador; pacote exato; prazo; quota; recibo único por destinatário; rollback atômico | Implementado e testado sem entregar cartas em produção |
| E4 | Regressões, 1000 duelos, retomada, W.O., privacidade, quotas, erros com referência; novo /ping informa release | Validação automática concluída; homologação humana no Discord pendente |

## Regra acordada da mão

Novos duelos usam speed-rpg-v2. Se uma compra excederia sete, primeiro o dono descarta; a carta do topo continua no Deck e não é revelada. Cada compra é verificada separadamente. Efeitos de busca/recuperação/devolução resolvem antes do descarte do excedente. A continuação não reativa custos, não recompra cartas já recebidas e pode pertencer ao adversário fora de seu turno.

Estados v1 e estados legados sem versão continuam aceitos sob as regras anteriores até a partida terminar. Duelo antigo não é convertido no meio; abra uma partida nova para validar sete. Perfil, coleção e arena não são resetados.

## Evidências reproduzíveis

- Node 22; compilação TypeScript sem erros; **365 testes passando**, incluindo restauração de decisão em novo processo, revisão obsoleta, compra interrompida no elo de Jarro da Ganância, ordem de efeitos de Goblin Arrogante, Hane-Hane, Sangan e dois jogadores acima do limite.
- `validation/engine-v080-audit.json`: **1000 partidas concluídas**, **63120 decisões**, **4388 restaurações JSON**; nenhuma identidade física perdida, duplicada ou transformada. 996 vitórias por PV e quatro por falta de compra. Tempos locais não medem a latência do Discord.
- `validation/npc-policy-comparison.json`: nova política venceu **183/360 (50,8%)** contra a política da 0.7.3, com os mesmos decks novos. Yugi 73/120; Joey 58/120; Kaiba 52/120. **Não demonstra superioridade geral da IA.** Os defeitos táticos específicos têm testes; planejamento de vários turnos e dificuldade ajustável continuam oportunidades, não capacidades declaradas desta release.
- `validation/npc-deck-comparison.json`: decks novos venceram **274/360 (76,1%)** contra os antigos usando a mesma política atual. Esse teste indica melhora contra o baseline, não taxa de vitória contra humanos.
- Os comparativos cobrem 30 sementes por personagem, duas posições e os dois primeiros jogadores. Para reproduzir: compile separadamente a release ef146bf (0.7.3), depois execute `node scripts/compare-npc-policies.cjs --baseline /pasta/da/release` e o mesmo comando com `--compare-decks`.
- `npm test`, `npm run check:cards` e `npm run audit:engine`; a auditoria de 1000 usa `node scripts/audit-duel-engine.cjs --games 1000`.

## Administração de eventos

1. `/evento criar nome:... cartas:89631139:1,07089711:2 participantes:10 horas:24` prepara o pacote e mostra exatamente o que será entregue. Não concede nada.
2. O administrador criador revisa e confirma no botão. Sem confirmação, o evento permanece em rascunho.
3. `/evento entregar evento:ID jogador:...` entrega a um perfil existente. Repetir o mesmo destinatário retorna o recibo anterior sem duplicar cartas.
4. `/evento listar` recupera IDs, estado e contagem dos oito eventos mais recentes do servidor. `/evento encerrar` bloqueia novas entregas.

Permissão de Administrador é verificada no servidor em cada ação, além da permissão padrão do comando. Não há ligação automática com vitórias NPC ou diário. Eventos ficam vazios/desativados até um administrador configurar e confirmar um pacote.

## Homologação necessária no Discord

- `/ping`: versão 0.8.0; iniciar NOVO treino e NPC, conferir descarte antes da oitava compra e compras múltiplas; retomar painel após atualização.
- Hane-Hane/Sogen ampliados; texto em português visível; consulta de uma/duas cartas e edição de deck sem custom IDs repetidos.
- Vitória/derrota, reabertura, respostas fora do turno e continuação de corrente; primeira vitória/diário sem cartas novas.
- Administrador vê /evento; jogador comum não pode executar nem confirmar; validar pacote descartável somente se o proprietário autorizar a distribuição específica.
- Duelo completo em desktop e celular. Não considerar encerramento da engine ou início do trabalho visual aprovado antes desse aceite.

## Limites explícitos

As 130 definições continuam sendo o catálogo suportado. Não foram adicionadas cartas sem efeito executável nem interpretação por IA durante a partida. Handlers específicos existentes permanecem como exceções testadas; não foram reescritos sem necessidade. Descrições são explicações próprias do código, não textos oficiais integrais/flavor. Não há redesenho da arena. Os percentuais antigos de 92/47 continuam históricos, não uma medida de prontidão.
