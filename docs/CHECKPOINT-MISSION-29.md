# Continuidade — segundo bloco M29

Candidato: 890 cartas, +38 desde 852 (+26 combate, +12 buscas/gatilhos). Catálogo `5d886110c38bb1040970ea0cdf7508f8e0b72d37dfb348ad55a9a12531c29c13`. Suíte local: 6273 aprovados, zero falhas; 94 testes novos de gatilhos. Ainda faltam 62 para +100, 381 para 1271.

- Bloco anterior de combate: commit `0a6b1cfb315f30eed7016c3433e02dadbf8b5f73`, CI `40911254801` em execução no momento do checkpoint. Implantar esse commit somente após ambos os jobs aprovados e confirmação no host.
- Bloco atual: `triggerBatch29.ts`, `tests/triggerBatch29.test.cjs`, `scripts/audit-trigger-batch29.cjs`, revisão oficial individual em `docs/evidence/mission29-trigger-review.json`.
- A CI anterior `40910661228` passou nos 6179 testes mas falhou em auditoria histórica de distribuição. A correção encaminha a remoção delimitada das novas adições também nessa auditoria; hashes antigos não foram alterados.
- Produção anteriormente confirmada: 852 em `55d4a2e5...`. Candidato não é deploy.
- Próximas famílias: eventos de fases e efeitos de batalha, operações selecionadas múltiplas e custos. Continuar sem conceder inventário nem simplificar efeitos para atingir contagem.

---

# Continuidade — expansão de combate M29

Candidato: 878 cartas, base 852, +26; catálogo `eac6f004c7dd07d8b4312fa22147ce690fa0caa4166dfa521bfe8553f0df46cb`.

- Regras, dados, revisão oficial e 173 testes em `combatRules.ts`, `combatEffects.ts`, `combatBatch29.ts`, `tests/combatBatch29.test.cjs` e `docs/evidence/mission29-combat-review.json`.
- Gate: compilar; executar suíte completa isolada; `node scripts/audit-combat-batch29.cjs`; verificar preservação e catálogos. CI precisa passar antes da hospedagem.
- Produção confirmada anteriormente: `55d4a2e5...`, 852. Não confundir candidato/CI com implantação.
- Continuar sem parar no primeiro grupo: buscas de Equip/Ritual por FLIP/Invocação, seleções múltiplas, descarte/compra e gatilhos de batalha. Faltam 74 para +100 na missão, 393 para 1271; não habilitar cartas só por descrição.
- Seguir na branch e PR12 existentes, sem merge. Antes de cada deploy, backup consistente do banco, código/configuração no host; não conceder cartas nem restaurar banco automaticamente. Preservar arena e dados.

---

# Checkpoint M29 — implantação e identidade operacional

Repositório: dareka222778/yugioh-speed-rpg. Branch: feat/rea-engine-recovery-20261026. PR #12 em rascunho, sem merge. Base validada b1388611abe6e7be79d33893f5fca5e20effefb9, CI 40825696808 aprovada, 6000 testes; v9 com 852 certificadas/autorizadas. Sempre consultar o HEAD/CI atuais antes de continuar.

O chat anterior de 25/10 parou com uma refatoração local 0.17.2 incompleta; o ambiente foi limpo por manutenção. Esse material não substitui o trabalho subsequente das Missões 1–28. Os fontes atuais foram recuperados diretamente da branch remota em 29/10.

Há acesso autenticado à instância Bot-Hosting.net 6066b24b-4658-4e99-aa9b-baa386bba09a. Backup pré-v9 consistente e fontes/configuração/retratos: data/deploy-backups/pre-v9-1793286449456. HEAD inicial do host a6ee11d6cf61a30601be8b1cff948b1136dbfea8; não presumir que esse continua online. A implantação está sendo conferida separadamente da CI. Não apagar dados ou compartilhar segredos.

Mudança nova: runtimeStatus.ts elimina a contagem literal 130 nas mensagens de ping e início, usando o resolvedor ativo, catálogo e lista positiva. Seis cenários em runtimeStatus29.test.cjs. Não altera certificações nem mecânicas; versão npm permanece 0.17.1, engine v9. Os resultados finais de CI/host precisam ser consultados antes de afirmar aprovação ou deploy; ver REA-MISSION-29.md e a entrega do chat.

Expansão M29 não concluída: 0 novas neste bloco operacional, 1110 pendentes, meta 1271 ainda a 419. Próximo trabalho independente: operações compostas nas famílias apontadas pela M28. Não contar cartas apenas importadas, não habilitar definições incompletas e não conceder coleções automaticamente. Autorização administrativa de distribuição das certificadas já existe; preservar economia e arena.

O gate de preservação da M8 inclui o bootstrap inteiro. A substituição operacional agora é revertida por um normalizador estritamente delimitado, antes da comparação com os hashes históricos originais: importação, duas mensagens e constantes substituídas. Testes verificam reconstrução byte a byte, rejeição de hooks duplicados, dotenv em primeiro lugar, detecção de alterações fora desse escopo e ausência de normalização dos resolvedores arquivados. Nenhum hash de referência foi atualizado.
