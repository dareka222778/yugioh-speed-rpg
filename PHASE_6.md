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
