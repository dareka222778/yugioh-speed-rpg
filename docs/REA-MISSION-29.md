# Missão 29 — expansão por famílias e implantação incremental

## Bloco de combate em validação — 29/10/2026

Base operacional confirmada: `55d4a2e5a3889f9c8d1041a232116ae9aece261c`, 852 cartas. Este bloco acrescenta **26 cartas**, levando o candidato a **878 certificadas e autorizadas**, sem conceder inventário. A meta de pelo menos 100 novas cartas nesta missão e as metas de 1271/1962 continuam abertas: faltam 74 para o primeiro lote agregado, 393 para 1271 e 1084 identidades históricas.

O vocabulário de combate agora cobre dois ataques (contagem persistida, sem soma indevida), perfuração, redução/duplicação de dano, proteção de destruição em batalha, custo de PV por ataque, bônus durante a Etapa de Dano/cálculo, ataque direto concedido por equipamento, contagem de equipamentos e condições sobre posição/mão/zonas da fonte. As regras são dados em `combatBatch29.ts`; execução e validação ficam em `combatEffects.ts`, `combatRules.ts` e na camada contínua. A interface continua consumindo ações legais.

Fontes: texto integral atual de cada carta foi conferido no banco oficial da Konami; URLs, hashes e impressão anterior ao corte constam em `docs/evidence/mission29-combat-review.json`. Para cartas exclusivas do OCG no período, também foi conferida a impressão japonesa. A interpretação segue o texto atual na adaptação Speed RPG; o catálogo histórico determina elegibilidade, não uma reprodução do rulings de 2004. Não foi utilizada classificação automática por palavras-chave para conceder certificação. Arquivos brutos de fontes externas não integram a implantação.

Decisões verificadas em perguntas oficiais: Pedágio afeta jogadores e acumula por cópia; Soldados Insectos do Céu ganha ATK somente na Etapa de Dano; negação de ataques múltiplos antes da Etapa de Dano interrompe o ataque adicional, mas negação durante essa etapa não interrompe o combate. As páginas de perguntas são, respectivamente, `faq_search.action?cid=4896&ope=4&request_locale=ja`, `?cid=4484&ope=4&request_locale=ja` e `?ope=5&fid=11046&request_locale=ja`, no banco oficial.

Meteoro Perfurante e Espadachim Amazonesa ficam fora deste lote: conflito de destinatários de perfuração e reflexão exigem regras e testes próprios. Não foram reduzidos a um efeito aproximado. Os esquemas só aceitam as variantes implementadas. Proteção contra dano não impede destruição; proteção contra destruição não zera dano. Os cálculos ocorrem antes de remover fontes/equipamentos destruídos em batalha.

A suíte própria executa 173 testes, com pelo menos seis cenários por carta: identidade, resultado mecânico, restrições, serialização, negação/remoção e ação inválida sem mutação. Também testa acúmulo de custos, imunidade, fontes dos dois jogadores, atributos na revelação, dano zero/perfuração e reabertura de contagem no turno seguinte. A auditoria `audit-combat-batch29.cjs` compara revisão, certificado e resultados reais por fingerprint; é obrigatória na CI. As revisões anteriores do catálogo são preservadas, e o gate de preservação histórica remove apenas as adições delimitadas deste bloco, sem atualizar hashes de referência.

**Estado de implantação deste bloco:** pendente de CI e de verificação na hospedagem. O bot verificado anteriormente continua em 852 até a implantação confirmada. Layout, economia e regras de formato permanecem fora deste bloco.

---

# Histórico do primeiro bloco operacional

Base conferida no GitHub: `b1388611abe6e7be79d33893f5fca5e20effefb9`, PR #12 em rascunho. CI `40825696808` concluída com sucesso. A engine ativa é v9; há 852 cartas certificadas/autorizadas, 1110 identidades históricas pendentes. Esta entrega não certifica novas cartas: a expansão da Missão 29 e a meta 1271 permanecem abertas.

## Defeito operacional corrigido

O código do comando `/ping` e do log de inicialização tinha a expressão literal “130 cartas”, apesar do catálogo com 852. `runtimeStatus.ts` agora obtém a versão do resolvedor e a lista de cartas diretamente da fachada executável ativa, além do identificador do catálogo e da interseção com a lista de distribuição autorizada. As duas mensagens compartilham o mesmo resumo. Uma consulta a um catálogo antigo durante uma partida não pode reduzir os números públicos do processo.

Seis cenários próprios verificam identidade real, consistência entre ping/início e independência do contexto histórico. Nenhum efeito, arquivo de resolvedor arquivado, inventário, recompensa ou layout de duelo foi modificado. A versão npm continua 0.17.1, como na base; versão da engine, hash do catálogo e commit são os identificadores desta implantação.

## Procedimento de implantação autorizado

Instância existente Bot-Hosting.net, Node 22.23.4, 1 GB RAM/50% CPU e 2 GB de disco. Conferência inicial: commit `a6ee11d6cf61a30601be8b1cff948b1136dbfea8`, branch classic-engine-foundation; processo antigo com 130 cartas, um jogador. Nenhum segredo é copiado para o repositório ou para o relatório.

Backup local no host: `data/deploy-backups/pre-v9-1793286449456`, com cópia consistente do SQLite conferida por integrity_check, fontes anteriores, metadados, configuração e retratos quando existentes. Configuração e banco permanecem apenas na hospedagem. A referência de rollback é o commit anterior; restaurar código não deve restaurar automaticamente o banco nem apagar progresso posterior.

O host é fixado no commit aprovado, sem substituir dados ou configuração. Regressão completa isolada no Node 22, checagem de certificados e hashes dos arquivos históricos antecedem reinício normal. Após reinício: conferir resumo ativo, conexão e registro de comandos; comparar banco com o backup e executar uma verificação funcional isolada 1v1/2v2. CI e implantação são evidências separadas. A conclusão e os resultados observados devem ser registrados no relatório de entrega, sem inferir deploy somente da aprovação da CI.

## Escopo e próximos lotes

852 certificadas, 852 autorizadas, zero concedidas automaticamente por esta entrega. Desde 771: +81; faltam 419 para 1271. As contagens não são progresso de prontidão do beta. A auditoria histórica ainda tem suas lacunas declaradas; 1962 são identidades do recorte observado.

Após a implantação, continuar a Missão 29 a partir da v9, com operações compostas e certificação por família. Candidatos do checkpoint M28: buscas FLIP/Invocação com filtros de Equipamento/Ritual; compras/descartes com escolhas persistidas; gatilhos de dano/destruição em batalha. Quantidade desbloqueável depende de revisão do texto completo e execução no resolvedor, não de palavras-chave. Não recuperar a engine antiga de 130 cartas por cima desta branch.

O gate de preservação da M8 inclui o bootstrap inteiro. A substituição operacional agora é revertida por um normalizador estritamente delimitado, antes da comparação com os hashes históricos originais: importação, duas mensagens e constantes substituídas. Testes verificam reconstrução byte a byte, rejeição de hooks duplicados, dotenv em primeiro lugar, detecção de alterações fora desse escopo e ausência de normalização dos resolvedores arquivados. Nenhum hash de referência foi atualizado.
