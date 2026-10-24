# Yu-Gi-Oh! Speed RPG

Bot de Discord para um RPG de cartas inspirado em Speed Duel.

## V0

- `/ping`
- `/start` com escolha de deck inicial
- `/perfil`
- Persistência local em SQLite
- Base pronta para coleção, loja, mercado e duelos

## Rodando localmente

1. Instale Node.js 20+.
2. Copie `.env.example` para `.env`.
3. Preencha `DISCORD_TOKEN` e `DISCORD_CLIENT_ID`.
4. Rode `npm install`.
5. Rode `npm run dev`.

> Nunca envie seu token do Discord para ninguém e nunca coloque o `.env` no GitHub.

## Próximas etapas

1. Importador de cartas Speed Duel / primeira geração.
2. Coleção e editor de deck.
3. Motor de duelo 1v1.
4. Renderer visual do campo.
5. NPCs e recompensas.
6. Loja rotativa.
7. Market entre jogadores.
8. Eventos, PvP e Tag Duel 2v2.

## V0.2 — Perfil de personagem

- `/perfil`: ficha privada com avatar, retrato, cor, biografia e dados reais do jogador.
- `/perfil publico:True`: compartilha a ficha no canal, sem botões de edição.
- `/personalizar nome:Kairos bio:Minha história cor:ametista imagem:<anexo>`.
- O botão **Personalizar** abre um formulário para nome, biografia e cor.
- `/personalizar remover_imagem:True` remove o retrato armazenado.
- Cores: ametista, ouro, oceano, rubi e esmeralda.
- Retrato PNG/JPG/WebP até 2 MB. Origem limitada ao CDN de anexos Discord, download limitado e com timeout, assinatura do formato verificada. Não faz recorte, edição ou análise de conteúdo da imagem.
- Imagens ficam em `portraits/` junto ao arquivo SQLite (por padrão `data/portraits/`). Uma imagem por jogador, sobrescrita a cada envio. Não armazena links temporários como retrato permanente.
- Migração aditiva preserva saldo, XP e estilo inicial existentes.
- Nenhuma dependência adicional. Recomenda-se Node 22 para a versão atual de better-sqlite3.

### Atualizar no Botkeep

1. Faça um backup de `data/` (SQLite e retratos); não use instalação limpa nem apague dados.
2. Na aba **GitHub**, atualize os arquivos a partir de `main`.
3. Reinicie usando `npm run build && npm start`. Um simples Redeploy pode não buscar os arquivos novos.
4. Use `/perfil`, personalize e reinicie novamente para verificar persistência.

Mantenha `DATABASE_PATH` apontando para armazenamento persistente e inclua os retratos nos backups. Sem volume persistente, o código não garante preservação após recriação do servidor. O disco gratuito é limitado: em servidores maiores, migrar retratos para armazenamento de objetos com quota.

### Testes

`npm test` compila e verifica migração de um banco legado, persistência após reabertura, validação dos campos, payload dos embeds, upload simulado, exibição e remoção de retrato. O teste de download usa fetch simulado; permissões, rede Discord e aparência final precisam ser conferidas no servidor.

A V0 registra o estilo inicial; ainda não entrega cartas, executa duelos ou possui economia jogável. O perfil não inventa vitórias ou progressão que o motor ainda não implementa.

## V0.3 — Fase 1: identidade visual

Perfil em uma única imagem PNG (1000 × 760), retrato integrado sem distorcer ou cortar a imagem, silhueta quando não há retrato, cinco cores e texto alternativo com os dados reais. Nomes longos são divididos e ajustados ao espaço disponível; biografia até 240 caracteres. A tela inicial também ganha uma composição visual com os três estilos e mantém a indicação de que cartas e duelos ainda não foram implementados.

Renderer: `src/cardRenderer.ts`, usando sharp 0.34.5. Cache de imagens do sharp limitado a 8 MB, um thread por imagem e fila de até quatro renderizações; nenhuma API paga, navegador ou geração por IA é usada no bot. As interações aguardam a renderização com resposta deferida. Retratos antigos ilegíveis ou acima do limite de 16 megapixels usam a silhueta para não derrubar o comando.

`npm test` cobre migração e persistência, dados reais no texto alternativo, dimensões da ficha, integração e remoção do retrato, texto com caracteres XML, nomes longos, cores, retrato danificado e tela inicial. A legibilidade foi inspecionada em prévias locais; a apresentação final precisa ser conferida no aplicativo Discord. O renderer usa fontes sans-serif disponíveis no sistema; verificar a fonte após implantação em outro sistema operacional.

## V0.4 — Fase 2: cartas e coleção

- 28 cartas clássicas no catálogo local; confira `CARD_SOURCES.md` para origem e limites.
- Cada conjunto inicial contém 20 cartas: 16 monstros (duas cópias de oito) e quatro Magias/Armadilhas.
- Escolher um estilo agora entrega as cartas. Jogadores da V0.3 recebem automaticamente o conjunto correspondente na primeira inicialização da V0.4.
- Um recibo em `starter_grants` e a atualização de inventário são gravados na mesma transação. Repetir `/start`, abrir coleção ou reiniciar não repete a entrega. Um erro desfaz toda a operação.
- `/colecao` mostra quantidades, seis cartas por página e seleção para consulta; também acessível pelo botão Coleção no perfil.
- `/carta busca:<nome ou ID>` procura em português, inglês ou pelo identificador de oito dígitos. Há autocomplete; consultas ambíguas mostram alternativas.
- Consulta mostra categoria, ATK/DEF/nível quando aplicável, quantidade possuída e link para a base Konami.
- A arte é opcional, baixada do CDN YGOPRODeck para cache local em `data/card-art`, com timeout, limite de tamanho e bloqueio temporário de novas tentativas após falha. Se indisponível, a ficha textual continua funcionando. Inclua o cache nos backups ou deixe-o ser reconstruído.
- A Fase 2 não implementa montagem de decks, duelos, efeitos, loja, preços ou raridades do RPG. A seleção é temática e não certifica legalidade de torneio Speed Duel.

Validação inclui rollback simulado durante entrega, migração de jogador antigo, preservação de saldo/perfil/inventário, reabertura de banco, três conjuntos iniciais, repetição de ações, paginação, busca com acentos e cache/falha de arte. Nenhuma nova dependência npm na Fase 2. `package.json` e `package-lock.json` devem sempre ser atualizados juntos.

Antes de entregar conjuntos a jogadores antigos, a inicialização grava uma cópia de recuperação SQLite em `data/backups` (junto ao banco configurado). Se o backup falhar, a migração não prossegue. A coleção também é contada no banco e registrada nos logs de início para verificação operacional.


## Fase 3 — Editor de decks (v0.5)

- `/deck ver` abre o editor; `espaco` escolhe 1, 2 ou 3. Um botão Decks aparece nos novos perfis.
- No primeiro acesso, o espaço 1 recebe uma composição do conjunto inicial já possuído. Os demais começam vazios. Não há entrega de novas cartas.
- Selecione uma carta e use +1/−1, troque de espaço, renomeie e ative um deck válido. As alterações são salvas imediatamente no SQLite; não é necessário clicar em Salvar.
- Alternativas por comando: `/deck adicionar`, `/deck remover` (carta, quantidade, espaco), `/deck nome` (texto, espaco), `/deck ativar` e `/deck inicial`.
- Copiar o conjunto inicial exige um espaço vazio e nunca sobrescreve um deck existente.
- Regras deste protótipo de RPG: 20–30 cartas, até 3 cópias por identificador, respeitando a quantidade da coleção. Não é um verificador de listas oficiais de torneio.
- Um único deck pode estar ativo por jogador. Um rascunho com menos de 20 cartas é salvo, mas não pode ser ativado. Editar um ativo até ficar inválido desativa esse deck. O jogador precisa ativá-lo novamente quando estiver válido.
- As mesmas cópias podem compor decks diferentes: editar um deck não vende, consome ou apaga cartas da coleção. As tabelas decks/deck_cards são adicionais e não alteram os dados de perfil.
- Painéis e modais usam revisão para rejeitar alterações antigas; botões privados verificam o proprietário. Gravações são transacionais.
- Testes incluem os três conjuntos iniciais, isolamento entre jogadores, persistência após reabrir o banco, limites, invalidação, rollback e o listener real de interações com o transporte Discord simulado. O teste local não substitui uma interação real no Discord.
- Duelos, efeitos e recompensas permanecem para as próximas fases. Ativar um deck nesta versão só salva a seleção.


### Editor visual de cartas

O `/deck ver` agora anexa uma grade PNG de seis cartas reais por página e uma ampliação da selecionada. O menu e os botões continuam responsáveis pelos cliques (a imagem do Discord não possui áreas clicáveis). Quantidades, estado, atributos e destaque são desenhados com os contornos de fonte incorporados. As imagens usam o mesmo cache de cartas da Fase 2: até três downloads simultâneos, seis IDs por página e timeout por imagem. Se o CDN falhar, o espaço mantém nome/ID e os controles continuam disponíveis. Uma fila limita a renderização simultânea para o plano de 512 MB. Não há alterações no banco nem nas regras de deck.


## Fase 4 — Duelo básico 1v1 (v0.6)

Ative seu deck e use `/duelo treino`, `/duelo desafiar oponente:...`, `/duelo ver` ou `/duelo sair`. A arena é pública e a mão fica no painel privado do participante. O motor possui turnos, invocações/tributos, posições, combate, 4000 PV, compra/descarte, derrota por deck vazio, desistência e os quatro efeitos iniciais. PvP exige aceite; o treino usa um NPC heurístico sem recompensas. O estado persiste no SQLite após reinício, com revisão contra cliques antigos e uma sessão por jogador.

Leia [DUEL_RULES.md](DUEL_RULES.md) para regras implementadas, privacidade, expiração e limites. Adicionar uma carta ao catálogo não a habilita para duelar: a lista do motor é explícita. Não há Skills, Extra Deck ou motor universal de efeitos. A renderização usa o cache de cartas existente e conserva fallback textual.

Validação inclui partidas completas simuladas, conservação de cartas em 100 sementes, combate/efeitos, consentimento do convite, retomada, rollback, privacidade do campo e o listener real com transporte Discord simulado. Confirmar a experiência de dois usuários no Discord permanece um teste de aceitação separado.


## Fase 4.1 — W.O., Campo e Fusão

Prazo de 30 minutos por decisão, vitória do adversário por W.O., verificação automática a cada 10 segundos e bloqueio de controles após fim. Derrota por deck vazio ocorre na falha de compra obrigatória. Campo, Deck Adicional, cemitério consultável e área de banidas aparecem na arena. Sogen e a Fusão do Espadachim das Chamas estão implementados; `/duelo treino_fusao` oferece tutorial virtual, sem alterar coleção ou economia. O editor separa automaticamente cartas de Fusão do Principal. Ver DUEL_RULES.md para as diferenças entre suporte implementado e o TCG completo.

## Fase 5 — conteúdo jogável (v0.7.0)

- `/npc ver`: portal privado com Joey Wheeler, Yugi Muto, Seto Kaiba, progresso e prêmios.
- `/npc desafiar duelista:<nome>` ou botões do portal: duelo público, mão privada, deck ativo real, embaralhamento normal e mesmas regras do jogador.
- `/npc diario`: oponente em rotação diária, com 100 DP + 50 XP + uma carta de apoio. Uma recompensa por conta/dia, global entre servidores, renovação às 00:00 de São Paulo. É preciso vencer antes de virar o dia; revanche fora do modo diário não dá o bônus.
- Primeira vitória contra cada NPC, uma vez por conta: Joey 150 DP/100 XP + Olhos Vermelhos e conjunto da Fusão do Espadachim das Chamas (Polimerização, Manipulador de Chamas, Masaki e a Fusão); Yugi 150 DP/100 XP + Mago Negro; Kaiba 200 DP/125 XP + Olhos Azuis e Sogen.
- Primeira vitória e diário podem somar. Revanche normal, treino, PvP, derrota, desistência e W.O. não geram prêmio repetido. Não há apostas nem cobrança de entrada.
- XP total é mantido; cada 100 XP completa um nível. Níveis existentes nunca são reduzidos. Cartas recebidas vão para a coleção; o jogador edita seu deck com `/deck ver`.
- Catálogo com 35 cartas, incluindo os três monstros clássicos de dois tributos. São adaptações temáticas dos NPCs, usando somente efeitos já implementados; a IA é uma heurística e não lê a mão ou cartas ocultas do adversário.
- Migrações aditivas: `npc_results`, `npc_first_wins`, `npc_daily_claims`. Estado final, saldo, XP, inventário e recibos são confirmados na mesma transação. Uma falha de gravação desfaz a jogada inteira, permitindo tentar de novo sem pagamento parcial.
- Motor próprio, campo clássico e verso enviado pelo usuário mantidos. O motor continua sendo um conjunto limitado de regras/cartas, não uma implementação completa do TCG.

Próximas etapas são loja e mercado/expansões, e 2v2 após estabilizar o 1v1. Esta versão não cria uma loja de fachada.

## v0.7.1 — recuperação de rede na inicialização

Falhas transitórias de DNS/conexão (`ENOTFOUND`, `EAI_AGAIN`, resets, timeout e HTTP 502/503/504) aguardam dentro do processo e repetem após 5, 10, 20 e depois 30 segundos. O login usa um Client novo a cada tentativa, pois discord.js destrói o Client quando o login falha. O registro dos comandos também tenta novamente após falhas transitórias, sem bloquear o cliente já conectado. Token inválido, permissões e erros desconhecidos não entram nessa repetição. Os logs informam apenas operação, código do erro e intervalo, sem corpo de requisição ou credenciais.

Isso evita um ciclo de encerrar/recompilar o bot por uma falha temporária. Não altera DNS do servidor, não ignora TLS e não resolve uma indisponibilidade persistente da rede da hospedagem. Considere o bot conectado somente após o log `online como ...`, e os novos comandos disponíveis após o log de registro.

## Engine clássica — marco de efeitos (branch `classic-engine-foundation`)

Este marco amplia o motor antes de fechar os decks e retratos definitivos dos duelistas. **Não indica suporte integral ao anime ou ao TCG.** O formato adaptado mantém 4000 PV, 3 zonas de monstro, 3 zonas de Magia/Armadilha e 20–30 cartas no Deck Principal, sem Skills.

### Efeitos de monstro efetivamente habilitados

| Carta | Evento | Operação |
| --- | --- | --- |
| Man-Eater Bug (54652250) | FLIP | Escolhe um monstro de qualquer lado e destrói |
| Hane-Hane (07089711) | FLIP | Devolve um monstro ao dono |
| Magician of Faith (31560081) | FLIP | Recupera Magia do próprio Cemitério |
| Mask of Darkness (28933734) | FLIP | Recupera Armadilha do próprio Cemitério |
| Skelengel (60694662) | FLIP | Compra uma carta; falha obrigatória pode causar derrota |
| Cannon Soldier (11384280) | Ignição | Tributa um monstro (inclusive si mesmo) como custo para causar 500 de dano |

Os alvos são selecionados na ativação, antes da janela de resposta; efeitos não selecionam automaticamente novos alvos depois da resposta. Custos de Tributo são pagos antes da corrente, não reembolsáveis se o efeito não resolver. Em batalha, efeitos FLIP são ativados após o cálculo de dano, inclusive quando o monstro é destruído pelo combate.

### Como experimentar no Discord

Use **`/duelo laboratorio`** com um perfil válido. A partida virtual inclui onze monstros de efeito clássicos (os seis anteriores, Sangan, Bruxa da Floresta Negra, Jinzo, Ventríloco Misterioso e Tomate Místico), além de Bloqueador de Magia, Sete Ferramentas do Bandido, Pote da Ganância, Raigeki, Tufão Espacial Místico, Campo e Polimerização; mantém abertura de Fusão para demonstração. Nenhuma carta é adicionada ou removida da coleção. O comando antigo **`/duelo treino_fusao`** continua disponível com esse mesmo baralho de laboratório.

Para instalar as alterações no bot hospedado, atualize o código da branch aprovada, compile e reinicie o processo, e registre os novos comandos slash no Discord. Commits no GitHub não atualizam automaticamente uma instância em execução.

### Escopo pendente

Ainda faltam diversas outras famílias clássicas de efeitos (sobretudo efeitos rápidos de monstros, casos complexos de corrente, regras de simultaneidade e suporte às cartas restantes). Gatilhos do Cemitério, Magias Rápidas, custos, Armadilhas de Resposta e efeitos contínuos possuem apenas um primeiro conjunto de implementações auditadas. A IA de duelo usa heurísticas e não substitui uma implementação completa das regras. Antes de migrar esta branch para `main`, executar `npm ci`, `npm run check`, `npm test` e aceitar manualmente um duelo com dois clientes Discord, incluindo alvos, cartas ocultas e efeitos em combate.

### Acompanhamento da engine e do próximo layout

O escopo de cada fase e as porcentagens fundamentadas por entrega estão em [ENGINE_PROGRESS.md](ENGINE_PROGRESS.md). Após `npm run build`, use `npm run progress` para mostrar percentual concluído/restante da engine e do redesign, cobertura **real** do lote histórico e número de monstros de efeito jogáveis.

A versão atual incorpora Sangan e Bruxa da Floresta Negra: ao irem **do campo para o Cemitério**, podem buscar um monstro elegível no Deck com ATK/DEF até 1500, com limitação por nome e bloqueio temporário de ativação dos efeitos do card buscado. Há testes de busca depois da corrente, Tributo, batalha, proprietário verdadeiro e privacidade da escolha.

### Efeito contínuo: Jinzo

O Jinzo com face para cima bloqueia a ativação de Armadilhas de ambos os jogadores e nega efeitos de Armadilha no campo durante a resolução de correntes. Seu bloqueio é recalculado conforme o estado do campo; monstros virados para baixo não o aplicam, e a remoção de Jinzo devolve acesso às Armadilhas. O laboratório pode testar esse caso sem conceder cartas. A base está em `src/monsterEffects.ts`, a execução em `src/duelEngine.ts` e os cenários em `tests/classicContinuousEffects.test.cjs`.

### Armadilhas de Resposta e Invocações (marco de engine)

A engine agora admite **Bloqueador de Magia** (custo de descarte, negar ativação de Magia), **Sete Ferramentas do Bandido** (pagar 1000 PV, negar ativação de Armadilha) e correntes que negam outros elos. Armadilhas comuns não podem ser acorrentadas à Velocidade 3, e os custos permanecem pagos quando um elo é negado. **Ventríloco Misterioso** dispara efeito de ganho de PV quando outro monstro é Invocado por Invocação-Normal ou Virar, sem disparar ao próprio entrar em campo ou a um simples virar durante batalha. Os três cards entram no laboratório virtual sem alterar o inventário real.

O escopo e o percentual atualizado por entregas estão documentados em [ENGINE_PROGRESS.md](ENGINE_PROGRESS.md). Validação: `tests/classicCounterTraps.test.cjs`, `tests/classicSummonTriggers.test.cjs` e `npm run progress` no GitHub Actions.

### Destruição por batalha e Invocação-Especial do Deck

**Tomate Místico** (83011277) é a primeira carta do laboratório que pode recrutar outro monstro diretamente do Deck quando é destruído por batalha e enviado ao Cemitério. Só permite monstros TREVAS com até 1500 ATK; o jogador também pode recusar. A engine diferencia esta causa de destruição da causada por custos/efeitos e considera o verdadeiro dono da carta. Os cenários em `tests/classicBattleRecruiters.test.cjs` são executados automaticamente. O marco atual está em **78% engine / 22% restantes** e **56% do redesign Azure / 44% restantes**, conforme [ENGINE_PROGRESS.md](ENGINE_PROGRESS.md).

## Arena Azure e avanço do motor — 2026-10-24

A reformulação funcional já está disponível na branch de desenvolvimento:

- Arena azul inspirada no ritmo e na hierarquia do Duel Links, com HUD dos duelistas, PV, três zonas, indicador de fases e de respostas, mão privada e retratos dos NPCs.
- Fotos de perfil dos jogadores que possuem imagem cadastrada agora aparecem no HUD do duelo. Cartas ocultas não são incluídas no conjunto público de artes.
- A mão pode ser explorada **carta por carta**: imagem grande, nome, ATK/DEF, resumo de efeito, controles anterior/próxima, menu de ações legais da carta e retorno ao painel. A permissão é verificada pelo servidor.
- Galeria dos NPCs e editor de decks agora usam a mesma linguagem azul. Os decks *jogáveis* de Joey, Yugi e Kaiba têm **30 cartas** cada; os produtos históricos de 50 cartas permanecem somente para consulta.
- **Pote da Ganância**, **Raigeki** e **Tufão Espacial Místico** foram acrescentados ao motor e ao laboratório. Tufão é uma Magia Rápida com janela de resposta, e destruir uma Magia/Armadilha já ativada não nega automaticamente seu efeito.
- O GitHub Actions executa os testes e gera prévias PNG da arena pública e privada, ficha de duelista, carta histórica individual e editor. As prévias são anexadas como artefato **duel-azure-previews** à execução do workflow de validação. As imagens do catálogo podem aparecer como placeholders na geração offline; a execução normal utiliza o cache de arte de cartas.

### Validação, limitações e implantação

Em [ENGINE_PROGRESS.md](ENGINE_PROGRESS.md) os percentuais representam pesos fixos de entregas e não um percentual de todas as regras TCG/anime. Testes automatizados verificam componentes, regras, partidas simuladas, conservação de cartas, privacidade de mão/deck e renderização, mas **não substituem testes humanos no Discord** e não validam todas as cartas existentes.

A hospedagem não é atualizada por estes commits: é necessário implantar a branch validada, disponibilizar as dependências do projeto, registrar os comandos slash e reiniciar o bot. Não faça merge na main sem validar as interfaces em um servidor de teste.
