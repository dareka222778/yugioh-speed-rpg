# Continuidade de engenharia — missão 2

Base verificada: PR #12 em rascunho, branch `feat/rea-engine-recovery-20261026`, commit `7802a737212165c9a0100562e37cd8adc734b960`. Não havia alteração remota posterior ao relatório anterior. Os documentos e resultados da primeira sessão foram preservados; este documento descreve a evolução seguinte.

## L02 — versões executáveis preservadas

CONFIRMADO POR TESTES DO RPG: saves sem `resolverVersion` selecionam para sempre `engine-v1`. A nova criação seleciona explicitamente `engine-v2`. Ambas executam cópias locais independentes e verificáveis de suas dependências: 27 módulos na v1 e 31 na v2. Não se trata apenas de congelar parâmetros: algoritmos, regras, definições, RNG, estruturas e validadores usados na execução também pertencem ao arquivo da versão.

`duelEngine.ts` tornou-se a fachada de despacho. `duelEngineCurrent.ts` conserva a implementação de desenvolvimento incremental; alterações nela não entram silenciosamente em jogos v1/v2. `resolverArchive.ts` seleciona a execução e oferece pinagem legada explícita, sem modificar o objeto original ou permitir rebaixamento. Versões desconhecidas são recusadas.

Os manifests em `src/resolvers/v1/` e `v2/` têm origem e hashes SHA-256. A CI verifica conteúdo e fechamento das importações, impedindo dependências acidentais na implementação corrente. A v2 normaliza apenas as fronteiras de importação para um identificador local fixo; isso está registrado no manifest.

Os testes alteram a definição corrente em memória e demonstram que efeitos pendentes **v1 e v2** mantêm o resultado fixado, inclusive após JSON/replay. Saves antigos não são promovidos automaticamente. O histórico já gravado não é reexecutado para reconciliar publicação.

Próxima evolução semântica exige uma nova versão de resolvedor, novos fixtures de compatibilidade e despacho explícito. Não atualizar arquivos históricos e seus manifests para acomodar uma mudança de comportamento. Uma correção futura pode precisar de uma migração explícita, testada e documentada.

## P03 — Espera e decisões persistentes

CONFIRMADO POR TESTES DO RPG: `standbyFlow.ts` permite agendar trabalho futuro com escolha obrigatória ou opcional, opções e operações tipadas, custo de PV e alvo vinculado à encarnação. A compra do turno ocorre uma vez antes da escolha. A seleção paga o custo uma vez e abre uma raiz de resposta; o resolvedor retoma essa raiz após a corrente. A recusa opcional não paga. Uma opção obrigatória não oferece cancelamento voluntário.

Tarefas sem opções válidas ou sem PV para o custo recebem resultado de cancelamento. O encerramento do duelo cancela trabalho não processado. Continuação órfã, origem desconhecida, escolha reservada, duplicação de agendamento e ação fora da janela são recusadas. Os testes incluem processo SQLite novo, recibo repetido e rotação/decisor 2v2.

ADAPTAÇÃO PRÓPRIA: o agendador é uma capacidade confiável da engine, não uma ativação livre disponível ao jogador. Nenhuma das 130 cartas ganhou um efeito de Espera por essa mudança. A certificação de uma carta futura ainda precisa integrar a origem e suas condições específicas.

## T01 — entidades de ficha

O [manual oficial, p. 45](https://www.yugioh-card.com/eu/wp-content/uploads/2022/07/Rulebook_v9_en.pdf) fundamenta a distinção entre fichas e cartas físicas, sua permanência com a face para cima e a remoção ao sair do campo. A [página oficial de Scapegoat](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4818&request_locale=en) fundamenta os atributos da ficha de Ovelha e sua restrição de Tributo para Invocação. Essas fontes públicas não são resultados da engenharia reversa do Duel Links, nem uma importação de seu código ou dados.

CONFIRMADO POR TESTES DO RPG: `tokens.ts` gera UIDs próprios, registra criação/remoção em ordem causal e preserva política e dono. Há validação de grupo completo, posição, capacidade, ledger, identidade e limite de geração. Destruição, Tributo, banimento e devolução removem a entidade sem inserir uma carta em outra pilha. Equipamentos e alvos passam pela limpeza e validação existentes. Controle temporário conserva o dono; retorno sem espaço remove a ficha. Reentrada não reutiliza o UID removido.

A conservação distingue cartas físicas e fichas, incluindo 2v2 e reservas. Fichas não entram em Decks, certificados, coleção, disponibilidade econômica ou recompensas. Não são alvos de Livro da Lua. A permissão de Tributo é política explícita da origem, com restrição padrão da ficha de Ovelha. A apresentação reutiliza os mesmos renderizadores e o fallback local; não há imagem nova, alteração de verso ou requisição de arte para IDs sintéticos.

ADAPTAÇÃO PRÓPRIA: as zonas continuam sendo três por lado. **Scapegoat não foi habilitada**: seu grupo de quatro não cabe nesse formato. Não foi reduzido para três, nem ignorada sua restrição de outras Invocações. O suporte estrutural a fichas não certifica automaticamente uma carta geradora.

## I02, R03, D01 e consistência 2v2

- I02: foram acrescentados testes de custo já pago, saída/retorno por operações reais, restauração da raiz e ausência de entidade apesar de metadata em cache. Reservas 2v2 agora participam do rastreamento de zona. LIMITE TÉCNICO: não é possível reconstruir épocas e movimentos que um save legado nunca registrou. A v1 mantém sua interpretação histórica; a matriz conserva I02 com esse limite explícito em vez de fabricar uma migração autoritativa.
- R03: `snapshotInspection.ts` e `inspect-saved-duels.cjs` produzem uma inspeção somente de leitura, com motivo, revisão e hash. O relatório omite estados privados e recusa sobrescrever arquivos. Os testes verificam preservação dos registros e ausência de recibo/prêmio para saves incompatíveis. Não há reparo automático de banco.
- D01: `cardPresentation.ts` aplica o nome em português, o nome inglês ou um rótulo com ID. Lookup, busca, inspeção e referências de materiais usam o fallback sem mudar o fingerprint, a identidade ou a admissão. A descrição de ficha é separada da admissão de cartas.
- O journal transacional 2v2 registra eventos por revisão junto com estado e recibo, mantém movimentos intermediários e traduz destinatários privados para o membro correto. Uma falha de journal reverte a ação. O recibo repetido não duplica os eventos. Dados privados não são projetados para espectadores.

Inspeção offline, sempre com uma cópia autorizada do banco e um relatório novo:

```text
node scripts/inspect-saved-duels.cjs --db copy.sqlite --out NEW-report.json
```

## Certificação e lote histórico

As 130 cartas certificadas continuam habilitadas; nenhuma foi removida ou adicionada. A suíte, as famílias, os fingerprints e as simulações existentes permanecem obrigatórios. Não houve concessão de inventário ou autorização econômica.

`prepare-historical-batch.cjs` seleciona um primeiro lote de 20 candidatos normais entre 509 candidatos importados elegíveis, ainda não certificados, com primeira observação mundial até **30/09/2004**, passcode público único e estatísticas numéricas. O snapshot inclui a procedência por hash e está em `catalog/proposed/normal-before-2004-09-30.json`.

INFERIDO: esses candidatos compartilham a família estrutural de monstros normais. Isso não certifica cada carta. Normalização, fingerprint, regressões, certificado e política regional/de liberação são gates explícitos. Catálogo, executabilidade e distribuição permanecem separados. `npm run audit:historical-batch` verifica reprodução determinística do lote.

## Desempenho, verificações e limites

O benchmark `npm run benchmark:recovery` mede 60 partidas 1v1/2v2, cada transição repetida após serialização, latência de ações e memória com GC. A métrica de 1,5 segundo aplica-se ao trecho headless medido; não inclui rede, Discord ou renderização. O JSON é preservado como artefato da CI. Medições não devem ser apresentadas como aceitação humana no Discord.

Uma referência forte entre snapshots na trilha de execução foi substituída por `WeakRef` na v2, evitando reter a sequência inteira de estados. O benchmark cede ao event loop entre lotes para permitir coleta; uma medição síncrona sem essa fronteira manteria temporariamente alvos de WeakRef vivos pelo próprio modelo do JavaScript. O comportamento histórico da v1 não foi reescrito.

Reprodução: `npm run check`, `npm test`, `npm run audit:rea`, `node scripts/verify-resolver-archives.cjs`, `npm run benchmark:recovery`, `npm run audit:historical-batch` e as demais auditorias do workflow. `audit:rea:strict` continua indicando a limitação histórica de I02. Não há TODO desabilitado para produzir resultado verde: os três probes anteriores foram convertidos em asserções executáveis e ganharam suites específicas.

O ambiente local continua sem dependências npm completas por restrição de rede/cache. Testes puros e benchmark foram executados localmente em Node 24; SQLite, tipagem e renderização são validados na CI Node 22. Os resultados finais devem ser vinculados ao SHA exato do workflow, não herdados de uma etapa anterior.

Próximas prioridades: aprovar a política de expansão regional do lote, implementar adaptadores de cartas específicas sobre as capacidades novas e certificar suas interações; testar perfis históricos muito longos e obter métricas de ponta a ponta em um ambiente Discord de homologação. Nenhum merge, deploy ou acesso a dados de produção foi realizado.
