# Homologação da candidata — Missão 3

Estado: preparada para avaliação; **não homologada no Discord real**. Nenhum token, login, servidor ou usuário real foi usado nesta sessão. Não houve merge, deploy ou liberação econômica.

## Evidência executável isolada

`tests/discordHomologation.test.cjs` usa os mesmos `handleDuelComponent` e `handleTagComponent` do bot, banco SQLite temporário e renderizadores reais. O transporte é simulado, o provedor de arte é local e `fetch` é bloqueado. Há menus reais, acknowledgement anterior à mutação, resposta privada, payload validado, PNG decodificado, duas entregas concorrentes do mesmo request 1v1, restauração e falha de publicação após commit. A partida 2v2 usa quatro perfis de teste e decks clássicos emprestados, sem conceder cartas.

As suítes existentes `interactions`, `discordFlow`, `tagStore`, `tagRenderer` e `deckRenderer` continuam obrigatórias: incluem comandos slash registrados no cliente simulado, botões, menus, convites, privacidade e renderização. O novo teste complementa esses contratos; não simula o protocolo Discord inteiro. O JSON `artifacts/discord-offline-homologation.json` separa acknowledgement e tempo total incluindo renderização. Tempos locais e de runner não representam a latência de uma interação real.

## Roteiro para servidor isolado

Bloqueio: falta autorização para um ambiente Discord de homologação e suas credenciais. O teste automatizado não deve tentar usar produção como alternativa. Após provisionamento autorizado, usar banco descartável ou cópia sanitizada separada, bot de teste, canal e quatro contas de teste consentidas. Nunca reutilizar token ou banco de produção. Esse passo exige autorização adicional do responsável.

1. Registrar SHA e versão candidata; executar `npm ci`, `npm run check`, `npm test` e o workflow completo. Confirmar os hashes v1/v2/v3. Guardar os artefatos e o link do CI.
2. Confirmar isolamento do caminho SQLite e do bot; criar perfis de teste. Verificar que starter, coleção e progresso não recebem as 20 cartas novas. Não executar eventos de distribuição.
3. Exercitar `/start`, coleção/decks e comandos de duelo/dupla/treino conforme o registro atual do bot. Aceitar e recusar convites, abrir painéis privados, navegar cartas e zonas, usar botões/menus e testar painel antigo/usuário indevido.
4. Usar Yugi e Kaiba emprestados nos treinos e quatro consentimentos no 2v2. São adaptações Speed RPG com 4.000 PV, mão 4, limite 6 no Final, 20–30/5 cartas, zonas 3+3, Campo separado, sem Principal 2 e Skills desativadas. Não prometer reprodução de decks ou regras do anime.
5. Demonstrar invocação/tributo, especial/fusão, Magia/Armadilha, FLIP, correntes e escolha obrigatória. Para fichas, usar somente fixtures de engenharia isoladas: Scapegoat continua sem certificação, pois quatro fichas não cabem em três zonas. Não adicionar comandos de criação livre de entidades.
6. Interromper o bot de teste durante escolha e resposta; reiniciar com o mesmo SQLite. Verificar mesma versão, RNG e decisão; repetir request/painel e conferir pagamento, eventos e revisão únicos.
7. Simular falha da publicação e restaurar conexão; conferir estado persistido antes do painel atualizado. Desistência/expiração 2v2 devem gerar um único resultado no diário, liberar assentos e não premiar ninguém.
8. Medir recebimento → acknowledgement, recebimento → commit e recebimento → publicação visível, separadamente. Registrar p50/p95/p99/máximo, concorrência, CPU/RAM, host, rede, erros e rate limits. A meta de 1,5 segundo não pode ser aprovada usando só o benchmark interno.
9. Comparar capturas com o layout aprovado: campo, imagens, verso, perfis e identidade visual. Não alterar recursos para acomodar falhas de teste.
10. Encerrar sessões de teste, conferir invariantes e emitir aceite ou rejeição com evidências. Não promover, distribuir cartas ou implantar automaticamente.

## Gates ainda abertos

- Aceite humano das imagens e dos fluxos em Discord isolado.
- Latência real, rate limits e concorrência entre processos/hosts representativos. O benchmark de 32 sessões intercala um único event loop; não é um teste de 32 processos gravando SQLite.
- Política regional e autorização separada para distribuir as 20 cartas. Certificação mecânica não é liberação de loja/evento.
- I02: dados de épocas de zona nunca gravados em saves antigos permanecem irrecuperáveis. Não preencher lacunas com dados fabricados.
