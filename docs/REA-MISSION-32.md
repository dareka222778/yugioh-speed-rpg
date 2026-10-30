> **CORREÇÃO POSTERIOR OBRIGATÓRIA:** a FAQ oficial de Cipher Soldier identifica um efeito desencadeado obrigatório com Corrente no cálculo de dano. Sua modelagem contínua foi incorreta e a admissão foi retirada. As contagens de 923/+7 abaixo descrevem um estado SUPERADO e não representam o catálogo atual. Neste checkpoint de correção, a base ativa retornou a 916; seis candidatas válidas foram reenfileiradas em lotes novos pelos gates originais. Não contar Cipher Soldier. Ver `docs/evidence/mission32-withdrawal.json`.

# Missão 32 — catálogo, admissão industrial e condições contínuas

Estado inicial verificado: commit `c48a64a42ae57b556ce25f00170bafecb0c03605`, engine-v9, 916 identidades certificadas/autorizadas e 1.046 pendentes. CIs completa e rápida da base aprovadas. Todos os componentes de automação solicitados já existiam; foram recuperados integralmente, sem reimplementar a certificação.

## Implementações e admissões

| Família | Novas cartas | Evidência executável |
|---|---|---|
| Modificador no cálculo contra Tipo específico | Cipher Soldier | 14 cenários, incluindo Guerreiro revelado, ataque/defesa, ausência de bônus fora do cálculo e Skill Drain |
| Fusão sem efeito, receita exata | Amphibious Bugroth | 12 cenários, materiais físicos, Polimerização negada, ocupação de zonas e dono diferente |
| Permissões de combate enquanto Umi está presente | Mermaid Knight; Amphibious Bugroth MK-3 | 32 cenários, limites de ataques, ataque direto, Campo adversário, perda da condição na Corrente e negação |
| Imunidade a Magias enquanto Umi está presente | Cannonball Spear Shellfish; Torpedo Fish; Deepsea Warrior | 48 cenários, Magias próprias/adversárias, remoção de Umi na Corrente, Armadilhas e Invocação por Tributo quando necessária |

Total após integração dos dois pacotes: **923 certificadas e autorizadas, +7 nesta missão, 1.039 pendentes**. Restam 78 para ultrapassar 1.000 e 348 para 1.271. O alvo de 1.001 ainda não foi atingido. Nenhuma carta parcial ou variante foi incluída nessa contagem.

`faceUpNames` acrescenta uma condição ao vocabulário contínuo existente. Consulta nomes de regras públicos em ambos os campos, permite reutilizar imunidade e regras de combate já existentes e exige a capacidade `condition:face-up-named-card`. Não interpreta descrições nem calcula estatísticas recursivamente. Resolvers arquivados e revisões anteriores do catálogo não foram alterados.

## Linha de admissão

`card-batch-ci.cjs` executa o **mesmo** `card-batch-automation.cjs promote --release` em checkout descartável. Exige testes, revisão por identidade, fingerprints, gates de distribuição e suíte completa. Produz um pacote com hashes anteriores/posteriores de cada alteração. O job tem somente permissão de leitura; não faz commit, merge, deploy ou concessões. A integração verifica os hashes antes de aplicar. A CI completa do commit integrado continua obrigatória para implantação.

As duas primeiras cartas passaram em `41001876289`, checkout `d22d215224a42e5d129f5a898d1384a07793e361`; as cinco seguintes em `41002652377`, checkout `4ec5b82db6bbd615ff9d6972cbfdfbcad7af82d5`. Os pacotes foram recuperados dos logs, descomprimidos e validados antes da integração. Propostas, lotes admitidos, provas de registro e certificados permanecem em `catalog/` e `docs/evidence/generated-m32-*.json`. Fila vazia significa ausência de propostas pendentes, nunca testes ficticiamente aprovados.

Foram acrescentados oráculos públicos de ATK/DEF e seletores inequívocos para ações sem alvo. A worklist agora consulta a lista positiva real e separa certificação de distribuição.

## Falhas encontradas e corrigidas

1. Verificação de caminho dependente do SO: um caminho absoluto Windows era aceito no runner Linux. Agora são rejeitados absolutos POSIX e Windows.
2. O importador histórico resolvia symlinks antes de conferir a região protegida; `node_modules` ligado fora do checkout podia escapar do bloqueio. A proteção agora verifica os caminhos lógicos e físicos, inclusive aliases externos, antes de qualquer escrita. Regressões específicas reproduzem o caso.
3. `GITHUB_SHA` representa o merge sintético em eventos de PR e é reservado. Os recibos agora usam `CARD_BATCH_BASE_COMMIT`, vinculado ao HEAD efetivamente extraído.
4. A auditoria de jogos representativos colocava todas as novas cartas no Deck Principal. A primeira Fusão gerada expôs a falha. O construtor agora separa o Adicional, inclui materiais e Polimerização, respeita limite compartilhado de nomes e conta a ação sobre o UID do monstro de Fusão. A exigência de observar todas as cartas continua ativa.

## Validação e desempenho

Os 106 cenários das sete novas cartas passaram pela engine pública em cópias isoladas, incluindo restauração e replay determinístico. Testes novos cobrem proteção de arquivos, importação por symlink, separação certificação/distribuição, seleção de ações, condição nominal e montagem de decks de Fusão. Resultados finais da CI e métricas Node 22 devem ser consultados no checkpoint e nas evidências da missão.

Medição **local Node 24**, catálogo candidato com 923 cartas: 50 duelos intercalados concluídos, 1.043 ações, 149 restaurações/replays, conservação de identidades e zero falhas. p50 0,62 ms; p95 1,78 ms; máximo 9,52 ms; pico RSS 134.389.760 bytes (aprox. 128,2 MiB); CPU usuário 1.218 ms e sistema 109 ms. Cenários determinísticos sem Discord, SQLite ou renderização; não homologam capacidade de participantes nem latência externa. O benchmark reproduzível está em `scripts/benchmark-catalog32.cjs` e também foi incorporado à CI.

## Bloqueios e continuidade

- A meta de 1.001 permanece aberta. O catálogo restante contém majoritariamente efeitos compostos, gatilhos, custos e exceções; os três supostos Normais pendentes não possuem senha resolvida.
- Fairy Meteor Crush não foi admitida: o destinatário do dano precisa considerar o controlador do Equipamento, diferente do piercing genérico atual. A Legendary Ocean e The Legendary Fisherman também exigem operações adicionais; a condição Umi isolada não basta.
- Próximas famílias: custos de descarte com movimento/destruição parametrizados; modificadores persistentes e efeitos secundários de Equipamentos; múltiplos efeitos/gatilhos por monstro. Validar textos e dependências antes de contabilizar retornos estimados.
- O npm local não pode obter dependências (`ENOTCACHED` offline e `EACCES` na rede); tipagem, compilação, SQLite e regressão completa são realizados na CI Node 22. Testes locais por transformação nativa de TypeScript são identificados separadamente.
- Nenhuma sessão autenticada acessível da hospedagem e nenhuma chave de API configurada. A implantação de 916 consta no relatório anterior; não foi observada novamente nesta sessão. A versão nova não foi implantada e não há contagem online nova comprovada.

Não houve merge, acesso ao Discord real, alteração de layout, economia, inventários ou bancos persistentes. A skill [REA](C:/Users/Micro/.agents/skills/reverse-engineer-anything/SKILL.md) foi usada na tentativa de descoberta da sessão de hospedagem; o endpoint não estava acessível.

## Fila industrial reproduzível

`card-batch-family-queue.cjs` reaproveita o cache M21 e confere os hashes dos arquivos e de cada texto completo antes de agrupar. Os 1.039 pendentes estão cobertos por texto secundário; há 1.026 assinaturas exatas de texto e categoria e oito grupos com mais de um pendente. A assinatura conserva números, condições, custos e efeitos secundários; sua igualdade é somente navegação para revisão individual, nunca admissão automática. Texto primário oficial, definições e testes continuam obrigatórios. Quatro regressões verificam adulteração, duplicação, ausência de texto e separação de estágios. Resumo em `docs/evidence/mission32-family-queue-summary.json`.
