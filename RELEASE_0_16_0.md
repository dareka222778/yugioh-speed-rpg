# 0.16.0 — regras definitivas e continuidade

## Comportamento

Novas partidas usam `speed-rpg-classic-v1`: seis cartas na mão, descarte até seis somente na Fase Final do próprio turno e Adicional até cinco. Comprar, buscar, recuperar ou devolver cartas não interrompe a resolução por excesso de mão. O oponente não precisa descartar durante seu turno; no 2v2, o dono inativo recebe a própria carta e aguarda sua Fase Final.

O laboratório Normal passa o cursor e troca a mão/deck do parceiro somente no momento correto, inclusive quando precisa esperar o descarte final. Os modos com efeitos usam a coordenação já existente. A política de NPC já escolhe descartes entre as ações legais e é exercitada nas simulações.

`rulesFor` preserva os estados antigos, inclusive decisões v2 já salvas, limite 7 e Adicional 6. O banco não é convertido e coleções/decks não são apagados. Deck salvo acima do limite pode ser reduzido; não permite novas adições acima do limite. Há apenas uma Fusão habilitada atualmente: o teto de cinco não implica cinco Fusões diferentes disponíveis.

Ajuda, regras, texto operacional de compra/devolução, editor e imagem de deck mostram os novos limites. `/ping` e inicialização usam a versão do pacote, corrigindo respostas antigas que ainda anunciavam 0.10.0. O renderer 1v1 permanece intocado.

## Arquivos

Núcleo: rulesProfile, duelEngine, duelIntegrity, handFlow, tagDuel. Editor: decks, deckUI, deckRenderer. Mensagens: index, commandUI, cardText, duelUI, tagUI. Testes novos: classicRulesV1; testes de sessões v2 explicitamente mantidos. Aceitação inclui o novo perfil e executa as suítes em bancos isolados e sequência segura para o host. ROADMAP_CLASSIC consolida as próximas fases.

## Validação

- Suíte completa: 431 testes aprovados, zero falhas; 14 novos testes, com cenários para as quatro posições iniciais nos dois formatos 2v2.
- Gate crítico: 107 testes aprovados.
- 1v1: 1000 partidas, 63099 decisões, 4386 restaurações; conservação física.
- 2v2 clássico: 1000 partidas, 58508 decisões, 4045 restaurações; conservação física. As 130 definições estavam presentes; 47 tiveram ativação explícita observada. Isso não demonstra todos os efeitos das 130.
- Sessões persistidas: 100 Normais e 100 clássicas pelo adaptador de componentes, mais 100 treinos solo com três NPCs. Inventário/economia conservados e reservas liberadas.
- Certificação do registro: 130 habilitadas, sem promoção de novas cartas.
- Prévias offline renderizadas; editor mostra Adicional /5. Renderer 1v1 SHA-256 `01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c`.

Relatórios em `validation/engine-acceptance.json`, `tag-classic-audit.json`, `tag-classic-session-audit.json`, `tag-session-audit.json` e `tag-training-audit.json`. Os números dos testes determinísticos são reproduzíveis; sessões com sorteio de abertura podem ter números diferentes de decisões.

A entrega não certifica novas cartas, não implanta loja/mercado e não encerra a homologação humana. Não atribui um percentual global à engine.

## Implantação e reversão

Antes de atualizar, backup SQLite consistente, integrity_check de origem e destino e conferência do commit online. Testes usam bancos temporários e não herdam credenciais Discord. Atualização somente por fast-forward, sem reset do banco. Relatórios locais gerados pelo host são preservados antes de substituir versões rastreadas.

Reverter para 0.15.1 não é seguro depois de criar uma partida com a nova versão de regras: essa versão antiga a recusaria. Preferir um patch corretivo compatível com ambos os perfis. Em necessidade de recuperação do banco: parar o processo normalmente, preservar banco e sidecars atuais separadamente, restaurar uma cópia do backup verificado sob supervisão e verificar integridade antes de iniciar. Não executar restauração automática nem sobrescrever o único backup. O backup anterior à implantação não contém progresso criado depois dele.
