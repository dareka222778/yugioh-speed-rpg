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
