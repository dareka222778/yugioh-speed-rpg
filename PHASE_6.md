# Fase 6 — equipes clássicas 2v2, versão 0.15.1

## Estado atual

A implementação jogável está disponível para quatro humanos, com efeitos, decks próprios ou emprestados e persistência. A homologação de uma partida por quatro pessoas reais no Discord e a aceitação visual em celular continuam pendentes. Testes automatizados não substituem esses dois critérios. A engine continua limitada às 130 definições habilitadas do RPG; não abrange todas as cartas do anime/TCG.

## Como jogar

Para experimentar sem reunir outras três pessoas, use `/dupla treino`: você e Yugi enfrentam Kaiba e Joey. A opção `deck` permite escolher um clássico emprestado ou seu deck ativo. Os três NPCs usam o mesmo núcleo, decisões legais e estado salvo das partidas entre humanos; pausam sempre que cabe a você decidir. Uma decisão de NPC pendente após reinício é retomada automaticamente.

1. Os quatro participantes criam seus perfis com `/start`.
2. Um deles usa `/dupla convidar parceiro:... oponente1:... oponente2:...`.
3. A opção `cartas` escolhe clássicos emprestados (padrão), decks ativos próprios ou o antigo laboratório Normal. Cada convidado confirma sua participação em até cinco minutos.
4. O campo público oferece **Minha mão / jogar** e **Cemitério / zonas**. A mão é privada e tem consulta carta a carta, descrição em português e ações legais. `/dupla ver` recupera seu painel. `/dupla campo` republica o campo no mesmo servidor se a mensagem foi perdida.

Não há apostas, gastos, recompensas ou entrega de cartas. Cartas emprestadas existem somente dentro da sessão. Decks próprios são fotografados como dados no momento da confirmação de cada participante; editar um deck depois disso não altera a partida.

## Regras da adaptação

- Ordem: Azul 1 → Vermelha 1 → Azul 2 → Vermelha 2, a partir da primeira posição sorteada. O primeiro turno não tem compra nem batalha.
- Cada equipe compartilha 4000 PV, três zonas de Monstro, três de Magia/Armadilha, Campo, cemitério e banidas. Mãos, decks e Adicionais são individuais: 20–30 cartas principais, até seis no Adicional e até três cópias por carta.
- O representante ativo da equipe decide suas respostas usando a própria mão/deck e pode usar o campo compartilhado, inclusive cartas baixadas pelo parceiro. O parceiro inativo não oferece uma segunda janela de resposta. Efeitos sobre as duas mãos/decks afetam os dois representantes ativos. Efeitos de monstros do campo/cemitério são controlados pelo representante ativo da equipe.
- A troca de parceiro ocorre somente depois das respostas/gatilhos do fim do turno, imediatamente antes da compra do participante que entra. O Adicional também troca nessa transição.
- Uma carta devolvida à mão ou ao Adicional retorna ao participante que é seu dono físico. O dono inativo escolhe seu próprio descarte se receber cartas acima de sete; a prioridade anterior é restaurada depois. Uma devolução coletiva termina antes dos descartes individuais.
- Cada pessoa tem limite de sete cartas, com descarte antes da próxima compra. A equipe perde por falha de compra obrigatória, PV, desistência confirmada de qualquer membro ou W.O. de 30 minutos de quem precisa decidir. Falhas simultâneas de compra podem resultar em empate.

Estas são regras próprias de equipes do Speed RPG, não uma alegação de aderência integral ao Tag Duel oficial.

## Arquitetura e proteção dos dados

`teamRotation.ts` contém somente a coordenação serializável de quatro posições. O núcleo de regras e o registro declarativo de efeitos são compartilhados com o 1v1; a coordenação opcional não é inserida nos duelos 1v1. As reservas entram na verificação de conservação física de cartas. `tagDuel.ts` adapta ações/decisões e conserva o modo Normal das sessões antigas.

`tagStore.ts` grava estado e revisão em transação SQLite. Identificadores dos controles vinculam usuário, servidor, sessão e revisão. Cliques repetidos não executam novamente uma ação. O anfitrião fica reservado ao criar o convite; cada convidado fica reservado somente ao aceitar. Convites não podem bloquear outra pessoa sem consentimento. As reservas aceitas bloqueiam partidas simultâneas 1v1/2v2. Migrações são aditivas e foram testadas sobre uma sessão anterior à coluna de formato. Dados inconsistentes são preservados e recusados para revisão.

Publicações têm uma revisão confirmada separada da revisão do jogo. O verificador periódico retenta mensagens pendentes após falhas/reinício. Uma confirmação antiga não encobre uma jogada mais recente. O estado já salvo não depende de a edição da mensagem funcionar.

`tagRenderer.ts` mostra quatro contadores individuais sobre o campo clássico completo. A mão fica em uma imagem separada para leitura no celular; o azul identifica as equipes e os controles. O laboratório Normal mantém seu renderer azul. `tagUI.ts` inclui consultas paginadas das zonas, ocultando cartas adversárias baixadas e Adicionais dos outros participantes. Falha de imagem retorna texto e botões completos.

O arquivo do campo 1v1 permanece idêntico: SHA-256 `01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c`.

## Evidências desta versão

| Verificação | Resultado |
|---|---|
| Suíte completa | 417 testes aprovados |
| Aceitação 1v1 | 1.000 partidas, 63.120 decisões, 4.388 restaurações, conservação física |
| 2v2 clássico determinístico | 1.000 partidas, 58.507 decisões, 4.045 restaurações, conservação física |
| Definições presentes na auditoria 2v2 | 130; 47 definições com ativação explícita observada |
| Treino solo persistido | 100 partidas, um transporte humano simulado e três NPCs, conservação e economia inalterada |
| Integração 2v2 clássico persistida | 100 partidas através do mesmo adaptador de componentes e SQLite, sem alterar economia |
| Casos específicos de equipes | respostas no fim do turno, custo do representante, Adicional individual, devolução ao dono inativo, quatro mãos com excedente, empate e migração |
| Privacidade/Discord | limites de payload, bloqueio por usuário/servidor, imagens sem mãos alheias, controles com revisão |

A presença de uma carta na auditoria não prova, sozinha, todos os seus efeitos. A evidência combina os testes do núcleo por famílias com os testes específicos do coordenador e as partidas de integração. Os relatórios em `validation/` preservam esse escopo e não afirmam certificação humana.

Reprodução: `npm test`, `npm run accept:engine`, `npm run audit:tag`, `npm run audit:tag-sessions`, `npm run audit:tag-classic`, `npm run audit:tag-classic-sessions`, `npm run audit:tag-training`. No plano de hospedagem, use `npm run test:host`, que executa uma suíte por vez. A execução paralela abortou processos naquele plano; a execução sequencial completa passou.

## Histórico dos blocos implantados

- 0.11.0: lobby, quatro confirmações, ações privadas, conservação, reservas, W.O. e retomada, ainda só com Normais.
- 0.12.0: campo visual e consulta carta a carta.
- 0.13.0: publicação recuperável, republicação de arena e auditoria de sessões persistidas.
- 0.14.0: efeitos clássicos, decks próprios, Adicionais individuais, propriedade física, correntes e zonas completas.
- 0.15.0: treino solo com três NPCs, retomada automática dos NPCs e reserva de convidados somente após consentimento.

## Critério para encerrar a homologação

Uma partida completa com quatro pessoas reais, usando as respostas, a consulta de cartas e a retomada de painel em pelo menos um celular. É preciso conferir também o resultado e os controles desativados ao terminar. Sem essa evidência, não registrar “100% homologado” nem declarar as fases seguintes concluídas.

## Patch 0.15.1 — isolamento do executor de testes

O executor cria um SQLite temporário para todo o processo de testes, remove credenciais Discord herdadas e apaga somente seu próprio diretório temporário ao terminar. Cada suíte ainda pode criar seu próprio banco. Um teste de UI do 2v2 foi corrigido para declarar seu banco temporário antes de qualquer importação. Guardas verificam que um caminho de produção sentinela não é tocado, que credenciais não chegam ao worker e que falhas retornam código de saída diferente de zero. Perfis e coleções reais foram comparados ao backup e permaneceram iguais. O log de inicialização também lista os comandos realmente registrados.
