# Release candidata 0.16.1 — revisão da IA e matriz de cartas

Derivada da 0.16.0; regras de mão (6 na Fase Final), Deck Adicional (até 5), partidas persistidas e arena visual 1v1 permanecem inalteradas.

- IA avalia um monstro inimigo virado para baixo sem consultar sua identidade oculta. Evita invocar atacantes fracos em Ataque sem necessidade e evita ataques arriscados de monstros com menos de 1600 ATK contra defesas ocultas. O valor 1600 é uma heurística tática, não uma alteração de regra de Speed Duel.
- Corrige teste intermitente de retomada 2v2: uma janela de resposta humana legítima precisa terminar antes de existir uma decisão pendente do NPC.
- `npm run audit:cards:matrix` produz inventário verificável em `validation/card-matrix-v016.json`, cobrindo IDs, descrições PT, tipos, famílias de efeito, suítes de certificação e indicação de menção literal. Ter referência em um teste não significa ter todos os casos daquele efeito certificados.
- O checklist de hospedagem passa a indicar explicitamente a branch de desenvolvimento; não presumir `main`.

## Portão de qualidade local

- 433 testes passaram com Node 22; compilação TypeScript passou.
- Aceitação da engine: 107 testes críticos, 1000 jogos simulados e conservação das cartas; aprovação técnica local. Não substitui aceitação humana no Discord.
- Catálogo mantido em 130 cartas certificadas; a auditoria classificou 58 cartas para revisão manual de efeitos. Não houve liberação de novos cards nem distribuição de recompensas.

## Estado da implantação

**Não implantada/validada no Botkeep em 25/10/2026.** O painel mostra o antigo servidor excluído e nenhum backup disponível para restauração na própria interface. Código pode ser publicado no GitHub sem afetar o progresso; criar instância nova exige verificar antes se há backup externo e restabelecer o token Discord por mecanismo seguro. Não tratar bot indisponível como se tivesse sido reiniciado com sucesso.
