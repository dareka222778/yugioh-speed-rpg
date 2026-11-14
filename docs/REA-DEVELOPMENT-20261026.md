# Desenvolvimento independente a partir da REA V1–V11

Base: `classic-engine-foundation`, commit `a6ee11d6cf61a30601be8b1cff948b1136dbfea8` (130 cartas certificadas). A branch `main` contém uma versão anterior e não foi usada como base nem alterada. Implementação na branch `feat/rea-engine-recovery-20261026`, PR em rascunho #12, sem merge ou implantação.

A REA fornece recomendações arquiteturais e cenários propostos, não prova das regras do jogo comercial. A V11 classifica as recomendações de snapshots/recibos como INFERIDAS e não demonstra atomicidade, idempotência ou regras formais de correntes. As garantias descritas abaixo pertencem à implementação independente do RPG e aos seus testes. Nenhum código, offset, binário ou dado proprietário foi incorporado.

## Etapa 1 — auditoria executável

`rea-acceptance-cases.json` transforma os 23 cenários propostos na V3 em seleções concretas de testes da engine, persistência e transporte. Cada seleção precisa executar pelo menos uma asserção aprovada; selecionar zero testes é falha. Cenários sem suporte usam probes executados com TODO explícito, sem serem contabilizados como aceitos.

Execute `npm run audit:rea`. O resultado fica em `artifacts/rea-acceptance.json`, também preservado como artefato da CI. `npm run audit:rea:strict` retorna falha enquanto houver lacunas ou cobertura parcial. A suíte completa continua sendo `npm test`; a auditoria REA é uma verificação adicional.

As lacunas demonstradas são P03 (escolha obrigatória na Espera), T01 (fichas) e L02 (seleção de resolvers históricos após atualização de efeitos). Não habilitamos cartas dessas mecânicas. I02, R03 e D01 têm limites de cobertura registrados na matriz; sucesso nas regressões citadas não certifica todas as extensões possíveis do cenário.

## Etapa 2 — engine, identidade e operações

- `cardLifetime.ts` acompanha a encarnação de zona de cada UID. Alvos de novas ativações capturam UID, zona e época; sair e retornar invalida o alvo anterior. Alterar controlador dentro da mesma zona preserva a referência. Custos permanecem pagos e nenhum alvo substituto é escolhido automaticamente. Contra-armadilhas continuam apontando para ativações da corrente, independentemente da permanência da carta fonte.
- Checkpoints ocorrem nas ações, elos e operações compartilhadas de entrada/saída. Futuros efeitos com movimentos intermediários precisam usar essas operações ou sincronizar explicitamente cada movimento. Metadados opcionais mantêm snapshots antigos legíveis; não é possível reconstruir épocas anteriores à atualização.
- `monsterExit.ts` centraliza a saída para o Cemitério com dono original, histórico de Fusão e política existente de gatilhos. A entrada compartilhada e a saída produzem evidência causal de movimentos, inclusive campo → Cemitério → campo com zonas finais iguais.
- A trilha transitória de uma operação é convertida em eventos imediatamente após a execução. Ela não é uma fita de replay nem parte da projeção pública. Snapshots legados e comparações arbitrárias continuam usando o resumo antes/depois quando não há trilha correspondente.
- Continuações de escolha desconhecidas e referências de alvo malformadas são recusadas antes da execução. Correntes LIFO, custos, gatilhos, prioridades e alvos anteriores permanecem cobertos pela suíte existente.

## Etapa 3 — persistência, recuperação e publicação

`actionReceipts.ts` implementa o protocolo comum a 1v1 e 2v2. O recibo vincula ID da interação, duelo, ator, servidor, revisão e ação. Estado, custos, prêmio existente, eventos e recibo são gravados dentro da transação SQLite correspondente. A repetição reconhecida retorna o estado atual e a revisão originalmente confirmada, sem executar novamente a ação. Reutilizar o ID com outra solicitação é erro. Clientes antigos sem ID conservam a proteção por revisão, mas não recebem replay por recibo.

As tabelas novas são aditivas: `duel_action_receipts`, `tag_action_receipts` e `duel_transition_events`. Não há alteração destrutiva de snapshots, inventários ou progresso. O diário de 1v1 agrega os eventos da ação humana e das ações automáticas do NPC; não apaga movimentos intermediários ao consolidar o estado final. Eventos privados devem passar por `projectTransitionEvents` antes da entrega.

O marcador de revisão pública funciona como publicação pendente de estado. A recuperação agora inclui duelos ativos não publicados. A confirmação de publicação exige a revisão atual; uma mensagem inicial confirma apenas a revisão renderizada. A entrega externa permanece sujeita a repetição e reconciliação: não se promete exatamente uma entrega no Discord.

`inspectSavedDuel` oferece inspeção de quarentena sem alterar o conteúdo original. Um snapshot incompatível não impede o processamento dos outros duelos. O operador ainda precisa tratar os casos em quarentena; não há reparo automático ou interface administrativa nova.

As regressões injetam falhas em recibos, verificam rollback de estado/eventos/membros, reabertura de conexão, dois processos SQLite concorrentes, publicação falha, confirmação obsoleta e publicação inicial em corrida com uma ação. Os testes anteriores de prêmio e retomada entre elos continuam ativos.

## Etapa 4 — expansão e certificação

`certificationBatch.ts` e `scripts/plan-certification-batch.cjs` produzem um plano de revisão sem efeitos de escrita. Cada candidato informa `namespace: "passcode"`, ID de oito dígitos, fingerprint mecânico e suites. O plano rejeita namespaces de ordinais, duplicatas, definições sem validação, fingerprints antigos, referências inválidas e arquivos de teste ausentes.

Execute `npm run plan:certification -- candidates.json`. Um plano aprovado ainda exige executar as regressões e o processo de certificação existente. Ele não habilita cartas, não modifica certificados e não concede disponibilidade econômica. O conjunto de 130 cartas permanece igual. Texto traduzido não participa do fingerprint mecânico.

## Preservação e validação

As regras aprovadas permanecem em `rulesProfile.ts`: 4.000 PV, mão inicial quatro, descarte para seis na Final, Principal 20–30, Adicional cinco, zonas 3+3, Campo separado, sem Principal 2 e Skills desativadas. Os perfis legados mantêm a interpretação previamente suportada.

Os módulos de renderização, imagens, versos, perfis, coleções e decks não foram alterados. Em `index.ts`, somente as três chamadas de vínculo da mensagem recebem a revisão renderizada. Testes e auditorias usam bancos temporários; nenhum cliente Discord ou dado de produção foi executado.

O ambiente local tem Node 24 e rede restrita; `npm ci --offline --ignore-scripts` falhou por dependências ausentes no cache. Testes puros foram executados com remoção nativa de tipos fora do código do produto. A validação completa de tipagem, compilação, SQLite, renderização e simulação é realizada na CI com Node 22 e dependências reais. Resultados completos devem ser conferidos pelo SHA da revisão, sem transferir aprovação de uma revisão anterior para mudanças posteriores.

## Pendências

1. Introduzir resolvers históricos versionados antes de mudar a semântica de definições com partidas pendentes (L02); o número atual de versão sozinho não arquiva implementações antigas.
2. Modelar Espera e suas continuações persistentes (P03), com cartões certificados e regressões próprias.
3. Separar fichas de cartas físicas e itens econômicos antes de permitir geração de entidades (T01).
4. Ampliar testes de encarnação para todas as futuras operações compostas e documentar a política de migração de alvos legados.
5. Definir retenção/arquivamento de recibos e diário, ferramenta administrativa de quarentena e diário causal equivalente para 2v2. Os recibos 2v2 já impedem reaplicação da ação identificada.
6. Confirmar o fallback visual de traduções ausentes para todos os caminhos de apresentação; a independência do fingerprint está testada.

Próxima prioridade: versionamento de resolvers e fixtures históricas de retomada, antes de expandir o catálogo certificado.
