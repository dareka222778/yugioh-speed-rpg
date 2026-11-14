# Missão 23 — operações econômicas com escolha (checkpoint local)

Este checkpoint está **somente na cópia de desenvolvimento** e não equivale à homologação geral nem a um deploy.

## Implementação

- Base remota consultada: `36fb0f872f60d275ee9607987d907c38965387f0` (`engine-v9`, 815 certificadas).
- Novas identidades: Mooyan Curry (`58074572`, escolhe qual jogador ganha 200 PV) e Poison of the Old Man (`08842266`, Magia Rápida com escolha entre ganhar 1200 PV e causar 800 de dano).
- Operação genérica `choiceSequence` utiliza o executor econômico existente e grava a opção da ativação na corrente; não depende de um resolver novo por carta.
- A detecção de Magia Rápida passou a consultar a ativação parametrizada, preservando a restrição de uso no turno em que foi Baixada.
- O Ladrão Goblin foi explicitamente excluído do novo lote por já estar certificado em uma missão anterior.
- Nova revisão imutável `engine-v9`: `695993578437c6b7bb9f6fb7df0f78a6a6e8a308688d889cf9c4ba7caced5e10` (817 certificadas). Nenhum ID foi autorizado para distribuição.

## Evidências locais

- `npm run build`: aprovado.
- `node --test tests/economicBatch23.test.cjs`: 8 testes aprovados, zero falhas; inclui identidade, fingerprint, escolhas alternativas, Magia Rápida, rejeição de opções fabricadas e execução pelo duelo público.
- `node scripts/verify-catalog-revisions.cjs`: aprovado para revisões históricas v7.
- `node scripts/check-card-certification.cjs`: 817/817 certificados, 130 distribuídos.
- `git diff --check`: aprovado.
- Suítes existentes M19/M21/M22: 121 assertions passaram, mas três hooks de relatório falharam por filesystem read-only. Não evidenciam defeitos na engine.

## Bloqueio de validação total

`npm test` não foi executado: o fluxo sobrescreveria arquivos locais preexistentes em `artifacts` (observado `artifacts/certification-executions-mission19.json`). O procedimento recebeu rejeição explícita e depende de consentimento do proprietário sobre essa consequência. **Não alegar CI completa ou deploy antes da aprovação e execução.**

## Continuação

Depois da autorização, executar regressão completa, conferir CI em ambiente correto (Node 22), publicar checkpoint no PR #12, então seguir para famílias de busca e recuperação. Não mesclar nem distribuir cartas automaticamente.
