# Missão 26 — mudanças de posição reutilizáveis

## Estado consolidado

- Base desta sessão: `00dc8c9173ad496581c4fc4edcb97dd3f831fd4c`, já na Missão 25, com 828 certificadas e 136 distribuíveis. O resumo antigo do PR ainda descrevia apenas a Missão 21; não representa o último catálogo.
- Resultado: **832 certificadas**, **1.130 pendentes** no catálogo histórico de 1.962. Desde o baseline de 771 da missão +500: **+61/500 (12,2%)**, faltam **439**. Esses números incluem as missões intermediárias e não atribuem seus avanços à M26.
- M26: quatro novas identidades, revisadas individualmente: Earthquake, Windstorm of Etaqua, Zero Gravity e Ready for Intercepting.
- Distribuição mantida em **136**. Novo catálogo imutável: `d827809a01521f86cf5f5e432a2e8b85e7d25c1fb00953df32fb2d676bdff701`. Revisões anteriores não foram reescritas.

## Implementação

`positionRules.ts` valida o vocabulário; `positionOperations.ts` resolve grupos por controlador e face visível ou um alvo por UID. Grupos são obtidos na resolução, antes das mudanças. Imunidades são verificadas como Magia ou Armadilha. Não gasta mudança manual, não reinicia ataque nem invocação e não revela monstros ocultos.

O caso de colocar com a face para baixo reutiliza o reset do Livro da Lua e a limpeza de equipamentos. Guerreiro/Mago é um filtro público: não consulta o Tipo de cartas ocultas e exclui Fichas. A identidade de zona já existente impede que um alvo que saiu e voltou seja tratado como o original.

A operação participa da ativação e resolução de Magias/Armadilhas, textos PT-BR, validação de metadados, cobertura mecânica e gate de CI. As fontes e ressalvas históricas estão em `docs/evidence/mission26-position-reviews.json`. Nenhuma engine arquivada foi editada.

## Verificação observada

- Node 24.22.1 local: compilação aprovada e **5.812 testes aprovados, zero falhas, zero ignorados/TODO**.
- A suíte M26 tem **32 testes**: elegibilidade, certificados, restrições de ativação, dois controladores, alvos desaparecidos/ocultos, grupo na resolução, correntes, recuperação JSON, imunidade, Jinzo, Magic Jammer, Seven Tools, janela de Dano, equipamentos e interrupção de ataque.
- `audit-position-batch26.cjs`, auditoria M21, verificação de revisões, hashes dos 277 módulos v1–v8, gates de integridade M3/M4/M5/M7/M8 e `git diff --check`: aprovados.
- O binário SQLite foi compilado localmente com os cabeçalhos da versão de Node em uso. Não há dependência de um hook que apenas transpila.
- A homologação Node 22 completa depende da CI do commit enviado. A aprovação local não representa merge, deploy ou medição de Discord real.

## Retomada

Consultar HEAD e CI antes de continuar; preservar avanços concorrentes. Prosseguir por famílias completas, usando o catálogo atual de 832 e a meta consolidada de +61/500. O contador +11 do auditor M21 é apenas o lote individual daquela missão.

Próxima expansão de posição que exige fluxo de gatilhos: Book of Taiyou, Stop Defense e Desert Sunlight. Não certificá-las somente com esta operação, pois virar monstros exige enfileirar efeitos FLIP corretamente depois da resolução da corrente. Outra família de alcance: recuperação de múltiplas cartas com escolhas próprias, como Salvage e Dark Factory of Mass Production. O cache secundário completo continua fora do Git; usar os índices versionados e conferir sua disponibilidade antes de afirmar que foi recuperado.
