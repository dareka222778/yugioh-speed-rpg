# Missão 28 — checkpoint de implementação

Base remota conferida: `efd7575cab373d24b36633649d2b775fa70c74f6`, CI `40807995535` aprovada; 832 certificadas/distribuíveis. Cópia anterior com trabalho M22 não registrado preservada. Trabalho atual em `repo-mission28-efd7575` separado, inicialmente conferido pelos hashes dos 788 arquivos remotos.

Primeiro bloco: quatro operações de revelação/posição compartilham a fila de FLIP pós-Corrente; duas recuperações compartilham seleção serializada de exatamente dois alvos, antes da janela de resposta, com revalidação independente por UID/época de zona. Book of Taiyou, Stop Defense, Desert Sunlight, Dark-Piercing Light, Salvage e Dark Factory of Mass Production. Catálogo local: 838; +67/500 desde 771, restam 433. A lista positiva inclui o novo lote por autorização M28, sem concessões de inventário.

Validação local por hook Node 24 de remoção de tipos: 45 cenários M28 e 32 M26 aprovados. O hook não faz tipagem nem prova SQLite/renderização. A execução conjunta de `monsterEffects.test.cjs` encontrou dependência `sharp` indisponível: 80/81 passaram, um falhou no carregamento do renderizador. Nenhum teste removido; validação completa Node 22 deve ser observada na CI do commit. Gates históricos M3/M4/M5/M7/M8 passaram após normalização delimitada das seis adições; arquivos v1–v8 não foram alterados. Fonte oficial e impressões elegíveis: `docs/evidence/mission28-review.json`.

Retomada: conferir HEAD/CI; corrigir falhas antes de dependências novas. Continuar pelas famílias verificadas, ampliar recuperação/seletores para destinos adicionais e FLIP com seletores, sem contar pistas heurísticas como cartas desbloqueadas. A meta +500 e o catálogo completo NÃO foram concluídos. Hospedagem não alterada; checkpoint M27 informa painel sem sessão autenticada.

## Segundo bloco

Seis movimentos de zonas p?blicas implementados por opera??o parametrizada: Disappear, Gravedigger Ghoul, Soul Release, Miracle Dig, Soul Reversal e Backup Soldier. Sele??o incremental com m?nimo/m?ximo, confirma??o e contexto da Corrente preservado; gatilhos de destrui??o n?o s?o fabricados por banimento. Cat?logo local 844, +73/500 desde 771; restam 427 para 1.271 e 1.118 identidades para 1.962. Foram adicionados testes de transa??o SQLite e IA, cuja execu??o exige as depend?ncias da CI. A matriz autom?tica percorreu as 1.962 identidades e validou os hashes dos sete arquivos de cache (1.180 textos). Fam?lias encontradas por palavras permanecem pistas, com quantidade desbloque?vel desconhecida.

Primeiro commit M28: d79d3b30c1cc1169f6ce4e8403909f409e531812; CI 40821346740: 5.858 testes aprovados, tipagem aprovada, ainda em execu??o nos demais gates quando este checkpoint foi escrito.
