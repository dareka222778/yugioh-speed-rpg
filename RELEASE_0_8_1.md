# 0.8.1 — gate técnico e integração dos duelos

O núcleo habilitado mantém 130 cartas, mão de sete e a arena original. Os componentes agora passam por um roteador compartilhado entre produção e integração isolada. Validação local impede IDs repetidos, menus inválidos e estouro dos limites de mensagens antes da chamada ao Discord.

Uma falha na entrega privada depois de salvar a jogada não impede a tentativa de atualizar a arena pública. Reabrir o painel não repete a ação. Falhas após deferReply editam a resposta pendente; falhas após deferUpdate preservam o painel e geram aviso privado. O desafio de NPC reconhece o clique antes de criar a partida.

Validação: 372 testes completos. O gate `npm run accept:engine` executa suites críticas (incluindo o handler real com transporte Discord simulado) e 1000 partidas completas com 4388 restaurações e conservação de cartas. Evidência em validation/engine-acceptance.json. Isso libera o desenvolvimento dos comandos no escopo 1v1 atual; não certifica cliques humanos, todas as cartas do anime ou 2v2.

O antigo número 92% foi arquivado como métrica histórica. Não se chega ao fim da engine somando pontos sem critérios. O avanço para layout ocorre por gate técnico executável, com a homologação humana identificada separadamente.
