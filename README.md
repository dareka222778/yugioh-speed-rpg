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
