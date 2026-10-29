# Missão 29 — primeiro bloco operacional: implantação do catálogo aprovado

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
