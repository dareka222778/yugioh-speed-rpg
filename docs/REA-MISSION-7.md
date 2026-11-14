# Missão 7 — expansão mecânica e continuidade do beta

Base confirmada: checkpoint `02405e4570d180a3aec002a1a4fcc672c69c39cd`, PR #12 em rascunho, sem alterações posteriores na retomada. CI 40580273860 aprovado. Os três documentos de continuidade foram lidos integralmente. Esta missão não altera produção, layout, economia, distribuição, regras ou arquivos das engines v1–v5.

## Primeiro lote individual

| Passcode | Carta | Operação |
|---|---|---|
| 43716289 | Poison Mummy | FLIP: dano de 500 |
| 45141844 | Old Vindictive Magician | FLIP: destruição de um monstro adversário, inclusive baixado |
| 77491079 | Gale Lizard | FLIP: devolução ao dono de um monstro adversário |
| 91869203 | Amazoness Archer | Ativação: tributar dois monstros e causar 1.200, sem restrição artificial de uma vez por turno |
| 69579761 | Des Koala | FLIP: dano de 400 por carta na mão adversária na resolução |
| 83994646 | 4-Starred Ladybug of Doom | FLIP: destruir monstros adversários de nível quatro revelados na resolução, sem selecionar alvo |

Metadados, identidade canônica, passcodes públicos, regras e impressões OCG verificadas antes de 30/09/2004 são registrados individualmente em `evidence/mission7-individual-reviews.json`. As fontes primárias são os links oficiais por CID ali indicados. Não foram copiadas descrições proprietárias; o texto operacional em português é gerado das operações. Passcodes são concordância do snapshot público por CID, não extração do HTML oficial. Datas verificadas provam uma impressão OCG anterior ao corte, não primeira data universal nem disponibilidade TCG inferida. O nome atual Amazoness Archer tem atualização oficial do nome antigo Amazon Archer em 2010; não é apresentada como uma carta nova de 2010.

A consulta japonesa de Poison Mummy documenta impressão em 21/03/2002, divergente da primeira observação OCG incompleta do snapshot. A evidência adicional é guardada sem reescrever o snapshot. A página inglesa da Ladybug falhou em duas tentativas; a fonte japonesa confirma explicitamente a exigência de face para cima. Não tratar níveis ocultos como públicos para esse efeito.

## Execução e versionamento

Quatro definições reutilizam operações existentes com políticas específicas. Duas operações novas calculam contagem da mão e seleção em grupo por nível na resolução; a segunda captura UIDs elegíveis antes de chamar a saída compartilhada, preservando movimentos/dono/gatilhos. Não transformam destruição em negação nem mudam a seleção de alvos já vinculados.

Engine-v6 explícita e fechamento independente de 35 módulos. V1–v5 permanecem imutáveis; saves sem versão continuam v1. A v5 mantém 197 definições e não admite as seis novas. A compilação de desenvolvimento corrente não substitui silenciosamente um save antigo. Snapshot/backup e testes de carga passam a reconhecer os seis manifestos; 2v2 novo usa v6, enquanto saves legados seguem sua implementação.

O código contém certificados individuais vinculados ao fingerprint e à suite, mas a conclusão de certificação deste lote exige regressões individuais, pipeline e **CI completo verde no SHA correspondente**. Antes desse gate, a entrega é candidata. A política separada bloqueia as seis novas cartas, mantendo as 67 anteriores bloqueadas e a política original dos 130.

## Evidência reproduzível e progresso

`tests/mechanicalBatch7.test.cjs`: identidade/metadata/fingerprint, efeito positivo, caso negativo, replay/conservação e FLIP após destruição por batalha ou pagamento de dois Tributos para cada carta. Casos adicionais verificam contagem após compra em elo superior e replay completo fixado em v5. O manifesto de execução é `artifacts/certification-executions-mission7.json`; o pipeline existente valida as revisões e cenários individualmente.

Na primeira execução local, dois testes esperavam a continuação antiga monsterTarget, mas o construtor atual de gatilhos corretamente usa triggerTarget. A expectativa foi corrigida preservando a seleção exclusiva do alvo adversário; nenhuma regra foi alterada para atender ao teste. Após correção, 156 regressões puras selecionadas passaram, incluindo o lote v5, interações, arquivos históricos e os 32 testes novos. Tipagem, dependências nativas e suíte completa pertencem ao CI Node 22; Node 24 local com stripping não prova compilação TypeScript.

`scripts/verify-resolver-archives.cjs` verifica v1–v6, e a preservação das missões anteriores continua obrigatória. A contagem candidata é 197 → 203 certificados internos, sem novas autorizações de distribuição. Normalização e os 11 bloqueios factuais não foram alterados.

## Próximas unidades e limites

O primeiro CI executou 993 testes: 972 passaram e 21 falharam. A tipagem passou, mas as listas de versões aceitas em fichas e Espera não incluíam v6. A correção foi feita somente nos helpers correntes e na candidata v6 ainda não homologada, com hashes atualizados; v1–v5 não foram editadas. Três expectativas de contagem e uma expectativa de versão corrente também estavam desatualizadas. A seleção local posterior de 105 testes afetados passou; a suite tagClassic completa depende de Sharp indisponível localmente e deve passar no CI, sem desabilitá-la.

Foram adicionadas sete regressões cruzadas, três de decisão NPC e testes SQLite de rollback/recibo/retomada do efeito com dois Tributos. O NPC considera dano FLIP e vítimas reveladas por nível sem consultar identidades ocultas. Uma fixture 2v2 construída pelo construtor arquivado v5, sem rebatizar v6, verifica replay completo e convivência SQLite com uma partida v6.

As cargas adicionais de oito e 16 sessões correspondem a **24 e 48 participantes simulados**, respectivamente. Os relatórios incluem a contagem de pessoas distintas; isso não é login de pessoas reais nem prova de capacidade do host. O cenário menor exercita cinco versões e o maior seis. Os JSON são consolidados por `audit-mission7-beta.cjs`, sem autorização automática de disponibilidade ou lançamento.

Avançar com regressões cruzadas de alvos, dono/controlador, escolhas/restauração, 2v2 e falhas transacionais do lote; depois avaliar outra família integralmente suportável. Dark Mimic LV1 permanece bloqueada: seu efeito adicional de evolução na Espera exige integração completa antes da certificação; não implementar apenas a compra FLIP.

O beta pretendido é de 20–50 jogadores, não 20–50 duelos nem uma capacidade já homologada. A homologação real exige o ambiente e autorizações do roteiro da Missão 6. Amostras headless/SQLite não comprovam Gateway, rate limits, publicação ou RAM conjunta do host. Não fazer login, distribuição, merge ou deploy automaticamente.

O manifesto `evidence/mission7-preserved.json` fixa os 162 arquivos históricos v1–v5 (157 módulos e cinco manifestos) ao Git blob do checkpoint remoto e os 197 certificados anteriores a hashes SHA-256. `check-mission7-integrity.cjs` é gate do CI, junto com os verificadores anteriores. A ampliação do catálogo não pode modificar silenciosamente um certificado antigo.

Próxima prioridade mecânica: efeitos contínuos com presença da fonte, múltiplas fontes e limpeza/negação; avaliar um novo lote somente após fontes e testes individuais, sem supor que a v6 contenha essa implementação. Continuar a expansão histórica por famílias, mantendo todas as cartas fora da disponibilidade até autorização específica. Nenhum resultado de 24/48 participantes simulados substitui o aceite do beta real.

Permanecem fora da cobertura completa: catálogo histórico inteiro, mecânicas ainda não implementadas, fatos ausentes, épocas históricas I02, homologação humana/Discord, host com recursos medidos, soak de horas/dias e restauração operacional. Consultar o CI e o PR atuais para resultados do SHA final; não herdar contagens de um candidato intermediário.
