# Missao 8: checkpoint de implementacao

Base: 1bbbdd3847b9455febabffc2351456982df438a6, PR #12 draft.

Candidata engine-v7: revisoes imutaveis de catalogo separadas da semantica; contexto isolado por partida. Catalogos de 203 e 225 cartas, sem copiar novamente a engine para registrar o segundo lote. Engines v1-v6 intactas.

22 revisoes individuais e 110 cenarios individuais locais aprovados; seis testes de revisoes de catalogo aprovados. Execucao local usa Node 24 com remocao de tipos; nao substitui tipagem/Node22/SQLite/Sharp no CI. Certificacao e prontidao ainda aguardam regressao e interacoes completas.

Em andamento: regressao cruzada de fontes/negacao/imunidade/duracao; persistencia dos catalogos em snapshots; carga mista e CI. Nao declarar conclusao desta candidata antes de validar.

Retomada: ler este arquivo, docs/evidence/mission8-individual-reviews.json e manifestos catalog/engine-v7 e src/resolvers/v7; verificar HEAD e CI do PR. Preservar todos os saves e arquivos v1-v6. Nenhuma distribuicao, merge ou deploy autorizado.
