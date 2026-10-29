# Missão 28 — checkpoint de implementação

Base remota conferida: `efd7575cab373d24b36633649d2b775fa70c74f6`, CI `40807995535` aprovada; 832 certificadas/distribuíveis. Cópia anterior com trabalho M22 não registrado preservada. Trabalho atual em `repo-mission28-efd7575` separado, inicialmente conferido pelos hashes dos 788 arquivos remotos.

Primeiro bloco: quatro operações de revelação/posição compartilham a fila de FLIP pós-Corrente; duas recuperações compartilham seleção serializada de exatamente dois alvos, antes da janela de resposta, com revalidação independente por UID/época de zona. Book of Taiyou, Stop Defense, Desert Sunlight, Dark-Piercing Light, Salvage e Dark Factory of Mass Production. Catálogo local: 838; +67/500 desde 771, restam 433. A lista positiva inclui o novo lote por autorização M28, sem concessões de inventário.

Validação local por hook Node 24 de remoção de tipos: 45 cenários M28 e 32 M26 aprovados. O hook não faz tipagem nem prova SQLite/renderização. A execução conjunta de `monsterEffects.test.cjs` encontrou dependência `sharp` indisponível: 80/81 passaram, um falhou no carregamento do renderizador. Nenhum teste removido; validação completa Node 22 deve ser observada na CI do commit. Gates históricos M3/M4/M5/M7/M8 passaram após normalização delimitada das seis adições; arquivos v1–v8 não foram alterados. Fonte oficial e impressões elegíveis: `docs/evidence/mission28-review.json`.

Retomada: conferir HEAD/CI; corrigir falhas antes de dependências novas. Continuar pelas famílias verificadas, ampliar recuperação/seletores para destinos adicionais e FLIP com seletores, sem contar pistas heurísticas como cartas desbloqueadas. A meta +500 e o catálogo completo NÃO foram concluídos. Hospedagem não alterada; checkpoint M27 informa painel sem sessão autenticada.

## Segundo bloco

Seis movimentos de zonas p?blicas implementados por opera??o parametrizada: Disappear, Gravedigger Ghoul, Soul Release, Miracle Dig, Soul Reversal e Backup Soldier. Sele??o incremental com m?nimo/m?ximo, confirma??o e contexto da Corrente preservado; gatilhos de destrui??o n?o s?o fabricados por banimento. Cat?logo local 844, +73/500 desde 771; restam 427 para 1.271 e 1.118 identidades para 1.962. Foram adicionados testes de transa??o SQLite e IA, cuja execu??o exige as depend?ncias da CI. A matriz autom?tica percorreu as 1.962 identidades e validou os hashes dos sete arquivos de cache (1.180 textos). Fam?lias encontradas por palavras permanecem pistas, com quantidade desbloque?vel desconhecida.

Primeiro commit M28: d79d3b30c1cc1169f6ce4e8403909f409e531812; CI 40821346740: 5.858 testes aprovados, tipagem aprovada, ainda em execu??o nos demais gates quando este checkpoint foi escrito.

## Terceiro bloco e corre??es de CI

Gravity Bind, Insect Barrier e Vengeful Bog Spirit utilizam a nova regra cont?nua preventAttack com filtros reutiliz?veis. A declara??o ? distinguida da interrup??o de ataque em andamento; Invoca??o-Virar registra seu turno sem confundir revela??o por efeito. Corrigida uma falha real: Armadilhas Cont?nuas passavam antes dos filtros de Damage Step e velocidade de resposta. O teste dessa janela agora passa. Total local: 847 certificadas/autorizadas, +15 na M28; +76/500 desde 771 (15,2%), restam 424 para 1.271 e 1.115 para 1.962.

As primeiras tentativas de CI expuseram tipagem (corrigida), uma corrup??o de acentos no envio do ajuste via PowerShell (reenvio via bytes UTF-8/Node) e uma fronteira de quebra de linha no normalizador dos certificados (corrigida sem enfraquecer os testes de preserva??o). O bloco de movimentos apresentou 5.902/5.916 testes aprovados antes dessas corre??es; os testes nativos novos de SQLite e IA passaram. Nova CI completa ainda necess?ria. A su?te direcionada das tr?s fam?lias e M26 passou em 159 testes; quatro testes de preserva??o e dois da matriz tamb?m passaram.

## Retomada operacional

C?digo de tr?s blocos: 19c77578f1b3222d345434ace46a4aa5935b32e2, CI 40822867051 ainda em verifica??o ao escrever. Antes de retomar, consultar HEAD/CI e ler REA-MISSION-28.md. A CI do primeiro bloco 40821346740 terminou aprovada nos dois jobs. Os testes locais n?o substituem Node 22, SQLite e Sharp da CI. O runner agora emite JUnit e test-summary.json no CI, incluindo todos os contadores, sem relaxar crit?rios.

Pasta atual: C:/Users/Micro/Downloads/speed-rpg-rea-20261026/repo-mission28-efd7575. A pasta antiga repo-mission21-d7060e18 continua intacta com trabalho M22 n?o registrado; n?o copi?-lo por cima do HEAD. Cache secund?rio: ../mission21-text-cache, validado pelo manifesto. Com depend?ncias instaladas: npm run check; npm test; node scripts/audit-mechanical-batch28.cjs; node scripts/audit-movement-batch28.cjs; node scripts/audit-attack-batch28.cjs; node scripts/family-matrix28.cjs ../mission21-text-cache; npm run audit:rea. N?o reescrever os cat?logos anteriores.
