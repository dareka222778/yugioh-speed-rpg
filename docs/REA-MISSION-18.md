# Missão 18 — Fusão histórica e efeito FLIP executável

## Resultado certificado

- **Catálogo v8:** 769 cartas únicas certificadas (+2 em relação à Missão 17), sem admissão automática de passcodes alternativos.
- **Distribuição:** 130 autorizações anteriores preservadas; 639 cartas certificadas seguem bloqueadas para distribuição.
- **Engine:** executável v8 congelado e os oito arquivos históricos de resolvers preservados; somente registros, dados e testes foram acrescentados.
- **Validação local:** 5.453 testes aprovados, zero falhas, zero ignorados e zero TODO; auditoria histórica 769 correspondências sem ambiguidade; oito resolvers arquivados verificados. A CI remota precisa ser confirmada após o push.

| Passcode canônico | Carta | Fonte oficial | Implementação e validação |
| --- | --- | --- | --- |
| `23995348` | Blue-Eyes Ultimate Dragon | [Konami CID 4386](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4386&request_locale=en) | Fusão exata de **três instâncias diferentes** de Blue-Eyes White Dragon com Polymerization, 4500 ATK/3800 DEF, consumo dos materiais, Deck Adicional, persistência e isolamento de código. O passcode alternativo `23995346` não é contado de novo. |
| `37101832` | Gravekeeper's Guard | [Konami CID 5511](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5511&request_locale=en) | FLIP obrigatório, seleção de um **monstro adversário** e retorno à mão do dono; sem alvo possível, sem ativação inventada; replay e restauração de JSON. |

## Evidência e compatibilidade

- `src/mechanicalBatch18.ts` reúne exclusivamente os dados e as definições tipadas verificadas individualmente.
- `tests/mechanicalBatch18.test.cjs` registra 12 cenários de identidade, permissão, integridade, material e resolução. Não altera motores históricos.
- `scripts/mission18-reviewed-extensions.cjs` desfaz **apenas** o novo registro aditivo antes das comparações de hash de código histórico; qualquer alteração de lógica protegida continua detectável.
- Nova revisão imutável: `catalog/engine-v8/bac940f014b439abf82a706eab8610c08e9b1631e5ab6323784cc683218c2b34.json`.
- `node scripts/check-card-certification.cjs`, `node scripts/audit-historical-admission.cjs`, `node scripts/audit-mission15.cjs` e `node scripts/verify-resolver-archives.cjs` aprovaram a mudança.

## Estado e próximos passos

O catálogo histórico continua com **1.962 registros**: a diferença não representa cartas já implementadas ou prontas para jogar. Muitas das pendências têm regras de descarte, escolha, temporização, substituição de nome, interação com campos ou combate que não cabem no vocabulário v8. A próxima expansão realmente grande requer um **resolver v9 isolado**, com operações tipadas adicionais, snapshots legados intocados e testes por família antes da certificação individual. Introduzir somente o texto das cartas não cria seus efeitos.

Este lote **não executa merge, deploy, acesso ao bot real, distribuição nem mudança de layout**. O PR #12 deve permanecer em rascunho até a autorização de homologação beta.
