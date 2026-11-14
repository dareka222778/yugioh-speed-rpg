# Missão 3 — expansão certificada e candidata de engenharia

Ponto de partida confirmado: PR #12 em rascunho, branch `feat/rea-engine-recovery-20261026`, commit `d185c098ec90a69967b92527a1afe3a3c0e50d21`. Não havia alterações remotas posteriores à Missão 2. Base: 550 testes, 130 cartas certificadas, resolvedores v1/v2 e uma limitação histórica explícita I02. Nenhuma investigação REA foi reiniciada; os resultados V1–V11 orientam a arquitetura, sem incorporar código proprietário.

## Integridade e correções

CONFIRMADO POR HASH: os 58 módulos históricos continuam byte a byte idênticos. O manifesto `evidence/mission3-preserved-files.json` protege 78 arquivos, incluindo seus manifestos, renderizadores, verso, fontes, regras, perfis, esquema SQLite, starters, decks NPC, relatórios anteriores, matriz REA e proposta original. `node scripts/check-mission3-integrity.cjs` verifica esse contrato na CI. `verify-resolver-archives.cjs` verifica também a nova versão e o fechamento das dependências locais.

CONFIRMADO POR INSPEÇÃO E REGRESSÃO: desistência e expiração de partidas 2v2 não gravavam o resultado no diário transacional usado pelas ações normais. `tagStore.save` agora grava eventos da revisão dentro da mesma transação do estado e da liberação de assentos. Não há segunda inserção no caminho `actTag`. Cancelar convite não inventa resultado de duelo. Os testes `tagTerminalRecovery` injetam falha SQL no diário, comprovam rollback de estado/assentos/eventos, repetição sem duplicata, publicação pendente até confirmação da revisão correta e ausência de recompensas/alteração de inventário.

O primeiro CI da expansão encontrou uma expectativa de crosswalk ainda fixada em 130; foi atualizada para 150, sem remover os contratos históricos de 130. Outro CI expôs uma suposição intermitente em `tagJournal`: Pote da Ganância pode aguardar respostas rápidas da mão sorteada. O teste agora preserva a verificação de emissão, repete o recibo e passa pelas respostas legais antes de exigir os eventos privados da compra. Não foi alterada a engine para satisfazer uma expectativa incorreta de resolução imediata.

## Expansão individual: 130 → 150

As 20 cartas são Monstros Normais e usam o adaptador existente. Não foram criados efeitos fictícios. Há certificado mecânico explícito por passcode, metadados em `historicalNormalBatch.ts` e duas regressões individualizadas por carta em `historicalNormalCertification.test.cjs`: invocação/baixar/estatísticas/destruição/restauração/conservação e controle temporário/retorno/Tributo ao Cemitério do dono. Há ainda regressões do lote em 2v2 e de compatibilidade histórica. Novos certificados só foram mantidos após esses testes passarem.

| Passcode | Carta | Nível | Atributo / Tipo | ATK / DEF | TCG até o corte segundo a importação |
|---|---|---:|---|---|---|
| 46718686 | Hitodenchak | 2 | WATER / Aqua | 600 / 700 | Não recuperado |
| 46457856 | Tomozaurus | 2 | EARTH / Dinosaur | 500 / 400 | Não; observada em 2013 |
| 15507080 | Sectarian of Secrets | 2 | DARK / Spellcaster | 700 / 500 | Não; observada em 2006 |
| 64511793 | Eyearmor | 2 | EARTH / Warrior | 600 / 500 | Não recuperado |
| 84285623 | Haniwa | 2 | EARTH / Rock | 500 / 500 | Não; observada em 2005 |
| 38142739 | Petit Angel | 3 | LIGHT / Fairy | 600 / 900 | Sim; 2002 |
| 53581214 | Fire Reaper | 2 | DARK / Zombie | 700 / 500 | Não; observada em 2019 |
| 90963488 | Nemuriko | 3 | DARK / Spellcaster | 800 / 700 | Sim; 2002 |
| 08783685 | Hourglass of Life | 2 | LIGHT / Fairy | 700 / 600 | Não; observada em 2022 |
| 22026707 | Curtain of the Dark Ones | 2 | DARK / Spellcaster | 600 / 500 | Não; observada em 2013 |
| 53832650 | Meotoko | 2 | EARTH / Beast | 700 / 600 | Não; observada em 2013 |
| 09159938 | Dark Gray | 3 | EARTH / Beast | 800 / 900 | Sim; 2002 |
| 18710707 | The Furious Sea King | 3 | WATER / Aqua | 800 / 700 | Sim; 2002 |
| 47695416 | Candle of Fate | 2 | DARK / Fiend | 600 / 600 | Não recuperado |
| 75889523 | Archfiend Marmot of Nefariousness | 2 | EARTH / Beast | 400 / 600 | Não; observada em 2005 |
| 09430387 | LaLa Li-oon | 2 | WIND / Thunder | 600 / 600 | Não recuperado |
| 52800428 | Fiend's Hand | 2 | DARK / Zombie | 600 / 600 | Não recuperado |
| 39175982 | Winged Cleaver | 2 | EARTH / Insect | 700 / 700 | Não; observada em 2019 |
| 15150371 | Archfiend Mirror | 2 | DARK / Fiend | 700 / 600 | Não recuperado |
| 15510988 | Thunder Kid | 2 | WIND / Thunder | 700 / 600 | Não; observada em 2006 |

CONFIRMADO NA FONTE PRIMÁRIA: as páginas japonesas oficiais da Konami, individualizadas por CID em `evidence/mission3-card-review.json`, mostram categoria Normal, nível, atributo, tipo, ATK/DEF e lançamento OCG em **04/02/1999** para todas. Por exemplo, [Hitodenchak, CID 4233](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4233&request_locale=ja). Identidades numéricas e passcodes foram cruzados com a importação pública anterior e referências secundárias individualizadas. O HTML oficial consultado não exibe passcodes; esse campo é corroborado, não apresentado como extraído daquele HTML. Nenhum texto de efeito de videogame foi usado como regra do TCG/OCG. Nenhuma descrição proprietária foi copiada.

INFERIDO COM LIMITE EXPLÍCITO: a primeira observação mundial do lote coincide com o registro OCG de 1999. As datas TCG importadas são observações, sem afirmar que sejam o menor dia em todos os territórios. Algumas páginas regionais divergem por dias; isso não muda o corte das quatro cartas TCG de 2002. Valor nulo não prova inexistência universal de edição TCG. A seleção segue a proposta mundial/OCG da Missão 2; não equivale a um catálogo TCG de 2004. Nomes ingleses servem como fallback; não se alega tradução oficial portuguesa para o lote.

CONFIRMADO POR POLÍTICA E TESTES: o catálogo atual passa a 150 cartas, com 91 Normais. A distribuição das novas 20 permanece **bloqueada** em `cardReleasePolicy.ts`, tanto no parser de pacotes quanto na concessão de eventos, inclusive linhas pré-existentes adulteradas em fixture. Não há alterações de loja, starters, inventários reais, recompensas ou decks NPC. Disponibilidade técnica para fixtures/engine não concede posse ao jogador.

A proposta original permanece intacta e reprodutível sobre o catálogo v2 de 130. `buildBatch(true)` produz `catalog/proposed/normal-next-mission3.json`: mais 20 candidatos dentre 489 Normais elegíveis ainda não certificados. São apenas candidatos importados; não foram certificados nem distribuídos. As informações individuais desse próximo lote ainda precisam de revisão primária.

## Compatibilidade e recuperação

Novas partidas usam `engine-v3`, uma cópia executável fechada de 32 módulos com SHA-256 por arquivo. A normalização documentada fixa a identidade v3, remove despacho histórico de dentro da própria cópia e acrescenta os metadados/certificados do lote ao comportamento da Missão 2. Os módulos v1/v2 não foram editados. Save sem versão continua v1; save v2 continua v2. A facade, o validador e o diário selecionam a versão correta, inclusive quando a trilha em memória se perdeu após serialização.

`resolverV3Compatibility` restaura uma corrente v2 com custo de descarte já pago, compara com o executável original e impede reaplicar pagamento; altera temporariamente metadados de desenvolvimento e demonstra que v3 não muda retroativamente. Compara ainda 12 duelos completos com decks clássicos existentes e as mesmas sementes nas versões v2/v3: estados e ações devem coincidir, exceto pelo identificador do resolvedor. Não houve migração destrutiva nem substituição silenciosa de regras.

As suítes existentes continuam exercitando invocações especiais/fusões, Magias, Armadilhas, FLIP/ignição, destruição, banimento, retorno, prioridades/correntes, escolhas e fichas. As novas 20 não incluem geradores de fichas ou efeitos de corrente; não se declara suporte a novas famílias apenas por ampliar Normais. Scapegoat continua sem certificação: seu grupo de quatro fichas não cabe nas três zonas aprovadas.

## Jogabilidade, desempenho e Discord

CONFIRMADO LOCALMENTE: 42 regressões do lote, 3 regressões de compatibilidade v3 e testes puros de Espera/fichas/histórico passaram em Node 24 com o carregador de TypeScript local. O ambiente local não tem as dependências npm completas, por restrição de rede/cache; ele não substitui o build, SQLite e renderização do workflow Node 22.

O novo benchmark `node --expose-gc scripts/benchmark-concurrent-engine.cjs` intercala 32 partidas, 16 1v1 e 16 2v2, com decks Yugi/Kaiba/Joey existentes, replay após cada ação e restaurações periódicas. Na execução local: 32 concluídas, 1.113 ações e 173 restaurações; p95 de step aproximadamente 2,09 ms e máximo 5,15 ms. Heap após GC caiu em relação à medição inicial, mas RSS permaneceu alto após a carga: aproximadamente 231 MB. Isso é uma amostra, não demonstra ausência universal de vazamento nem capacidade garantida de hospedagem.

O benchmark anterior também passou localmente: 60 partidas, 1.218 ações com replay interrompido, p95 aproximadamente 1,45 ms e máximo 5,61 ms; heap retido cresceu aproximadamente 1,53 MB. São medições locais de Node 24, não valores do runner Node 22 nem latência do Discord. Os JSON de cada execução distinguem escopo, versão, memória, percentis e limite de 1,5 segundo. O benchmark intercalado não equivale a vários processos concorrendo pela escrita no banco; os testes SQLite entre processos existentes permanecem obrigatórios.

`discordHomologation` usa handlers reais, SQLite descartável e PNG real com arte offline, preservando o layout. Exercita menus, privacidade, acknowledgement, commit único sob entrega duplicada concorrente, restauração e falha de publicação. É homologação de contratos em transporte simulado, **não aceite de um servidor Discord**. O [roteiro e bloqueios](DISCORD-HOMOLOGATION-MISSION-3.md) detalham os comandos, usuários, imagens e métricas que ainda exigem ambiente autorizado.

## REA e reprodução

A matriz de 23 cenários foi preservada. Os contratos continuam obrigatórios; I02 conserva a limitação legítima de épocas/movimentos nunca gravados em saves antigos. Não foram fabricadas informações históricas. O teste estrito que exige cobertura integral não deve ser confundido com a suíte de regressão padrão: a limitação continua documentada.

Executar `npm ci`, `node scripts/verify-resolver-archives.cjs`, `node scripts/check-mission3-integrity.cjs`, `npm run check`, `npm test`, `npm run audit:rea`, `npm run benchmark:recovery`, `node --expose-gc scripts/benchmark-concurrent-engine.cjs` e as demais auditorias de cartas/histórico/1v1/2v2/treino do workflow. `npm test` não ignora testes para obter resultado verde.

O workflow preserva `rea-acceptance-results`, com relatórios REA, benchmarks e homologação offline, e `speed-rpg-visual-previews`. A contagem final da suíte, os resultados completos de simulação e a aceitação técnica devem ser consultados no **CI do SHA final**, ligado ao [PR #12](https://github.com/dareka222778/yugioh-speed-rpg/pull/12); resultados intermediários não substituem esse gate. Os checkpoints locais registram commits e resultados observados para retomada.

## Pendências da candidata

1. Autorizar e executar homologação Discord isolada, incluindo latência real, rate limits, reconexão e aceite visual humano. Não usar produção como ambiente de testes.
2. Definir política regional e autorizar separadamente distribuição/loja/eventos. As 20 cartas permanecem bloqueadas para distribuição.
3. Rever os próximos 20 candidatos individualmente; ampliar famílias de efeitos só com adaptador específico e regressões. Não reduzir efeitos oficiais para caber no formato sem decisão explícita.
4. Medir processos/hosts e históricos prolongados em condições representativas. Os benchmarks atuais validam os trechos descritos, não um SLO fim a fim.
5. Preservar o limite I02 nos saves que nunca registraram as épocas necessárias. Não prometer recuperação desses dados.

Nenhum merge, deploy, alteração de produção, concessão de recompensas ou mudança de identidade visual foi realizado. A candidata é de engenharia; sua promoção exige os gates acima.
