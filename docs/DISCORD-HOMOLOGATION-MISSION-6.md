# Homologação isolada da candidata — Missão 6

Não executada no Discord real. A sessão preparou scripts, fixtures e testes offline; não acessou tokens, servidores ou contas. CI não chama o launcher. Nenhum passo abaixo autoriza produção, merge, deploy ou distribuição.

## O que o responsável precisa fornecer

- Autorização explícita para um bot dedicado de testes e um servidor separado; IDs da aplicação, servidor e canal de testes.
- Modo de teste escolhido: `solo-ai` (somente o responsável, contra NPCs) ou `closed-beta` (convites consentidos, capacidade-alvo de 20 a 50 participantes). O roteiro humano 2v2 original ainda pode usar `manual-four` com quatro participantes.
- IDs públicos da aplicação e servidor de produção para a lista de destinos proibidos. Não fornecer banco, token ou credenciais de produção.
- SHA completo aprovado, host de testes, limite de memória/CPU e volume SQLite dedicado. Sem compartilhamento de arquivo SQLite entre hosts.
- Token exclusivo do bot de testes, provisionado diretamente no ambiente autorizado. Não colocar token em relatórios, autorização JSON, PR ou chat.

## Preparação sem login

Em checkout limpo do SHA aprovado, Node 22 e dependências do lockfile, executar `npm ci`, `npm run check`, `npm test` e o workflow completo. Confirmar os hashes v1–v5 e a matriz `docs/evidence/mission6-readiness.json`. Não reaproveitar `dist` de outro checkout: remover somente o diretório de build confirmado dentro do checkout isolado, recompilar e executar `node scripts/stamp-candidate-build.cjs`.

Executar `node scripts/prepare-discord-sandbox.cjs`. O resultado informa uma pasta nova, banco isolado ainda inexistente, configuração e autorização de exemplo com `approved:false`. O preparador não consulta credenciais, não abre SQLite nem inicia o cliente. Copiar o exemplo para uma autorização local com os IDs e SHA aprovados; preencher somente após autorização real.

`node scripts/discord-sandbox-preflight.cjs CONFIG AUTHORIZATION` valida os metadados, destinos proibidos, lista de participantes, caminho do banco e sentinela dotenv. Também se pode usar `node scripts/start-discord-sandbox.cjs CONFIG AUTHORIZATION` para dry run. Ambos terminam sem login e sem ler o token. Aprovação desses metadados não prova que o token realmente pertence à aplicação: o responsável deve garantir o provisionamento correto.

O exemplo gerado agora inicia em `testMode: "solo-ai"`: `aiOnly: true`, `inviteOnly: true` e exatamente **um** ID consentido. Essa opção serve para o responsável exercitar `/duelo treino`, `/npc` e `/dupla treino` no bot de teste enquanto os duelos 1v1 e 2v2 humanos continuam cobertos por simulações offline. Não requer quatro contas humanas. Para a entrada controlada de pessoas, alterar explicitamente para `testMode: "closed-beta"`, `inviteOnly: true`, `participantCap` entre **20 e 50**, e preencher `consentingUserIds` somente com os IDs já convidados e consentidos, começando com um usuário se necessário e ampliando até a capacidade selecionada. Alterações de convidados exigem atualizar o arquivo de autorização e **reiniciar manualmente** o processo isolado. O modo antigo `manual-four` continua exigindo ao menos quatro IDs.

Somente após autorização, definir DISCORD_TOKEN, DISCORD_CLIENT_ID e DISCORD_GUILD_ID do bot de testes e usar `node scripts/start-discord-sandbox.cjs CONFIG AUTHORIZATION --run`. O launcher exige checkout Git limpo no SHA aprovado e verifica o inventário/hash de todos os módulos compilados e lockfile. Ele fixa DATABASE_PATH dentro da pasta preparada, impede fallback para o .env do repositório, injeta uma lista de acesso validada e inicia o bot com a pré-carga exclusiva `scripts/sandbox-interaction-preload.cjs`, **sem alterar os módulos históricos**. Essa pré-carga bloqueia comandos, menus, botões e autocompletes fora do **servidor, canal e IDs consentidos**, antes de o handler receber o evento; também bloqueia convites PvP/2v2 para usuários não convidados. Não usar `npm start` como substituto desse isolamento, pois não ativa a pré-carga. O bot deve ser instalado exclusivamente no servidor de testes. O launcher não verifica instalações existentes via rede. Controles de convite **não substituem** as permissões do próprio servidor Discord.

## Roteiro e evidências de aceite

Registrar SHA, Node/lockfile, máquina, horário, participantes e baseline dos perfis, coleções, saldos e versões. Nunca registrar tokens ou mãos privadas em canais públicos.

1. `/start`, starter, `/perfil`, `/colecao`, `/deck` e seleção/ativação do deck. Confirmar a concessão inicial única prevista e nenhuma concessão das 67 adições bloqueadas. Verificar edição concorrente, painel antigo, inventário insuficiente e outro usuário.
2. `/duelo` com convite, aceitação, recusa, painéis privados e republicação do campo. Exercitar compra, invocação normal/tributo, especial, Fusão, Magias/Armadilhas, FLIP, alvos, custos, correntes e escolhas obrigatórias/opcionais. Usar decks possuídos e empréstimos já suportados. As 197 definições são cobertas na engenharia; certificação não permite conceder cartas bloqueadas nem exige colocá-las em contas.
3. `/dupla` com quatro consentimentos, clássico emprestado e treino solo; rotação de assentos, cartas do parceiro, prioridades e recuperação. Decks Yugi/Kaiba são adaptações Speed RPG. Manter 4.000 PV, mão 4/limite 6 no Final, Deck 20–30/Adicional 5, zonas 3+3, Campo separado, sem Principal 2 e Skills desligadas.
4. Combate, dano, destruição, banimento, retorno, controle temporário, ficha em fixture isolada e zona ocupada. Não certificar nem conceder Scapegoat como atalho: sua mecânica continua bloqueada.
5. Desistência, timeout e deck-out, incluindo decisão de resposta pendente. Conferir resultado único no diário, assentos liberados e controles encerrados. PvP/treino não geram recompensa; desafio NPC segue apenas a regra já aprovada. Comparar saldos/coleções antes/depois e recibos de primeira vitória.
6. Interromper o processo dedicado durante escolha/corrente e após commit antes da publicação; reabrir com o mesmo banco e SHA. Reenviar interação/painel: confirmar uma revisão/pagamento/resultado, sem repetição. Testar indisponibilidade de publicação, reconexão e mensagem removida. Nunca interromper produção.
7. Comparar capturas dos painéis públicos/privados, menus, imagens e verso com o layout aprovado. Verificar permissão do canal, privacidade, menus longos, componentes antigos e ausência de exposição de cartas ocultas.
8. Medir separadamente recebimento→ACK, recebimento→commit e recebimento→publicação visível, com p50/p95/p99/máximo, erros/rate limits, concorrência, RAM total/cgroup, RSS de cada processo, CPU e espaço/WAL. Registrar também download de arte fria versus cache e renderização. Meta de 1,5 segundo permanece pendente até definir qual etapa deve atendê-la e medi-la no Discord real.

Aceite exige roteiro assinado, invariantes preservados, ausência de regressão visual/econômica, restauração demonstrada e orçamento do host aprovado. Falha em isolamento, duplicação de pagamento/recompensa, corrupção, vazamento de privacidade ou extrapolação de memória bloqueia promoção. Resultados headless não substituem esse aceite.

## Backup, restauração e reversão — procedimento preparado

Os comandos são utilitários do operador e foram exercitados exclusivamente com bancos temporários. Nenhum banco real foi copiado nesta missão.

1. Planejar janela e impedir novos escritores no ambiente que será avaliado; preservar binário/build, fontes no SHA exato, Node, lockfile, manifests v1–v5, configurações fora do pacote e diretórios de retratos/arte com permissões adequadas. O utilitário SQLite não inclui arquivos de imagem nem segredos.
2. `node scripts/sqlite-snapshot.cjs snapshot SOURCE EXISTING_BACKUP_PARENT` usa a API de backup SQLite, incluindo páginas WAL já confirmadas; não copiar somente o arquivo principal de um banco ativo. Saída em subpasta nova, manifesto SHA-256 e versões. Com escritores ativos, o backup é consistente, mas não contém commits posteriores ao snapshot. Não declarar que inclui alterações não confirmadas.
3. `node scripts/sqlite-snapshot.cjs verify SNAPSHOT_FOLDER` verifica hash, integridade e chaves estrangeiras sem migrações da aplicação. `restore SNAPSHOT_FOLDER NEW_DESTINATION` exige destino e sidecars inexistentes, sem sobrescrever banco existente. Comparar manifests/lockfile com o build aprovado, abrir somente a cópia, verificar recibos, versões, membros e economia e testar saves legados antes de qualquer promoção.
4. A reversão do código exige retirar os escritores, arquivar o estado pós-incidente e selecionar um build que suporte **todas** as versões ainda ativas. Voltar de v5 para um binário sem suporte v5 não é uma reversão segura. Esta missão mantém v1–v5 e não cria v6.
5. Restauração de snapshot anterior perde commits posteriores: não executá-la automaticamente nem prometer replay a partir de eventos, que não são um log completo de comandos. Exige decisão explícita sobre os dados posteriores, reconciliação e autorização. Reiniciar apenas no caminho validado, conferir health, publicação pendente e economia, sem redistribuir recompensas/cartas.

Backup/restore de fixtures passou na automação; restauração operacional, RPO/RTO, host, Discord real e lançamento continuam dependentes do aceite separado.
