# Entrega 0.15.0 — engine, comandos e equipes

## Disponível

- 1v1 com as 130 definições habilitadas, regras de sete cartas, custos, respostas/correntes, condições de vitória, W.O. e salvamento. Não é o catálogo completo do clássico/TCG.
- Comandos azuis, perfil personalizável, coleção, NPCs e consulta carta a carta com texto em português. O campo original do 1v1 e o verso enviado permanecem preservados.
- `/dupla convidar`: quatro humanos, quatro confirmações, decks próprios ou emprestados, campos/PV por equipe, mãos/decks/Adicionais individuais, efeitos, correntes e zonas consultáveis.
- `/dupla treino`: você e Yugi contra Kaiba e Joey. Escolha um deck emprestado de Yugi, Joey ou Kaiba, ou o próprio deck ativo. Os NPCs jogam automaticamente e o estado de cada jogada fica salvo.
- `/dupla ver` reabre seu painel; `/dupla campo` recupera a mensagem pública. Mensagens pendentes são republicadas sem repetir ações. Convites só reservam um convidado depois de seu aceite.

Nenhum desses modos de equipes distribui cartas, DP ou XP. Não altera perfis, retratos, coleção ou decks já salvos. Migrações são aditivas. O treino usa cartas virtuais separadas da coleção.

## Validação técnica

415 testes automatizados, incluindo o listener real do Discord com transporte substituído para testes. A mesma versão deve passar no CI e no host antes do reinício. A suíte de host é sequencial por causa do limite de processos do plano.

Relatórios reproduzíveis em `validation/`:

- `engine-acceptance.json`: 1.000 duelos 1v1, conservação e retomadas.
- `tag-classic-audit.json`: 1.000 duelos 2v2 com decks clássicos e variações, 130 definições presentes, 47 definições com ativação explícita observada. Presença no baralho não comprova todos os efeitos; testes por famílias e de propriedade complementam essa auditoria.
- `tag-classic-session-audit.json`: 100 partidas com quatro participantes simulados através de SQLite e do adaptador dos controles.
- `tag-training-audit.json`: 100 treinos completos com um participante simulado e três NPCs reais do motor, sem perdas/duplicações nem alterações de economia.

A migração de uma sessão 2v2 anterior foi testada preservando exatamente o JSON e as quatro reservas aceitas. O campo 1v1 mantém o SHA-256 registrado em `PHASE_6.md`.

## Homologação ainda necessária

Uma partida entre quatro pessoas reais no Discord, incluindo uso em celular, consultas e retomada do painel. O treino solo facilita a validação inicial de uma pessoa, mas não substitui esse aceite. A qualidade estética também exige avaliação humana. Não declarar “100% homologado” ou fases posteriores concluídas apenas porque testes passaram.

As regras de representantes ativos, respostas do parceiro, cemitério compartilhado e devolução ao dono estão documentadas em `PHASE_6.md` e `/ajuda` → Duelos em equipes 2v2.

## Patch 0.15.1

417 testes aprovados após acrescentar guardas do executor. O processo inteiro de testes recebe um SQLite temporário e não herda credenciais Discord. O teste de UI que podia abrir o banco padrão agora também declara um banco isolado antes dos imports. A comparação do banco real com o backup confirmou perfis e coleções preservados. A inicialização lista todos os comandos registrados, incluindo `/dupla`.
