# Missão 19 — P001: fechamento do grupo de monstros normais

## Resultado do primeiro lote de implantação

- `68638985`: **Slime Toad / Rã Limo**, monstro Normal, ÁGUA/Aqua, nível 2, 700 ATK / 500 DEF, CID Konami 4555. Elegibilidade por primeira observação mundial em 20/12/2002 (TCG); não descartar pela data OCG importada de 2008.
- `14898066`: **Vorse Raider / Ginete Vorse**, monstro Normal, TREVAS/Beast-Warrior, nível 4, 1900 ATK / 1200 DEF, CID Konami 5004. O histórico também registra `14898067` para a mesma identidade: **não** criar segunda carta nem segunda certificação.

As duas definições são `normal` (sem efeito). Os metadados e os certificados foram acrescentados ao catálogo v8, **sem modificar** um resolver arquivado ou uma revisão anterior do catálogo.

### Evidências e garantias

- Fonte factual: catálogo histórico `catalog/historical/2004-10-01/cards.json`, verificado contra as fichas oficiais de CIDs 4555 e 5004.
- Revisão append-only v8: `e3387fb0b10688773c14d0c23d59c4a8281bac996eca41e405ee8533d26bef48`.
- Contagem anterior: 769 cartas certificadas. Contagem atual: **771**. A autorização de distribuição continua em **130**.
- `tests/historicalNormalBatch19.test.cjs`: identidade, data mundial, estatísticas, invocação Normal, monstro baixado, serialização/replay, impressão duplicada e ausência de autorização de distribuição.
- Regressão direcionada: **10/10** aprovações. Regressão ampliada sem SQLite: **82/82** aprovações. Compilação, verificação TypeScript, auditoria de preservação da Missão 15 e auditoria de certificados: aprovadas.
- A suíte completa foi tentada, mas os casos com SQLite ficaram impedidos pela incompatibilidade ABI entre o `better-sqlite3` local (Node 22) e o executável de teste (Node 24). A tentativa de recompilar o módulo falhou na extração dos headers por restrição de filesystem (`fchown`); **isso não representa aprovação nem falha funcional da engine**. Exigir CI oficial em Node 22 antes de concluir o aceite integral.

### Próximos lotes e bloqueios

O pacote P001 está esgotado: não restam outros monstros Normais históricos com senha canônica, excluindo cards Rituais e entradas sem senha. Não promover por similaridade textual os pacotes adjacentes P002–P009: várias Fusões carecem de materiais certificados; *Black Skull Dragon* possui a regra adicional de ser sempre tratado como `Archfiend`; *Cyber Shield* precisa de filtro exato por nome; e *Chorus of Sanctuary* depende de posição de batalha. Esses requisitos demandam mecânicas específicas ou análise individual antes de receber certificado.

**Nenhum merge, deploy, acesso ao Discord real ou autorização de novas cartas para loja foi executado.**
