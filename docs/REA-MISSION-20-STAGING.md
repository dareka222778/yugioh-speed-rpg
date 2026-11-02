# Missão 20 — lote preparatório de efeitos compartilhados (P002–P005)

Estado: **implementação isolada, sem certificação/ativação em duelos**. Não publicar ou distribuir até o roteamento da engine nova ser concluído.

## Implementado no núcleo evolutivo

- Predicados de nome verdadeiro (`alwaysTreatedAs`) e arquétipo adicional (`archetypes`), incluindo o limite compartilhado de três cópias por nome nas regras de deck.
- Fórmulas contínuas por nome exato, arquétipo e ambos os lados do campo/Cemitério; modificador por posição e por Fase de Batalha do controlador.
- Filtros de Equipamento por nome canônico, subtipo de monstro e Nível máximo.
- Os onze cards históricos abaixo possuem definições mecânicas verificadas, mas ficam no estágio `validated`, não `certified`.

| Card | ID | Família mecânica |
| --- | --- | --- |
| Harpie Lady 1 | 91932350 | Nome sempre Harpie Lady; aura WIND |
| Harpie's Pet Dragon | 52040216 | Conta Harpie Lady em ambos os campos |
| Swamp Battleguard | 40453765 | Conta Lava Battleguard próprio |
| Lava Battleguard | 20394040 | Conta Swamp Battleguard próprio |
| Amazoness Paladin | 47480070 | Conta Amazoness próprias, inclusive si mesma |
| Dark Magician Girl | 38033121 | Conta Dark Magician/Magician of Black Chaos nos Cemitérios |
| Black Skull Dragon | 11901678 | Fusão exata e marcador Archfiend |
| Cyber Shield | 63224564 | Equipamento por nome exato, incluindo alias |
| Fusion Weapon | 27967615 | Equipamento em Fusão Nível 6 ou inferior |
| Chorus of Sanctuary | 81380218 | Campo, somente monstros em Defesa |
| Banner of Courage | 10012614 | Contínuo, somente sua Fase de Batalha |

## Verificações

- `npm run check` / `npm run build`: compilam.
- `node --test tests/mechanicalBatch20Staged.test.cjs`: **8 testes aprovados** (simulação isolada com catálogo de teste explícito).
- `node --test tests/mechanicalBatch20Staged.test.cjs tests/cardReleasePolicy.test.cjs tests/engineCoverage15.test.cjs tests/catalogPrinting8.test.cjs`: **15 testes aprovados**.
- `tests` com totais antigos de 769 foram ajustados para aceitar extensões posteriores sem mudar o conjunto de 130 cartas distribuídas.
- CI completa não executada localmente: runner de teste em ambiente somente-leitura e binário SQLite local incompatível com a versão de Node disponível.

## Bloqueios de integração

1. O entrypoint público de duelos carrega o resolvedor arquivado `engine-v8`, cujo código não contém os novos predicados. Simplesmente marcar as onze cartas como `certified` criaria uma falsa garantia de funcionamento.
2. Uma tentativa de mudança parcial de resolvedor foi bloqueada. A nova versão exige uma migração atômica completa do resolvedor, catálogo e validação antes de habilitar este lote.
3. Não houve atualização de produção, merge, deploy, Redis/SQLite reais, cartas distribuídas ou dados de jogadores.

## Retomada

Concluir uma integração atômica do novo resolvedor, criar snapshot próprio, executar testes completos (incluindo duelos de ponta a ponta), emitir certificados específicos e só então ampliar a versão disponível para beta fechado.
