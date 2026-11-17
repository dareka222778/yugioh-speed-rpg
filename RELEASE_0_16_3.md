# 0.16.3 — equipamentos, campos e exceções existentes

## Resultado

Corrige uma mensagem incorreta: a Magia de Campo destruída em resposta já não era aplicada mecanicamente, mas o registro dizia que tinha entrado em vigor. Agora só anuncia a aplicação se a mesma carta ainda estiver na Zona de Campo, com a face para cima. A resolução de outros efeitos não foi alterada.

A validação de estados agora recusa indicadores `resolved` de tipo incorreto e identificadores `equippedTo` inválidos, em vez de aceitar valores verdadeiros por coerção JavaScript. Campos legados que omitem o indicador continuam válidos. Estado inválido é recusado, sem tentar reescrever o banco ou remover cartas.

## Cenários novos

- Cada um dos cinco equipamentos: modificadores exatos e retomada JSON, destruição do equipamento sem destruir o alvo, dono do Cemitério correto, Livro da Lua em resposta e Tufão antes da resolução, sem bônus fantasma ou novo alvo.
- Cada um dos três campos: zona separada com três M/A ocupadas, dois campos acumulados conforme a adaptação existente, substituição por Campo baixado, destruição antes de resolver e mensagem coerente.
- Yami: penalidades em Fadas reveladas dos dois lados e exclusão de cartas ocultas.
- Destruição de Cards: zero compras não é derrota por Deck vazio, última compra bem-sucedida não é derrota imediata, contagem de mão atualizada após um elo de compra e restauração do estado.
- Escudo e Espada: somente monstros revelados no momento do efeito, bônus aditivos separados, monstros posteriores não afetados e expiração. A regra existente para duas resoluções não é modificada nem apresentada como nova homologação oficial.
- Proteção contra tipos malformados em metadados persistidos e aceitação do formato legado válido.

A suíte é referenciada nos certificados das dez cartas envolvidas. Os fingerprints mecânicos das definições não mudaram, e nenhuma carta foi promovida. Matriz segue com 130 cartas e 58 cartas com efeito no universo de revisão.

## Referência e limites

A permanência do equipamento em uma zona M/A e a perda do alvo ao virar o monstro para baixo foram confrontadas com o manual oficial Konami (seção Equip Spell Cards): https://www.yugioh-card.com/eu/wp-content/uploads/2022/07/Rulebook_v9_en.pdf . Os dois campos acumulados são a adaptação já documentada do RPG. Não se afirma conformidade com todas as regras históricas TCG/OCG, com todas as combinações nem tradução oficial integral das cartas.

## Verificação

- 466 testes aprovados, zero falhas; 26 casos novos, incluindo as regressões que falhavam antes das correções.
- Gate crítico: 148 testes aprovados.
- 1000 duelos 1v1: 70149 decisões, 4934 restaurações, conservação física de todas as cartas.
- 1000 duelos 2v2 clássico: 71076 decisões, 5023 restaurações, conservação física; 999 vitórias por PV e uma por falta de compra obrigatória. Todas as 130 definições estavam presentes; 47 tiveram ativação explícita observada.
- 100 sessões clássicas pelo adaptador de componentes/SQLite e 100 treinos solo com NPCs, sem alterar economia e com liberação das reservas.
- Registro de certificação e matriz: 130 cartas habilitadas, nenhuma nova promoção.
- Arena 1v1 SHA-256 `01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c`.

A arena, mão seis na Fase Final, Adicional cinco, inventário e controle administrativo de concessões permanecem preservados. Homologação humana 2v2/celular e importação histórica continuam pendentes.

## Implantação

Atualização incremental da 0.16.2, sem migração de esquema nem edição de coleções. Antes da ativação: backup SQLite consistente, testes isolados no host, validação somente de leitura dos estados salvos e comparação dos dados com o backup. Reinício normal; conferir versão conectada ao Discord e comandos registrados. Não restaurar um banco antigo sobre progresso atual. Scripts de testes não herdam token Discord nem caminho de produção.
