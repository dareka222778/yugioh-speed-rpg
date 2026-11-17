# Roteiro consolidado — Speed RPG Clássico v1

Decisão do usuário em 25/10/2026. Esta numeração substitui os planos fragmentados anteriores; não marca funcionalidades como concluídas sem evidência. Versão-base 0.15.1, nova entrega 0.16.0.

## Regras e proteção

4000 PV; mão inicial 4; Principal 20–30; até 3 cópias; Adicional até 5; mão até 6 com descarte na Fase Final do próprio turno. Compras, buscas e devoluções resolvem sem bloqueio pelo tamanho da mão. Três zonas de Monstro, três M/A, Campo separado, Cemitério e banimento; primeiro turno sem compra/batalha; sem Main 2; Skills desativadas. Preservar o campo 1v1 e o verso fornecido pelo usuário. Perfil, coleção, decks e progresso não são removidos. Cartas especiais somente com autorização administrativa configurada; importação e certificação não concedem exemplares.

Partidas antigas conservam sua versão. O novo perfil não migra decisões de compra/descarte já pendentes. Um deck salvo acima do novo limite permanece editável e é recusado para novos duelos, sem apagar cartas. Nunca restaurar produção automaticamente para desfazer código: um rollback de código não deve eliminar progresso posterior ao backup.

## Sequência principal

| Fase | Entrega | Gate |
|---|---|---|
| 0 | Conferir remoto, versão online, recursos, logs, banco e backup | integridade e recuperação documentadas |
| 1 | Regras definitivas nos quatro modos e mensagens | suíte, persistência e simulações aprovadas |
| 2 | Revisão das 130: efeitos, PT-BR, UI, IA, W.O., economia | matriz por carta e regressões de defeitos |
| 3 | Importador e auditoria histórica | relação nominal, procedência, lacunas e deduplicação reproduzíveis |
| 4 | Famílias de mecânicas reutilizáveis | timing, custos, alvos, correntes e restauração testados |
| 5 | Certificação por produto/data | lotes 25–75; incompatibilidades explícitas; liberação administrativa separada |
| 6 | Homologação do escopo certificado | partidas reais 1v1/2v2, celular, reinício e estabilidade |
| 7 | Finalização dos comandos azuis | catálogo paginado, deck builder e inspeção; arena preservada |
| 8 | Progressão e NPCs | dificuldade tática, missões e ausência de informação oculta |
| 9 | Loja e economia | operações atômicas, recibos e disponibilidade controlada |
| 10 | Ampliação administrativa/eventos | permissões e auditoria; proteções básicas existem desde a fase 0 |
| 11 | Trocas/mercado | confirmação, conservação e prevenção de duplicação |
| 12 | Expansões contínuas | anime, temporadas e eventual expansão de Skills |

Não é necessário habilitar todo o histórico antes de homologar uma versão: fases 4–6 repetem-se por conjunto definido. A loja e o mercado ficam fora da entrega 0.16.0.

## Linha editorial de cartas

H1 OCG 1999; H2 OCG 2000–2001; H3 TCG 2002; H4 2003; H5 janeiro–setembro/2004; H6 somente 01/10/2004. A1+ legado do anime comercializado depois do corte. A ordenação real deriva de datas verificadas por produto; reimpressões atualizam disponibilidade, sem duplicar identidade canônica.

Separar catálogos histórico, anime e jogável. A contagem alternativa 1962 é provisória: existem blocos de produtos vazios no conjunto consultado. O bloqueio 403 da API YGOPRODeck não foi resolvido; não afirmar que a contagem veio daquela API. Importador entregue em 0.17.0; auditoria de completude ainda pendente.

Estados futuros: importada → catalogada → em análise → implementada → testada → certificada; disponibilidade administrativa e habilitação são controles separados. Incompatibilidade e adaptação ficam explícitas. Não habilitar Scapegoat com quatro fichas em três zonas nem alterar texto silenciosamente. Adaptações relevantes exigem decisão do usuário.

## Evidências e progresso

417 testes pertencem à entrega 0.15.1, não comprovam automaticamente a nova regra. A 0.16.0 adiciona regressões de Fase Final, retornos, compras, 2v2 e compatibilidade. Veja RELEASE_0_16_0.md e relatórios versionados em validation/.

Relatar por bloco: mudanças, defeitos, testes executados, catalogadas/implementadas/certificadas/habilitadas, pendências/incompatíveis, cobertura por produto, riscos, commit, versão online e próximo bloco. Nenhum percentual global de engine/layout até existir denominador verificável. Os pesos antigos de project-progress são históricos, mantidos somente no JSON por compatibilidade.

As 130 definições têm referências de certificação no registro atual; a fase 2 deve revisar se cada referência cobre todos os efeitos relevantes. Presença em simulação não equivale a ativação e não certifica todas as combinações. Validação humana do 2v2 e aceitação em celular continuam pendentes.

## Próximo bloco após 0.16.0

Fase 2: construir matriz de requisitos/efeitos/testes das 130 cartas, priorizar lacunas reais e revisar tática dos NPCs com cenários. A fase 3 pode avançar na preparação de dados sem liberar cartas nem bloquear correções.

### Auditoria automatizada da fase 2 (em andamento)

`npm run audit:cards:matrix` gera `validation/card-matrix-v016.json` com as 130 identidades, famílias de efeitos, descrição operacional PT-BR e a relação das suítes certificadoras. A coluna `directIdMention` registra somente uma indicação textual do ID nos testes; não é prova de que todas as ativações, resoluções ou combinações foram testadas. A matriz separa explicitamente efeitos que exigem revisão individual antes de prometer cobertura integral.

**Bloqueio operacional observado em 25/10/2026:** o painel Botkeep da conta `dareka222778` mostrava 0 servidores, com exclusão concluída do antigo `yugioh-speed-rpg` aproximadamente 13 horas antes. O painel de backups não listava ponto de recuperação. A alegação anterior de reinício da v0.16.0 não equivale a validação online atual. Antes de recriar o servidor, recuperar e conferir a cópia externa do SQLite, retratos e variáveis de ambiente, se disponíveis; não substituir arquivos de dados por um banco vazio por suposição. Atualização GitHub e implantação são etapas independentes.

## Continuidade 0.16.2 — fase 2 em andamento

O último código do outro chat era e6216ca (0.16.1), com cautela contra cartas ocultas, matriz de 130 cartas e teste de retomada de treino corrigido. O host real Bot-Hosting.net estava em 0.16.0, online, com dados preservados; o problema do Botkeep não bloqueia esta instância.

A próxima entrega reutiliza esse código e corrige a repetição de ataque da IA e a descrição do timing FLIP. Cinco cenários dedicados passam a constar dos certificados de Fissura, Polimerização, Pote da Ganância, Sogen e Tufão Espacial Místico; a matriz passa a identificar a versão e não possui referências indiretas de efeitos. Isso não encerra a revisão das 58 cartas com efeito: uma menção literal ou um cenário aprovado não prova todos os timings e combinações. Próximo lote: equipamentos/campos e revisão das exceções, mantendo o catálogo em 130 até concluir os gates do núcleo.

## Continuidade 0.16.3 — equipamentos, campos e exceções

A fase 2 acrescenta cenários por carta para os cinco equipamentos, três campos e as exceções Destruição de Cards e Escudo e Espada. Corrige a mensagem de Campo que saiu antes da resolução e valida os tipos dos indicadores de resolução e alvo de equipamento nos estados persistidos. Campos legados sem indicador explícito continuam aceitos. Não muda o efeito de troca repetida de Escudo e Espada, que permanece a adaptação já documentada, nem acrescenta novas cartas.

As referências da certificação e a matriz incorporam a suíte classicPersistentReview. Essa evidência delimita cenários, não encerra a revisão completa das 58 cartas com efeito ou a homologação humana. Próximo lote: custos/alvos e perda de alvo entre elos para as demais famílias; revisar o que já tem evidência antes de criar testes repetidos. O catálogo histórico segue separado e não está liberado.

## 0.17.0 — fase 3 iniciada com importação real

Por solicitação do usuário, avançamos para preparação histórica mantendo as pendências da fase 2 e da homologação humana. O importador isolado reproduz a união de 1962 cartas até 01/10/2004, mantém códigos alternativos e produz relações nominais/produtos/datas/lacunas. Uma projeção factual versionada permite reproduzir as saídas sem depender do ZIP mutável. O cruzamento confirma as 130 cartas atuais nesse recorte sem modificar a admissão.

A entrega técnica da primeira importação é verificável; a auditoria de completude continua aberta pelos produtos vazios e datas ausentes. O catálogo do anime não é inferido. Ver HISTORICAL_IMPORT.md para escopo, comandos, hashes e pendências. O pacote não é carregado pela engine nem pela UI; exibição de catálogo e liberação de cartas pertencem a blocos posteriores.

## 0.17.1 — alvos e correntes, ponte das fases 2 e 4

Magias Rápidas passam a reutilizar a lista de alvos e o resolvedor das ativações principais. Corrige o registro falso de destruição do Tufão quando um elo anterior já retirou seu alvo. A revisão acrescenta oito cenários dedicados de alvo perdido, fonte destruída sem negação, contracorrentes com custos pagos e retomada JSON, conservando os UIDs. Os quatro certificados afetados referenciam essa evidência.

Não adiciona cartas, adaptações, migrações de estado ou alterações no campo. O recorte permanece em 130 jogáveis; as 1962 históricas seguem em preparação. Não encerra a revisão completa das 58 cartas com efeito ou a homologação humana. Próximo lote: regras de seleção/resolução de cemitério, controle e gatilhos com zonas ocupadas; só então ampliar a certificação histórica por produto.
