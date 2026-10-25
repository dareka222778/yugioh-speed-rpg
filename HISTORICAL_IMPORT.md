# Fase 3 — catálogo histórico de preparação

O importador é executável e foi rodado sobre dados reais. Ele não substitui o catálogo do motor, não importa código/efeitos executáveis, não abre SQLite, não concede cartas e não altera identidade/progresso de jogadores. Os 130 registros já habilitados permanecem independentes e têm correspondência única no recorte histórico.

## Resultado do snapshot

| Recorte inclusivo | TCG observado | OCG observado | União por identidade canônica |
|---|---:|---:|---:|
| Até 30/09/2004 | 1422 | 1897 | 1962 |
| Até 01/10/2004 | 1482 | 1897 | 1962 |

Origem: release agregado YGOJSON recomendado por seu README, não os agregados diretos desatualizados. Fonte: https://github.com/iconmaster5326/YGOJSON . URL do arquivo: https://github.com/iconmaster5326/YGOJSON/releases/download/v1/aggregate.zip . Data de obtenção registrada: 25/10/2026. O endereço é mutável: os hashes, não o nome v1 sozinho, identificam a entrada usada.

Entrada: 14616 registros de cartas e 3306 produtos. Seleção: 1962 cartas, sendo 1297 monstros, 397 Magias e 268 Armadilhas; 335 eventos de lançamento por produto/data/região. Há 584 candidatos a monstros Normais de Deck Principal; os 75 monstros de Fusão e 20 de Ritual são distinguidos. Esses candidatos não são cartas automaticamente suportadas.

Identidade primária: UUID da carta na fonte. Idiomas, artes, raridades, códigos alternativos e reimpressões não são cartas novas. Todos os códigos válidos são preservados, inclusive o zero inicial. Konami ID e códigos alternativos são usados no cruzamento com as 130 cartas existentes; ambiguidades são sinalizadas, nunca resolvidas pelo nome.

A ordem deriva dos produtos e datas da fonte. Há contagem separada de estreias mundiais observadas e estreias regionais. Empates no mesmo dia usam uma ordem técnica estável de região/ID, sem inventar horário de lançamento. `firstObserved` significa a menor data encontrada nos produtos fornecidos, não prova de primeira publicação histórica real.

## Arquivos e reprodução

- `catalog/historical/2004-10-01/cards.json`: fatos, nomes EN/PT/JA quando presentes, atributos, mecânicas e datas observadas; estágio importado e sem liberação por esta operação.
- `cards.csv`: relação nominal para conferência; importar colunas de IDs/códigos como texto ao usar planilhas. Exportação protege nomes com prefixos de fórmula; o JSON preserva o nome literal.
- `releases.json` e `releases.csv`: produtos, regiões, datas, associações e estreias sem contar reimpressões como cartas novas.
- `audit.json`: contagens, lacunas, colisões, escopo dos diagnósticos e limites de completude.
- `manifest.json`: hashes/tamanhos das entradas e saídas, data declarada da fonte e hash do importador.
- `catalog/historical/replay-2004-10-01/`: projeção factual compactada dos campos usados na auditoria e manifesto de integridade. Omite imagens, textos de efeitos e atributos não utilizados. Preserva a reprodução desta janela; não reconstrói os arquivos brutos completos nem substitui uma nova coleta para expandir o recorte.
- `validation/historical-admission.json`: cruzamento das 130 cartas já habilitadas. Não certifica as demais nem concede autorização administrativa.

`npm run audit:history` verifica os arquivos, reconstrói todos os cinco arquivos de saída byte a byte a partir da projeção preservada e confere o cruzamento com o motor. Funciona sem internet nem as entradas brutas de 225 MB. É executado no CI; não roda na inicialização nem nas interações do Discord.

Para importar uma nova entrada completa, use Node 22 e os agregados extraídos da fonte:

```sh
node --max-old-space-size=2048 scripts/import-historical.cjs --cards /caminho/cards.json --sets /caminho/sets.json --output catalog/historical/NOVO-SNAPSHOT --cutoff 2004-10-01 --retrieved-on AAAA-MM-DD
```

Use `--expected-cards-sha256` e `--expected-sets-sha256` para exigir os hashes conhecidos. Uma repetição idêntica retorna `unchanged`; dados diferentes exigem outra pasta. O importador recusa saídas em src/data/dist/scripts/tests/node_modules/.git, incluindo aliases por link simbólico. O banco do bot não é destino de importação.

A geração inicial sobre entradas completas foi medida neste ambiente em aproximadamente 2,2 segundos e 752 MiB de memória de pico. É uma tarefa offline, não medição de latência de um duelo e não foi executada sobre os arquivos brutos na instância de produção. O pacote preparado tem aproximadamente 4 MB, sem milhares de imagens; o motor não o carrega automaticamente.

## Limitações verificadas

A contagem é provisória: 3 produtos TCG e 21 OCG dentro do recorte têm blocos vazios. Há 348 nomes PT ausentes; nomes existentes vêm de YGOJSON e não foram todos conferidos como tradução oficial. Não foram importados textos integrais de efeitos. Os 1085 diagnósticos também incluem datas ausentes/inválidas no conjunto inteiro, inclusive produtos posteriores; não são 1085 lacunas do clássico.

O catálogo do anime é separado e continua pendente de evidências de aparição. Não inferimos participação no anime pela data comercial; Selo de Orichalcos não entra automaticamente no recorte de 2004. Habilitação futura exige implementação, testes, certificação e autorização de disponibilidade próprias. As 58 cartas com efeito do motor seguem em revisão; fase 2 e homologação humana não foram declaradas concluídas.

### Produtos com conteúdo vazio dentro do recorte

| Região | Data observada | Produto |
|---|---|---|
| OCG | 1999-06-01 | Limited Edition |
| OCG | 1999-07-01 | Yu-Gi-Oh! Duel Monsters II: Dark Duel Stories Duelist Legend in Tokyo Dome invitation cards |
| OCG | 1999-07-08 | Yu-Gi-Oh! Duel Monsters II: Dark Duel Stories Game Guide 1 promotional card |
| OCG | 1999-08-05 | Yu-Gi-Oh! Duel Monsters II: Dark Duel Stories Game Guide 2 promotional card |
| OCG | 1999-08-26 | Premium Pack |
| OCG | 1999-08-26 | Yu-Gi-Oh! Duel Monsters II: Dark Duel Stories Duelist Legend in Tokyo Dome attendance cards |
| OCG | 1999-09-25 | jump novel lottery prize card |
| OCG | 1999-12-18 | Premium Pack 2 |
| OCG | 2000-04-20 | Magic Ruler |
| OCG | 2000-05-18 | Legend of Blue Eyes White Dragon |
| OCG | 2000-07-13 | Pharaoh's Servant |
| OCG | 2000-08-01 | Konami official tournament 2000 participation card |
| OCG | 2000-09-28 | Curse of Anubis |
| OCG | 2001-02-22 | Metal Raiders |
| OCG | 2001-07-21 | Labyrinth of Nightmare |
| OCG | 2002-03-21 | Pharaonic Guardian |
| OCG | 2003-07-17 | Invader of Darkness (set) |
| OCG | 2003-11-20 | The Sanctuary in the Sky (set) |
| OCG | 2004-01-01 | Konami official tournament 2004 participation card |
| OCG | 2004-03-25 | Structure Deck: Marik (OCG) |
| OCG | 2004-05-22 | Yu-Gi-Oh! World Championship 2004 tournament promotional cards |
| TCG | 2001-11-12 | Duelin' Monsters Giveaway |
| TCG | 2001-12-01 | Summoned Skull Sample promotional card |
| TCG | 2002-03-19 | Yu-Gi-Oh! Dark Duel Stories |

## Próximo bloco

Conferir os produtos vazios e datas com fontes primárias; preparar a priorização por primeiro lançamento e famílias de mecânicas. A fase 4 amplia operações do motor a partir dos dados, sem habilitar cartas automaticamente. Scapegoat e outras incompatibilidades com três zonas exigem revisão explícita; o importador não interpreta textos para adaptá-las.
