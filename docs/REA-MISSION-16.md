# Missão 16 — expansão e estabilidade

Base verificada: `8bcc05f9796fdca4cee2562b26a709cd2fa7e691`, engine-v8, 749 certificados e 130 IDs distribuíveis. CI 40640461055 aprovada. PR #12 permanece em rascunho. Os 680 arquivos locais coincidiram com os blobs Git da base antes das alterações.

## Bloco operacional implementado

`scripts/sqlite-health.cjs` mede arquivos principal/WAL/SHM, páginas livres, quantidade de linhas e estimativa de payload por tabela em uma transação de leitura consistente. O orçamento e limiar são configuráveis na API. O relatório distingue payload de espaço físico e não representa todo o disco da hospedagem. A leitura percorre tabelas: executar sob demanda, sem colocar na rota de cada interação.

Uso: `node scripts/sqlite-health.cjs <banco-existente.sqlite>`. A abertura padrão é somente leitura e não cria bancos ausentes. `--checkpoint-passive` é uma operação explícita; não há TRUNCATE, VACUUM, exclusão, retenção automática ou alteração de schema. Leitores podem impedir checkpoint completo; o relatório mostra frames pendentes. Recibos, históricos e estados permanecem intactos. Um erro operacional é propagado, nunca convertido em sucesso.

O soak publica `artifacts/sqlite-health16-soak.json` antes de fechar seu banco temporário. Isso permitirá confrontar o crescimento de ~197 MiB observado na Missão 15 com a composição real das tabelas. A causa ainda não está confirmada. Purga automática foi adiada: ausência de uma política comprovada de leitura de arquivo e validade dos recibos impede excluir dados com segurança.

`scripts/repeat-acceptance16.cjs` repete as 17 suítes críticas, salvando TAP completo e stderr diretamente em arquivos, sem limite de buffer. Cada tentativa tem banco isolado, segredos Discord removidos, hashes dos testes, versão Node, duração, código de saída e sinal. O manifesto é salvo após cada execução. Falhas não interrompem a coleta posterior e tornam o resultado global reprovado. O modo concorrente é explícito. Não atribuímos causa à falha intermitente anterior sem reprodução.

## Validação inicial

Node local v24.22.1: **12 testes novos aprovados**, zero falhas/TODO, incluindo SQLite real via `node:sqlite`, rollback, leitor que fixa snapshot, writer não confirmado, reabertura e recibos conservados. O primeiro teste revelou uso incorreto de checkpoint em conexão somente leitura; a fixture foi corrigida para conexão operacional gravável. O CLI já abria gravável apenas mediante flag explícita.

A validação Node 22 completa, tipagem e integração com better-sqlite3 serão executadas na CI; o ambiente local não tem as dependências npm instaladas. Este bloco não altera certificados nem resolvers. Expansão de cartas ainda em revisão individual; nenhuma carta apenas triada foi promovida.

## Continuidade

Próximas famílias: ataque direto, modificadores por Cemitério e Tributo com dano fixo. Cannon Soldier já existe e não deve ser contabilizado novamente. Conferir efeitos secundários e as fontes completas antes de gerar certificados. Não editar os executáveis v1–v8 nem revisões imutáveis. Sem merge, deploy, acesso Discord ou distribuição.
