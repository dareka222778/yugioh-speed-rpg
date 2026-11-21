# Missão 15 — destruição filtrada, engine-v8 e oito admissões individuais

A branch de desenvolvimento usa **engine-v8 e 749 cartas certificadas**, antes 741. A lista positiva de distribuição continua limitada aos mesmos **130 IDs**; as oito novas cartas não foram concedidas nem liberadas na loja. O catálogo histórico de 1.962 registros continua incompleto. Este relatório não declara homologação real nem lançamento.

A [CI 40638667535](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40638667535), commit 2fc28f01b664fdd474b1e42cca08fddb6237af36, concluiu **ambos os jobs com sucesso: 5.290 testes, zero falhas/TODO**, tipagem, compilação, auditorias, SQLite e soak de 600 segundos. As oito admissões passaram individualmente identidade, efeito, negação, replay pelo dispatcher real e decisão da IA. Os 23 cenários REA passaram, preservando a cobertura parcial legítima I02. Aprovação se refere ao SHA indicado; conferir o HEAD se houver alterações posteriores.

**Cartas implementadas e fontes**

| Carta / passcode | Condição de destruição | Impressão oficial verificada anterior ao corte |
|---|---|---|
| Exile of the Wicked / 26725158 | Fiend | TCG, 01/10/2002, TP2-004 |
| Acid Rain / 21323861 | Machine | OCG, 22/07/1999, Vol.4 |
| Eternal Drought / 56606928 | Fish | OCG, 22/07/1999, Vol.4 |
| Breath of Light / 20101223 | Rock | OCG, 22/07/1999, Vol.4 |
| Warrior Elimination / 90873992 | Warrior | OCG, 22/07/1999, Vol.4 |
| Eradicating Aerosol / 94716515 | Insect | OCG, 22/07/1999, Vol.4 |
| Eternal Rest / 95051344 | Equipamento vinculado ao monstro | OCG, 20/06/2002, DL1-044 |
| Last Day of Witch / 90330453 | Spellcaster | OCG, 23/01/2003, DL4-118 |

As datas são impressões verificadas, sem inventar estreia mundial. Disponibilidade OCG não prova disponibilidade TCG antes de 30/09/2004. As divergências nas datas TCG importadas de Eternal Drought, Breath of Light e Last Day of Witch permanecem documentadas, sem regravar o histórico congelado. A impressão de Eradicating Aerosol foi recuperada na fonte oficial indexada/calendário após falha inicial do endpoint japonês.

Fontes primárias e concordância CID/passcode: [pesquisa](evidence/mission15-card-research.json). Revisões individuais com fingerprints, dados e fontes: [revisões](evidence/mission15-individual-reviews.json). Evidência realmente executada, separada da pesquisa: [execuções](evidence/mission15-card-executions.json). Os passcodes foram cruzados com o histórico público importado; não se afirma que a página oficial consultada os exponha. Nomes canônicos em inglês não são apresentados como traduções oficiais; as descrições operacionais são em português.

**Operação reutilizável e preservação**

destroyFiltered aceita filtros tipados de Tipo e presença de Equipamento. A seleção do grupo ocorre na resolução, nos dois campos e apenas sobre monstros com a face para cima. Não escolhe alvos individuais na ativação, não cria custos inexistentes e não lê identidades ocultas. Filtros vazios, Tipos desconhecidos/duplicados e campos não suportados são rejeitados.

O executor central captura o grupo elegível e as imunidades antes da primeira mutação e usa os serviços existentes de saída de campo. Isso preserva dono, condição de Fusão, fichas, limpeza de Equipamentos e gatilhos. A remoção encadeada de um Equipamento pode retirar a elegibilidade para Eternal Rest. Warrior não inclui Beast-Warrior, e Fish não significa WATER, Aqua ou Sea Serpent.

Foi criada uma implementação v8 com 46 módulos e manifesto. **Os 47 arquivos dessa implementação não foram alterados na admissão das oito cartas**: a revisão inicial de 741 cartas d84815dc2001064ba69b0fec719fc41495f78561d0438f16d6a0ee19357d4ee3 foi estendida por dados à revisão de 749 cartas e301765da8535ac4462932bbb64d6f5c2d8fe6f15461d236c89bc8325819a8c6. Saves da primeira revisão continuam usando exatamente os seus dados; as cartas novas são rejeitadas nela e em v7.

Os 231 módulos históricos v1–v7, seus manifestos e as sete revisões v7 permanecem intactos. A auditoria verifica os 253 caminhos da base e os 47 arquivos v8 já validados. Três arquivos correntes têm extensões explicitamente delimitadas: import/spread de metadados, certificados aditivos e duas linhas do hook tático no store. O normalizador revisado remove somente essas adições para conferir os bytes originais; rejeita código no objeto de certificados e detecta mudanças fora dos limites. Não foi desabilitada nenhuma verificação histórica.

**IA, persistência e testes**

A IA avalia o grupo realmente afetável, com o catálogo salvo e sem consultar informação oculta. Usa a nova Magia quando o benefício supera a perda própria e evita destruição exclusivamente prejudicial. Essa é uma heurística tática; não restringe ações legais do jogador.

O backup online SQLite inclui catálogos v7/v8 e hashes dos manifestos. Backups antigos de formato 1 com apenas v7 continuam restauráveis. Testes de interrupção abrupta agora incluem v8 em 1v1/2v2 e mantêm o caso 2v2 v7, além dos resolvedores anteriores. O store transacional mantém seu código original fora do hook de IA; não há migração de banco de produção.

A família tem 41 testes compartilhados, 40 cenários individuais de admissão, um cenário de recuperação 2v2 com todas as oito cartas, nove avaliações táticas, testes dos limites de extensão, fixtures de carga e diagnóstico de cobertura. Inclui negação, retirada de Equipamento em cadeia, imunidade, dono/controlador, fichas, gatilho de Sangan após o grupo inteiro sair do campo e preservação da Fusão para renascimento. Os certificados exigem execução das suítes e auditoria individual, não apenas importação de dados.

O Node local é 24 e não dispõe de better-sqlite3 utilizável. Regressões puras foram executadas localmente; tipagem, compilação, SQLite, processos, interrupções e suíte completa são comprovados pela CI Node 22. Falhas locais por dependência ausente não foram declaradas como sucesso. A matriz REA mantém a limitação legítima I02: históricos de zona ausentes não foram fabricados.

**Cargas, problemas corrigidos e beta**

Foram preparados decks virtuais de carga contendo as oito Magias, Equipamento e sete Tipos de monstros. As cargas de 50/100 sessões usam 1v1/2v2, duas instâncias writer, duplicatas, rollback injetado, reinício, conservação e economia. Contam ativações por carta; incluir uma carta no deck não significa que ela foi utilizada. A primeira amostra não ativou Aerosol; o fixture foi melhorado com um Inseto Normal forte. A amostra final registrou duas/cinco ativações de Aerosol, além da sua regressão individual.

A amostra final ativou todas as oito Magias nas duas cargas: 43/91 ativações comprometidas em 50/100 sessões, 2.143/4.508 commits, 195/412 duplicatas e um reinício de writer em cada carga. SQLite, chaves estrangeiras, conservação e economia passaram. P95 IPC/fila/transação foi 141/221 ms, p99 294/392 ms, RSS agregado amostrado 509/545 MiB. CPU acumulada coordenador+writers: 13,24/23,10 segundos em 9,07/14,87 segundos de execução; o runner não emula a quota de CPU da hospedagem.

O soak com oito versões completou 5.481 duelos em 601,3 segundos, 325.367 commits e 19.139 entregas duplicadas, com integridade/conservação/economia aprovadas. Pico RSS observado: 228,6 MiB em um processo; heap após GC passou de 37,1 a 43,6 MiB. Isso é um teste limitado a dez minutos, não prova de ausência de vazamento em dias. O banco terminou com 197,2 MiB sob essa carga sintética intensa: retenção/arquivamento seguro de históricos e recibos, monitoramento de disco e política de backup continuam prioridades operacionais. Não foi apagado histórico para melhorar métricas.

Os valores completos e a proveniência estão em [validação](evidence/mission15-validation.json) e nos artefatos da CI. São medidas de engine/IPC/fila/SQLite, sem Discord ou renderização. A referência é 2 GB RAM, 100% CPU e 8 GB; não há capacidade real de usuários certificada nem comprovação da meta de 1,5 segundo de ponta a ponta.

Problemas concretos corrigidos: expectativa de distribuição da Missão 14 omitia Flash Assailant; auditoria NPC aceitava seis cartas no Adicional e não verificava suas cópias; backup omitia catálogos v8; impressão de erro truncava o TAP de aceitação; auditorias do contrato atual ainda presumiam v7/sete versões; a cobertura descartava os filtros ao classificar o efeito. Uma aceitação intermitente anterior teve causa não recuperada; aceitações seguintes passaram, e agora o diagnóstico integral é preservado. Isso não é apresentado como correção causal de uma falha não identificada.

O fluxo existente permite proprietário sozinho contra IA, depois convidados e beta fechado. Ainda faltam homologação Discord autorizada, medições representativas de hospedagem, localização integral e outras famílias mecânicas para completar o catálogo. Próxima prioridade: modificadores condicionais por posição/duração e dependências de fontes, depois negação/busca/invocações conforme a triagem da Missão 13. Novas semânticas exigem versão explícita; cadastro compatível continua por dados.

Não houve merge, deploy, acesso ao Discord real, distribuição, alteração de layout/imagens, exclusão de progresso nem operações em produção.
