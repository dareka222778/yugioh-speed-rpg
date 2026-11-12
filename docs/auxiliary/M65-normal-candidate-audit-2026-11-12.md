# M65 — Auditoria auxiliar dos candidatos Normal históricos

**Data:** 2026-11-12  
**Branch-base observada:** `feat/work-m65-normal-v9-triage-20261112`  
**HEAD efetivo usado:** `5129933809dd7dd56a5e954ba1bd7d35f1fb2784`  
**Snapshot engine-v9:** `72ba4830f7e62ceaff795c1fa5b7b5b690ee5ef1f675eaedb9b7ed7da5675b52`  
**Escopo deste registro:** pesquisa e auditoria somente; nenhuma certificação ou admissão.

## Resultado do planejador M65

O script `scripts/plan-normal-expansion-v9.cjs` foi lido no HEAD efetivo da PR #21. Reproduzi em memória a mesma sequência de filtros sobre os arquivos versionados:

- `catalog/historical/2004-10-01/cards.json`: 1.962 identidades históricas.
- Snapshot engine-v9 apontado por `catalog/engine-v9/manifest.json`: 1.014 cartas e 1.014 certificados.
- Registros marcados `normalMainCandidate`: 584.
- Candidatos elegíveis ausentes do catálogo e do mapa de certificados: **0**.

| Motivo de exclusão | Registros |
|---|---:|
| Sem data TCG | 154 |
| Primeira impressão TCG após 2004-09-30 | 106 |
| Mais de um passcode histórico | 2 |
| Já catalogados/certificados | 322 |
| **Total** | **584** |

Os outros contadores do planejador foram zero: data mundial ausente/posterior ao corte, passcode inválido/duplicado e metadados inválidos.

**Limitação de execução:** o runner do GitHub Actions não expôs o `console.log` do teste que imprime a contagem. A contagem acima foi reproduzida pela lógica exata do planner sobre os dados atuais, não apresentada como uma execução local de `npm run plan:normal-v9`. O teste real da suíte verificou determinismo, unicidade, corte histórico e ausência de IDs já habilitados/certificados.

## Revisão dos dois registros ambíguos

Ambos têm múltiplos passcodes no dataset histórico. A base oficial da Konami confirma a identidade impressa, os atributos e a impressão TCG original; ela não fornece, nessa página, uma tabela que mapeie todos os passcodes alternativos.

### Red-Eyes Black Dragon — Konami ID 4088

- Passcodes no dataset: `74677422`, `74677427`.
- A revisão atual contém certificado para `74677422`; `74677427` não aparece como identidade separada.
- Konami confirma DARK, Level 7, 2400 ATK / 2000 DEF, Dragon / Normal.
- Primeira impressão TCG listada: LOB-070, 2002-03-08.
- Fonte oficial: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4088&ope=2&request_locale=en

### Dark Magician — Konami ID 4041

- Passcodes no dataset: `36996508`, `46986414`, `46986420`, `46986421`.
- A revisão atual contém certificado para `46986414`; os outros três não aparecem como identidades separadas.
- Konami confirma DARK, Level 7, 2500 ATK / 2100 DEF, Spellcaster / Normal.
- Primeira impressão TCG listada: LOB-005, 2002-03-08.
- Fonte oficial: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4041&ope=2&request_locale=en

**Decisão:** não criar aliases, cartas ou certificados a partir da semelhança de nome/arte. A revisão oficial sustenta a identidade e a impressão original, mas não prova por si só a equivalência individual de cada passcode histórico. Os dois registros permanecem excluídos do planejador por ambiguidade e não geram novas admissões.

## CI observada

- PR #19 / M60 research: Engine validation e feedback rápido concluídos com sucesso; jobs `test` e `extended-soak` aprovados.
- PR #20 / auditoria 969→1014: Engine validation e feedback rápido concluídos com sucesso; jobs `test` e `extended-soak` aprovados.
- PR #21 / planner M65: o primeiro run falhou em dois testes por `Invalid historical cutoff: 2004-09-30`. O commit `5129933` corrigiu as classes de dígitos na validação de data/passcode. No run 43167361493, `test` e `extended-soak` passaram; o resumo registrou 7.957 testes, 7.957 aprovados e zero falhas. O feedback rápido 43167361413 também passou.

## Coordenação e limites

A coordenação compartilhada registra handoff `available`, owner `null` e próxima execução do Work às **06:30 (America/Sao_Paulo)**. O campo `lastActivityAt` ainda marca 03:17, embora o commit M65 efetivo tenha sido criado às 03:19:38 e a execução do Work tenha terminado às 03:21:20. Por isso, a branch auxiliar foi baseada no HEAD real atualizado `5129933`, não no `baseCommit` antigo `dc01a68`.

Este arquivo é o único caminho criado por esta auditoria. Não foram alterados scripts, testes, catálogo, runtime, coordenação, inventários, PRs ou produção. Não houve certificação, admissão, merge ou deploy. Revalidar a coordenação antes de qualquer nova alteração, especialmente antes da próxima janela do Work.

## Apêndice — evidência direta da CI (05:31, 12/11/2026)

A execução **Engine validation** da PR #21, associada ao HEAD `5129933809dd7dd56a5e954ba1bd7d35f1fb2784`, terminou com sucesso no run [43167361493](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/43167361493).

- Job `test` (ID `131012253804`): `success`.
- Job `extended-soak` (ID `131012253625`): `success`.
- Artefato `rea-acceptance-results` (ID `13921585172`) contém `test-summary.json` com Node 22.23.4, **7.957 testes aprovados, 0 falhas, 0 cancelados, 0 ignorados e 0 TODO**.
- O `test-results.xml` do mesmo artefato contém os três casos de `tests/normalExpansionV9Planner.test.cjs` (filtro, validação de snapshot/data e plano real determinístico). Eles aparecem sem elemento de falha, portanto passaram.
- O runner usa reporter JUnit/dot e o artefato não contém `system-out`; logo, o `console.log` com a contagem não foi preservado como saída textual do job. A contagem **0** deste relatório continua sendo uma reprodução determinística do algoritmo exato sobre os blobs versionados, não uma citação de stdout da CI.

Identificadores das fontes usadas na reprodução:
- Histórico `catalog/historical/2004-10-01/cards.json`: Git blob `e9ddb6a3cdc5921a26f4ac9c4be703bb34f284e5`.
- Planner `scripts/plan-normal-expansion-v9.cjs`: Git blob `bfc9a163df87ea733142c53aec10962d58d0d47d`.
- Snapshot `72ba4830f7e62ceaff795c1fa5b7b5b690ee5ef1f675eaedb9b7ed7da5675b52.json`: Git blob `6ac57935d6131f70835cc6d1b1562ab6037a3430`.

### Matriz atual de CI das PRs 19–21

| PR | Feedback rápido | Engine validation | Resultado |
|---|---|---|---|
| #19 / M60 research | Run 43165584813 — success | Run 43165584883 — success | 3 jobs aprovados |
| #20 / catalog delta | Run 43165884034 — success | Run 43165884069 — success | 3 jobs aprovados |
| #21 / M65 planner | Run 43167361413 — success | Run 43167361493 — success | 3 jobs aprovados |

As três PRs permanecem abertas, em rascunho e mergeable. A PR #17/M61 permanece fora do escopo e com handoff pendente; nenhum arquivo dela foi tocado.