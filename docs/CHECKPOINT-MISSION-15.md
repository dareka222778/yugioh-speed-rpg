# Checkpoint persistente — Missão 15

Branch: `feat/rea-engine-recovery-20261026`; PR #12 deve permanecer em rascunho. Base recebida: `2e21d40724341db91bb9a03e3500641fc46f9302`. Não usar o workspace antigo como fonte de envio.

Workspace desta sessão: `C:\Users\Micro\Downloads\speed-rpg-rea-20261026\repo-mission15-2e21d407`. Ele foi materializado dos blobs remotos e não contém checkout Git utilizável. Os commits foram criados pela API Git Data, com atualização condicional do HEAD e sem force. Em uma nova sessão, preferir checkout/worktree real da branch remota; conferir alterações posteriores antes de aplicar qualquer arquivo local.

## Estado técnico

- Ativa: engine-v7; 741 certificados; 130 distribuíveis. Candidata experimental: engine-v8, 46 módulos, revisão inicial `d84815dc2001064ba69b0fec719fc41495f78561d0438f16d6a0ee19357d4ee3`, também com 741 cartas.
- Oito efeitos novos estão implementados como candidatas declarativas e testados com admissão sintética somente nos testes. **Nenhuma carta nova foi certificada ou distribuída. Não copiar esses certificados de fixtures para o registro real.**
- Não promover a v8 automaticamente. Faltam integração da IA, revisão/admissão individual, extensão de catálogo e validação 2v2 v8.
- Backups novos incluem v7/v8; backups de formato 1 apenas v7 continuam suportados. Stores, banco, regras e módulos v1–v7 permanecem byte a byte na base.
- Auditoria dos decks NPC corrigida para cinco cartas no Adicional e limite de cópias.
- 37 testes da família, quatro da auditoria NPC, dois testes SQLite e um de diagnóstico novos. Seleção local final de 58 testes aprovados no Node 24; não substitui a CI Node 22 nativa.

## Commits e evidências já observadas

1. `d6b73d10`: corrige expectativa obsoleta de distribuição da Missão 14. CI **40629958472** concluída com sucesso, incluindo ambos os jobs; job principal com 5.178 testes, zero falhas/TODO.
2. `08071cbc`: infraestrutura v8 experimental e primeiros testes de destruição filtrada.
3. `9658585f`: backup SQLite com catálogos v8 e compatibilidade antiga.
4. `1b925bb3`: isolamento de schema, candidatos, auditoria NPC, preservação e benchmark. CI **40631948178** aprovou a suíte de 5.203 testes, mas o job principal falhou posteriormente em `accept:engine`. O erro original ocultou o trecho relevante do TAP; isso não foi declarado como CI aprovada.
5. `7e08350b`: amplia testes individuais para negação/replay, dono e fichas; pesquisa pública e validação estrita do efeito.
6. `843a43ea`: cargas SQLite opcionais de 50/100 sessões incluindo v8 em 1v1 e preservando as cargas anteriores.
7. `49fae2f3`: captura e publica TAP completo se a aceitação crítica falhar; preserva todas as verificações.

O resultado final de HEADs posteriores deve ser consultado no GitHub. A falha de aceitação acima precisa de diagnóstico efetivo; sucesso da suíte completa não a invalida. A etapa diagnóstica antecipada executa a aceitação antes das cargas/relatórios, mantendo também a execução final existente, para distinguir falha reproduzível de interferência posterior.

Atualização observada: o job principal **122631736846**, CI **40632450832**, commit `843a43ea`, terminou aprovado com **5.221 testes, zero falhas/TODO**, tipagem, aceitação e cargas SQLite de 50/100 sessões com oito versões. A falha anterior não reapareceu; sua causa continua não recuperada. Auditoria REA: 23 passaram, uma cobertura parcial (I02). Métricas e proveniência: `docs/evidence/mission15-validation.json`. Não confundir esse resultado com aprovação automática de commits posteriores; o novo teste de diagnóstico acrescenta uma asserção de teste à suíte seguinte.

## Retomada verificável

1. Conferir HEAD remoto, PR e todos os jobs da CI mais recente. Não reenviar um tree baseado em SHA antigo. Identificar e preservar qualquer trabalho posterior.
2. Ler `REA-MISSION-15.md`, `docs/evidence/mission15-card-research.json` e `mission15-preserved-baseline.json`.
3. Se `accept:engine` falhar, ler o TAP completo nos logs e `artifacts/engine-acceptance-failure.tap`, identificar o teste concreto, acrescentar regressão e corrigir a causa. Não remover suítes, diminuir expectativas nem declarar a CI verde.
4. Ambiente Node 22: `npm ci`, `npm run check`, `npm test`, `node scripts/verify-resolver-archives.cjs`, `node scripts/verify-catalog-revisions.cjs`, `node scripts/audit-mission15.cjs`, `npm run accept:engine`. Manter os demais comandos da CI.
5. Executar `node scripts/stress-persisted-duels.cjs 50 2 --mixed --candidate-v8` e variante `100 2`; conferir oito versões, conservação/economia, duplicatas, reinício e SQLite íntegro. A v8 nesses cenários é 1v1; 2v2 permanece v7. Não confundir benchmark com Discord real.
6. Consolidar a revisão regional individual e as divergências de datas importadas. A impressão OCG de Eradicating Aerosol foi recuperada posteriormente por fonte oficial indexada/calendário (22/07/1999, Vol.4); não repetir a busca já resolvida. Não alterar o histórico congelado.
7. Implementar avaliação da IA para a nova operação, testar cada carta com suas interações, concluir a admissão real e criar revisão v8 por dados. A lista positiva de distribuição continua fechada. Uma futura atualização legítima dos arquivos correntes de metadados/certificados requer atualizar explicitamente a auditoria da Missão 15, preservando todos os 741 anteriores e os artefatos imutáveis.
8. Somente depois promover a v8, com saves/ações pendentes e 2v2 cobertos. Avançar pelos grupos da Missão 13. Não criar outra versão de resolver para simples cadastro de efeitos já expressáveis.

## Homologação e limites

O fluxo existente aceita proprietário sozinho contra IA, depois convidados e beta fechado. Nenhum login real foi feito. Configuração isolada, autorização específica de SHA/alvos e credencial segura são necessárias antes do acesso real. Referência de hospedagem atual: 2 GB RAM, 100% CPU e 8 GB; nenhuma capacidade real de jogadores foi certificada.

Não houve merge, deploy, alterações de produção, distribuição de cartas, mudanças de layout/imagens nem reconstrução artificial dos dados ausentes de I02. Não encerrar a continuidade como catálogo completo: este ciclo entrega uma candidata técnica ainda não promovida.
