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
