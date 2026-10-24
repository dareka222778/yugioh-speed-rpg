# Fase 4 — Motor básico 1v1 (v0.6)

> **Observação de versão (2026-10-24):** esta seção é o registro histórico do protótipo v0.6, não uma descrição exaustiva da branch atual. Na branch classic-engine-foundation existem efeitos FLIP, Ignição, Cemitério, destruição em batalha, Armadilhas de Resposta, Magias Rápidas, Jinzo, cartas de busca e duelos NPC de 30 cartas. Veja ENGINE_PROGRESS.md e o capítulo atual do README.md. O jogo continua uma **adaptação própria**, não um simulador integral de torneios.

## Como jogar

1. Ative um deck válido no editor (`/deck ativar`).
2. Use `/duelo treino` para enfrentar o bot ou `/duelo desafiar oponente:...` para convidar outro jogador do servidor. Ambos precisam de deck ativo. O convite exige aceite e expira após dois minutos.
3. O campo público mostra PV, zonas, contagens e últimas jogadas. Clique em **Abrir meu painel / mão**: esse painel é uma resposta efêmera, visível só para seu dono. `/duelo ver` recupera o painel após reinício ou quando a mensagem privada não estiver mais acessível.
4. O menu privado lista apenas ações legais. Selecionar uma ação a executa imediatamente. Use Anterior/Próxima para outras ações. Monstros são identificados por M1/M2/M3, da esquerda para a direita; o campo se compacta após remoção.
5. A arena pública é atualizada após cada ação. O outro jogador atualiza seu painel privado pelo botão Atualizar quando necessário. Se a edição do campo público falhar, o estado continua salvo: tente Atualizar campo ou `/duelo ver`.
6. `/duelo sair` cancela um convite ou abre a confirmação de desistência. Só confirmar encerra uma partida ativa.

## Regras implementadas

- 4000 PV; mão inicial de quatro cartas; deck de 20–30 cartas; até três cópias, dentro da coleção. O primeiro jogador é sorteado e não compra nem entra na batalha no primeiro turno.
- Três zonas de Monstro e três de Magia/Armadilha por duelista. Compra automática nos turnos seguintes; fase principal, batalha e encerramento. Não há Main Phase 2. O início/standby é automático, pois nenhuma carta deste conjunto exige ação nessas etapas.
- Uma Invocação Normal ou Baixar monstro por turno: em Ataque com a face para cima ou Defesa com a face para baixo. Níveis 5–6 exigem um tributo; a rotina também prevê dois para 7+, mas o catálogo atual não contém monstros desse nível. Invocação por tributo ocupa a mesma cota normal.
- Mudança manual de posição uma vez por turno, apenas para monstros que não entraram, mudaram ou atacaram naquele turno. Virar manualmente um monstro baixado coloca-o em Ataque. Baixar um monstro não permite virá-lo no mesmo turno.
- Um ataque por monstro em Ataque por turno. Ataque direto exige campo adversário sem monstros. Comparação ATK/ATK, ATK/DEF, empate e dano refletido são automáticos. Não há dano perfurante. Empate de 0 ATK não destrói os monstros.
- Após ações relevantes há janela de resposta. O adversário recebe a primeira oportunidade; os jogadores alternam e a corrente resolve de trás para frente após duas passagens. Quem não possui resposta legal passa automaticamente. Só as duas armadilhas deste catálogo estão disponíveis para encadear.
- Um ataque possui janela de declaração e janela de dano. Monstros baixados são revelados antes da janela de dano, permitindo o reforço de ATK/DEF compatível. Não há cartas de negação, remoção rápida ou redirecionamento neste conjunto, portanto não se oferece um sistema universal de replay/negação.
- Mão máxima de seis no encerramento: o jogador escolhe o descarte. Falhar na compra por deck vazio, chegar a 0 PV ou desistir encerra o duelo. Descartar é escolha privada; a carta descartada fica pública no cemitério.

## Cartas habilitadas

Os 24 monstros normais e as quatro cartas abaixo constituem uma lista explícita em `IMPLEMENTED_DUEL_CARDS`. Uma nova entrada no catálogo não se torna automaticamente jogável.

| Carta | Comportamento executável |
|---|---|
| Remédio Vermelho (`38199696`) | Magia Normal, recupera 500 PV. Sem teto artificial de 4000 PV. |
| Fissura (`66788016`) | Magia Normal, destrói o monstro adversário com a face para cima de menor ATK atual. Empates são escolhidos pelo ativador na resolução, depois dos reforços da corrente. Não mira monstros baixados. |
| Reforços (`17814387`) | Armadilha Normal, alvo com a face para cima ganha 500 ATK até o encerramento do turno. |
| Muralhas do Castelo (`44209392`) | Armadilha Normal, alvo com a face para cima ganha 500 DEF até o encerramento do turno. |

Magias podem ser ativadas da mão se houver zona livre, ou de uma zona onde estejam baixadas. Armadilhas precisam estar baixadas desde um turno anterior. Ambas as armadilhas podem reforçar monstros de qualquer lado, com escolha explícita. As cartas ativadas permanecem na zona durante a corrente e vão ao cemitério ao resolver.

## Persistência e privacidade

- A composição dos decks é copiada no início/convite; editar um deck depois não muda uma partida em andamento. Nenhuma carta da coleção é consumida e não há DP, XP, apostas ou recompensas nesta fase.
- Tabelas adicionais `duels` e `duel_members`. O estado JSON, revisão e vínculos são gravados em uma transação. Um jogador participa de uma sessão por vez. Um clique antigo ou repetido não executa novamente uma ação.
- Convites expirados e partidas com 30 minutos sem a decisão exigida perdem por W.O., com vitória do adversário. Um verificador roda a cada 10 segundos e também confere o prazo em cada interação. Abrir ou atualizar painel não renova o prazo; apenas uma jogada aceita o faz. O responsável é quem deve responder/decidir, que pode ser diferente do dono do turno.
- O estado inclui mãos e ordem do deck no banco do servidor, mas a projeção pública e seu renderer omitem esses dados e a identidade de cartas baixadas. O painel privado é autorizado por participante e servidor antes de anexar a mão. Logs técnicos não registram a mão nem opções privadas.
- O histórico recente guarda até 12 eventos por duelo; o banco preserva as sessões finalizadas para inspeção. Mensagens perdidas não apagam o estado. Os backups de `game.sqlite` devem incluir essas novas tabelas.

## Limites deliberados (atualizados pela Fase 4.1 abaixo)

Este é um motor próprio e limitado ao conjunto inicial, inspirado em Speed Duel; não é uma implementação integral de torneios. Há Deck Adicional de até 6 cartas e a Fusão específica descrita abaixo. Ainda não há Skills, outras Fusões, Rituais, monstros de efeito, condições alternativas de vitória, lista oficial de restrições, regras genéricas de timing ou cartas não habilitadas. O NPC é heurístico e simples; não é uma IA competitiva e decide usando a própria mão e o campo visível. Ele pode atacar um monstro baixado sem conhecer sua identidade.

## Referências verificadas

- Guia Konami: https://img.yugioh-card.com/eu/wp-content/uploads/2022/07/Speed_Duel_Guide_EN.pdf
- Tutorial: https://www.yugioh-card.com/eu/play/speed-duel-tutorials/speed-duel-tutorial-part-1/
- Remédio Vermelho: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4345&ope=2&request_locale=en
- Fissura: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4835&ope=2&request_locale=en
- Reforços: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4849&ope=2&request_locale=en
- Muralhas do Castelo: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4850&ope=2&request_locale=en

Os textos acima resumem o comportamento em português. Nenhum código de outra engine foi incorporado.


## Fase 4.1 — W.O., Campo, Deck Adicional e inspeção

- Aos 30 minutos da decisão pendente, o adversário vence por W.O.; o estado é finalizado, a revisão muda e os vínculos da sessão são liberados. O vencedor é o adversário de quem deveria agir (fase principal, batalha, resposta, escolha ou descarte). O prazo persistido sobrevive a reinícios. O anúncio automático pode levar até 10 segundos; cliques no prazo vencido já são bloqueados imediatamente.
- Partidas encerradas não têm menus/botões ativos. Painéis privados antigos não executam ações: ao primeiro clique, são substituídos pelo resultado sem controles. O bot não consegue reescrever preventivamente uma mensagem efêmera cujo token já expirou no Discord; isso não permite continuar a partida, pois o servidor também rejeita a ação.
- Deck vazio causa derrota **quando uma compra obrigatória falha**. Comprar a última carta ou simplesmente ficar com zero cartas no deck não encerra antes disso. Cemitério vazio não é condição de derrota.
- Zona de Campo separada por jogador, sem ocupar as três zonas comuns. Sogen aumenta 200 ATK/DEF dos Guerreiros e Bestas-Guerreiras dos dois lados; seu efeito só se aplica depois da resolução. Substituir sua Magia de Campo manda a anterior ao cemitério. Cada lado pode manter sua própria Magia de Campo.
- Deck Adicional separado (0–6 cartas; até 3 cópias), fora da compra inicial e da contagem de 20–30 do Principal. O editor envia automaticamente as cartas de Fusão possuídas para essa composição adicional. Editar continua sem consumir a coleção.
- Polimerização invoca **Espadachim das Chamas**, usando **Manipulador de Chamas + Masaki, o Espadachim Lendário** da mão ou campo. Materiais e Polimerização vão ao cemitério, a Fusão sai do Adicional e entra no campo em Ataque ou Defesa, sem gastar a Invocação Normal. Zona cheia impede a Fusão se os materiais não liberarem espaço. As escolhas são apresentadas antes da corrente; este conjunto não tem respostas que removam/troquem materiais. Não é uma implementação genérica de todos os textos de Fusão.
- **Cemitério / zonas** permite consultar os cemitérios, a Magia de Campo, banidas e seu próprio Deck Adicional. O Adicional do oponente permanece oculto. A lista de banidas existe, mas nenhuma das 32 cartas atuais bane cartas.
- `/duelo treino_fusao` é um tutorial separado: fornece uma composição virtual com Campo, Polimerização, os materiais e uma Fusão, com mão inicial conhecida para praticar. Não entrega essas cartas à coleção, não exige um deck ativo e não gera recompensas. Exige apenas personagem criado. Os duelos normais continuam usando somente as cartas possuídas.

Referências adicionais: Sogen https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4339&ope=2&request_locale=en ; Polimerização https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4837&ope=2&request_locale=en ; Espadachim das Chamas https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4021&ope=2&request_locale=en .

## NPCs e evento diário (Fase 5)

Use `/npc ver`, `/npc desafiar` e `/npc diario`. Prêmios são apenas de primeira vitória contra cada NPC e da primeira vitória diária no modo evento. Recompensas são automáticas e aparecem no resultado, sem botão de resgate. Repetir cliques, atualizar mensagens ou reiniciar o processo não cria outro prêmio. Desistência, derrota, W.O., PvP e os dois modos de treino não pagam. Vitória de NPC elegível é por pontos de vida ou falha de compra obrigatória.

O evento usa a data de America/Sao_Paulo e exige conclusão antes da meia-noite da mesma data. Se virar o dia durante o duelo, o bônus daquele evento expira; primeira vitória do NPC ainda é válida. Bônus e primeiras vitórias são globais por conta, não por servidor.

Joey tem uma receita de Fusão implementada; Yugi e Kaiba usam monstros normais e dois tributos para seus monstros principais. Os decks são adaptações temáticas de 20 cartas. O saldo inicial, as cartas antigas e os decks salvos são preservados; nada é distribuído só por atualizar o bot.
