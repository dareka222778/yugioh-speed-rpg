# Missão 32 — resultado parcial e certificação corrigida

**Engine-v9: 916 → 922 cartas certificadas e autorizadas, +6; 1.040 identidades pendentes.** Faltam 79 para ultrapassar 1.000 e 349 para 1.271. A meta da missão não foi atingida. Não houve implantação nova.

Base conferida: c48a64a42ae57b556ce25f00170bafecb0c03605, PR #12 em rascunho, CIs da base aprovadas. As cópias locais anteriores foram preservadas; o HEAD foi recuperado byte a byte em uma pasta separada. Todos os componentes de automação solicitados já estavam publicados e foram reutilizados.

## Cartas admitidas

| Família | Cartas | Cenários individuais |
|---|---|---:|
| Fusão sem efeito, receita exata | Amphibious Bugroth | 12 |
| Combate condicionado à presença de Umi | Mermaid Knight; Amphibious Bugroth MK-3 | 32 |
| Imunidade a Magias condicionada à presença de Umi | Cannonball Spear Shellfish; Torpedo Fish; Deepsea Warrior | 48 |

Os 92 cenários executam a fachada pública utilizada por novos duelos e incluem condições, negação, restauração, replay determinístico, remoção da condição durante a Corrente, materiais físicos, zonas, controle/dono e Armadilhas. Os dados oficiais completos e as impressões regionais revisadas constam nas propostas e nos lotes admitidos m32-exact-fusion e m32-umi-verified. Não foram concedidos inventários.

Catálogo atual: 40664314907b30712c09656b5c4bba3c29e9989b3ac1dc7477b18bad4bf6aa0c. Os gates confirmam 922 registradas/certificadas, 922 autorizadas e zero não certificadas liberadas. Os 277 módulos arquivados de v1–v8 passaram na verificação de hashes.

## Correção de revisão: Cipher Soldier

A revisão inicial classificou incorretamente o bônus como contínuo. A [FAQ oficial de CID 5034](https://www.db.yugioh-card.com/yugiohdb/faq_search.action?ope=4&cid=5034&request_locale=ja) identifica um efeito desencadeado obrigatório no cálculo de dano, com Corrente. Testes que apenas conferiam ATK/DEF não demonstravam esse timing.

A admissão foi retirada antes de qualquer deploy. Os lotes que dependiam de sua base foram retirados do registro ativo e as seis cartas corretas foram novamente promovidas pelos gates originais, em lotes novos. Catálogos e provas superados foram preservados para auditoria; as contagens anteriores de 923/+7 não são válidas. Cipher Soldier não é jogável nem distribuível. A proposta rejeitada está bloqueada e há regressões contra sua readmissão, mesmo com uma revisão falsamente marcada como aprovada.

O gate adicional calculation-timing-review32.cjs exige revisão oficial específica para modificadores de cálculo e rejeita a aproximação contínua conhecida de CID 5034. Não implementa ficticiamente um gatilho que a engine ainda não possui. A implementação correta desse timing permanece pendente.

## Implementação e automação

- faceUpNames e a capacidade condition:face-up-named-card acrescentam uma condição ao vocabulário contínuo existente. Consultam identidades públicas em ambos os campos, sem ler cartas ocultas ou estatísticas recursivas. Não habilitam automaticamente outras cartas que mencionam Umi.
- card-batch-ci.cjs chama o mesmo card-batch-automation.cjs promote --release em checkout descartável, executa suíte completa e gates e produz um pacote com hashes anteriores/posteriores. O job tem somente leitura, não faz commits nem deploy. O HEAD integrado ainda precisa da CI completa Engine validation.
- Oráculos públicos de ATK/DEF e seletores de propriedades ausentes permitem cenários inequívocos de ataque direto. A worklist distingue certificação de autorização explícita.
- card-batch-family-queue.cjs verifica os hashes do cache M21 e de cada texto completo. Os 1.040 pendentes possuem texto secundário verificado; há 1.027 assinaturas exatas de texto/categoria e oito grupos compartilhados. Números, timing e efeitos secundários não são apagados. Igualdade de texto é navegação, nunca certificação ou equivalência mecânica comprovada.

## Falhas corrigidas

1. Caminhos absolutos Windows eram aceitos no runner Linux: a importação de pacotes agora rejeita absolutos dos dois sistemas.
2. O importador histórico resolvia symlinks antes de verificar destinos protegidos. Agora verifica o caminho lógico e físico, inclusive aliases externos a node_modules, antes de qualquer escrita.
3. GITHUB_SHA indica o merge sintético de PR e é reservado. Recibos usam CARD_BATCH_BASE_COMMIT vinculado ao checkout real.
4. A auditoria de jogos colocava novas Fusões no Principal. Agora usa o Adicional, inclui receitas e Polimerização, respeita limites por nome e observa o UID de Fusão. A exigência de observar todas as novas cartas foi mantida.

## Testes e métricas

A preparação corrigida 41004657316, checkout 6e4419c5013ef38bff0caf081ea7e80672df3161, promoveu 1 + 5 cartas: **6.765 testes aprovados, zero falhas, cancelamentos, skips ou TODO**, Node 22.23.4, SQLite disponível. Também executou gates de certificação/distribuição e jogos completos de NPC. Os quatro testes adicionais do gate de timing/rejeição passaram localmente; a CI do commit final é a referência para o total integrado.

Medição local reproduzível, Node 24, sem Discord/SQLite/renderização: 50 duelos concluídos, 1.043 ações, 149 restaurações/replays, p95 1,95 ms, máximo 9,97 ms e pico RSS 134.057.984 bytes. Em 1.000 duelos intercalados: 22.722 ações, 3.246 restaurações/replays, p95 1,66 ms, máximo 44,49 ms e pico RSS 499.802.112 bytes, sem falhas ou perda de identidades. São sessões intercaladas em um processo, não 1.000 usuários simultâneos nem homologação de capacidade no Discord. Evidências completas em mission32-local-benchmark.json e mission32-headless-1000.json.

## Pendências e hospedagem

Não há sessão autenticada acessível da Bot-Hosting.net nem chave de API configurada. A versão anterior c48a64a/916 consta no relatório anterior; não foi observada novamente. Nenhuma versão desta missão foi implantada. A skill REA foi usada para tentar localizar a sessão de hospedagem; o endpoint de depuração não estava acessível.

O npm local não consegue obter dependências: ENOTCACHED offline e EACCES no acesso normal. Compilação, tipagem, SQLite e regressão completa foram executados na CI Node 22. Testes locais com transformação nativa de TypeScript são identificados separadamente.

Próximos blocos: custos de descarte com movimentos parametrizados; restrições de ativação e timing de Invocação/cálculo de dano; efeitos secundários e modificadores persistentes de Equipamentos. As quatro Mensagens Espirituais dependem de Destiny Board; os três supostos Normais pendentes não têm senha resolvida. Fairy Meteor Crush exige destinatário de dano vinculado ao controlador do Equipamento; The Legendary Fisherman e A Legendary Ocean possuem requisitos adicionais. Não tratar essas dependências como efeitos completos.

Sem merge, acesso ao Discord real, alteração de layout, economia, inventários ou bancos persistentes. O PR permanece em rascunho. A missão segue parcial até atingir o marco com certificações demonstradas.
