# 0.17.0 — fase 3, catálogo histórico de preparação

Importador Node 22 executado sobre os agregados reais YGOJSON. Produz 1962 identidades históricas observadas e 335 eventos de produto/data/região, com relação nominal e fontes identificadas por hashes. Reproduz 1422 TCG/1897 OCG até 30/09 e 1482 TCG/1897 OCG incluindo 01/10/2004, mantendo a união 1962. São números do snapshot alternativo, não resultados da API YGOPRODeck nem total definitivo do anime.

A projeção factual durável reproduz as cinco saídas byte a byte sem rede ou os agregados originais completos. Nenhuma imagem/texto de efeito é preservado nessa projeção. O pacote inclui fontes, datas observadas, códigos alternativos, mecânicas estruturadas, lacunas, checksums e relação com as cartas já admitidas. Não interpreta texto para programar efeitos.

O importador não abre SQLite ou Discord e recusa saídas nas pastas do motor/dados. Não sobrescreve snapshots diferentes; repetições idênticas são idempotentes. Skills e Tokens ficam fora. Ritual/Fusão não são classificados como candidatos a Normais de Deck Principal. Colisões de identificadores não são resolvidas por nome.

O cruzamento liga as 130 cartas existentes a 130 identidades históricas distintas, sem habilitar ou conceder cartas. Novas entradas ficam em preparação. A arena, as regras Speed RPG Clássico v1, os perfis, coleções, decks e comandos permanecem preservados. O processamento de entradas brutas é offline; o bot não carrega esse catálogo na inicialização/interações.

## Verificação

- 487 testes aprovados, zero falhas, incluindo 21 cenários da importação histórica. Gate crítico: 169 testes e 1000 duelos 1v1, com conservação física.
- Importação real: entrada com 14616 cartas e 3306 produtos, seleção de 1962 identidades e 335 eventos regionais.
- Repetição idêntica não sobrescreve arquivos; testes cobrem alteração de entrada, links simbólicos para pastas protegidas, datas inválidas, variantes, colisões, Skills/Tokens, classificação de Ritual/Fusão e isolamento do catálogo jogável.
- Projeção factual durável: reprodução de todos os cinco arquivos de saída byte a byte, sem rede. Arquivo com imagem/texto de efeito não é necessário para repetir a auditoria.
- Cruzamento das 130 cartas existentes com 130 identidades históricas, sem ambiguidade e sem novas habilitações/concessões.

`npm run audit:history` verifica hashes, reprodução factual e correspondência com as 130 cartas; o CI inclui essa etapa. Ver HISTORICAL_IMPORT.md e os manifestos versionados para o recorte e as fontes. A verificação da engine conserva seu escopo próprio; não transforma importação em certificação.

## Implantação

Apenas scripts, fatos de preparação e relatórios novos; sem migração do SQLite ou carregamento automático do catálogo pelo bot. Antes da atualização: backup consistente, testes isolados no host e comparação de perfis/coleções/decks. Reinício normal e conferência da versão conectada ao Discord. Os arquivos brutos de 225 MB não são enviados ao servidor; nele só são verificados os artefatos preparados e a projeção compacta.

## Pendências explícitas

3 produtos TCG e 21 OCG têm conteúdo vazio dentro do recorte; 348 nomes PT estão ausentes. Tradução oficial integral, catálogo de aparições no anime, revisão completa de efeitos, certificação de novas cartas e homologação humana permanecem pendentes. O número 584 é de candidatos Normais de Deck Principal por metadados, não de novas cartas implementadas.
