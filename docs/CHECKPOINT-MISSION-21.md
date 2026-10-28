# Missão 21 — checkpoint recuperável

Base remota consultada: `d7060e18e190221734a13d7fedf7659098eb3113`, branch `feat/rea-engine-recovery-20261026`, PR #12 em rascunho. Meta: 500 novas identidades certificadas além das 771 iniciais. **Missão ainda não concluída.**

## Bloco de integração

- Novos duelos selecionam engine-v9, usando o núcleo TypeScript evolutivo da raiz. Os arquivos executáveis arquivados v1–v8 permanecem inalterados e verificados por hash. Não foi criada outra cópia integral da engine.
- Catálogo v9 inicial: `c22a157ba80ac167b8089eeaf7a5b592c57032975772cbb16759a3f39d2d7156`, 782 definições certificadas no registro de desenvolvimento, incluindo as 11 preparadas na M20. A admissão final deste bloco depende da suíte completa e da CI Node 22; não constitui comprovação de +500.
- Corrigido bônus de Banner of Courage que persistia durante o descarte da Fase Final. Corrigida validação das três cópias somadas pelo nome de regra Harpie Lady.
- Evitado ciclo de importação entre a fachada pública, transições e o resolvedor atual.
- Backup SQLite passa a incluir também os artefatos de catálogo v9, sem remover recibos, partidas ou perfis.
- Normalizadores de preservação removem somente adições delimitadas e verificadas antes de comparar hashes históricos. Não foram removidas as verificações dos arquivos arquivados.

## Evidências locais verificadas

Node 24.22.1 com `../local-typescript-hooks.cjs`: 76 testes das suítes M20/M21, mais 13 testes de resolvedores históricos e lote M19: 89 aprovações, zero falhas/TODO. O hook transpila; não verifica tipos nem substitui a CI Node 22 com SQLite nativo.

`verify-resolver-archives.cjs`: v1–v8 íntegros (277 módulos). Verificações de integridade M3, M4, M5, M7 e M8 passaram após normalização delimitada. A CI da base falhava no gate M3 por adição de campos de identidade na M20; o caso foi reproduzido e corrigido sem atualizar hashes históricos.

## Retomada

1. Consultar HEAD remoto e CI antes de alterar; preservar avanços posteriores.
2. Executar compilação/tipagem, suíte completa e auditorias; corrigir expectativas do resolvedor atual sem alterar fixtures explicitamente históricas.
3. Revisar os testes individuais reais em `tests/mission21ActiveBatch.test.cjs`, os certificados e as fontes M20. Não usar testes isolados de staging como único critério de admissão.
4. Recuperar ferramentas parciais M17 somente após revisão, na pasta irmã `repo-mission17-9733dd1a`. Priorizar cache de textos integrais e triagem completa, sem inferir equivalência por palavras.
5. Implementar famílias reutilizáveis e ampliar lotes. Rituais exigem invocação própria, materiais, escolhas, impossibilidades e regras individuais; não admiti-los como monstros Normais.
6. Registrar contagem por identidade canônica, testes reais, CI e progresso `novas / 500`. Manter distribuição em 130; sem merge/deploy/Discord.

Ambiente local sem Git executável nem dependências npm. Operações GitHub usam o conector com atualização condicional da referência. Compilação/SQLite completos devem ser confirmados na CI antes de declarar aprovação.

## Atualização de continuidade

Commits já enviados: `9e66ffb5` (integração), `c3b26c82` (fichas/Standby/recuperação/triagem), `c3b009fa` (admissão individual e pipeline). No último deles, Node 22 compilou e aprovou 5.561 testes, zero falhas/TODO, e o gate individual M21. A CI parou depois na expectativa de oito versões do gate beta M7; esse gate e o de prontidão M6 foram ajustados para o conjunto efetivamente observado de nove. Consultar o HEAD e a CI mais recentes para confirmar integração completa.

As 11 novas passaram pelo gate individual; total 782, +11/500, faltam 489. Ver `docs/REA-MISSION-21.md` e os índices M21. Não certificar outras cartas com base na coleta secundária.

Cache completo dos 1.180 pendentes, sem erros de coleta: `C:\Users\Micro\Downloads\speed-rpg-rea-20261026\mission21-text-cache\batch001.json` até `batch007.json`. SHA-256 dos arquivos e textos no índice `docs/evidence/mission21-full-text-index.json`. Não repetir a coleta: primeiro validar hashes e reutilizar os textos. Origem secundária pública, não substitui o confronto oficial de cada comportamento.

Comandos de retomada após instalar dependências no Node 22: `npm run check`, `npm test`, `node scripts/audit-mechanical-batch21.cjs`, `node scripts/triage-mission21.cjs`, `node scripts/index-full-text21.cjs ../mission21-text-cache`. Relatórios completos regeneráveis em `artifacts/`. A CI executa os dois primeiros gates M21; a indexação do cache é local e não depende de acesso ao Discord.

Próximo bloco: usar o cache completo para revisar grupos por operações compostas; priorizar seletores de busca/recuperação e escolhas de resolução, ou uma implementação completa de Ritual quando as receitas e exceções estiverem verificadas. Não há novas cartas Normais identificadas com identidade suficiente para admissão automática. Preservar os dados de economia/UI e a lista positiva de 130.
