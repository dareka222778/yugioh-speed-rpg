# 0.16.2 — continuidade da fase 2 e correções verificáveis

## Base e comportamento

Derivada de e6216ca (0.16.1), a última entrega do outro chat. Inclui a cautela de NPC contra defesas ocultas, matriz das 130 cartas e correção da retomada de treino. A instância correta Bot-Hosting.net foi observada online em 0.16.0, com banco e backup íntegros; não foi necessário criar outro servidor ou reconstruir jogadores.

- Uma avaliação tática compartilhada passa a ser usada para ataque e repetição. Um atacante fraco não muda de política só porque o adversário substituiu o monstro defensor durante as respostas. A estimativa de 1600 para defesa oculta é uma heurística, sem consultar identidade, mão ou ordem de compra do rival; não é regra de combate.
- Descrição das cinco cartas FLIP distingue virar a carta de ativar o efeito após o cálculo de dano em batalha. O motor já executava esse timing; a correção é textual e possui regressão.
- Referências de certificação incluem testes específicos de Fissura (empate/ATK atual/carta oculta), Polimerização (material ausente na resolução), Pote da Ganância (compra consumida por outro elo), Sogen (elegibilidade/dos dois lados/remoção) e Tufão Espacial Místico (destruir não nega o efeito já ativado).
- Matriz identifica versão do pacote e perfil de regras. O CI gera a matriz após conferir a certificação.

Arena 1v1, regras de mão seis na Fase Final, Extra até cinco, perfis/coleções/decks e controle administrativo de concessões são preservados. Nenhuma carta nova é habilitada. A enumeração de 58 efeitos na matriz é um universo de revisão, não uma afirmação de que todos os casos já foram revisados.

## Validação

- 440 testes aprovados, zero falhas; 122 testes no gate crítico.
- 1000 partidas 1v1: 70149 decisões, 4934 restaurações, conservação física.
- 1000 partidas 2v2 clássico: 71076 decisões, 5023 restaurações, conservação física; 999 vitórias por PV e uma por falha de compra obrigatória. As 130 definições estavam presentes; 47 tiveram ativação explícita observada.
- 100 partidas clássicas persistidas pelo adaptador de componentes e 100 treinos solo com três NPCs; conservação física/econômica e liberação das reservas.
- Matriz: 130 cartas, 58 com efeitos para revisão, zero referências exclusivamente indiretas entre elas. Zero referências indiretas não significa cobertura completa.
- Renderer 1v1 preservado: SHA-256 `01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c`.

Não equivale a uma partida real com quatro pessoas nem à aceitação visual em celular. A fase 2 continua em andamento; o importador histórico e as expansões não foram entregues neste bloco.

## Implantação

Backup consistente da 0.16.0 verificado no Bot-Hosting.net antes da atualização; comandos do Discord consultados e evento restrito a administrador confirmado. Implantação exige testes isolados no host, comparação de perfil/coleção/decks ao backup, reinício normal e confirmação do novo log. Não criar instância vazia nem restaurar um banco antigo sobre dados atuais. Esta entrega não modifica o esquema do banco nem o perfil serializado de regras.
