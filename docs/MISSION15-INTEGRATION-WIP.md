# Missão 15 — segundo bloco em validação

Base consolidada do primeiro bloco: `043f93818cc839b4a955c7c84618553183449c06`. Não voltar a esse SHA sobrescrevendo trabalho posterior.

O segundo bloco prepara v8 como padrão e 749 registros certificados, com oito Magias de destruição filtrada. A admissão individual e a decisão da IA agora possuem testes reais, e a revisão v8 nova é `e301765da8535ac4462932bbb64d6f5c2d8fe6f15461d236c89bc8325819a8c6`.

**Aprovação final depende da CI Node 22/SQLite e da auditoria `audit-mechanical-batch15.cjs`. Não inferir aprovação da CI do primeiro bloco.** Os resultados finais devem substituir o estado anterior nos relatórios/checkpoints após validação.

O executável v8 previamente validado foi mantido sem alteração: 47 arquivos (46 módulos e manifesto) conferidos contra o SHA acima. A expansão é uma revisão de dados, não uma cópia nova da engine. Os 741 registros anteriores permanecem idênticos na revisão inicial v8 e todas as revisões v7 ficam preservadas.

Há três extensões correntes explicitamente delimitadas: hook tático em `duelStore`, import/spread aditivo em `cardMetadata` e bloco de certificados em `cardCertifications`. O normalizador `mission15-reviewed-extensions.cjs` remove somente essas adições revisadas para comparar os bytes originais com os hashes anteriores; exige certificados em JSON e rejeita código executável. Testes verificam que alterações fora desses limites continuam sendo detectadas. Isso não autoriza alterar os resolvers históricos.

Para retomar: inspecionar HEAD/CI; executar tipagem e suíte completa; conferir testes individuais/IA/2v2 e o manifesto `artifacts/certification-executions-mission15.json`; rodar ambas as auditorias da Missão 15; corrigir falhas reais antes de declarar as oito certificações concluídas. Preservar distribuição positiva de 130 IDs. Não fazer merge/deploy.
