# Checkpoint da Missão 32 — estado corrigido

Engine-v9; **922 certificadas/autorizadas, +6 desde 916; 1.040 pendentes**. Catálogo: 40664314907b30712c09656b5c4bba3c29e9989b3ac1dc7477b18bad4bf6aa0c. Faltam 79 para 1.001 e 349 para 1.271. O marco não foi atingido.

Branch: feat/rea-engine-recovery-20261026; PR #12 permanece em rascunho. Conferir o HEAD remoto e a CI antes de retomar, preservando qualquer avanço posterior.

## Admissões válidas

- m32-exact-fusion: Amphibious Bugroth, 12 cenários.
- m32-umi-verified: Mermaid Knight, Amphibious Bugroth MK-3, Cannonball Spear Shellfish, Torpedo Fish e Deepsea Warrior, 80 cenários.

As seis passaram pela promoção original em checkout descartável na CI 41004657316, base 6e4419c5013ef38bff0caf081ea7e80672df3161, com 6.765 testes aprovados e zero falhas/TODO. A CI completa do HEAD final também é obrigatória. A fila de propostas está vazia após integração; não executar novamente a promoção dos lotes já admitidos.

## Retirada obrigatória preservada

**Cipher Soldier NÃO está certificada.** A FAQ oficial declara um gatilho obrigatório com Corrente no cálculo de dano; a aproximação contínua inicial era incorreta. Contagens antigas de 923/+7 estão superadas. Ver mission32-withdrawal.json. Os snapshots antigos foram mantidos como evidência, não como catálogo atual. Não restabelecer os lotes m32-supported-combat-fusion ou m32-umi-presence no manifesto ativo. Seus testes antigos estão preservados como referência de revisão; as seis cartas corretas possuem novas suítes e a rejeição de Cipher Soldier possui regressões próprias.

## Retomada operacional

1. Ler REA-MISSION-32.md e mission32-progress.json; consultar HEAD, PR e checks remotos.
2. Usar card-batch-family-queue.cjs com o cache M21 verificado para gerar artifacts/mission32-family-queue.json. Os 1.040 textos secundários estão disponíveis, mas ainda exigem revisão oficial individual.
3. Priorizar operações compartilhadas: descarte como custo com movimento/destruição; restrições de ativação; gatilhos de Invocação/cálculo; efeitos secundários de Equipamentos. Quatro monstros compartilham texto de bloqueio de respostas à Invocação-Normal; três guardiões compartilham efeito no cálculo; as Mensagens Espirituais não são admissões vazias.
4. Novos lotes: baseRevision = catálogo atual acima; queue.json deve conter somente propostas ainda não admitidas. Gerar/testar/promover pelos gates existentes. Nunca inferir efeito contínuo apenas pelo texto mencionar cálculo de dano.
5. O workflow de preparação usa CARD_BATCH_BASE_COMMIT. O pacote admission-bundle.json é reproduzido nos logs ADMISSION_BUNDLE em gzip/base64; confirmar checkout, gate, testes, resultados e TODOS os hashes de base antes de integrar. Não sobrescrever trabalho divergente.
6. Após commit, exigir Engine validation com test e extended-soak aprovados no mesmo SHA. A CI rápida ou a preparação isolada não bastam para deploy.
7. Implantar somente por sessão legitimamente autenticada ou API já configurada, com plan/stage/probe existentes, backup e evidência do commit/catálogo online. Não solicitar credenciais no chat.

## Ambiente e evidências

Workspace: C:\Users\Micro\Downloads\speed-rpg-rea-20261026\repo-mission32-c48a64a. As cópias anteriores foram preservadas. Git CLI e dependências completas não estão disponíveis localmente; commits foram publicados via API GitHub com lease do HEAD. Node local 24.22.1; npm bloqueado por cache/rede. A CI usa Node 22 e SQLite. O hook local ../local-typescript-hooks.cjs transforma TypeScript, não verifica tipos nem substitui a CI.

Preservados: 277 módulos de resolvers v1–v8, todos os dados persistentes, layout e economia. Os gates locais confirmaram 922 certificadas/autorizadas e zero liberação de carta incompleta. Métricas: mission32-local-benchmark.json (50 duelos) e mission32-headless-1000.json (1.000 sessões intercaladas); não representam latência Discord.

A descrição operacional em PT-BR foi corrigida para mostrar a condição de Umi nas cinco cartas; cinco testes verificam essa apresentação sem mudar o layout. Validar a CI do HEAD posterior a a3122dd6, não reutilizar a aprovação de um SHA anterior como prova desse ajuste.

Hospedagem: nenhuma nova implantação. Não há sessão autenticada acessível nem BOTHOSTING_API_KEY configurada. Último relato anterior: c48a64a/916; runtime não observado novamente nesta sessão. Nenhuma concessão de inventário.

## Retomada: restrições de ativação

CI de 9ecea268 aprovada: 6.774 testes sem falhas/TODO e extended-soak aprovado (run 41007215069). Não repetida. Recibo: docs/evidence/mission32-resume-ci.json.

Nova operação preventActivation integrada ao resolver ativo: distingue ativação de Card de negação de efeito; Trap/battle e Quick-Play/all, relativo ao controlador atual. Proposta m32-activation-restrictions: Pitch-Black Warwolf, Mirage Dragon e Invader of Darkness; 51 cenários públicos passaram em sandbox headless local, incluindo fonte virada por Desert Sunlight no elo superior sem negar o elo inferior já ativado. A proposta ainda NÃO conta como certificação. Exigir promoção isolada Node22, suíte completa e importação do bundle validado antes de contar ou distribuir.

277 módulos históricos intocados; Umi e retirada de Cipher Soldier preservados. Hospedagem continua pendente de acesso autenticado.

### Admissão concluída — 925

Lote m32-activation-restrictions admitido pelo gate existente na CI 41079475780, base bc54f7cf: 6.827 testes Node22 aprovados, zero falhas/TODO. Bundle importado somente após validação de SHA-256 de cada conteúdo e do arquivo anterior; catálogo atual 488b7ef1792a32ec4a3758f104de76b1952f5ba4ebe229927f52c0e85bdd6995. Total: 925 certificadas/autorizadas; 1.037 pendentes; faltam 76 para 1.001 e 346 para 1.271. Nenhum inventário concedido. Exigir CI completa do commit de admissão antes de implantação; hospedagem ainda sem acesso autenticado.

### Segundo bloco: gatilho opcional com custo de PV

Correção demonstrada: a construção de gatilhos simultâneos não tinha pagamento de custos e a via legada de revelação em batalha não oferecia a recusa de efeitos FLIP pagos. Agora custos LP são pagos ao criar o elo, não ao oferecer escolha; elegibilidade é recalculada após cada ativação e a recusa não paga. O schema admite somente FLIP opcional com LP e operação não direcionada burn/heal; descarte/Tributo e outros contratos de gatilho permanecem bloqueados.

Needle Ball (94230224, CID4496), OCG Booster 5 de 1999-10-17, texto/FAQ oficiais revistos: proposta m32-optional-trigger-lp, 22 cenários headless aprovados, ainda não certificada. Inclui dois gatilhos quando só há PV para um, batalha após destruição da fonte, negação mantendo o custo e restauração/rejeição de repetição. Submeter à admissão completa antes de contar.

### Promoção homologada — Needle Ball (926)

CI de preparação [41095089614](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/41095089614) no commit `bb6e84796dfffc90a0e5f8796fff96141146f8c4` executou os gates originais, com 6.851 testes Node 22 aprovados, zero falhas/TODO, e produziu o bundle `m32-optional-trigger-lp` com SHA-256 dos 12 arquivos e hashes anteriores. Admite Needle Ball (`94230224`/CID4496) com 22 cenários e corrige a regressão de política de custos opcionais. Catálogo certificado/autorizado no código após aplicar o bundle: **926 cartas; 1.036 pendentes; 75 para ultrapassar 1.000**. Fila de admissão esvaziada. Exigir CI completa do commit final antes de deploy. Runtime online não foi atualizado nem verificado nesta promoção.
