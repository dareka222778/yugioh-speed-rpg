# Engine / motor de duelo — revisão funcional

> Esta seção registra a revisão funcional anterior (`e6840e1`). A refatoração
> incremental posterior, os novos módulos e as evidências atuais estão em
> [ENGINE_REFACTOR.md](ENGINE_REFACTOR.md). O sorteio das buscas agora é persistido
> e reproduzível em partidas novas; a limitação de seed descrita abaixo é histórica.

## Contrato preservado

Um motor: 4000 PV, três zonas de monstro, três de Magia/Armadilha, 20–30 cartas
principais. A arena original foi preservada sem alterações. Seu SHA-256 é
`01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c`.
O teste em `duelReview.test.cjs` protege também esse requisito literal.
Nenhum deck de NPC, conjunto inicial ou inventário foi alterado nesta revisão.
Nenhuma biblioteca nova foi adicionada. O runtime testado e usado no CI é Node 22.

## Falhas reproduzidas e corrigidas

| Problema | Correção | Evidência |
| --- | --- | --- |
| Sete Ferramentas aceitava Livro da Lua como alvo | Exige ativação real de Armadilha no último elo | `duelReview.test.cjs` |
| Magia Rápida não podia iniciar uma corrente entre ataques | Janela de batalha inclui mão própria e cartas previamente baixadas | `duelReview.test.cjs` |
| Ativar Magia na batalha podia retornar à Fase Principal | A fase de retomada é conservada | `duelReview.test.cjs` |
| Livro da Lua preservava bônus temporários e gastava a mudança manual | Um helper comum limpa bônus/uso temporário e conserva histórico de Invocação, ataque e mudança manual | `duelReview.test.cjs` |
| Sangan disparado no fim do turno era resolvido depois da próxima compra | Encerramento fica suspenso até concluir efeitos e escolhas do turno antigo | `duelReview.test.cjs` |
| Ventríloco podia perder um efeito válido ao ser destruído antes da resolução | Ativação entra na corrente da Invocação antes das respostas, com fonte/controlador capturados | `duelReview.test.cjs` |
| Estados corrompidos podiam chegar à execução/persistência | Contratos de estado, identidade de cartas e transição; rejeição antes de gravar ou premiar | `duelIntegrity.test.cjs` |

Os primeiros testes de revisão foram executados antes das correções: cinco dos
seis cenários iniciais falharam. O conjunto corrigido depois passou integralmente.

## Efeito rápido de monstro e cálculo de dano

Kuriboh (40640057 / CID 4064) foi habilitado com seus dados reais: Nível 1,
TREVAS, Demônio, 300 ATK / 200 DEF. Durante o cálculo de dano de um ataque do
oponente, o jogador pode descartar o próprio Kuriboh da mão para impedir seu dano
daquele combate. O efeito não protege o monstro da destruição e não protege o
próximo combate, dano de efeito ou compra obrigatória.

O custo é pago antes da resolução e fica no Cemitério. Não é uma ativação de
Magia/Armadilha: Bloqueador de Magia e Sete Ferramentas não podem negá-lo. A IA
usa informações públicas do atacante e seus próprios monstros para evitar
gastar Kuriboh quando não receberia dano. O bloqueio de nome de Sangan é respeitado.

As janelas agora distinguem declaração, etapa anterior ao cálculo e cálculo.
Livro da Lua/MST não são oferecidos na Etapa de Dano; os modificadores comuns de
ATK/DEF já suportados podem responder na janela anterior ao cálculo, mas não
na janela de cálculo de Kuriboh.

## Integridade e compatibilidade

`duelIntegrity.ts` verifica versão, participantes, turno, fase, prioridade,
zonas, tipos de cartas, correntes, gatilhos, PV e UID globais. Uma transição
não pode perder, duplicar ou transformar uma carta física do catálogo atual.
A conservação é global: mudar o controlador não é perder uma carta do jogo.
Geradores de fichas/transformações não estão habilitados e exigiriam ampliar
esses contratos, junto da implementação e de testes próprios.

Os campos novos são opcionais em snapshots de versão 1. O banco valida na
leitura e antes de salvar/recompensar. JSON inválido ou registro inconsistente
produz erro controlado; nada é apagado automaticamente. As transações existentes
continuam protegendo revisão, economia e recompensas únicas. Construtor,
encerramento por W.O. e abertura de partidas antigas também passam pelo contrato.

## Evidência local

- Instalação limpa com Node 22: concluída.
- Build e tipagem: aprovados.
- Suíte completa: **291 testes aprovados, zero falhas**.
- Auditoria adicional: **1.000 jogos completos**, 49.642 decisões executadas,
  3.351 restaurações de snapshots JSON, todos os UID/identidades conservados.
- Neste ambiente, a auditoria levou 6.315,3 ms; mediana de decisão 0,101 ms,
  p95 0,187 ms. Isso mede execução local da engine, sem rede ou renderização,
  e não prevê o tempo de resposta do Discord ou da hospedagem.
- Arena: arquivo original inalterado e testes visuais anteriores aprovados.

Comandos: `npm ci`, `npm run check`, `npm test`, `npm run progress`,
`npm run audit:engine`. Para ampliar carga após o build:
`node scripts/audit-duel-engine.cjs --games 1000`.
O script cria e remove seu próprio banco temporário; não abre o banco real.
Seeds controlam escolhas e aberturas, mas buscas posteriores ainda embaralham
por criptografia; uma seed isolada não é uma fita de replay determinística.

## O que ainda não foi certificado

A implementação continua na branch de trabalho e no PR em rascunho. Esta revisão
não foi implantada nem validada por uma partida real no Discord.

O fechamento abaixo resolve simultaneidade e replay no escopo registrado.
Continuam fora da certificação: negação arbitrária de efeitos de monstros,
novas categorias de efeitos/invocação, fichas e cartas não habilitadas. O catálogo
contém 121 cartas habilitadas, das quais 12 têm definições de efeito de monstro.
Isso não equivale a todas as cartas do anime clássico. Adicionar um nome ou
texto ao catálogo não implementa seu efeito. O aceite de uso real no Discord e
a implantação continuam pendentes; o PR permanece em rascunho.

## Referências primárias consultadas

- Sete Ferramentas: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4863&ope=2&request_locale=en
- Livro da Lua e timing: https://www.db.yugioh-card.com/yugiohdb/faq_search.action?cid=5432&ope=4&request_locale=ja&sort=2
- Ventríloco: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4172&ope=2&request_locale=en
- Kuriboh: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4064&ope=2


### Ordem de verificação e CI

Uma primeira execução de CI desta revisão detectou erros de tipagem mesmo com
os testes JavaScript aprovados: o compilador havia emitido JavaScript, e uma
sequência local sem interrupção imediata permitiu continuar após a falha.
Os tipos foram corrigidos e a revisão foi novamente executada com parada no
primeiro erro: tipagem sem emissão, build, suíte completa, auditoria e prontidão.
O CI mantém cada verificação como uma etapa obrigatória separada. O teste antigo
de timeout foi ajustado para criar uma escolha válida com alvo real, conservando
a verificação de que o jogador correto perde por W.O. nessa fase.

## Fechamento funcional — correntes simultâneas e repetição de ataque

Implementação principal: `src/duelEngine.ts`. Contratos serializáveis em
`src/duelIntegrity.ts`; escolhas da IA em `src/duelStore.ts`.
Evidência: `tests/duelCompletion.test.cjs` (22 cenários adicionais) e
atualização de três testes existentes cuja expectativa anterior de timing
estava incorreta. Nenhum teste foi removido.

- Grupos de gatilhos: obrigatórios do jogador do turno, obrigatórios do rival,
  opcionais do jogador do turno e opcionais do rival. O controlador ordena seus
  efeitos; alvos são escolhidos antes de respostas rápidas. A classificação
  opcional atualmente corresponde ao recrutador Tomate Místico; novas definições
  não herdam uma classificação correta sem implementação e teste.
- Sangan e Bruxa em destruição simultânea entram na mesma corrente. A busca
  pausa a resolução LIFO, conserva os elos restantes e retoma sem conceder
  janela de resposta entre buscas. Restrição de nome e limite de uso permanecem.
- Invocação por Tributo agrega os efeitos dos Tributos enviados ao Cemitério
  aos gatilhos da Invocação; Baixar por Tributo também ativa o gatilho antes
  de respostas rápidas. Efeitos de custo de Soldado Canhão aguardam sua corrente.
- FLIP de Invocação-Virar entra na corrente antes de Tributo Torrencial; sair
  do campo depois da ativação não apaga o efeito.
- Tomate Místico é aceito ou recusado na ativação. Uma vez ativado, a seleção
  da Invocação ocorre durante a resolução; não há uma segunda opção de cancelar
  um efeito já ativado. Snapshots antigos continuam aceitando seu formato legado.
- O marcador da Etapa de Dano atravessa gatilhos FLIP e recrutadores. Não permite
  Livro da Lua, Tributo Torrencial ou modificadores comuns fora da janela legal.
- Quando o conjunto de defensores muda antes do dano, o atacante escolhe novo
  alvo, ataque direto ou cancelamento. Cancelar consome o ataque; repetir não é
  uma nova declaração. Trocar apenas a face/posição do defensor não dispara replay.
- A ordem de gatilhos, uma corrente pausada e a decisão de replay foram
  gravadas no SQLite, reabertas em outro processo Node e retomadas pela API real
  de ações. Uma revisão antiga do painel é recusada. W.O. identifica o decisor.

Os testes de replay que introduzem/removem defensores durante a declaração
montam explicitamente essa alteração de estado: o catálogo atual não oferece
todas as famílias de efeitos rápidos que poderão produzir tais cenários.
A auditoria de 1.000 partidas terminou por PV; W.O. e falta de compra são
verificados em testes específicos da suíte, não atribuídos a essa amostragem.

Referências de ordem e timing: rulebook oficial v10, páginas de Replay Rules e
Multiple Cards with the Same Timing, e diagrama oficial de efeitos rápidos:
https://img.yugioh-card.com/en/downloads/rulebook/SD_RuleBook_EN_10.pdf
https://www.yugioh-card.com/en/play/fast-effect-timing/

A arena e `src/duelUI.ts` não foram alterados. Nenhum banco de jogadores foi
modificado pela auditoria. Não houve implantação, merge nem publicação no bot.
