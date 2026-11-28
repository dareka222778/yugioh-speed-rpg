# Missão 7 — plano de continuidade até o beta

Estado: **planejado, não implementado**. Base técnica e restrições: `CHECKPOINT-MISSIONS-1-6.md`. Não há meta artificial de quantidade de certificados, porcentagem de prontidão ou prazo linear para o catálogo. Engine-v6 é uma possibilidade condicionada a nova semântica, não uma entrega já existente.

## Ordem de trabalho

P0: conferir branch/CI/checkpoint e manter todas as regressões. A homologação operacional segue em paralelo **somente se houver ambiente e autorização**; sem isso, avançar na expansão mecânica offline. Não substituir o desenvolvimento integral por documentação, nem iniciar trabalhos extensos nesta sessão de consolidação.

Primeira unidade recomendada na próxima sessão: inventariar candidatos ainda não certificados por identidade canônica, selecionar um lote pequeno de **efeitos de monstro/FLIP já expressáveis integralmente** e produzir uma ficha de lacunas por carta. Se não existir equivalência completa, desenvolver uma operação reutilizável com testes antes de qualquer admissão. Monstros Normais podem formar lote independente, mas não devem absorver toda a sessão e postergar indefinidamente a expansão mecânica.

## Lotes priorizados e dependências

As faixas abaixo cobrem o backlog restante por tipo e dependência. São filas de triagem, não declaração de suporte ou lista de cartas aprovadas. Atribuição final exige revisão individual; uma carta pode depender de mais de uma fila. O snapshot já contém os registros: não duplicar grandes dumps nem tratar simples diferença 1.962−197 como denominador canônico sem resolver aliases/CIDs.

| Fila / prioridade | Família | Dependências e critérios de entrada | Evidência exigida para saída |
|---|---|---|---|
| Q0 / transversal | Identidade, aliases, região, datas, estatísticas | Separar os 11 bloqueios, fatos simbólicos e divergências; passcode não é ordinal nem ID de arte; OCG/TCG/mundial são distintos | Fonte confiável, ficha de revisão, fingerprint; caso inconclusivo continua bloqueado |
| Q1 / alta | Monstros ativados e FLIP de operações já suportadas | Custos, alvos, janela, obrigatoriedade, gatilho e resolução devem coincidir integralmente; não inferir equivalência pelo texto ou nome | Teste individual positivo/negativo, resposta/negação, alvo que sai/retorna, custo único, save/replay e 2v2 quando aplicável |
| Q2 / alta | Magias normais/rápidas e Armadilhas normais/de resposta | Reutilizar operações econômicas/destruição/retorno e modelos de ativação; speed/damage window e condições específicos | Ativação legal/ilegal, corrente LIFO, custo, alvo invalidado, não execução duplicada e conservação |
| Q3 / alta | Equipamento e Campo com modificadores suportados | Restrições por atributo/tipo, dependência da fonte, recomputação, troca de controle, substituição de Campo e saída de zona | Interações com destruição/retorno/controle, limites de zonas e restauração; nenhuma alteração visual |
| Q4 / média-alta | Contínuos de monstro, Magia e Armadilha; triggers condicionais | Duração, presença da fonte, estado face-up, múltiplas fontes, negação, ordem determinística e limpeza; infraestrutura existente é parcial, não um programa genérico completo | Regressões de entrada/saída/negação/controle, fontes simultâneas, gatilhos e persistência; nova versão se mudar semântica |
| Q5 / média-alta | Invocações especiais e Fusões adicionais | Receita exata, restrições, materiais, origem/destino, dono/controlador, zonas, histórico de invocação e revival; identidades de arquétipo podem bloquear | Conservação de materiais, resposta à invocação, revive permitido/proibido, ausência de espaço, restauração e certificado por carta |
| Q6 / média | Rituais e seleção múltipla de materiais | Ainda não presumir suporte: seleção/custo multinível, condições do Ritual, reserva/validação de materiais e retomada após interrupção | Adaptador independente e testes de escolhas/custos/cancelamento/limiares/resposta antes de certificar |
| Q7 / média | Estatísticas dinâmicas, cópia e entidades vinculadas | Dependências explícitas: fórmula viva versus valor capturado, ATK original/atual, origem, zonas, duração, identidade e desligamento | Operações tipadas, persistência determinística, múltiplas fontes, ausência da origem, valores limite e mudança de zona |
| Q8 / condicionada | Fichas e efeitos com múltiplas entidades | Ledger já existe; cada gerador exige quantidade, capacidade, restrição de tributo/invocações e duração exatas | Grupo completo ou rejeição conforme regra; saída sem carta física, controle e reentrada; Scapegoat permanece bloqueada, não reduzir quatro fichas para três |
| Q9 / posterior | Janelas/negações/substituições/identidades complexas e demais efeitos não classificados | Recuperar requisitos específicos com fontes; classificar dependências ausentes em vez de gerar adaptador por semelhança | Nova operação/versão quando necessária, regressões cruzadas e revisão independente de cada carta |
| QN / paralela | Normais numéricos ainda não certificados | Identidade e categoria inequívocas, estatísticas, datas verificadas, nenhuma mecânica oculta | Reutilizar geração de cenários, revisão e certificado individual; não confundir novo Normal com nova cobertura mecânica |

Casos já pesquisados que devem permanecer na fila certa, sem nova admissão nesta consolidação:

- Gren Maju Da Eiza → Q7: multiplicador de cartas banidas; `?` é fato, não zero.
- Maju Garzett → Q6/Q7: captura/soma do ATK original dos dois Tributos; não usar ATK atual por conveniência.
- Gradius' Option → Q5/Q7: invocação vinculada, cópia viva e remoção ligada à origem.
- Black Skull Dragon → Q5/Q9: representação da condição de identidade/arquétipo; receita de Fusão isoladamente não basta.
- Ulevo/Meteo → Q0/Q9: identidade/passcode e condições de três Tributos/Match não suportadas. Não inventar IDs nem adaptar silenciosamente o formato.

Fontes já guardadas em `evidence/mission5-unresolved-research.json`; não refazer buscas concluídas. Para novas decisões, consultar fontes primárias e distinguir texto/regra atual de evidência histórica. Elegibilidade mundial antes do corte não comprova disponibilidade TCG naquela data. Preservar hipóteses da REA como hipóteses, sem copiar código ou dados proprietários.

## Contrato de cada lote

1. Selecionar por identidade canônica, excluir certificados existentes e manter aliases; registrar candidato, família, dependências, região, fonte e motivo de bloqueio.
2. Normalizar fatos sem gerar implementação implícita. Adaptador equivalente só é reutilizado após conferir todas as condições/efeitos da carta.
3. Implementar uma unidade de semântica sobre a arquitetura TypeScript; preservar módulos históricos. Se a engine efetivamente executada precisar mudar, criar versão explícita e testes de saves antigos, não editar o arquivo congelado.
4. Gerar cenários como ponto de partida e escrever verificações independentes; executar individualmente por carta, inclusive negativos, interação, restauração e fingerprint. Uma carta não pode herdar aprovação só porque compartilha adaptador.
5. Passar certificação e CI; registrar antes/depois de catalogadas, normalizadas, implementadas, testadas, certificadas e autorizadas. O último estágio exige autorização separada e permanece sem distribuição automática.
6. Commit pequeno e checkpoint com SHA, testes, falhas, evidências, pendências e próxima operação. Se uma fonte/mecânica bloquear, mantê-la documentada e avançar em outra unidade segura.

Ferramentas existentes: `catalogCertification.ts`, `certificationBatch.ts`, `scripts/audit-certification-pipeline.cjs`, `scripts/plan-certification-batch.cjs`, `scripts/audit-normalization-blockers.cjs`, `scripts/prepare-historical-batch.cjs`, testes e manifests individuais das Missões 3–5. Confirmar argumentos/schema nos próprios scripts. Os manifestos históricos e propostas antigas não devem ser reciclados para simular cobertura de um lote novo.

## Automação segura e limites

| Pode ser automatizado | Continua exigindo revisão/evidência ou autorização |
|---|---|
| Inventário canônico, detecção de duplicatas/aliases, validação de schemas e diffs contra snapshot congelado | Resolver identidade ambígua, criar tradução/datas/estatísticas ausentes |
| Classificação estrutural provisória por metadados, lista de dependências e planos de cenários | Interpretar integralmente texto/regra e equivalência mecânica; não gerar suporte por regex de descrição |
| Fingerprints, hashes, fechamento de imports, regressões individuais, replay, conservação e simulações | Aprovação individual da carta; não emitir certificados automaticamente |
| Geração de fixtures/esqueletos e execução de cenários positivos/negativos | Validar o oráculo; testes que repetem a implementação não bastam |
| Testes SQLite temporários, crash/retry, benchmarks, relatórios e checkpoint/CI | Banco real, restauração operacional, decisões de retenção/reconciliação e RPO/RTO |
| Preflight Discord, build/SHA, payloads/PNG/componentes offline e roteiro | Login/servidor/contas novos, aceite humano, capacidade de host e latência real |
| Planejar lotes e apontar cartões prontos para revisão | Distribuição, loja/eventos, merge e deploy |

## Caminho verificável até o beta

Acompanhar três trilhas sem porcentagem arbitrária: (A) catálogo/mecânicas com dependências e certificados por carta; (B) regras, persistência e recuperação 1v1/2v2; (C) operação e aceite Discord. A expansão integral do histórico segue no backlog até validação de todas as mecânicas pretendidas; o conjunto inicial do beta e seu cronograma exigem escopo explícito do responsável, não decisão silenciosa do agente.

Gates do beta: suíte/REA com limites explicitados, saves v1–v5 e futuras versões compatíveis, conservação e economia, ausência de duplicação sob falhas testadas, catálogo do beta certificado e disponibilidade autorizada, comandos/menus/privacidade/layout aceitos no Discord isolado, memória/CPU/latência medidos no host, backup/restore/reversão ensaiados e pendências bloqueantes tratadas. Nenhum teste interno sozinho autoriza produção. As restrições de merge/deploy/distribuição continuam até nova autorização.

## Prompt curto de retomada

Continue autonomamente a Missão 7 de dareka222778/yugioh-speed-rpg pelo PR #12 e pela branch feat/rea-engine-recovery-20261026. Leia docs/CHECKPOINT-MISSIONS-1-6.md, docs/evidence/continuity-missions-1-6.json e docs/MISSION-7-PLAN.md; verifique HEAD/CI e preserve mudanças posteriores. Execute a próxima unidade segura do plano, priorizando efeitos de monstro/FLIP integralmente suportáveis e suas dependências, com testes individuais, compatibilidade, commits e checkpoints. Preserve engines históricas, saves, economia e layout; não faça merge, deploy, distribuição ou acesso Discord sem autorização. Avance por lotes verificáveis até os gates do beta, registrando bloqueios e mantendo o PR em rascunho.
