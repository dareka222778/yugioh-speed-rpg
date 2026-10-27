# Missão 4 — catálogo escalável e preparação de homologação

Base confirmada: `06388402b1e304ae045b3bbeffd7fa0e9a7644ac`, PR #12 em rascunho, 150 certificados e 603 testes. Não havia alterações posteriores no remoto. Nenhum dado de produção foi acessado. As investigações REA, os layouts e os arquivos anteriores foram preservados.

## Pipeline e limites de automação

`catalogCertification.ts` normaliza metadados estruturados e produz um plano somente de leitura. Valida passcode como string de oito dígitos, preservando zeros; CID, identidade canônica, nomes, atributos, tipos, estatísticas, calendário real, primeira observação mundial e elegibilidade regional. Colisões de passcode/CID/identidade canônica bloqueiam os envolvidos. Não há escolha silenciosa da primeira duplicata. Um alias de certificado antigo pode ser relacionado sem transformar sua ambiguidade importada em identidade nova aprovada.

As consultas de revisão, implementação e execução usam índices, evitando varrer todo o conjunto de certificados para cada carta. O inventário distingue explicitamente:

| Etapa | Evidência necessária |
|---|---|
| Catalogada | Registro factual importado, ainda sujeito a conflitos |
| Normalizada | Identidade e campos estruturados válidos; não implica mecânica implementada |
| Implementada | Adaptador/definição explicitamente admitido na engine |
| Testada no novo pipeline | Manifesto executado, fingerprint atual, todos os cenários exigidos aprovados e nenhum falho |
| Certificada | Certificado individual explícito; o planejador nunca o emite |
| Autorizada para distribuição | Política separada; não decorre da certificação |

A classificação Normal exige categoria estruturada inequívoca e ausência de mecânica especial. Nome, resumo e texto traduzido não concedem suporte. Efeitos desconhecidos recebem dependências de curadoria/implementação; não se tenta inferir um programa executável de sua descrição. As demais famílias existentes são identificadas por suas definições admitidas, como destruição, recuperação, equipamento, Campo, sequência, resposta a ataque e efeitos de monstro. São famílias técnicas do RPG, não uma taxonomia oficial completa.

`scripts/audit-certification-pipeline.cjs` lê o catálogo histórico e cruza esses estágios. Na medição atual: **1.962 catalogadas, 1.846 normalizadas e 578 planos de cenários Normais**. Há 116 registros que não passam todos os requisitos de normalização atual. Isso não revoga certificados antigos cujos dados curados são válidos. Os 170 certificados continuam exercitados pela suíte completa. O manifesto novo de oito cenários cobre apenas as 20 cartas deste lote: não foi fabricada cobertura retroativa para os certificados anteriores.

Automação com denominador explícito para o novo lote: **20/20 normalizações e 160/160 instâncias de cenários executáveis**; **20/20 revisões individuais ainda obrigatórias**; **zero decisões automáticas de certificação**. No inventário completo, 1.846/1.962 normalizações equivalem a aproximadamente 94,1%. Essa taxa não representa completude mecânica do catálogo.

## Novo lote: 150 → 170

As 20 candidatas da proposta da Missão 3 foram revistas individualmente. `docs/evidence/mission4-primary-facts.json` preserva fatos mínimos e URLs oficiais por CID; `mission4-individual-reviews.json` vincula identidade canônica, aprovação individual, fonte primária, estatísticas e fingerprint mecânico. Os tipos, atributos, níveis, ATK/DEF, categoria Normal e datas OCG conferem com as páginas oficiais consultadas. Para Kanan, a consulta adicional da lista completa confirma o registro de 21/02/1999; não foi confundida uma reedição recente com o primeiro registro.

| Passcode | Carta | ATK / DEF | Primeira observação OCG verificada |
|---|---|---|---|
| 08944575 | The Drdek | 700 / 800 | 1999-02-04 |
| 53293545 | Firegrass | 700 / 600 | 1999-02-04 |
| 15401633 | Kagemusha of the Blue Flame | 800 / 400 | 1999-02-04 |
| 85705804 | Kurama | 800 / 800 | 1999-02-04 |
| 12829151 | Kanan the Swordmistress | 1400 / 1400 | 1999-02-21 |
| 99030164 | Happy Lover | 800 / 500 | 1999-03-01 |
| 15042735 | Hurricail | 900 / 200 | 1999-03-01 |
| 97973387 | Droll Bird | 600 / 500 | 1999-03-01 |
| 64154377 | Embryonic Beast | 500 / 750 | 1999-03-01 |
| 88435542 | Fire Eye | 800 / 600 | 1999-03-01 |
| 77603950 | Phantom Dewan | 700 / 600 | 1999-03-01 |
| 83678433 | Midnight Fiend | 800 / 600 | 1999-03-01 |
| 76704943 | Yamatano Dragon Scroll | 900 / 300 | 1999-03-01 |
| 03985011 | Lucky Trinket | 600 / 800 | 1999-03-01 |
| 29948642 | Dig Beak | 500 / 800 | 1999-03-01 |
| 03732747 | Water Element | 900 / 700 | 1999-03-01 |
| 37243151 | Weather Control | 600 / 400 | 1999-03-01 |
| 13193642 | Dark Plant | 300 / 400 | 1999-03-01 |
| 61201220 | Phantom Ghost | 600 / 800 | 1999-03-01 |
| 49258578 | Gate Deeg | 700 / 800 | 1999-03-01 |

CONFIRMADO: fatos mecânicos e presença OCG antes do corte nas fontes oficiais. INFERIDO: passcodes/nomenclatura inglesa ligados ao CID pelo crosswalk público importado; o HTML oficial consultado não publica os passcodes. Datas TCG continuam como observações da importação, sem nova comprovação do menor dia regional. A aprovação deste lote é OCG/mundial, não TCG-2004. A opção regional TCG do pipeline exige evidência primária adicional e não reutiliza a aprovação OCG como se fosse TCG. Nulo significa não recuperado, não inexistência universal.

`tests/helpers/normalCertification.cjs` é o adaptador reutilizável de cenários. Cada carta registra oito testes independentes: identidade, invocação, baixar, destruição, controle temporário, Tributo ao Cemitério do dono, restauração JSON e zonas ocupadas. Só a execução produz `artifacts/certification-executions-mission4.json`. Um plano gerado sem execução não marca a carta como testada. O lote usa a mecânica Normal existente; não foram inventados efeitos para ampliar contagens.

O adaptador calcula os Tributos por nível e distingue zona cheia sem Tributo de zona liberada por Tributo. Duas cartas já certificadas de níveis 5 e 8 exercitam mais 16 cenários do próprio adaptador, sem criar certificados ou revisões históricas novas para elas.

Distribuição das 40 adições das Missões 3–4 permanece bloqueada. As 130 anteriores conservam a política existente. Não há novas concessões, alteração de loja, recompensa, starter, coleção ou deck NPC. A autorização de distribuição não equivale a posse; os demais controles de inventário permanecem.

## Versionamento e preservação

Novas partidas usam `engine-v4`, com 33 módulos fechados e manifesto SHA-256. `scripts/freeze-resolver.cjs` torna o congelamento reproduzível e recusa sobrescrever qualquer versão existente ou importar dependência externa ao fechamento. O manifesto descreve a base e a normalização; não afirma que o commit-base já continha os novos metadados.

Os 90 módulos v1–v3, os 150 certificados anteriores e 114 arquivos protegidos são verificados por `scripts/check-mission4-integrity.cjs`. A proposta da Missão 3 permanece reprodutível sobre v3, sem ser reescrita para o catálogo atual. Há regressão adicional de seis partidas completas v3/v4 com os mesmos decks/sementes: comportamento e ações devem coincidir, exceto pela identidade do resolvedor. Saves antigos continuam na versão original. I02 conserva a impossibilidade de recuperar épocas/movimentos que nunca foram gravados.

## Concorrência e correção demonstrada

O primeiro teste de 50 sessões persistidas passou a suíte de 773 testes, mas falhou por esgotar oito tentativas sob disputa de escrita. As transações DEFERRED liam recibos/estado antes de obter o writer, permitindo falha de upgrade do snapshot em WAL. Não se aumentou o número de tentativas para ocultar o problema. `performDuelAction` e `actTag` agora usam a variante **IMMEDIATE**: obtêm o writer antes das leituras e mantêm estado, eventos, recibos e pagamentos na transação existente. Não houve alteração das regras arquivadas nem do esquema SQLite.

`scripts/stress-persisted-duels.cjs 50` mantém inicialmente 25 partidas 1v1 e 25 partidas 2v2 ativas, usando quatro processos escritores reais sobre SQLite temporário. Injeta uma falha transacional e uma ação inválida concorrente, duplica entregas, verifica uma revisão por ação, conserva UIDs/identidades, reinicia um writer, conclui partidas e verifica economia, assentos, `integrity_check` e `foreign_key_check`. BUSY continua sendo erro transitório possível, contado explicitamente, com retry limitado por request estável no harness. Isso não promete espera ilimitada nem recuperação automática de toda falha externa no bot.

As métricas separam tempo IPC/fila/transação e serviço no worker, incluindo CPU e RSS por processo. RSS de processos encerrados não deve ser somado como se todos estivessem ativos simultaneamente. O benchmark headless anterior aceita agora 32, 50 e 100 sessões, com relatórios separados, CPU, event loop, memória, replay após cada ação e restaurações. Nem esse benchmark nem o teste SQLite medem latência real do Discord.

## Discord isolado

`scripts/prepare-discord-sandbox.cjs` prepara um diretório novo com configuração, caminho SQLite separado e campos de credencial vazios. Não inicia o bot, não faz login e não recebe autorização por herdar variáveis do ambiente. A preparação local foi executada; o caminho concreto consta no checkpoint externo da missão.

`tests/discordFullMatches.test.cjs` acrescenta partidas completas 1v1 e 2v2 nos handlers reais, com menus, acknowledgement antes da mutação, payloads privados, PNGs reais em checkpoints, fechamento dos controles e reabertura efetiva do SQLite/cache de módulos durante a partida. O transporte é simulado, a arte é offline e `fetch` é bloqueado. Os testes anteriores de comandos slash, menus, botões, imagens e falha de publicação permanecem. Isso é evidência local/CI; **não é homologação de um servidor Discord**.

Reprodução offline: `node scripts/run-tests-isolated.cjs --serial tests/discordHomologation.test.cjs tests/discordFullMatches.test.cjs`. O roteiro da Missão 3 continua válido. Faltam servidor/bot/contas isolados autorizados, credenciais próprias, medição real de rede/rate limits e aceite visual humano.

## Reprodução e continuidade

Executar o workflow completo: hashes v1–v4, proteção dos certificados, tipagem/build, todos os testes, pipeline com revisões e manifesto executado, carga SQLite de 50 sessões, REA, benchmarks 32/50/100, auditorias históricas/cartas, simulações 1v1/2v2, treinos e prévias visuais. Os artefatos incluem o plano por carta/família, os resultados individuais, as partidas offline e a carga persistida. O CI do SHA final no PR #12 é a referência para contagens e métricas finais; um checkpoint verde anterior não o substitui.

O ambiente local continua sem todas as dependências npm. Os testes puros e benchmarks headless usam Node 24 local; tipagem, SQLite, Sharp e a suíte completa são efetivamente executados na CI Node 22. Não atribuir testes não executados localmente ao ambiente local.

Plano para o catálogo: resolver os 116 bloqueios de normalização sem inventar identidades; revisar Normais restantes em lotes auditáveis; ampliar adaptadores de famílias de efeitos com testes positivos, negativos e interações; manter snapshots executáveis por versão; exigir revisão por carta mesmo quando a geração de cenários é automática. As famílias pendentes de curadoria não podem ser prometidas como prazo linear por quantidade de cartas. Não há estimativa responsável de conclusão total sem medir os próximos lotes complexos.

Sem merge, deploy, acesso à produção, distribuição de cartas ou alteração de layout.
