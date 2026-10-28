# Missão 16 — expansão e estabilidade

Base verificada: `8bcc05f9796fdca4cee2562b26a709cd2fa7e691`, engine-v8, 749 certificados e 130 IDs distribuíveis. CI 40640461055 aprovada. PR #12 permanece em rascunho. Os 680 arquivos locais coincidiram com os blobs Git da base antes das alterações.

**Estado corrente em validação: engine-v8, 762 certificados (+13), 130 distribuíveis e 120 testes novos locais aprovados.** As seções abaixo registram os blocos incrementais; a CI final e métricas devem ser consolidadas antes da entrega.

## Bloco operacional implementado

`scripts/sqlite-health.cjs` mede arquivos principal/WAL/SHM, páginas livres, quantidade de linhas e estimativa de payload por tabela em uma transação de leitura consistente. O orçamento e limiar são configuráveis na API. O relatório distingue payload de espaço físico e não representa todo o disco da hospedagem. A leitura percorre tabelas: executar sob demanda, sem colocar na rota de cada interação.

Uso: `node scripts/sqlite-health.cjs <banco-existente.sqlite>`. A abertura padrão é somente leitura e não cria bancos ausentes. `--checkpoint-passive` é uma operação explícita; não há TRUNCATE, VACUUM, exclusão, retenção automática ou alteração de schema. Leitores podem impedir checkpoint completo; o relatório mostra frames pendentes. Recibos, históricos e estados permanecem intactos. Um erro operacional é propagado, nunca convertido em sucesso.

O soak publica `artifacts/sqlite-health16-soak.json` antes de fechar seu banco temporário. Isso permitirá confrontar o crescimento de ~197 MiB observado na Missão 15 com a composição real das tabelas. A causa ainda não está confirmada. Purga automática foi adiada: ausência de uma política comprovada de leitura de arquivo e validade dos recibos impede excluir dados com segurança.

`scripts/repeat-acceptance16.cjs` repete as 17 suítes críticas, salvando TAP completo e stderr diretamente em arquivos, sem limite de buffer. Cada tentativa tem banco isolado, segredos Discord removidos, hashes dos testes, versão Node, duração, código de saída e sinal. O manifesto é salvo após cada execução. Falhas não interrompem a coleta posterior e tornam o resultado global reprovado. O modo concorrente é explícito. Não atribuímos causa à falha intermitente anterior sem reprodução.

## Validação inicial

Node local v24.22.1: **12 testes novos aprovados**, zero falhas/TODO, incluindo SQLite real via `node:sqlite`, rollback, leitor que fixa snapshot, writer não confirmado, reabertura e recibos conservados. O primeiro teste revelou uso incorreto de checkpoint em conexão somente leitura; a fixture foi corrigida para conexão operacional gravável. O CLI já abria gravável apenas mediante flag explícita.

A validação Node 22 completa, tipagem e integração com better-sqlite3 serão executadas na CI; o ambiente local não tem as dependências npm instaladas. Este bloco não altera certificados nem resolvers. Expansão de cartas ainda em revisão individual; nenhuma carta apenas triada foi promovida.

## Continuidade

## Bloco de catálogo e IA

Registro ampliado de **749 para 752 certificados**, sem mudança de engine-v8 ou dos 130 distribuíveis. Admissão individual: **Chaos Necromancer**, **Yellow Luster Shield** e **Buster Blader**. As definições e certificados foram acrescentados por dados; nova revisão `b84222a8334764cb6bc6f6f69c99eb7a4b3925b5dda2c754df8fd92a843e4c95`. As 749 definições anteriores, seus efeitos, certificados e revisões permanecem idênticos, assim como todos os executáveis históricos.

Fontes oficiais completas e localizadas: [Necromante do Caos](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5827&request_locale=pt), [Escudo do Brilho Amarelo](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5161&request_locale=pt) e [Blader Notável](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4983&request_locale=pt). Os links EN nas revisões documentam impressões TCG anteriores ao corte. Buster tem divergência entre a data importada e a impressão oficial PSV-050 (20/10/2002); o histórico importado não foi reescrito. Não se afirma que essas impressões sejam as primeiras mundiais.

As três cartas reutilizam contagens e modificadores contínuos existentes. Foram executados sete cenários individuais por carta, com negação, movimento, recálculo e replay, além de regressões cruzadas: Equipamento/negação, imunidade a Magias, múltiplas cópias, controle diferente do dono e identidade oculta. Não foi criada operação nova nem resolver v9. Os cinco atacantes diretos antes triados, Cannon Soldier, Amazoness Archer e Shadow Ghoul já estavam certificados; não foram recontados.

Uma falha concreta da IA foi reproduzida: a avaliação de invocação consultava estatísticas sem colocar o monstro prospectivo no campo, perdendo seu próprio efeito contínuo. Dois testes falham com a consulta anterior e passam com a correção (`mission16-ai-before-fix.json`). Agora a simulação inclui a futura presença, remove a carta da mão e coloca Tributos no Cemitério de seu dono. A partida original não é mutada. Há regressão específica para impedir contar Muka Muka ainda na mão.

Também foram reproduzidas três brechas no validador de admissão: contínuos com custo/limite ignorável, operações passivas declaradas como ignição e gatilhos automáticos com política manual. O validador corrente agora os rejeita; todos os monstros já certificados continuam válidos. Isso limita novas admissões, sem editar os validadores ou executáveis congelados.

`scripts/plan-mission16.cjs` gerou matriz dos **1.210 registros históricos ainda não certificados**, a partir do registro corrente. Categorias da Missão 13 são pistas sobrepostas; operações, custos e dependências não revisados permanecem explicitamente desconhecidos. Goblin Thief continua bloqueado: a sequência v8 verifica vitória antes da cura seguinte, e não foi demonstrada equivalência à resolução simultânea. Needle Ball precisa de custo em gatilho opcional, que o validador já rejeitava; Mooyan Curry exige escolha do jogador beneficiado. Não simplificamos esses efeitos para elevar o total.

## Validação em andamento

CI do bloco operacional `40702951689`: Node 22, suíte de 5.302 testes e cinco repetições críticas aprovadas; soak de 600 segundos aprovado. CI do catálogo `40705330464`: **5.328 testes, zero falhas/TODO**, tipagem e auditorias individuais aprovadas, mas o novo simulador falhou ao comparar propriedade opcional `battleFlip: undefined` com sua ausência após JSON. A comparação foi corrigida para confrontar todos os campos efetivamente persistidos, sem alterar a engine ou suprimir divergências reais. A nova CI precisa confirmar simulações completas.

Localmente, o bloco final possui 33 testes de cartas/admissão e 12 operacionais aprovados. A CI completa do HEAD final, métricas das 50/100 sessões e a decomposição do crescimento SQLite ainda devem ser consolidadas. Não equiparar simulação interna à homologação Discord. Meta de 20–50 cartas novas não atingida neste bloco; o ganho certificado é três.

## Memória de backup

O utilitário existente `scripts/sqlite-snapshot.cjs` alocava todo o banco em `readFileSync` apenas para calcular SHA-256. A leitura agora usa blocos de **64 KiB**, mantém o formato dos manifestos e fecha o descritor mesmo com erro de I/O. Três testes verificam compatibilidade binária, limites de leitura e falha injetada. Isso limita o buffer do hash; não significa que todo o processo de backup tenha consumo fixo de 64 KiB.

O conjunto novo completo executado localmente tem **48 testes aprovados, zero falhas/TODO** (`docs/evidence/mission16-local-tests.tap`). A compatibilidade do backup e da restauração com SQLite nativo continua coberta pelas suítes existentes na CI.

Operação isolada, sem login no bot:

```text
node scripts/sqlite-health.cjs <banco-existente> --budget-bytes 8589934592 --warning-ratio 0.8
node scripts/sqlite-health.cjs <banco-existente> --checkpoint-passive
node scripts/sqlite-snapshot.cjs snapshot <origem> <diretorio-pai-existente>
node scripts/sqlite-snapshot.cjs verify <pasta-do-snapshot>
node scripts/sqlite-snapshot.cjs restore <pasta-do-snapshot> <destino-novo>
```

Usar ambientes isolados até autorização operacional. Restauração rejeita sobrescrever arquivo ou sidecars existentes. Um arquivo principal copiado sem os dados confirmados do WAL não substitui a API de backup. Não ativamos retenção destrutiva; alertas se referem ao orçamento SQLite configurado, que não inclui backups, assets ou o restante do disco. `dbstat`, quando disponível, diferencia páginas de tabelas/índices da estimativa de payload; sua ausência é explicitada.

## Próximas prioridades

O segundo lote acrescentou dez Normais elegíveis pela união mundial: Mystical Shine Ball, Mikazukinoyaiba, Dancing Elf, Sealmaster Meisei, Gogiga Gagagigo, Metal Armored Bug, Cosmo Queen, Turu-Purun, Warrior of Zera e Dharma Cannon. As fontes oficiais e impressões TCG estão em `mission16-world-normal-reviews.json`. São 70 cenários individuais, mais recuperação 2v2. Nenhum efeito secundário foi omitido: são Monstros Normais; a narrativa não é uma habilidade. A origem TCG demonstrada não é uma recuperação independente da primeira data OCG importada. Rituais e identidades ambíguas permanecem bloqueados.

Concluir os resultados da CI e dos diagnósticos, depois isolar semânticas de resolução simultânea de LP, custo em gatilho e escolhas de jogador no próximo resolver quando necessário. Os demais sistemas do beta, localização integral e testes Discord reais continuam pendentes. Sem merge, deploy, acesso Discord ou distribuição.
