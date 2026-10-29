# Missão 28 — operações compartilhadas na engine ativa

## Resultado implementado

Engine v9, base `efd7575cab373d24b36633649d2b775fa70c74f6` conferida no GitHub: 832 certificadas, 832 autorizadas, CI 40807995535 aprovada. Resultado deste ciclo: **852 certificadas e autorizadas**, **20 novas**. Desde 771: **81/500 (16,2%)**, faltam **419** para 1.271. Das 1.962 identidades importadas, **1.110 permanecem pendentes**. O alvo operacional de +100 não foi atingido; não houve certificação por metadados ou contagem de aliases.

| Família | Cartas admitidas |
|---|---|
| Revelação e FLIP pós-Corrente, 4 | Book of Taiyou; Stop Defense; Desert Sunlight; Dark-Piercing Light |
| Recuperação exata de dois alvos, 2 | Salvage; Dark Factory of Mass Production |
| Movimentação de zonas públicas, 6 | Disappear; Gravedigger Ghoul; Soul Release; Miracle Dig; Soul Reversal; Backup Soldier |
| Proibições contínuas de ataque, 3 | Gravity Bind; Insect Barrier; Vengeful Bog Spirit |
| Recrutamento por filtros, 5 | Troop Dragon; Howling Insect; Pyramid Turtle; Masked Dragon; Gravekeeper's Spy |

Identidades, passcodes, textos integrais revisados e impressões regionais elegíveis estão nas três evidências `mission28-*-review.json` e em `mission28-review.json`. As datas verificadas são impressões, sem alegar primeira publicação. Dark Factory é elegível pelo OCG de 27/05/2004; sua impressão TCG de 01/10/2004 fica fora do corte. Os textos secundários foram reutilizados após verificação dos sete hashes do cache, sem tratá-los como fonte oficial.

## Operações reais

`positionOperations` enfileira FLIP somente quando o efeito realmente revela uma carta. Não produz Invocação-Virar; o construtor existente ordena gatilhos obrigatórios/opcionais por controlador depois da Corrente. A continuidade de um ataque é suspensa para permitir que o FLIP resolva antes do dano. A fonte deve continuar elegível no campo ao construir esse novo grupo. Eventos de batalha já existentes mantêm seu tratamento próprio após cálculo.

`recoveryRules` seleciona exatamente dois alvos antes da resposta, sem pagamento ou movimento antecipado. Cada alvo tem UID/época de zona e é revalidado separadamente. `selectedMovement` amplia a mesma abordagem para mínimos/máximos, confirmação, dois Cemit érios, banimento e topo do Deck, preservando o contexto da Corrente de Magias Rápidas/Armadilhas. Miracle Dig e Backup Soldier verificam suas contagens na ativação. Fusões destinadas à mão/Deck retornam ao Adicional. Não há substituição automática de alvo perdido nem destruição fictícia em um banimento.

`preventAttack` aplica filtros de Nível, Tipo/controlador e turno de Invocação. Distingue proibição de declarar de interrupção de ataque em andamento. A Invocação-Virar registra seu turno; uma revelação por efeito não o faz. Imunidades, Jinzo e perda da fonte são reavaliados. Corrigida uma falha reproduzida: a ativação de Armadilhas Contínuas escapava dos filtros de Damage Step e da resposta a velocidade 3.

As operações executam no núcleo usado por novos duelos, sem outra engine paralela. Os 277 módulos v1–v8 e revisões anteriores do catálogo foram preservados. A lista positiva inclui somente o lote efetivamente certificado, conforme autorização M28. Nenhuma coleção, recompensa, loja, imagem ou layout foi alterado.

O seletor genérico de recrutamento recupera trabalho local antigo sem substituir o núcleo atual: filtros por nome, arquétipo, Tipo, ATK ou DEF, com escolha de Ataque/Defesa. Troop Dragon e Spy são obrigatórios, os demais opcionais. Rituais/Fusões não são oferecidos ilegalmente do Deck. A IA escolhe Defesa contra uma ameaça pública superior. Saídas v9 eliminam campos raiz indefinidos para representar a seleção interrompida igualmente após serialização.

## Validação e limites

- Primeiro bloco `d79d3b30`: **5.858 testes**, zero falhas; CI **40821346740 aprovada integralmente**, incluindo soak de 600 s.
- Quatro blocos mecânicos, M26 e preservação: **216 testes direcionados e de segurança aprovados localmente**; o resumo estruturado do runner foi exercitado em quatro testes adicionais. Estes números se sobrepõem a testes da suíte global e não devem ser somados como testes exclusivos.
- Regressão histórica local ampliada: **700 passaram e uma suíte não carregou por falta de better-sqlite3**. Outra tentativa conjunta anterior: 80/81 passaram, uma falha de carregamento de sharp. O hook local remove tipos, sem substituir compilação ou testes nativos.
- O bloco intermediário teve falhas reais de integração: tipagem do contrato validado; corrupção de acentos no envio de um ajuste via PowerShell; fronteira de quebra de linha do normalizador. Foram corrigidas preservando as asserções. Os testes nativos novos de reabertura SQLite, rollback de recibo, replay idempotente e decisões da IA passaram na CI intermediária.
- `test-summary.json` e JUnit passam a registrar os contadores nativos do Node em CI, com saída compacta, sem omitir falhas ou desabilitar testes. O resultado integral do HEAD final deve ser consultado; a aprovação do primeiro bloco não aprova automaticamente os seguintes.
- Gates de identidade/admissão, distribuição, preservação M3/M4/M5/M7/M8 e arquivos históricos passaram localmente. Cada família possui gate que exige o fingerprint e os cenários efetivamente registrados pela engine pública.

Não há nova medição de Discord real, capacidade de 20–50 usuários ou homologação do beta. Resultados de carga internos devem ser lidos nos artefatos da CI, sem extrapolação para latência do Discord.

## Fila e próxima continuidade

`family-matrix28.cjs` percorre as 1.962 identidades e registra operações, assinaturas executáveis, dependências, testes e estágios. Os 1.110 restantes não ganham assinatura semântica por correspondência de palavras. As pistas sobrepostas incluem destruição (392), LP (350), posição/controle (269), duração (258), recuperação (182) e compra/descarte (142); **não são quantidades desbloqueadas**. Operações necessárias ainda não revisadas ficam desconhecidas, em vez de inventadas.

Próximas três famílias com reutilização plausível, ainda dependentes de revisão individual: busca FLIP/Invocação com filtros de Equipamento/Ritual; sequências de compra/descarte com escolhas persistidas; eventos de dano/destruição em batalha com operações compostas. As Fusões simples remanescentes têm materiais ainda não certificados: a triagem não encontrou um lote livre de 50 Normais ou Fusões que pudesse ser admitido sem essas dependências.

Hospedagem: **não implantada**. Não há ferramenta de painel autenticado disponível nesta sessão; a M27 registrou necessidade de reconectar a conta. A autorização para preparar a atualização do bot de teste é reconhecida, mas não comprova acesso nem deploy. Usar somente a versão com CI integralmente aprovada, preservar backup verificável do código/configuração/banco e testar restauração antes de substituir a instância. Sem merge, Discord real, inventários concedidos ou produção alterada.
