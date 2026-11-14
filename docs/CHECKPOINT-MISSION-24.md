# Missão 24 — Cinco efeitos de contagem em uma única operação

## Resultado local

- Base remota anterior: 815 certificadas. Missão 23: +2. Missão 24: +5. Catálogo v9 atualizado com **822 cartas certificadas**, mantendo exatamente **130** autorizadas para distribuição.
- Cartas da Missão 24: **Restructer Revolution**, **Secret Barrel**, **Cemetary Bomb**, **Gift of The Mystical Elf** e **Solar Ray**.
- Fontes: os cinco textos e identificadores foram confrontados com o banco de dados oficial Konami, e as datas históricas foram verificadas contra `catalog/historical/2004-10-01/cards.json`.
- A operação compartilhada `scaledLP` calcula na resolução a quantidade de cartas na mão, no Cemitério, em zonas de monstro e nas zonas M/A, incluindo a Zona de Campo quando pedido. Suporta filtro de atributo e face visível e conta os dois campos.
- Casos: dano e cura, cartas baixadas, ambos os jogadores, propriedade e controle, monstro LUZ com face para cima, integridade de estado e dados inválidos.
- `node --test tests/economicBatch23.test.cjs tests/economicCountBatch24.test.cjs`: **15 aprovados, zero falhas**.
- `npm run build`, `node scripts/check-card-certification.cjs`, `node scripts/verify-catalog-revisions.cjs` e `git diff --check`: aprovados localmente.

## Limites e retomada

- Compilação e testes específicos foram realizados em Node 24; a suíte inteira que exige SQLite nativo não pôde ser homologada localmente porque o `better-sqlite3` instalado não tem binário para o ambiente e os cabeçalhos remotos de Node estavam inacessíveis. Validar a suíte integral por GitHub Actions em Node 22 antes de qualquer implantação.
- O PR #12 segue como canal de revisão. A atualização do bot de testes em produção requer CI verde e procedimento de implantação, com os avisos de progresso claramente separados de distribuição de cartas.
- Respeitar a condição historicamente elegível de TCG **ou** OCG até 30/09/2004; `Cemetary Bomb` atende via OCG, embora a primeira observação no TCG local seja 01/10/2004.
- Próxima ação para expansão maciça: identificar operações compartilhadas novas e batch de cartas por regra, sem certificar efeitos parciais nem inflar o contador com metadados apenas.
