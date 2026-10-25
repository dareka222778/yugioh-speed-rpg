# Continuidade — famílias de efeitos e ampliação do catálogo

## Entrega atual

Base: `cebca4a9cd1ecb593f7b515199643275659b4ea0`.
Catálogo executável: **130 cartas**, preservando as 121 anteriores. Nove adições
usam dados e executores compartilhados; nenhuma função foi criada por nome de
carta. Perfil mantido: 4000 PV, três zonas, 20–30 cartas principais, mão inicial
quatro e sem Fase Principal 2. Layouts, versos e decks dos NPCs não foram alterados.

A inclusão comprova o comportamento implementado/testado, não a aparição de cada
carta em um episódio específico. Cartas da era clássica e inventário completo do
primeiro anime são escopos diferentes. Não há denominação verificável de “100% de
todas as cartas do clássico” neste relatório.

## Novas cartas habilitadas

| ID | Carta | Modelo executado |
| --- | --- | --- |
| 76103675 | Faíscas | 200 de dano ao oponente |
| 46130346 | Hinotama | 500 de dano ao oponente |
| 20871001 | Medicamento Azul | 400 de recuperação própria |
| 47852924 | Alma do Puro | 800 de recuperação própria |
| 46918794 | Fogo Medonho | Grupo simultâneo: 1000 ao oponente e 500 ao controlador |
| 70368879 | Goblin Inexperiente | Comprar uma; depois recuperar 1000 PV do oponente |
| 83968380 | Jarra da Ganância | Comprar uma pela ativação de Armadilha Normal |
| 14315573 | Negativação de Ataque | Contramágica: negar ataque; se conseguir, encerrar Batalha |
| 62279055 | Cilindro Mágico | Negar ataque; se conseguir, dano igual ao ATK atual do atacante |

Metadados factuais de nomes, IDs e categoria importados de
https://dawnbrandbots.github.io/yaml-yugi/cards.json
SHA-256 do agregado consultado:
`2ebff4057fb21dcc7582c0f53ab4713c80195404dd791d290d0595cb201532d6`.
Somente os campos factuais selecionados entram no repositório; o agregado e
textos integrais não são redistribuídos. Os links Konami de cada carta estão em
`src/classicExpansion.ts`. Os resumos funcionais são próprios.

## O que mudou no motor

`economicOperations.ts` executa compra, ganho de PV e grupos de dano. O dano de
Fogo Medonho é aplicado aos dois jogadores antes de verificar vitória; se ambos
chegarem a zero, há empate. Recuperação não tem teto artificial de 4000 PV.
Red Medicine, Dian Keto, Ookazi e Pote da Ganância também usam esse executor,
conservando o comportamento e as mensagens anteriores.

As operações de uma sequência são ordenadas e param quando o duelo termina.
Compra voluntária exige cartas suficientes na ativação. Se uma corrente consumir
as últimas cartas antes da resolução, a tentativa de compra perde por falta de
cartas; o ganho de PV posterior do Goblin Inexperiente não acontece. Destruir a
Jarra com Tufão não nega seu elo; Sete Ferramentas pode negar sua ativação.
Jinzo e as restrições da Etapa de Dano continuam sendo respeitados.

`attackResponses.ts` compartilha a negação de ataque. O alvo é o UID do atacante
capturado na ativação. Se ele sair do campo, ficar incapaz de atacar ou se o
ataque já tiver sido negado por outro elo, o efeito dependente não é aplicado.
Cilindro usa ATK atual, não ATK impresso, e causa dano de efeito: Waboku não o
bloqueia. Duas cópias não causam dano duplicado após negar o mesmo ataque.

A velocidade é lida da política da definição, sem uma lista fixa de nomes de
Contramágicas. Negativação de Ataque usa Velocidade 3: Livro da Lua e Armadilhas
Normais não podem responder, mas Sete Ferramentas pode. Se a negação resolver,
a Fase de Batalha é encerrada e o perfil sem Fase Principal 2 segue para a janela
de encerramento. Nessa janela podem ocorrer efeitos legais, descarte e gatilhos
de fim de turno; nenhum outro ataque é oferecido. Se a ativação for negada ou o
ataque já não puder ser negado, não se encerra a batalha por esse efeito.

A IA entende os modelos novos, evita Fogo Medonho quando o próprio dano a faria
perder e não encadeia Jarra quando isso tornaria impossível sua compra já
pendente. Não consulta cartas ocultas do rival. A IA continua heurística.

## Cobertura executável, sem porcentagem fictícia

`npm run coverage:engine` conta o roteamento do catálogo certificado e falha
caso uma carta habilitada não tenha rota conhecida. O CI executa esse relatório.

| Rota de execução | Cartas |
| --- | ---: |
| Monstros Normais por dados | 71 |
| Fusão registrada | 1 |
| Definições de monstros com efeito | 12 |
| Modelo de compra/PV | 11 |
| Modelo de destruição de monstros | 7 |
| Modelo de resposta a ataque | 2 |
| Modelo de equipamento | 5 |
| Modelo de campo | 3 |
| Exceções nomeadas | 2 |
| Handlers legados ainda a migrar | 16 |
| **Total habilitado** | **130** |

Essas categorias são rotas técnicas, não certificação de todas as interações
TCG. A pontuação manual anterior de marcos permanece em 92/100 e não foi inflada
pelo número de cartas novas. O padrão visual permanece em 47/100, sem mudanças.

## Evidências

- Build e tipagem sem emissão: aprovados.
- **334 testes**, todos os 308 anteriores mais 26 casos novos; nenhuma exclusão.
- Nove certificados novos com fingerprint mecânico e referência a
  `tests/classicExpansionFamilies.test.cjs`. O teste antigo de tamanho do catálogo
  foi atualizado para 130; as outras verificações de admissão foram mantidas.
- **1.000 partidas completas** por auditoria: 50.158 decisões, 3.402 restaurações
  JSON, sem perda/duplicação/transformação indevida de cartas físicas.
- Execução independente com as mesmas seeds reproduziu o digest de ações e
  estados `50aaa6ccc33b75c7b61f22162b65371c3a45ede536d6488b950f30cc7ee585ed`.
- Comparação com a versão anterior, usando apenas o catálogo anterior:
  **200 partidas / 8.827 transições**, ações legais e estados equivalentes na
  amostra. Ordem de decks e campos internos normalizados para isolar sorteio;
  não é prova matemática de todas as partidas possíveis.
- Corrente de Contramágica salva no SQLite, reaberta em outro processo e retomada
  pela API real; revisões antigas de painel são recusadas.
- Mesmos três decks de NPC válidos, mesma metadata factual das 121 cartas antigas.
- Renderer inalterado, SHA-256
  `01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c`.
- Nenhum pacote novo, banco real modificado, merge ou implantação no Discord.

A auditoria terminou por PV; falta de compra, empate por dano simultâneo e W.O.
estão nos testes específicos. Tempo local do motor não representa latência do
Discord nem limite de partidas concorrentes do host.

## Próximos incrementos, em ordem

1. **Modificadores e proteção:** migrar Reforços, Muros do Castelo e Waboku para
   descritores compartilhados, preservando duração e diferença entre dano e
   destruição. Adicionar cartas somente quando esses modelos forem suficientes.
2. **Movimentação e Magias/Armadilhas:** unificar Tufão, Des-Magia, Remover Armadilha
   e Retorno Gigante sem confundir revelar, destruir, devolver e negar.
3. **Invocação e controle:** extrair as particularidades de reviver, mudar controle
   e Fusão; ampliar receitas clássicas com histórico de Invocação correto.
4. **Mecânicas adicionais:** condições especiais de vitória, Ritual, negações de
   efeitos de monstro e contínuos avançados. Cada família exige regras e testes
   próprios; nenhuma fica suportada só por cadastrar suas cartas.
5. **Catálogo do primeiro anime:** auditar uma lista delimitada por aparições e
   versão de regras. Um filtro de data de lançamento não resolve essa seleção.
6. **Aceite real e implantação:** validar em Discord e no host depois da revisão
   técnica. Só então avançar no padrão visual dos comandos, preservando a arena.

## Referências de regras consultadas

- Textos oficiais: Konami Card Database, CIDs 4349, 4350, 4840, 4347, 4353, 4895,
  5210, 4804 e 5124, links individuais nos metadados.
- Fogo Medonho, dano simultâneo:
  https://www.db.yugioh-card.com/yugiohdb/faq_search.action?cid=4353&ope=4&request_locale=ja
- Cilindro, negação como condição para dano:
  https://www.db.yugioh-card.com/yugiohdb/faq_search.action?cid=5124&ope=4&request_locale=ja
- Negativação, negação antes de encerrar Batalha:
  https://www.db.yugioh-card.com/yugiohdb/faq_search.action?cid=4804&ope=4&request_locale=ja
- Ausência de Fase Principal 2 no formato de referência:
  https://www.yugioh-card.com/eu/play/speed-duel-tutorials/speed-duel-tutorial-part-1/
