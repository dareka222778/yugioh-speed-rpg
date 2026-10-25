# Fase 6 — laboratório 2v2, release 0.10.0

## Implementação funcional desta etapa

`src/tagDuel.ts` reutiliza o núcleo 1v1 para dois campos compartilhados e coordena quatro mãos e decks independentes. Os participantes alternam A1 → B1 → A2 → B2; a equipe compartilha 4000 PV e três zonas de Monstro. O dono da decisão é o parceiro ativo, inclusive durante o descarte antes da compra. Cartas conservam seus UIDs ao trocar a mão/deck ativo por reservas. O primeiro jogador não compra nem ataca no primeiro turno; posições, Tributos, combate, derrota por compra, desistência e W.O. reutilizam o motor atual.

Apenas monstros Normais certificados são admitidos. Cartas com efeito, Magias, Armadilhas e Fusões são recusadas na construção e validação do estado; nenhum efeito é simplesmente ignorado. O campo compartilhado pode ser usado pelo parceiro seguinte. Esta é uma adaptação própria de laboratório, não uma afirmação de aderência integral a regras de Tag Duel oficiais.

`/dupla simular` executa uma partida completa com quatro participantes virtuais e mostra o resultado em resposta privada. Não usa decks de jogadores, não cria sessão humana e não altera coleção, DP ou XP. Está disponível para experimentar a infraestrutura da fase 6 sem afetar os duelos 1v1.

## Evidências

- 383 testes completos, incluindo rotação das quatro posições, campo compartilhado, sete cartas no parceiro que entra, deck correto, visibilidade, serialização, ações ilegais e efeitos recusados.
- `validation/tag-normal-audit.json`: 100 duelos completos, 4317 decisões, 284 restaurações, nenhuma carta perdida ou duplicada. Sementes e posições iniciais alternadas; reprodução via `npm run audit:tag`.
- Gate 1v1 executado separadamente; a aceitação do 1v1 não é herdada pelo 2v2.

## Próximas entregas da fase 6

1. Aprovar as regras detalhadas de efeitos/controle de propriedade em equipes: devolução à mão do dono, buscas, respostas do parceiro, perdas do participante e desconexão.
2. Estender as mesmas operações declarativas às mãos dos quatro participantes e correntes com prioridade por equipe, sem remendar o motor por captura de texto.
3. Lobby persistente de quatro humanos, consentimento, reserva de decks, timeout, retomada e painéis privados para cada participante.
4. Admitir cartas por famílias apenas após testes; adicionar renderer próprio de equipes sem alterar o campo 1v1.
5. Homologar quatro clientes Discord antes de habilitar jogos humanos e economia.

**Não entregue ainda:** convites e duelos 2v2 humanos, suporte às 130 cartas no 2v2 e integração de recompensas nessa modalidade. O laboratório está implantável; estas partes permanecem deliberadamente indisponíveis.

## Bloco 0.11.0 — quatro humanos, modo de homologação

`/dupla convidar parceiro:... oponente1:... oponente2:...` cria um lobby persistido por cinco minutos; cada convidado aceita em seu próprio usuário. Todos precisam de `/start`. As equipes são anfitrião/parceiro contra os dois oponentes. A partida começa somente após as quatro confirmações, em posição inicial sorteada. `/dupla ver` recupera convite ou mão após reconexão/reinício.

Nesta etapa cada participante recebe temporariamente um baralho de 30 monstros Normais certificados. Os baralhos emprestados existem apenas no estado da sessão; nenhuma carta é entregue na coleção e não há DP/XP/recompensas. O campo 1v1 permanece intacto. `tagUI.ts` exibe as três zonas de cada equipe, PV, contagens de mão/deck, vez e prazo; a mão individual contém menus de ações legais com paginação. Identificadores vinculam usuário, sessão e revisão. Uma jogada grava o JSON inteiro em transação antes de atualizar mensagens. Cliques antigos não repetem ações. Participantes ficam reservados, impedindo duelos simultâneos 1v1/2v2. Qualquer membro pode desistir pela equipe após confirmação. W.O. de 30 minutos, descarte antes da compra e derrota por deck vazio seguem o núcleo.

Testes cobrem confirmação, isolamento de servidor/usuário, retomada, revisão, conservação, W.O., cancelamento, bloqueio entre modalidades, falha de rede após gravação e limites dos componentes. Ainda requer homologação manual com quatro contas no Discord, além de efeitos e decks próprios no 2v2. Este bloco **não conclui a fase 6 inteira**.

## Bloco 0.12.0 — campo azul e cartas ampliadas

O 2v2 tem um renderer separado (`tagRenderer.ts`), com quatro contadores individuais de mão/baralho, dois campos de três zonas, PV por equipe, cemitério, indicador da decisão e o verso enviado pelo usuário. O painel privado mostra apenas a mão de quem o abriu. A consulta de uma carta amplia a imagem e mantém a descrição em português; suas jogadas conservam os mesmos índices e revisões da lista legal. Falhas de imagem retornam o painel textual completo. Fila limitada evita várias composições simultâneas no host. O campo âmbar 1v1 não é alterado.

A versão visual segue em homologação: os testes verificam que a composição pública não carrega imagens de cartas ocultas e que a privada carrega somente a mão solicitada, incluindo cartas baixadas por parceiros. Não há certificação automatizada de aceitação estética/mobile com quatro clientes humanos.

## Bloco 0.13.0 — recuperação de publicação e partidas persistidas

Cada mensagem pública registra a última revisão publicada. O verificador periódico retenta revisões pendentes, inclusive depois de uma reinicialização, sem repetir a jogada. Uma confirmação antiga não pode marcar uma revisão nova como entregue. `/dupla campo` recupera a arena em outro canal do mesmo servidor se a mensagem anterior foi apagada. Migrações SQLite são aditivas, e sessões inconsistentes são recusadas sem apagar o estado.

`npm run audit:tag-sessions` joga 100 partidas completas usando SQLite, quatro participantes simulados e o mesmo adaptador de componentes de produção. Resultado desta entrega: 2.909 decisões, 2.909 recargas, 2.909 publicações, 120 cartas físicas preservadas por partida, 400 reservas liberadas e economia inalterada. Os testes completos somam 396 casos. A validação no host usa `npm run test:host` com uma suíte por vez para respeitar os limites de processos do plano; a execução paralela naquele plano abortou um processo de teste, enquanto os testes sequenciais e o CI passaram.

Isso comprova a integração automatizada do modo Normal, não uma partida feita por quatro pessoas no Discord. Os requisitos restantes de efeitos/decks próprios e homologação humana continuam abertos; fases posteriores não devem ser declaradas concluídas enquanto esses critérios estiverem pendentes.
