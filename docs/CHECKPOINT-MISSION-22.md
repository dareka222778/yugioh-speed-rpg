# Missão 22 — primeiro bloco em validação

Base remota verificada: `a1e156504d1facbe167065b7531a2d98b49c918a`, CI 40759360105 aprovada; 782 certificados, 130 distribuíveis. Branch `feat/rea-engine-recovery-20261026`, PR #12 em rascunho.

Implementado no núcleo v9 ativo: família de Rituais de receita nominal, 15 monstros sem efeitos adicionais e suas 15 Magias. Materiais e posição escolhidos durante resolução; pagamento adiado; DP limitada valida suficiência e minimalidade, espaço, propriedade e política de Tokens. Sem segunda engine. Recuperação da escolha serializada e validação do fluxo. As versões arquivadas não foram alteradas.

Catálogo de desenvolvimento: 812 candidatos certificados por fingerprint; **admissão do lote depende da compilação, testes nativos e CI**. Não contabilizar +30 como conclusão aprovada antes dos gates. Se aprovado: +30 nesta missão, +41 desde 771, faltam 459 da meta acumulada. Meta operacional +100 ainda não atingida.

Testes locais: 150 testes da família, conjunto cruzado 200/200; 74 testes M21 também passaram após a integração inicial. Node 24 com hook TypeScript: não substitui tipagem ou SQLite Node 22. Testes nativos adicionais em `tests/ritualRecovery22.test.cjs` ainda não executados localmente por falta de dependências.

Fontes individuais e impressões verificadas: `docs/evidence/mission22-ritual-reviews.json`. Regras comuns: manual oficial https://img.yugioh-card.com/en/downloads/rulebook/SD_RuleBook_EN_10.pdf e FAQ oficial de minimalidade https://www.db.yugioh-card.com/yugiohdb/faq_search.action?fid=22879&ope=5&request_locale=ja . Tributos pertencem à resolução; negar a Magia impede a invocação (FAQ 6283). Datas verificadas são impressões elegíveis, não primeiras publicações.

Excluídos: os cinco Rituais de Efeito e respectivas receitas, enquanto seus efeitos adicionais não forem implementados; Earth Chant/Contract with the Abyss dependem da próxima extensão de filtros/exatidão; Ritual Weapon depende da admissão da nova categoria em equipamentos. Não presumir que toda carta Ritual esteja concluída.

Próximos passos: consultar HEAD/CI; corrigir falhas; executar auditoria individual de admissão e compatibilidade. Prosseguir para filtros genéricos de Ritual e seletores de recrutamento, conforme evidências. Cache M21 integral permanece na pasta irmã `mission21-text-cache`; não repetir coleta. Nenhuma alteração de economia, distribuição, layout ou Discord foi autorizada neste lote.
