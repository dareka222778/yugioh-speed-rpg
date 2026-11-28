# REA — Missão 16

**Bloco consolidado: engine-v8, 749 → 762 certificados (+13), 130 distribuíveis.** Não houve merge, deploy, distribuição, acesso ao Discord real ou alteração de produção.

Código validado: `4f9f0edfcabb77292b26eca821b74432c0bf7ee4`. [CI 40711583392](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40711583392): **ambos os jobs aprovados**, Node 22, **5.410 testes, zero falhas/TODO**, tipagem, compilação, auditorias, SQLite e soak de 600 segundos. São 120 testes novos desde a base de 5.290.

## Admissões individuais

| Carta | Passcode | Família |
|---|---|---|
| Chaos Necromancer | 01434352 | Contagem de monstros no próprio Cemitério |
| Yellow Luster Shield | 04542651 | DEF contínua para o próprio campo |
| Buster Blader | 78193831 | Contagens de Dragões no campo/Cemitério adversários |
| Mystical Shine Ball | 39552864 | Normal |
| Mikazukinoyaiba | 38277918 | Normal |
| Dancing Elf | 59983499 | Normal |
| Sealmaster Meisei | 02468169 | Normal |
| Gogiga Gagagigo | 39674352 | Normal |
| Metal Armored Bug | 65957473 | Normal |
| Cosmo Queen | 38999506 | Normal |
| Turu-Purun | 59053232 | Normal |
| Warrior of Zera | 66073051 | Normal |
| Dharma Cannon | 96967123 | Normal |

As três cartas contínuas passaram sete cenários individuais cada: identidade, efeito, rejeição, replay, negação, perda de fonte e recálculo. Regressões cruzadas abrangem Equipamento, imunidade, controle diferente do dono, múltiplas cópias e informação oculta. Os dez Normais passaram sete cenários por carta: identidade, invocação/Tributos, rejeição, combate, movimento, replay e IA, mais recuperação 2v2.

[Revisões dos contínuos](evidence/mission16-individual-reviews.json) e [revisões dos Normais](evidence/mission16-world-normal-reviews.json) vinculam cada identidade/estatística/definição a fonte oficial completa e impressão anterior ao corte. Os Normais foram admitidos pela **união mundial via TCG**, sem inventar primeiras datas OCG. As impressões oficiais AST são de 01/06/2004, divergindo do 01/05 importado; Buster Blader também tem divergência documentada. O histórico importado foi preservado. Dancing Elf foi conferida na página oficial italiana após timeout em inglês; a página portuguesa não apresenta o card. Seu nome inglês foi mantido.

Cannon Soldier, Amazoness Archer, Shadow Ghoul e os cinco atacantes diretos triados já estavam certificados e não foram recontados. Rituais, protótipos sem passcode, Vorse Raider com passcodes conflitantes e a ressalva de identidade/nome de Slime Toad não entraram neste lote.

**Nenhuma operação de execução nova:** reutilizados `normal`, `modifier` e `CountFormula`. Não foi criada engine-v9. A expansão não fecha todas as famílias contínuas, de duração, busca ou invocação.

## Compatibilidade e correções

- **CONFIRMADO:** 316 arquivos protegidos, incluindo 277 módulos e oito manifestos v1–v8, preservados por hashes. As 749 definições/certificados anteriores e a revisão intermediária de 752 foram comparados integralmente, sem alteração.
- Revisão intermediária v8: `b84222a8334764cb6bc6f6f69c99eb7a4b3925b5dda2c754df8fd92a843e4c95`.
- Revisão corrente: `f580081f728973259ab608d9ccfeca9938278a39708e9f0897e2c4da0946614c`. As revisões anteriores continuam imutáveis; novos IDs são rejeitados nos catálogos antigos.
- A IA agora avalia uma invocação com o monstro prospectivo no campo, retirado da mão, e Tributos no Cemitério do dono. Também recalcula ameaças públicas adversárias afetadas pela mesma aura. Não muda o estado real nem lê identidades ocultas. Regressões reproduziram decisões prejudiciais antes das correções.
- O validador corrente de admissão rejeita custos/limites ignoráveis em contínuos, operações passivas como ignição e política manual em gatilho automático. Todos os monstros já certificados continuam válidos. Validadores/executáveis históricos não foram editados.
- O novo simulador inicialmente comparava `battleFlip: undefined` com a ausência dessa propriedade após JSON. A CI 40705330464 reprovou esse comparador, embora seus 5.328 testes passassem. A correção compara todos os campos persistidos; não altera a engine nem ignora diferenças reais.

## SQLite, backup e retenção

**CONFIRMADO nesta reprodução:** o soak final concluiu 8.577 duelos e 509.676 commits. O arquivo principal chegou a **309,05 MiB**, WAL a **4,01 MiB**, com checkpoint PASSIVE completo. Havia 436.076 recibos/eventos 1v1 e 73.600 recibos/eventos 2v2: um registro de cada categoria por commit, sem incremento por entregas duplicadas nesta amostra. A integridade, chaves estrangeiras, conservação e economia permaneceram aprovadas.

A decomposição física mostra eventos, estados, recibos e índices como principais consumidores; apenas uma página estava na freelist. A amostra anterior de 5.211 duelos também apresentou WAL limitado e checkpoint completo. **INFERIDO:** o crescimento reproduzido acompanha a retenção de commits (~636 bytes de arquivo principal por commit nessas duas amostras), não um backlog crescente de WAL. Isso não prova retroativamente o conteúdo do banco temporário já descartado da Missão 15 nem define capacidade de hospedagem.

`scripts/sqlite-health.cjs` oferece leitura consistente de contagens/payload, páginas livres e uso físico por tabela/índice via dbstat quando disponível. Orçamento e limiar são configuráveis; o padrão é somente leitura. A varredura pode ser cara: executar sob demanda, fora da rota de interação. O orçamento não inclui backups, assets ou o espaço livre real do provedor. Checkpoint exige flag explícita; leitores podem impedir conclusão.

O SHA-256 de snapshots passou de alocação integral para leitura em blocos de **64 KiB**, conservando hashes e manifestos. Em quatro subprocessos locais com arquivo sintético de 64 MiB, o buffer adicional caiu de ~64 MiB para 64 KiB; o tempo permaneceu semelhante (~223–227 ms). Isso mede o hash, não todo o processo de backup.

Não houve purga, VACUUM, TRUNCATE ou alteração de schema. **PENDENTE:** política de arquivamento/leitura de eventos antigos e retenção dos recibos, preservando publicação, auditoria, replay e idempotência. Um TTL indiscriminado não é seguro.

```text
node scripts/sqlite-health.cjs <banco-existente> --budget-bytes 8589934592 --warning-ratio 0.8
node scripts/sqlite-health.cjs <banco-existente> --checkpoint-passive
node scripts/sqlite-snapshot.cjs snapshot <origem> <diretorio-pai-existente>
node scripts/sqlite-snapshot.cjs verify <pasta-do-snapshot>
node scripts/sqlite-snapshot.cjs restore <pasta-do-snapshot> <destino-novo>
node scripts/benchmark-snapshot-hash16.cjs
```

O backup usa a API SQLite e inclui dados confirmados do WAL. Restauração rejeita destino ou sidecars existentes. Não substituir esse procedimento por cópia isolada do arquivo principal ativo.

## Testes, IA e desempenho

| Amostra final | Resultado | p95 | Máxima | RSS |
|---|---|---:|---:|---:|
| IA: 50 sessões intercaladas | 50 duelos; 1.979 ações; 283 restaurações | 0,96 ms | 5,79 ms | 169,0 MiB |
| IA: 100 sessões intercaladas | 100 duelos; 4.103 ações; 587 restaurações | 0,81 ms | 7,85 ms | 217,4 MiB |
| SQLite: 50 sessões, dois writers | 50 concluídas; 195 duplicatas | 162,47 ms | 345,92 ms | 522,3 MiB agregado amostrado |
| SQLite: 100 sessões, dois writers | 100 concluídas; 412 duplicatas | 213,86 ms | 550,55 ms | 523,6 MiB agregado amostrado |

As simulações completas exercitaram as três novas cartas contínuas, com conservação e recuperação determinística. Os Normais tiveram decisões e ações individuais/2v2 verificadas. As cargas persistentes também reexercitaram as oito Magias da Missão 15, versões antigas, reinício de writer e entregas duplicadas. Houve 3/7 ocorrências de busy nas cargas de 50/100, tratadas sem perda de integridade.

Soak: 601,29 s; RSS observado máximo de 223,36 MiB; p95 interno de 1,68 ms e máximo de 180,84 ms. CPU acumulada de ~1.066,84 s, incluindo atividade do processo/threads. O runner não reproduz uma quota Starter+ de 100% CPU.

Os tempos de IA incluem decisão, execução, conservação e restaurações periódicas; os de persistência incluem IPC/fila/transação. **Não incluem Discord/renderização e não homologam 20–50 usuários nem a meta externa de 1,5 segundo.** Memória agregada foi amostrada, podendo perder picos curtos.

Na CI final: **5.410 aprovados, zero falhas/TODO**, REA **23/23**, uma cobertura parcial histórica legítima I02. Cinco repetições das 17 suítes críticas passaram **179 testes cada**; são execuções repetidas, não novos testes únicos. A falha intermitente antiga **não foi reproduzida e sua causa permanece NÃO RECUPERADA**. TAP/stderr integrais são preservados por tentativa.

Localmente: 120 testes novos aprovados em Node 24. As dependências npm/nativas não estão instaladas aqui; a suíte completa, tipagem e SQLite do projeto foram verificados na CI Node 22. Não atribuímos sucesso às tentativas locais de suítes bloqueadas por better-sqlite3 ausente.

## Artefatos e continuidade

- [Validação estruturada e proveniência](evidence/mission16-validation.json).
- [Diagnóstico SQLite](evidence/mission16-sqlite-diagnostic.json), [benchmark do hash](evidence/mission16-hash-benchmark.json), [TAP local](evidence/mission16-local-tests.tap).
- [Baseline protegido](evidence/mission16-preserved-baseline.json), [regressão anterior da IA](evidence/mission16-ai-before-fix.json).
- [Matriz reproduzível](evidence/mission16-priority-matrix.json): 1.200 registros restantes. Pistas da Missão 13 não foram tratadas como equivalência de efeitos; dependências não revisadas permanecem desconhecidas.
- Artefatos da CI incluem execuções individuais, auditorias dos dois lotes, simulações, métricas persistentes, soak, diagnóstico físico e TAPs repetidos.

Commits: `496fdc84` (diagnóstico), `ec8d92c9` (contínuos/IA), `f7a8d591` (guardas/replay), `54c2b6fb` (hash limitado), `723aa111` (aura adversária) e `4f9f0edf` (dez Normais mundiais). A consolidação documental posterior não muda a engine. [PR #12](https://github.com/dareka222778/yugioh-speed-rpg/pull/12) permanece em rascunho.

A meta de 20–50 novas cartas não foi atingida: **o ganho certificado real é 13**. Próximas prioridades: operações simultâneas de LP, custos de gatilhos, seleção de jogador e filtros por identidade para busca/recrutamento, com resolver isolado quando mudarem semânticas; depois fases/durações e arquivamento seguro.

O beta real continua pendente. A primeira etapa deve permitir proprietário sozinho contra IA; depois convidados e 20–50 participantes. Faltam configuração isolada validada, aplicação/guild/canal de testes, IDs autorizados, credencial por mecanismo seguro, SHA aprovado e autorização específica para acesso. Não solicitar credenciais em texto público. Catálogo completo, localização integral e medições reais de Discord também permanecem pendentes.
