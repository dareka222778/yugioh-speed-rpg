# Checkpoint da Missão 32

Base remota conferida: `c48a64a42ae57b556ce25f00170bafecb0c03605`, 916 identidades certificadas e autorizadas, 1.046 pendentes. PR #12 continua em rascunho; nenhuma alteração na branch principal.

## Bloco integrado

- Executor `scripts/card-batch-ci.cjs`: chama a promoção existente em checkout descartável, executa a suíte completa e os gates, produz alterações com hashes anteriores e posteriores; não escreve no GitHub nem implanta.
- Corrigida a proteção do importador histórico contra destinos protegidos ligados por symlink, inclusive aliases externos.
- Worklist distingue certificação de autorização explícita de distribuição.
- Oráculos de ATK/DEF calculados pela fachada pública e seletor de propriedades ausentes para ações inequívocas.
- Condição contínua tipada `faceUpNames`, com capacidade explícita `condition:face-up-named-card`; consulta nomes de regras públicos em ambos os campos, sem consultar identidades ocultas ou estatísticas recursivas. Arquivos dos resolvers v1–v8 preservados.
- Duas admissões pelo pipeline original: Cipher Soldier e Amphibious Bugroth. Seus 26 cenários passaram localmente em catálogo isolado. A promoção e a suíte completa Node 22/SQLite passaram no workflow de preparação `41001876289`, checkout `d22d215224a42e5d129f5a898d1384a07793e361`. Pacote de 12 arquivos recuperado com verificação dos hashes de base. Total resultante: 918, sem concessão de inventário. A CI completa do commit de integração continua obrigatória.

## Em andamento

`catalog/proposed/m32-umi-presence.json`: cinco candidatas com textos e impressões oficiais revisados: Mermaid Knight, Amphibious Bugroth MK-3, Cannonball Spear Shellfish, Torpedo Fish e Deepsea Warrior. Os 80 cenários passaram na engine pública em cópia isolada. A fila de preparação agora contém somente esse lote e exige o catálogo-base `a0b53f3a9dde3b431d3d4096f2e15b76260e1e29d27a0277a1059fe6817088d1` (918 cartas). Não contar essas cinco como certificadas até recuperar e integrar a promoção validada.

## Retomada

1. Consultar HEAD da branch e PR #12 antes de editar. Preservar alterações posteriores.
2. Acompanhar **Card batch admission preparation** do HEAD: seu job usa `CARD_BATCH_BASE_COMMIT`, pois `GITHUB_SHA` é reservado e pode indicar o merge sintético do PR.
3. Recuperar `reviewed-admission-changes/admission-bundle.json`; confirmar checkout, gate, testes e cada hash anterior. Os logs `ADMISSION_BUNDLE` contêm a mesma carga gzip/base64 para recuperação quando o download não estiver disponível. Não aplicar sobre trabalho divergente.
4. Integrar o pacote, retirar o lote da fila e executar CI completa **Engine validation**, incluindo `test` e `extended-soak`. CI de preparação ou rápida não autoriza implantação isoladamente.
5. Só depois usar os comandos existentes `card-batch-deploy.cjs plan/stage/probe`, com sessão autenticada legítima ou API previamente configurada. Nenhum merge.

## Limitações do ambiente

Workspace recuperado byte a byte do GitHub em `C:\Users\Micro\Downloads\speed-rpg-rea-20261026\repo-mission32-c48a64a`, preservando as cópias anteriores. Node local 24.22.1; npm offline não contém as dependências e a tentativa normal foi negada por acesso de rede (`EACCES`). Testes locais usam somente transformação nativa de TypeScript; isso não substitui tipagem, compilação ou SQLite da CI Node 22.

Não há API de hospedagem configurada nem endpoint de navegador conectado acessível nesta sessão. A implantação anterior de 916 consta no PR, mas o runtime online não foi observado novamente. Não declarar implantação nova. Não foram abertos bancos persistentes, acessado Discord real ou concedidas cartas.

## Pendências mecânicas verificadas

- Fairy Meteor Crush: o destinatário do dano depende do controlador do Equipamento; o piercing genérico atual usa o controlador do atacante. Não admitir como equivalente sem corrigir e testar esse caso.
- Os três supostos Normais pendentes não possuem senha resolvida. Não são três admissões automáticas.
- The Legendary Fisherman exige também proteção contra seleção de ataque e permissão de ataque direto ao oponente; imunidade a Magias sozinha é insuficiente.
- A Legendary Ocean exige redução de Nível e regra de nome, além dos modificadores. Não certificar somente como Umi com bônus.

O marco de 1.001 ainda não foi atingido. A meta não autoriza equivalências incompletas.

## Consolidação posterior dos dois lotes

Os dois pacotes descritos acima foram integrados: **923 certificadas/autorizadas, +7 nesta missão, 1.039 pendentes**. Catálogo atual `908b2ae27f7e78820cd7bf591832a99663d50e9eed831dd0250b787d362ac29c`. A fila de propostas está vazia; as cinco cartas de Umi não estão mais em staging. Os 106 cenários individuais passaram nos gates de preparação e localmente pela fachada pública.

Commit de integração do segundo lote: `6a4abf09c8996be360cd39c923c0410bf32b55a9`; validação completa: https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/41003466781 . A verificação também deve ser conferida para o HEAD posterior deste checkpoint. Não inferir implantação a partir de CI verde.

A auditoria de jogos foi corrigida para incluir Fusões no Adicional e seus materiais no Deck Principal, manter limites compartilhados de nomes e observar o UID de Fusão. Os gates não foram removidos. O benchmark da engine está na CI e em `scripts/benchmark-catalog32.cjs`; resultados locais completos preservados em `docs/evidence/mission32-local-benchmark.json`.

A nova fila `scripts/card-batch-family-queue.cjs` conferiu os hashes de todos os arquivos do cache M21: os 1.039 pendentes possuem texto secundário completo disponível; 27 exigem revisão de identidade. Há 1.026 assinaturas exatas de texto/categoria e oito grupos com múltiplos pendentes. Isso não demonstra equivalência mecânica nem dispensa revisão oficial. Gerar novamente com:

```powershell
node scripts/card-batch-family-queue.cjs C:\Users\Micro\Downloads\speed-rpg-rea-20261026\mission21-text-cache artifacts/mission32-family-queue.json
```

Maiores grupos ainda não certificados: quatro monstros que impedem respostas de Armadilhas à própria Invocação-Normal; três guardiões que alteram ATK no cálculo de dano; quatro Mensagens Espirituais que dependem da infraestrutura de Destiny Board. Não certificar as Mensagens como Magias Contínuas vazias. Outros próximos blocos reutilizáveis: custos de descarte com movimentos parametrizados; substitutos de Fusão (revisar separadamente os efeitos secundários de King of the Swamp); efeitos contínuos de impedimento de ativações durante a batalha.

Para o próximo lote: colocar somente propostas ainda não admitidas em `catalog/proposed/queue.json`, definir o catálogo-base acima, executar a promoção existente e a CI completa e importar o pacote apenas com hashes de base correspondentes. Nenhuma sessão de hospedagem foi disponibilizada; implantação segue pendente. Faltam **78 novas certificações** para 1.001; não declarar a missão concluída.
