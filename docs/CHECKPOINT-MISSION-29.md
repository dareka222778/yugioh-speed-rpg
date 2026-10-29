# Checkpoint M29 — implantação e identidade operacional

Repositório: dareka222778/yugioh-speed-rpg. Branch: feat/rea-engine-recovery-20261026. PR #12 em rascunho, sem merge. Base validada b1388611abe6e7be79d33893f5fca5e20effefb9, CI 40825696808 aprovada, 6000 testes; v9 com 852 certificadas/autorizadas. Sempre consultar o HEAD/CI atuais antes de continuar.

O chat anterior de 25/10 parou com uma refatoração local 0.17.2 incompleta; o ambiente foi limpo por manutenção. Esse material não substitui o trabalho subsequente das Missões 1–28. Os fontes atuais foram recuperados diretamente da branch remota em 29/10.

Há acesso autenticado à instância Bot-Hosting.net 6066b24b-4658-4e99-aa9b-baa386bba09a. Backup pré-v9 consistente e fontes/configuração/retratos: data/deploy-backups/pre-v9-1793286449456. HEAD inicial do host a6ee11d6cf61a30601be8b1cff948b1136dbfea8; não presumir que esse continua online. A implantação está sendo conferida separadamente da CI. Não apagar dados ou compartilhar segredos.

Mudança nova: runtimeStatus.ts elimina a contagem literal 130 nas mensagens de ping e início, usando o resolvedor ativo, catálogo e lista positiva. Seis cenários em runtimeStatus29.test.cjs. Não altera certificações nem mecânicas; versão npm permanece 0.17.1, engine v9. Os resultados finais de CI/host precisam ser consultados antes de afirmar aprovação ou deploy; ver REA-MISSION-29.md e a entrega do chat.

Expansão M29 não concluída: 0 novas neste bloco operacional, 1110 pendentes, meta 1271 ainda a 419. Próximo trabalho independente: operações compostas nas famílias apontadas pela M28. Não contar cartas apenas importadas, não habilitar definições incompletas e não conceder coleções automaticamente. Autorização administrativa de distribuição das certificadas já existe; preservar economia e arena.

O gate de preservação da M8 inclui o bootstrap inteiro. A substituição operacional agora é revertida por um normalizador estritamente delimitado, antes da comparação com os hashes históricos originais: importação, duas mensagens e constantes substituídas. Testes verificam reconstrução byte a byte, rejeição de hooks duplicados, dotenv em primeiro lugar, detecção de alterações fora desse escopo e ausência de normalização dos resolvedores arquivados. Nenhum hash de referência foi atualizado.
