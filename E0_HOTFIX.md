# E0 — Hotfix 0.7.3

## Implementado e testado localmente
- Vitórias e desafios diários continuam concedendo DP/XP; nunca gravam cartas na coleção. Modelos também deixam de anunciar cartas. Coleções existentes e conjuntos iniciais preservados.
- Carrossel com uma carta tem apenas retorno; duas têm uma seta; três ou mais têm duas setas com destinos distintos. Testes de zero a sete cartas, incluindo Hane-Hane e Sogen.
- Painel de zonas permite ampliar monstros, magia/armadilha, campo, cemitério, banidas e próprio Adicional. Próprias baixadas são consultáveis. Mão, deck e baixadas adversárias continuam secretos. Consulta validada por participante e revisão atual no servidor; não executa ações.
- Falha no carregamento da imagem mantém consulta textual. Texto ainda usa o resumo existente; localização completa pertence ao E3.
- Arena âmbar inalterada: src/duelRenderer.ts SHA-256 01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c.

## Validação
Compilação TypeScript e suíte completa (337 testes). Regressões de inventário, primeira vitória/diário, idempotência, rollback, retomada em novo processo, componentes únicos e privacidade.

## Pendências explícitas
Homologação dos cliques no Discord após implantação. Console administrativo de eventos ainda não implementado: distribuição extra permanece indisponível. Regra da mão de sete, IA, decks e descrições completas seguem E1–E3. A regra atual da mão não foi alterada neste hotfix. Não houve remoção de cartas previamente recebidas.
