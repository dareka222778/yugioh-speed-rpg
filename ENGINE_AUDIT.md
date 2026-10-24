# Engine / motor de duelo — revisão funcional

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
continuam protegendo revisão, economia e recompensas únicas.

## Evidência local

- Instalação limpa com Node 22: concluída.
- Build e tipagem: aprovados.
- Suíte completa: **268 testes aprovados, zero falhas**.
- Auditoria adicional: **1.000 jogos completos**, 49.161 decisões executadas,
  3.329 restaurações de snapshots JSON, todos os UID/identidades conservados.
- Neste ambiente, a auditoria levou 6.238,4 ms; mediana de decisão 0,099 ms,
  p95 0,194 ms. Isso mede execução local da engine, sem rede ou renderização,
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

Ainda faltam ordenação geral de efeitos simultâneos/SEGOC, replays de ataque
quando o campo muda, negação arbitrária de efeitos de monstros e outras cartas
não habilitadas. As correções de Ventríloco cobrem o gatilho obrigatório
não direcionado já registrado; não substituem todo o sistema de simultaneidade.
Nenhum desses itens deve ser anunciado como concluído por causa dos testes verdes.

## Referências primárias consultadas

- Sete Ferramentas: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4863&ope=2&request_locale=en
- Livro da Lua e timing: https://www.db.yugioh-card.com/yugiohdb/faq_search.action?cid=5432&ope=4&request_locale=ja&sort=2
- Ventríloco: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4172&ope=2&request_locale=en
- Kuriboh: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4064&ope=2
