# Checkpoint persistente — Missão 15

Repositório dareka222778/yugioh-speed-rpg, branch feat/rea-engine-recovery-20261026, PR #12 em rascunho. Base recebida: 2e21d40724341db91bb9a03e3500641fc46f9302. **Não restaurar o antigo estado v7 por cima desta integração.**

O desenvolvimento agora usa engine-v8, 749 certificados e a mesma lista positiva de 130 distribuíveis. Oito cartas foram revistas e executaram cinco cenários individuais cada: Exile of the Wicked, Acid Rain, Eternal Drought, Breath of Light, Warrior Elimination, Eradicating Aerosol, Eternal Rest e Last Day of Witch. Nenhuma foi concedida ou liberada na loja.

Workspace desta sessão: C:\Users\Micro\Downloads\speed-rpg-rea-20261026\repo-mission15-2e21d407. Foi materializado dos blobs remotos; não possui checkout Git utilizável. Commits foram criados pela API com atualização condicional do HEAD, sem force. Em outra sessão, preferir checkout/worktree real da branch e conferir alterações posteriores antes de aplicar arquivos locais. Não usar o workspace antigo repo como fonte de envio.

**Estado preservado**

- v1–v7: 231 módulos e sete manifestos; todos os artefatos v7 permanecem intactos.
- v8: 46 módulos e manifesto congelados no primeiro bloco, conferidos contra 043f93818cc839b4a955c7c84618553183449c06. A admissão posterior não alterou esses arquivos.
- Catálogo v8 inicial de 741: d84815dc2001064ba69b0fec719fc41495f78561d0438f16d6a0ee19357d4ee3.
- Catálogo v8 aditivo de 749: e301765da8535ac4462932bbb64d6f5c2d8fe6f15461d236c89bc8325819a8c6.
- Hooks/dados correntes revisados em duelStore, cardMetadata e cardCertifications. O normalizador confere o restante byte a byte e rejeita alterações arbitrárias. Não remover essa proteção nem regravar revisões imutáveis.
- Backups v7 antigos e v7/v8 novos continuam suportados. O novo hook do store é apenas tático; persistência/receipts/economia não foram reescritos.

**Resultados observados e CI**

d6b73d10 corrigiu a expectativa antiga da Missão 14: CI 40629958472 aprovada, 5.178 testes. O primeiro bloco opt-in teve CI 40633941602 aprovada em ambos os jobs, com 5.222 testes e soak prolongado.

A integração foi consolidada no commit **2fc28f01b664fdd474b1e42cca08fddb6237af36**: **CI 40638667535 aprovada em ambos os jobs, 5.290 testes, zero falhas/TODO**, tipagem, compilação, auditorias e SQLite. As oito cartas passaram a auditoria individual. Os 23 cenários REA passaram com uma cobertura parcial (I02). Cargas de 50/100 sessões ativaram todas as oito cartas; soak com oito versões completou 5.481 duelos em 601,3 segundos. Conferir sempre CI de HEADs posteriores, inclusive commits de consolidação.

Falhas intermediárias foram corrigidas sem desabilitar testes: formatos de certificados continuaram JSON estrito para auditores anteriores; contratos de novos duelos passaram a v8, mantendo testes explícitos v7; fixtures de resposta receberam descarte disponível para Magic Jammer; contagem de versões da auditoria beta passou a oito; cobertura passou a receber a definição inteira, com filtros. Evidências completas em mission15-validation.json.

Os diagnósticos de aceitação foram fortalecidos após uma falha intermitente cujo TAP foi truncado. Ela não reapareceu nas aceitações seguintes; sua causa permanece não recuperada. Não declarar esse episódio como resolvido causalmente sem evidência.

Evidências: REA-MISSION-15.md; mission15-card-research.json; mission15-individual-reviews.json; mission15-card-executions.json; mission15-preserved-baseline.json; mission15-v8-implementation-freeze.json; mission15-validation.json, todos sob docs ou docs/evidence.

**Retomada autônoma**

1. Conferir HEAD remoto, PR e ambos os jobs da CI mais recente. Preservar trabalho posterior. Se houver falha, ler TAP/log completos; não remover suítes nem relaxar regras para obter verde.
2. Node 22: npm ci; npm run check; npm test; node scripts/verify-resolver-archives.cjs; todas as verificações de preservação; node scripts/verify-catalog-revisions.cjs; node scripts/audit-mission15.cjs; node scripts/audit-mechanical-batch15.cjs; npm run coverage:engine; npm run accept:engine. Manter o restante da CI.
3. Conferir artifacts/certification-executions-mission15.json: oito linhas, fingerprints corretos, identity/mechanic/negative/replay/ai aprovados. Fixtures isolados nunca substituem esse manifesto de execução real.
4. Reproduzir cargas: node scripts/stress-persisted-duels.cjs 50 2 --mixed --filtered-spells e variante 100. As cargas normais e o soak agora abrangem oito versões; 2v2 novo usa v8. Conferir ativações por carta, conservação, economia, duplicatas, reinício e integridade. Um contador zero não pode ser relatado como efeito exercitado.
5. Não repetir pesquisa resolvida: as oito impressões pré-corte estão documentadas; Eradicating Aerosol foi confirmado no calendário oficial. Manter separadas disponibilidade TCG, OCG e união, e preservar divergências importadas.
6. Prosseguir pela triagem da Missão 13: posição/duração e fontes contínuas dependentes, depois negação/busca/recrutamento/invocações. Reutilizar operações existentes e certificar individualmente. Não editar v8 para mudar semântica já congelada; simples novos dados compatíveis usam outra revisão de catálogo.
7. Atualizar evidências, checkpoint e PR, mantendo rascunho. Não fazer merge/deploy/distribuição.

**Beta**

Proprietário sozinho contra IA já é o fluxo inicial previsto; não exigir quatro humanos. Teste real depende de configuração isolada validada, SHA aprovado, aplicação/guild/canal de testes, IDs consentidos, bloqueios de produção e credencial por mecanismo seguro com autorização específica. Nenhum login real ocorreu. Referência Starter+: 2 GB, 100% CPU, 8 GB; não extrapolar os benchmarks para capacidade de 20–50 usuários no Discord.

O catálogo clássico não está completo, localização integral permanece pendente e I02 continua limitado pela ausência legítima de dados históricos. Não fabricar registros para fechar esse caso.
