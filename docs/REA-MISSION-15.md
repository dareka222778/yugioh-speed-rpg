# Missão 15 — operação de destruição filtrada e recuperação da v8 experimental

**Atualização do segundo bloco, em validação:** a branch prepara v8 como padrão, catálogo aditivo de 749 cartas, revisões individuais e integração da IA. Consultar [MISSION15-INTEGRATION-WIP.md](MISSION15-INTEGRATION-WIP.md) e a CI do HEAD. O texto abaixo registra o primeiro bloco validado; não representa aprovação antecipada da integração posterior.

Este ciclo entrega infraestrutura executável e regressões. **A expansão de cartas e a Missão 15 integral permanecem incompletas.** A engine padrão continua v7, com **741 certificados e 130 IDs autorizados para distribuição**. Há uma v8 experimental acessível explicitamente pelo arquivo de resolvedores; ela não foi promovida a padrão. As oito definições candidatas são usadas exclusivamente nos testes e não constam do registro de cartas jogáveis.

## Base recuperada e correção da Missão 14

A base remota conferida foi `2e21d40724341db91bb9a03e3500641fc46f9302`. A CI 40628952952 tinha 5.177 testes aprovados e uma falha: a expectativa de bloqueios para distribuição ainda contava 610 cartas, omitindo Flash Assailant. A lista positiva de 130 já estava correta. O commit `d6b73d10` corrigiu somente o teste; o job principal da CI 40629958472 aprovou **5.178 testes, zero falhas e zero TODO**, tipagem, compilação, SQLite e as auditorias existentes.

O estado remoto foi materializado em diretório separado e os 603 blobs originais foram conferidos antes das alterações. O workspace antigo, que continha trabalho de outra sessão, foi preservado. Os relatórios solicitados existentes foram lidos; `REA-MISSION-8.md`, `REA-MISSION-9.md` e `REA-MISSION-10.md` não estavam na árvore recebida. Foram consultados os checkpoints, evidências, scripts e testes disponíveis dessas etapas; não foram fabricados relatórios retrospectivos.

## Implementação funcional

- `destroyFiltered`: operação declarativa com filtros de Tipo e presença de Equipamento, combináveis. Rejeita filtros vazios, Tipos desconhecidos/duplicados e campos de efeito não suportados.
- Seleção dos monstros dos dois campos na resolução, sem alvos individuais na ativação. Apenas monstros com a face para cima são examinados; nenhum menu depende da identidade de uma carta oculta.
- O grupo elegível, o limiar de ATK quando aplicável e as imunidades são capturados antes da primeira mutação. A saída usa os serviços existentes de destruição, preservando dono, limpeza de Equipamentos, fichas e a infraestrutura de gatilhos.
- O vínculo de Equipamento é verificado independentemente do controlador. A remoção encadeada do Equipamento pode tornar o monstro inelegível antes da resolução de Eternal Rest.
- Resolução das novas operações centralizada em `effectOperations`; os chamadores passam a definição completa, preservando seus filtros.
- Catálogos com cache e validação separados por versão; dispatcher, restauração e eventos aceitam explicitamente a v8. Nenhuma revisão v7 foi regravada.
- Uma única implementação v8, com 46 módulos e manifesto de hashes. A revisão inicial contém as mesmas 741 cartas; novas admissões compatíveis poderão ser revisões de dados, sem outra cópia da engine.
- Backup online SQLite inclui os catálogos v7/v8 e a referência ao manifesto v8. Backups antigos de formato 1 contendo apenas v7 continuam verificáveis/restauráveis. Não houve migração nem acesso a bancos de jogadores.
- A auditoria dos decks da IA passa a usar o perfil aprovado, corrigindo a aceitação indevida de seis cartas no Adicional e a ausência de verificação de cópias nele. Os decks atuais de Joey, Yugi e Kaiba continuam válidos.

Os ajustes da nova v8 durante este ciclo são ajustes de uma candidata ainda não promovida. **Nenhum módulo ou manifesto das engines v1–v7 foi modificado.**

## Cartas e fontes

As definições candidatas são Exile of the Wicked, Acid Rain, Eternal Drought, Breath of Light, Warrior Elimination, Eradicating Aerosol, Eternal Rest e Last Day of Witch. São **oito implementações declarativas em testes; zero novas certificações**. O índice [mission15-card-research.json](evidence/mission15-card-research.json) separa fontes oficiais, impressões verificadas, datas importadas e pendências por carta.

Por exemplo, [Acid Rain](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4666&request_locale=ja) e [Warrior Elimination](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4659&request_locale=ja) têm impressões OCG anteriores ao corte. Isso não autoriza tratá-las como disponíveis no TCG antes de 30/09/2004. [Eternal Rest](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4662&request_locale=ja) depende de Equipamentos, não de Tipo de monstro.

As divergências de datas TCG de Eternal Drought e Breath of Light foram registradas sem alterar o histórico congelado. Após falha inicial do endpoint japonês, a impressão OCG de Eradicating Aerosol em 22/07/1999, Vol.4, foi recuperada na página oficial indexada e no calendário oficial de cartas. A concordância de passcodes vem do histórico público importado; não se afirma que a página oficial consultada exiba esses números.

## Validação e limites das evidências

Há 37 testes da família candidata: oito resoluções individuais, oito negações individuais, oito restaurações/replays individuais e regressões compartilhadas de legalidade, imunidade, encadeamento, dono, fichas, isolamento de catálogo e não distribuição. Quatro testes adicionais cobrem a auditoria dos decks da IA, dois testes nativos cobrem snapshots novos/antigos e um testa a preservação integral dos diagnósticos de aceitação. Os testes SQLite exigem a execução Node 22 com dependências nativas na CI.

A seleção local executável final de 58 testes, incluindo regressões anteriores e o diagnóstico de aceitação, passou com Node 24. O carregamento direto de TypeScript não substitui tipagem, compilação nem SQLite. Tentativas locais que importaram `better-sqlite3` ficaram bloqueadas por dependência ausente; a suíte completa é executada na CI Node 22, sem desabilitar testes.

O job principal da [CI 40632450832](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40632450832), commit `843a43ea`, terminou aprovado com **5.221 testes, zero falhas/TODO**, tipagem, compilação, aceitação e cargas SQLite da candidata. A auditoria REA executou os 23 cenários com sucesso, mantendo uma cobertura parcial legítima em I02. Isso não presume aprovação de commits posteriores nem do job prolongado ainda não concluído quando o checkpoint foi registrado.

Na carga SQLite com duas instâncias writer e coordenador, 50/100 sessões concluíram 3.316/6.837 commits e 301/624 entregas duplicadas, com reinício de writer, conservação, economia e verificações SQLite aprovadas. P95 IPC/fila/transação foi aproximadamente 104/175 ms, p99 177/262 ms, e RSS agregado amostrado 569/568 MiB. O runner não estava limitado à quota de CPU da hospedagem pretendida; não se extrapola capacidade Starter+ desses resultados. Os valores completos, CPU e proveniência estão em [mission15-validation.json](evidence/mission15-validation.json).

Uma execução anterior (`1b925bb3`, CI 40631948178) passou os 5.203 testes, mas falhou depois na aceitação crítica, com diagnóstico truncado pelo tratamento antigo de erros. A causa desse episódio não foi recuperada e não se afirma que tenha sido corrigida por uma simples repetição. A captura integral do TAP foi implementada e testada; aceitações posteriores passaram. A etapa diagnóstica antecipada permanece temporariamente além da aceitação final para ajudar a localizar eventual recorrência.

`audit-mission15.cjs` verifica 253 arquivos contra a base, incluindo 238 arquivos das engines v1–v7, oito artefatos v7 e sete arquivos de certificados, metadados, distribuição, stores, banco e regras. As verificações anteriores continuam habilitadas.

O benchmark interno local da candidata, sem Discord/SQLite/renderização, executou 500 e 1.000 operações sobre 50 e 100 fixtures residentes. Na amostra Node 24, p95 foi aproximadamente 0,81/0,58 ms; RSS final aproximadamente 94,5/95,5 MiB. Esses números não comprovam a meta de 1,5 segundo no Discord nem capacidade para jogadores reais. A CI reproduz o benchmark e acrescenta cargas SQLite de 50/100 sessões com `--mixed --candidate-v8`, incluindo duplicatas, rollback, reinício de writer, conservação e economia. Nesse modo, a v8 aparece nos duelos 1v1; os 2v2 continuam na v7 aprovada.

Os resultados finais de cada execução ficam nos logs e artefatos da CI vinculada ao commit. O checkpoint distingue resultados já observados de verificações ainda em execução; não pressupõe aprovação de um HEAD posterior.

## Pendências para promoção, beta e catálogo

1. Fechar as revisões individuais e regionais das oito candidatas, integrar seus metadados/certificados e acrescentar uma revisão v8 aprovada. Não inserir certificados de fixtures no registro real.
2. Integrar e testar a utilidade da IA para destruição filtrada, evitando destruir seu próprio campo sem benefício. A política real de escolha de ações não foi alterada neste ciclo.
3. Cobrir as interações e gatilhos restantes por carta; Tipos alterados, novas espécies de Equipamentos e substituições de destruição não são capacidades concedidas por este filtro.
4. Validar persistência/rotação 2v2 na v8 antes da promoção. A preservação dos saves anteriores não equivale à homologação de todas as combinações novas.
5. Promover a v8 somente após integração e regressão completas; não mudar expectativas históricas para fazer testes passarem.
6. Prosseguir pelos grupos da triagem da Missão 13: modificadores/durações, dependências, negação, busca/recrutamento e condições de invocação, com testes integrais e certificação individual.

O fluxo de homologação existente permite proprietário sozinho contra IA, seguido de convidados e beta fechado. Login real não foi executado. Ainda são necessários configuração isolada validada, SHA candidato aprovado, aplicação/guild/canal de testes, IDs consentidos, listas de bloqueio de produção e credencial fornecida por mecanismo seguro quando houver autorização específica. O plano de referência é Starter+ 2 GB/100% CPU/8 GB; nenhuma capacidade de usuários foi certificada. O lançamento público exige também homologação real, medições representativas, recuperação operacional e decisão explícita sobre distribuição.

Não houve merge, deploy, concessão de cartas, alteração de economia, layout, imagens, banco de produção ou acesso ao Discord real. A limitação histórica I02 continua documentada; dados ausentes não foram reconstruídos artificialmente.
