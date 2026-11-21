# Checkpoint persistente — Missões 1–6 / retomada da Missão 7

Consolidado em 27/10/2026. Esta entrega altera somente documentação. Não inicia a implementação da Missão 7 nem autoriza merge, deploy, produção, distribuição ou acesso ao Discord. Estado estruturado em `evidence/continuity-missions-1-6.json`; plano em `MISSION-7-PLAN.md`.

## Estado remoto verificado

- Repositório: `dareka222778/yugioh-speed-rpg`; PR [#12](https://github.com/dareka222778/yugioh-speed-rpg/pull/12) aberto, em rascunho, não integrado.
- Branch de trabalho: `feat/rea-engine-recovery-20261026`; base do PR: `classic-engine-foundation`. Não trocar para main nem criar uma reconstrução da engine.
- Último código validado: `30f732e7ba0f97e61919bb87a4a30289e39c6ae7`, árvore `942fecd18310dd91ecdde34f99785cd319b4dd45`.
- [CI 40564035108](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40564035108): jobs test e extended-soak concluídos com sucesso. Referência de merge testada `65762c607f5f000789b8295014d8acf0e1901329`, árvore idêntica à branch.
- 957 testes aprovados; zero falhas, ignorados ou TODO; tipagem/build aprovados. REA: 23 cenários aprovados, sem lacunas ativas, com **uma cobertura parcial I02**, explicitamente preservada.
- Engine-v5; 157 módulos imutáveis em v1–v5 (27/31/32/33/34); 197 certificados: 111 Normais, 24 monstros de efeito, duas Fusões, 60 Magias/Armadilhas.
- 1.962 registros históricos, 1.951 normalizados, 11 bloqueios factuais. 67 certificados das Missões 3–5 continuam bloqueados para distribuição; política anterior dos 130 não alterada.

O commit que contém este checkpoint será posterior ao último código validado. Seu próprio CI deve ser consultado pela branch/PR; não atribuir automaticamente os 957 resultados a um SHA novo. O checkpoint não contém seu próprio SHA para evitar referência circular. Descobrir HEAD na retomada e verificar diferenças desde o código acima.

## Histórico cumulativo

| Missão | Entrega preservada | Resultado histórico de referência |
|---|---|---|
| 1 | Auditoria REA executável; identidade/época de zona; operações de saída; recibos transacionais, eventos e publicação pendente; planejamento de certificação | 130 certificados; último ponto conhecido 519 testes e três TODO, depois resolvidos |
| 2 | Resolvedores históricos; Espera/escolhas persistentes; fichas; recuperação/quarentena e apresentação; diário 2v2 | 130 certificados, 550 testes, sem TODO; I02 continua limitado |
| 3 | v3; primeiro lote de 20 Normais; terminais 2v2 transacionais; partidas/componentes/PNG offline | 150 certificados, 603 testes |
| 4 | v4; pipeline por família, metadados, fontes regionais, fingerprint, cenários e gates; outro lote de 20 Normais; WAL/IMMEDIATE e concorrência | 170 certificados, 791 testes; 1.846 normalizados/116 bloqueios naquele momento |
| 5 | v5; 27 cartas mecânicas; ataque direto, recrutadores, FLIP na resolução, destruição de Magias/Armadilhas, equipamentos/campos/Fusão; normalização factual e carregamento sob demanda | 197 certificados, 923 testes; 1.951 normalizados/11 bloqueios |
| 6 | Diário terminal 1v1, ordem dotenv/SQLite, fixture determinística; crashes de processo, versões mistas, backup/restore e sandbox com verificação de build | 197 certificados, 957 testes; candidata técnica, Discord real pendente |

Os números anteriores são históricos, não resultados reexecutados nesta consolidação. Detalhes e fontes: `REA-DEVELOPMENT-20261026.md`, `REA-MISSION-2.md` até `REA-MISSION-6.md`; não reescrever os relatórios anteriores.

## Módulos e contratos já concluídos no escopo testado

| Área | Implementação existente | Limite para expansão |
|---|---|---|
| Seleção de engine | `src/duelEngine.ts`, `resolverArchive.ts`, `resolvers/v1..v5/`, manifests e `verify-resolver-archives.cjs` | Save sem versão significa v1; não promover/rebaixar saves; nova semântica pode exigir v6 explícita |
| Regras/execução | `duelEngineCurrent.ts`, `effectModels.ts`, `effectDefinitions.ts`, `monsterEffects.ts`, `economicOperations.ts` | Desenvolvimento corrente não altera automaticamente o executável congelado; integrar todas as camadas antes de certificar |
| Identidade/movimento | `cardLifetime.ts`, `monsterExit.ts`, `duelTransitions.ts`, `duelIntegrity.ts` | UID, dono/controlador, época e movimentos intermediários; não inventar épocas ausentes de saves legados |
| Continuidade/entidades | `standbyFlow.ts`, `tokens.ts`, `tagDuel.ts` | Capacidades estruturais não equivalem a suporte de toda carta; Scapegoat permanece bloqueada no formato de três zonas |
| Persistência/publicação | `actionReceipts.ts`, `duelStore.ts`, `tagStore.ts`, `npcProgress.ts`, `snapshotInspection.ts` | Estado/recibos/eventos/recompensas transacionais; publicação externa reconciliável, não exatamente uma entrega |
| Catálogo/certificação | `catalogCertification.ts`, `certificationBatch.ts`, `cardCertifications.ts`, `effectRegistry.ts`, `cardReleasePolicy.ts`, lotes históricos/mecânicos | Catalogado → normalizado → implementado → testado → certificado → autorizado são gates separados |
| Discord/UI | `index.ts`, handlers duel/tag, UI/renderizadores, `discordPayload.ts` | Comandos/componentes/PNG offline aprovados; Gateway/REST real, imagens e latência ainda requerem aceite |
| Operação/candidata | Scripts `sqlite-snapshot`, `inspect-saved-duels`, `prepare-discord-sandbox`, `discord-sandbox-preflight`, `start-discord-sandbox`, `stamp-candidate-build`, `verify-candidate-build` | Sem credenciais/login por padrão; restauração somente para destino novo; código antigo precisa compreender todos os saves ativos |

## Evidência final preservada

- 24 crashes controlados: 1v1 v1–v5 e 2v2 v5, durante escrita de estado/eventos/recibo e após commit. Não equivalem a queda física de energia/disco nem provam todos os pagamentos sob todo tipo de crash.
- Carga mista 50 sessões/dois escritores: pico RSS agregado amostrado 561.577.984 bytes, p95 IPC/fila/transação 122,9 ms, CPU acumulada 21,02 s.
- Carga mista 100 sessões/dois escritores: pico RSS 607.657.984 bytes, p95 211,3 ms, CPU acumulada 37,65 s.
- Soak isolado: 601,3 s, seis sessões intercaladas por coorte, 5.496 partidas, 333.024 commits, 19.589 entregas repetidas, pico RSS 214.917.120 bytes. Heap pós-GC 27,7 → 33,2 MB; métricas retidas e crescimento do banco pertencem ao harness. Não prova ausência de vazamento por horas/dias.
- 1.000 partidas 1v1 e 1.000 clássicas 2v2, além de fluxos persistidos/treino/recuperação e renderização, passaram. Não declarar que cada uma das 197 cartas foi exercitada em cada simulação: a certificação individual tem evidências próprias.
- Backup WAL e restauração de saves pendentes v1/v5, 2v2, decks, inventário e recibos testados somente com fixtures isoladas.

[Auditorias](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40564035108/artifacts/12762288950), [soak](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40564035108/artifacts/12763305564), [prévias](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40564035108/artifacts/12761569282). Retenção configurada: 14 dias. Este resumo/JSON é persistente no Git; links de artefatos podem expirar. Se expirarem, reproduzir scripts no SHA correspondente, sem inventar acesso aos artefatos antigos.

RSS é amostrado, exclui Discord/PNG/SO e pode contar páginas compartilhadas ou perder picos. A reserva de 384 MiB em 1 GiB é uma hipótese de planejamento. Não há capacidade de usuários nem latência Discord de 1,5 s homologadas.

## Pendências reais

1. Homologação Discord isolada: autorização, aplicação/servidor/canal dedicados, quatro participantes consentidos, SHA e host aprovados. Token somente no ambiente autorizado, nunca no chat/PR/relatório. Seguir `DISCORD-HOMOLOGATION-MISSION-6.md` e matriz `evidence/mission6-readiness.json`.
2. Orçamento do host medido com Discord/renderização/SO, latência recebimento→ACK/commit/publicação e rate limits; soak de horas/dias, versões legadas representativas e restauração operacional/RPO/RTO. Não usar produção como substituto.
3. Novas famílias de cartas e dependências: ver plano da Missão 7. Nenhuma capacidade genérica autoriza completar uma descrição por aproximação.
4. Onze bloqueios: The Winged Dragon of Ra (original), Meteo the Matchless, Tomohiro the Mountain Warrior, Zera the Mant (Normal), Ulevo, Super War-Lion, Fiend's Mirror (Normal), Masahiro the Dark Clown, Obelisk the Tormentor (original), Slifer the Sky Dragon (original), Yasushi the Skull Knight. Faltam passcodes e, em vários casos, identidade/CID/tipo. Não substituir por versões modernas ou IDs de arte. Fontes em `evidence/mission5-unresolved-research.json` e relatório reproduzível de bloqueios.
5. I02: épocas de zona nunca gravadas não podem ser recuperadas. Preservar limitação e teste estrito; não desabilitar gates para obter verde.
6. Escopo do beta e autorização de distribuição precisam de aceite explícito. Não redefinir beta como catálogo completo, nem excluir silenciosamente funcionalidades/cartas pretendidas. O plano mantém o catálogo integral no backlog e separa gates operacionais do beta de expansão histórica contínua.

## Retomada sem perder trabalho

1. Ler este arquivo, o JSON, `MISSION-7-PLAN.md`, relatório/matriz/roteiro da Missão 6 e evidências do lote a desenvolver. A investigação REA V1–V11 é referência arquitetural, não prova das regras comerciais; distinguir CONFIRMADO, INFERIDO, HIPÓTESE e NÃO RECUPERADO.
2. Consultar PR/HEAD/CI atuais. Em checkout Git real: `git status --short`, `git branch --show-current`, `git log -8 --oneline`; investigar mudanças antes de atualizar. Continuar na branch íntegra com commits pequenos, sem force/overwrite de trabalho externo.
3. Este workspace foi materializado por arquivos e Git Data API; não presumir que contém `.git` ou dependências completas. Caminho local conhecido: `C:\Users\Micro\Downloads\speed-rpg-rea-20261026\repo`. Se não houver checkout/dependências utilizáveis, usar um checkout isolado autorizado ou ferramentas GitHub com atualização de referência protegida por SHA esperado. Nunca executar `git init` sobre a pasta do usuário para esconder essa diferença.
4. Com Node 22 e dependências do lockfile, executar `npm ci`, `npm run check`, `npm test`, hashes/preservação e `npm run audit:rea`. Se o último CI verde corresponder exatamente à árvore e não houver código novo, aproveitar a evidência existente; não repetir testes extensos só por rotina. Testes locais Node 24 parciais não substituem CI SQLite/Sharp/Discord.
5. Auditar as famílias/candidatos pelo pipeline existente antes de implementar. Usar snapshot congelado `catalog/historical/2004-10-01/` com corte de elegibilidade **30/09/2004**; não reescrever importações ou propostas históricas.
6. Escolher uma unidade independente do plano. Implementar adaptador, testes individuais e de interação/restore, fingerprint, revisão primária e certificado; se necessário, congelar uma nova versão explícita com a ferramenta existente sem editar v1–v5. Não criar versão apenas por documentação ou alterar certificado sem regressão.
7. Executar a suíte/gates apropriados, corrigir falhas e atualizar checkpoint com SHA, resultados exatos e próximo passo. Workflow completo de `.github/workflows/engine-validation.yml` é o gate final; não confundir job parcial com CI inteiro.
8. Atualizar o PR em rascunho e avançar autonomamente para outra tarefa segura se Discord/fontes/decisão externa estiverem bloqueados. Não pedir confirmação para decisões técnicas reversíveis já autorizadas.

Preservar layout, imagens, verso, regras aprovadas, coleções, decks, perfis, progresso, economia, saves e bancos. Não tocar main, produção ou dados reais; não integrar código/dados proprietários nem fazer merge/deploy/distribuição. Checkpoints locais externos `CHECKPOINT-MISSION-6.json` e `VALIDACAO-MISSION-6.json` são complementos, não pré-requisitos de retomada: os documentos deste commit e o CI preservam o contexto essencial.
