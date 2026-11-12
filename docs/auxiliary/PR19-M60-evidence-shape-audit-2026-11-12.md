# PR #19 / M60 — auditoria da forma da evidência oficial

**Data:** 2026-11-12, 06:36 (America/Sao_Paulo)  
**Branch-base:** `feat/work-m65-normal-v9-triage-20261112`  
**Base SHA:** `faded3908e3731edbaec8e8996d0705c2bbd206b`  
**Branch desta auditoria:** `feat/aux-pr19-evidence-shape-audit-20261112`  
**Escopo:** diagnóstico documental independente. Nenhum arquivo da PR #19, PR #17/M61, catálogo, runtime ou coordenação foi alterado.

## Coordenação verificada antes do registro

O estado compartilhado `coordination/state.json` registrava `owner: null`, `state: released` e handoff `available`, com próxima execução do Work às **11:30 de 12/11/2026**. A execução principal `458723bb-e7d4-8322-b812-749ce713b700` constava como concluída às 06:34. A reserva paralela da PR #17/M61 continuava pendente; seus arquivos permanecem intocados.

A branch auxiliar foi criada a partir do HEAD M65 indicado pela coordenação. A branch M63/PR #19 e os arquivos nela reservados não foram editados.

## Resultado da CI da PR #19

- PR: #19 — pesquisa M60.
- HEAD: `cbb8be6b01d5d26586c4dc268fa315cc0e06e607`.
- Card batch fast feedback: run `43192284375`, job `card-batch-fast`, **success**.
- Engine validation: run `43192284528`.
- Job `test`: `131094347646`, **failure**.
- Job `extended-soak`: ainda `in_progress` na consulta.
- Resumo do job de testes: **7.960/7.961 aprovados; 1 falha**.

### Falha reproduzida nos artefatos versionados

O teste `tests/m60FlipCycleResearch.test.cjs`, na asserção da linha 132, compara:

```js
assert.deepEqual(review.firstTcgPrinting, candidate.card.printing);
```

Para **Swarm of Scarabs** (passcode `15383415`, Konami ID `5418`), o objeto encontrado em `reviews[].firstTcgPrinting` é:

```json
{
  "date": "2003-07-18",
  "set": "PGD-021",
  "setName": "PHARAONIC GUARDIAN"
}
```

O objeto `candidate.card.printing` esperado pelo teste contém, além desses três campos:

```json
{
  "date": "2003-07-18",
  "set": "PGD-021",
  "setName": "PHARAONIC GUARDIAN",
  "region": "tcg",
  "source": "https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5418&request_locale=en"
}
```

A mensagem do runner confirma que a comparação falhou porque os campos `region` e `source` faltam no objeto da revisão. A falha é de consistência entre os registros de evidência, não uma falha de regra de duelo.

A mesma diferença estrutural aparece nos cinco registros de revisão: as quatro cartas-alvo e Guardian Sphinx diferido têm `firstTcgPrinting` com `date/set/setName`, enquanto seus objetos `candidate.card.printing` também incluem `region/source`. O teste interrompe a comparação no primeiro caso, portanto os outros quatro são uma inspeção estrutural do JSON, não cinco falhas de teste observadas separadamente.

### Correção recomendada ao Work

Preferencialmente, completar cada `reviews[].firstTcgPrinting` com `region: "tcg"` e a URL oficial exata correspondente ao `konamiId`, de modo que o registro de revisão reproduza o objeto de impressão que foi verificado. Alternativamente, se a intenção do esquema for manter os campos em estruturas distintas, o teste deve comparar uma projeção factual explícita e validar `region/source` separadamente. A primeira opção mantém a evidência autocontida e preserva a igualdade profunda pretendida.

Não remover a verificação de fonte oficial para fazer o teste passar. Também manter:
- `mechanicalStatus: "pending-runtime-and-regression"` para as quatro cartas-alvo;
- `mechanicalStatus: "deferred-non-targeting-mass-return"` para Guardian Sphinx;
- `certificationStatus: "not-certified"` para todas;
- zero admissões, certificados ou concessões de inventário nesta pesquisa.

## Estado da PR #21 / M65 observado nesta sessão

O HEAD indicado pela coordenação é `faded3908e3731edbaec8e8996d0705c2bbd206b`. O commit acrescenta proteção contra colisões de identidade canônica e Konami ID em todo o histórico, inclusive quando o registro duplicado não é candidato, e adiciona testes correspondentes.

- Card batch fast feedback: run `43191998106`, **success**.
- Engine validation: run `43191997694`; jobs `test` e `extended-soak` estavam **in_progress** na última consulta.
- O resultado da CI de `5129933` (7.957/7.957) pertence ao commit anterior e não substitui a validação do HEAD atual `faded3908`.

### Limite da contagem de candidatos M65

O teste real contém um `console.log` com `candidateCount`, mas o log do job anterior não preservou essa linha. A ocorrência `candidateCount: 1` encontrada no mesmo log pertence ao fixture do gerador M31, não ao planejador M65. Além disso, a consulta de conteúdo ao arquivo histórico grande `catalog/historical/2004-10-01/cards.json` retornou conteúdo vazio pelo conector nesta sessão. Portanto, **não há contagem atual de candidatos M65 diretamente extraída do log nem reproduzida sobre o novo HEAD**. O zero relatado anteriormente era uma reprodução do planner anterior e deve ser tratado como desatualizado até reexecução do HEAD `faded3908` com a saída/artefato preservado.

Recomendação: fazer o planner publicar o JSON completo ou, no mínimo, `normalCandidateRecords`, `candidateCount` e `excluded` em um artefato da execução. Isso permite auditar a contagem sem confundir logs de outros scripts.

## Estado final

Este commit adiciona somente este documento. Não altera M63/M64/M65, M61, scripts, testes, catálogo, certificados, inventário, coordenação compartilhada, PRs ou produção. Não houve certificação, admissão, merge ou deploy.

**Próxima janela principal registrada:** 11:30 (America/Sao_Paulo). Revalidar coordenação e CI antes de qualquer nova alteração.
