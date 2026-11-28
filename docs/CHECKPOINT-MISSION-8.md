# Miss?o 8 ? checkpoint persistente

Base confirmada: 1bbbdd3847b9455febabffc2351456982df438a6; branch feat/rea-engine-recovery-20261026; PR #12 em rascunho. Commits incrementais: 85e00b18, 069aa4f0, a9f0e00a, e6b3ba96. Nenhum merge, deploy, acesso Discord ou distribui??o.

## Implementado

- Candidata engine-v7: cat?logo imut?vel separado do c?digo, preso ao save por catalogRevision e SHA-256. Contexto isolado por AsyncLocalStorage; consultas e retomadas usam a revis?o gravada. Revis?o desconhecida falha preservando o save.
- Tr?s revis?es: 203, 225 e 243 cartas; os dois lotes s?o dados adicionais, sem nova c?pia da engine. Novos adaptadores exigem mudan?a expl?cita de sem?ntica/vers?o.
- Fontes cont?nuas por UID/?poca, ordem persistida, m?ltiplos modificadores, contagens vivas, nega??o de monstros, imunidade a Magias, dura??o at? fim de turno, remo??o e recomputa??o. Escopo n?o equivale a todo o sistema de camadas/regras de Yu-Gi-Oh!.
- 22 cartas no lote cont?nuo/tempor?rio; nove Fus?es de receita exata e nove materiais Normais no segundo lote. Revis?es individuais em docs/evidence/mission8-*-reviews.json. Todas as 40 novas cartas bloqueadas para distribui??o.
- Snapshot SQLite inclui as tr?s revis?es do cat?logo e hashes; verifica??o recusa artefatos ausentes/corrompidos. Testes de falha transacional, reabertura e duplicatas com custo de 1000 PV.
- 215 arquivos preservados contra o Git tree da base, incluindo 192 m?dulos hist?ricos v1?v6, manifestos, persist?ncia e apresenta??o. Os 203 certificados anteriores continuam id?nticos.

## Valida??o e estado de retomada

Execu??o local: Node24 com remo??o de tipos, sem SQLite/Sharp instalados. Os testes puros e os cen?rios individuais passaram localmente; n?o substituem a tipagem e su?te nativa Node22 do CI. O CI do commit e6b3ba96 j? passou pela su?te e cargas mistas e est? sendo consolidado; a candidata recebeu depois a corre??o da intera??o imunidade/Fus?o, novas verifica??es e benchmark de fontes. Conferir o HEAD e o ?ltimo CI antes de declarar a candidata aprovada.

O primeiro CI apontou dois erros de tipagem. A regress?o apontou consultas hipot?ticas de Campo/NPC e janela de dano sem flag auxiliar, corrigidas com testes preservados. Houve tamb?m corre??es de expectativas do cat?logo/descri??es e normaliza??o JSON de uma fixture de reabertura. Nada foi desabilitado para obter verde. Engines v1?v6 n?o foram editadas. A v7 permanece candidata n?o implantada durante essas corre??es.

## Limites e pr?xima unidade segura

A pr?-sele??o de receita/material de Polimeriza??o ? uma adapta??o herdada do RPG, documentada em cardText.ts; n?o reproduz a escolha oficial apenas na resolu??o. N?o alterar silenciosamente nem afirmar equival?ncia integral. Corrigir futuramente exige continua??o/versionamento e testes de escolhas.

Pr?ximas depend?ncias: condi??es de batalha/ataque, prote??o e substitui??o, gatilhos condicionais, sele??o m?ltipla e rituais, estat?sticas simb?licas e identidades vinculadas. Royal Decree n?o ? equivalente a Jinzo: negar efeitos n?o pro?be ativar Armadilhas. Blue-Eyes Ultimate Dragon continua sem admiss?o por ambiguidade de passcode do snapshot; n?o escolher um alias sem evid?ncia. Scapegoat continua bloqueada pela cria??o exata de quatro fichas num campo de tr?s zonas. I02 permanece limitado ? hist?ria efetivamente registrada.

Retomar: ler este checkpoint, docs/REA-MISSION-8.md quando dispon?vel, os dois ?ndices individuais e o relat?rio do ?ltimo CI; verificar altera??es posteriores, executar verify-resolver-archives, check-mission8-integrity, verify-catalog-revisions e su?te completa. Preservar saves/revis?es, economia, layout e SQLite. Manter PR draft; nenhum merge/deploy/distribui??o autorizado.
