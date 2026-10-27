# Missão 6 — estabilização e candidata para homologação

Base auditada: `01234e3f853ef6408d6ad657f4c5c137b5c78661`, engine-v5, 197 certificados, 1.951/1.962 registros normalizados e 11 bloqueios. Não houve expansão/distribuição de cartas, mudança de regras, v6, merge, deploy ou operação de produção.

## Revisão e correções demonstradas

A suíte completa foi executada novamente **antes das alterações** (Actions run 40558548274, tentativa 2, job 122391072667): 923 testes, 922 aprovados e uma falha. O teste de retomada do treino 2v2 pressupunha uma decisão humana após uma abertura aleatória, embora os NPCs possam concluir legitimamente a partida antes dela. A fixture agora grava uma decisão automatizada determinística com seed e assento conhecidos; o teste continua exigindo recuperação, avanço de revisão e economia intacta. As simulações aleatórias completas foram preservadas, sem desabilitar testes ou mascarar falhas da engine.

O timeout 1v1 salvava o resultado e liberava assentos sem gravar o evento terminal no diário, diferentemente do 2v2. A correção mantém estado, resultado, membros e evento na mesma transação. A regressão força falha na escrita do diário, exige rollback integral e confirma um único evento após retry. Convite expirado não gera resultado fictício.

O entry point importava módulos que abrem SQLite antes de carregar dotenv. O carregamento de configuração foi movido para o primeiro import; um processo isolado prova que a configuração já existe antes da primeira dependência da aplicação. Isso evita abrir o caminho padrão antes de ler DATABASE_PATH do ambiente de configuração. Nenhuma credencial real foi lida nos testes.

Os manifests v1–v5 e os arquivos protegidos continuam verificados em CI. As engines históricas, definições e semânticas não foram editadas. As 197 certificações e a política dos 67 certificados bloqueados permanecem. O lockfile contém 122 entradas de pacotes e duas versões de @discordjs/collection: 1.5.3 exigida por discord.js e 2.1.1 por REST/WS. São ranges major incompatíveis; não foi imposta deduplicação arriscada nem atualização oportunista de dependências.

## Recuperação, persistência e memória

`abruptRecovery6.test.cjs` executa 24 casos: 1v1 em v1–v5 e 2v2 v5, cada um interrompido por SIGKILL após escrita do estado, eventos, recibo ou retorno do commit. O worker usa triggers TEMP e uma função SQLite que sinaliza um marcador antes de bloquear dentro da transação; somente então o pai o encerra. Nenhum hook de falha foi adicionado ao código de produção. Os casos exigem ausência de commit parcial antes do commit e replay único depois dele, versão preservada, cartas, membros, economia, integridade SQLite e chaves estrangeiras. Isso prova recuperação de **falha de processo nos pontos testados**, não sobrevivência a falha de disco, corrupção física ou queda de energia do host.

Os testes anteriores de pagamentos, recompensa NPC, falha de recibo, duplicatas concorrentes e publicação permanecem. Não se extrapola o crash de uma operação sem custo para todas as operações econômicas; a cobertura econômica combina testes de rollback/recibo já existentes e novos casos de processo.

O harness de carga mantém as quatro configurações anteriores e acrescenta 50 e 100 sessões, dois escritores e versões 1–5 simultâneas em um único SQLite, com 2v2 v5. Cada ação verifica a versão fixada e conservação. Há contenção/retry limitado, duplicatas, erro injetado, reinício de escritor, conferência de economia e assentos. A API e os workers continuam sendo do harness, sem nova arquitetura na implantação.

`soak-mixed-versions.cjs` mantém um processo e banco vivos, executa coortes completas de cinco partidas históricas e uma 2v2, entregas repetidas e amostras pós-GC. CI exige **120 segundos**, encerrando somente após completar a coorte em andamento. Relata duração real, coortes, commits, CPU, RSS, heap, arquivo SQLite e WAL. Comandos aceitam 10–3.600 segundos para reprodução. Duas horas/dias de estabilidade e ausência de vazamentos **não** são comprovados por esse teste limitado.

Os valores finais pertencem ao artefato do CI do SHA final: `persisted-duel-stress-*-mixed.json`, `mixed-version-soak-mission6.json` e `readiness-mission6.json`. Não misturar números de execuções intermediárias. O planejamento usa 1 GiB e reserva hipotética de 384 MiB para Discord/renderização/SO, deixando 640 MiB para a carga medida. A reserva é uma hipótese de engenharia, não medição nem recomendação de capacidade. O relatório calcula a margem real de cada amostra e sinaliza se excede esse envelope. Nenhuma quantidade de usuários foi aprovada. RSS agregado é amostrado, pode contar páginas compartilhadas e perder picos; o teste não inclui cliente Discord/PNG no mesmo host.

## Homologação, funcionalidade e lançamento

Os comandos reais continuam exercitados por `interactions`, `discordFlow`, `discordHomologation` e `discordFullMatches`: perfis, inventário, decks, convites, componentes, privacidade, PNG, duelos completos 1v1/2v2 e recuperação. Testes das 197 definições e do lote mecânico permanecem obrigatórios, sem permitir que normalização ou certificação concedam cartas. Desistência, timeout, deck-out, recibos e recompensas são auditados por suites próprias. Transporte simulado não equivale ao Gateway/REST e às condições reais de rede.

A matriz auditável está em `docs/evidence/mission6-readiness.json`: **Aprovado com evidências**, **Pendente de teste real**, **Reprovado ou bloqueado**. A aprovação automatizada exige workflow completo verde no SHA candidato; presença de teste não é suficiente. I02 mantém dados históricos ausentes explicitamente irrecuperáveis. Não há porcentagem de prontidão.

O procedimento `DISCORD-HOMOLOGATION-MISSION-6.md` define autorização, quatro consentimentos, bot/servidor separados, banco novo, build/SHA exatos, roteiro funcional, medições e gates de aceite. O preparador cria configuração sem credenciais e autorização falsa por padrão. Preflight impede destinos de produção conhecidos e escape do banco; não consulta token nem faz login. O launcher manual exige autorização, ambiente dedicado, checkout limpo e inventário SHA-256 de todo o build. Não foi executado com --run. Falta o ambiente autorizado descrito no roteiro; isso bloqueia somente as ações reais de Discord.

O utilitário `sqlite-snapshot.cjs` usa backup online e manifesto; valida e restaura somente para destino novo. O teste cobre WAL confirmado, exclusão de escrita não confirmada, hash adulterado e recusa de sobrescrita/sidecar. Não abre módulos da aplicação nem migra o banco. Backup real, mídia externa, retratos e restauração operacional continuam fora da execução desta missão. O roteiro distingue reversão de código compatível de restauração com perda de commits posteriores, sem prometer replay automático.

## Reprodução e limites

Executar `npm ci`, `npm run check`, `npm test`, `node scripts/verify-resolver-archives.cjs`, cargas e auditorias conforme `.github/workflows/engine-validation.yml`. Scripts de falha/soak geram bancos temporários, retiram credenciais herdadas e limpam exclusivamente suas pastas de teste. Dependências SQLite/Sharp e suíte completa são executadas na CI Node 22; o ambiente local usa Node 24 apenas nas verificações disponíveis. Relatórios, métricas e prévias ficam nos artefatos do CI e o checkpoint local registra os commits.

Próxima fase recomendada: homologação real isolada após autorização e provisão, com orçamento de host medido e aceite humano. Manter bloqueados lançamento em produção, distribuição das 67 adições, identidades sem evidência, mecânicas ausentes e qualquer promessa de capacidade/latência real sem teste representativo.
