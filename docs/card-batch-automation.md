# Automação de lotes e implantação aprovada — Missão 31

Base recuperada: `0e031fdfca8e4a9a126a2838ea82775c2802c7e3`, engine-v9, versão 0.17.1, 903 cartas certificadas/autorizadas. A CI integral 40941198166 foi aprovada. O host foi consultado sem reinício e confirmou o mesmo commit, catálogo `63098a704e70…`, conexão ao Discord e 13 comandos.

Validação local deste marco: **6413 testes completos aprovados**, zero falhas/cancelados/ignorados/TODO; feedback rápido aprovado. O primeiro ensaio paralelo teve um processo de teste histórico encerrado sem erro de asserção; o teste isolado e a repetição completa serial passaram. Não foi removido nenhum teste nem reduzido o conjunto executado.

Os arquivos citados no prompt não estavam na branch nem no workspace recuperado após manutenção do ambiente. Esta implementação os reconstrói sobre o HEAD atual, sem reaplicar versões de 878/890 cartas.

## Fluxo executável

1. `node scripts/card-batch-worklist.cjs artifacts/worklist.json`: confronta as 1962 identidades com os certificados atuais. Separa erros de identidade/aliases, categorias e estruturas. Uma família estrutural é uma sugestão de revisão, nunca uma afirmação de equivalência entre textos.
2. `node scripts/card-batch-automation.cjs generate catalog/proposed/LOTE.json`: gera módulo TypeScript tipado, suíte executável, registro proposto e fingerprints. Não modifica registros ativos, certificados, lista de distribuição ou inventários.
3. `node scripts/card-batch-automation.cjs test catalog/proposed/LOTE.json`: copia fontes para um diretório temporário, remove credenciais Discord do subprocesso, usa banco isolado e uma admissão provisória exclusiva desse diretório. Compila, congela o catálogo de teste e executa a fachada pública do motor. Inclui regressões essenciais. O processo original continua com 903 cartas até uma promoção real.
4. `node scripts/card-batch-automation.cjs promote catalog/proposed/LOTE.json --release`: executa novamente a validação isolada. Exige revisão integral, identidade/impressão elegível, nove dimensões semânticas, cenários realmente executados, fingerprint e hash da suíte. Reutiliza `mass-certification21.cjs`. Só então acrescenta os registros, certificados e autorização explícita, compila, cria revisão do catálogo e verifica os hashes históricos e a distribuição. Sem `--release`, não autoriza distribuição. Nunca concede inventário.
5. Publicar o commit na branch/PR existentes; aguardar a CI estável completa. Não há merge automático.
6. `node scripts/card-batch-deploy.cjs plan SHA`: confirma no GitHub que o commit exato tem **Engine validation** e os dois jobs `test`/`extended-soak` aprovados. O workflow rápido sozinho não basta.
7. No host, após parada normal: `node scripts/card-batch-deploy.cjs stage SHA --offline`. Faz backup consistente do SQLite, código, configuração e compilado; verifica dados protegidos; instala somente se o lock de dependências mudou; compila e executa testes isolados e auditorias. Deixa recibo aguardando início/conexão do Discord. Em falha restaura código, nunca o banco.
8. Iniciar normalmente e executar `node scripts/card-batch-deploy.cjs probe`: verifica commit, catálogo, autorização, banco e criação/serialização/avanço de duelos 1v1/2v2, sem persistir jogadores fictícios. A conexão real ao Discord precisa ser observada no processo, além desse probe.

## Formato do lote e testes

O lote inclui `format`, `batchId`, `engineVersion`, `baseRevision`, `candidates` e `reviews`. Cada candidato contém `card`, `effect`, `monster` quando necessário, capacidades explícitas, texto integral ou paráfrase integral fiel com hash/fonte e `cases` com oráculos independentes. As revisões mantêm os campos do gate da M21: identidade, impressão oficial, condições, custos, alvos, escolhas, operações, duração, restrições, negação e efeitos secundários/exceções revisados.

`scenarioPlan` define os cenários obrigatórios. O gerador não inventa resultados esperados. Um cenário sem implementação falha; não vira TODO/skip nem recebe certificado. O executor aceita dados de estado, ações legais selecionadas sem ambiguidade, restauração JSON, tentativa inválida e expectativas de PV/zonas/UIDs. Cada cenário roda duas vezes com semente fixa e compara o resultado. Cenários negativos precisam realmente rejeitar uma ação sem mutação. JSON não executa JavaScript arbitrário.

`catalog/proposed/m30-generator-fixture.json` demonstra a infraestrutura usando uma carta **já certificada**. O teste isolado executou oito cenários reais e não propôs certificação nova. `fixtureOnly` impede promoção. Essa demonstração não conta como expansão de cartas.

Registros gerados preservam o código anterior por substituições delimitadas e verificadas por hash. `generated-batch-reviewed.cjs` reverte apenas esses registros nos testes de preservação; os resolvedores v1–v8 e seus hashes não são alterados. A revisão base e o conteúdo gerado são conferidos para evitar sobrescrever trabalho concorrente ou edits manuais.

## Dois níveis de validação

`node scripts/card-batch-fast.cjs` compila, testa gerador/lista/deploy/gate/regressões essenciais, executa o exemplo isolado real e verifica certificados, versões históricas e autorização. O workflow **Card batch fast feedback** é adicional. **Engine validation**, suas simulações, estresse, recuperação, benchmarks e soak completo permanecem obrigatórios e com os mesmos nomes de jobs.

Consulta das regras do GitHub: lista de rulesets retornou vazia; leitura de branch protection retornou 403 por limitação da integração. Não foi inferido que não existem checks obrigatórios, nem alteradas proteções/nome dos checks existentes.

## Integração com Bot-Hosting.net

A documentação oficial consultada em 29/10/2026 confirma REST API v1, autenticação Bearer e operações de shell, power e diagnose: https://bot-hosting.net/api . O painel atual não ofereceu ferramentas WebMCP. O cliente está implementado em `card-batch-deploy.cjs`, com teste das respostas e falhas; `deploy SHA` usa a variável `BOTHOSTING_API_KEY` e os escopos `deployments:read`, `deployments:power` e `deployments:shell`. Nenhuma chave foi criada, copiada para o repositório ou fornecida nesta sessão.

Sem essa chave, as mesmas etapas podem ser conduzidas pelo painel autenticado, com o script reduzindo a preparação a um comando e o probe a outro. O cliente não considera `ok: true` prova de bot online: exige estado running, log de conexão ao Discord e probe fresco do commit. Se a API encerrar uma preparação longa, o diário permite restaurar código com `rollback SHA`; dados do banco não são restaurados. A documentação informa limite de aproximadamente 90 segundos por shell via API, portanto lotes que excedam esse tempo precisam do painel ou da divisão de etapas, sem prometer execução em segundo plano que o host encerra.

## Estados e limites

Importada ≠ definida ≠ executada em isolamento ≠ certificada ≠ autorizada ≠ implantada. A autorização de todas as cartas testadas não entrega cartas a perfis existentes. Preservar arena, mão seis/descarte Final, Principal 20–30, Adicional cinco e duelos 1v1/2v2.

A infraestrutura é o primeiro marco. A meta seguinte continua ser utilizá-la em lotes novos e ultrapassar 1000 cartas; o exemplo com carta existente não reduz as 1059 pendentes.
