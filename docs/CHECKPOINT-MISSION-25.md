# Missão 25 — buscas de cartas por fonte e zona

Estado da implementação: `engine-v9`, PR #12. O lote adiciona seis magias historicamente elegíveis e com efeitos executáveis, elevando o catálogo de 822 para **828 cartas certificadas**. O índice anterior do catálogo permanece imutável, com nova revisão de 828 cartas. Por autorização do proprietário, essas seis cartas integram a distribuição de teste: **136 liberadas** (130 históricas + 6 deste lote). As outras 692 seguem bloqueadas na lista de distribuição.

| Carta | Password | Resultado implementado |
| --- | --- | --- |
| Terraforming | 73628505 | Adiciona uma Magia de Campo do próprio Deck. |
| Reinforcement of the Army | 32807846 | Adiciona um Guerreiro de Nível até 4 do próprio Deck. |
| Fusion Sage | 26902560 | Adiciona uma cópia de Polymerization do próprio Deck. |
| The Warrior Returning Alive | 95281259 | Recupera um Guerreiro do próprio Cemitério. |
| Toon Table of Contents | 89997728 | Busca uma carta Toon do próprio Deck. |
| Emblem of Dragon Destroyer | 06390406 | Recupera Buster Blader do próprio Deck ou Cemitério. |

As escolhas são restritas às zonas do próprio jogador, revalidadas durante a resolução e não podem escolher uma carta removida do local de origem. Se a carta sair do Deck, a engine embaralha o restante do Deck; não embaralha ao recuperar do Cemitério. Um monstro não elegível, uma carta do oponente ou uma identidade forjada não podem ser alvos válidos.

## Evidências de teste

- `tests/searchSpellBatch25.test.cjs`: identificação histórica, impressão dentro do corte, fingerprints, escolhas válidas e inválidas, integridade da transição e proteção de propriedade.
- `tests/reviewedExtensions15.test.cjs`: o strip auditado da nova extensão preserva o SHA da versão histórica, sem mascarar alterações arbitrárias.
- `scripts/check-card-certification.cjs`: 828 registros, 828 certificados e nenhuma definição sem certificado.
- `catalog/engine-v9/manifest.json`: revisão congelada por hash e sem sobrescrever revisões antigas.

## Próximas ações

1. CI completa no GitHub e relatório do novo SHA.
2. Validar na CI que a distribuição beta de seis novas cartas não expõe nenhuma carta não certificada e preserva os 130 IDs históricos.
3. Continuar por famílias de efeitos completas e realmente reutilizáveis. A quantidade de cards importados sem efeito não conta como implementação.

Não houve mudança no layout, nem merge ou deploy automático nesta entrega documental.
