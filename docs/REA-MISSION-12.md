# Missão 12 — preparação operacional de teste solo/IA e beta fechado

Estado: código e testes preparados; nenhum login Discord, deploy, acesso a bot hospedado, migração ou distribuição foi executado. A homologação humana em Discord permanece pendente.

## Política de acesso verificada

O ambiente de teste não precisa ter quatro pessoas para permitir que o responsável jogue **sozinho contra a IA**. `scripts/discord-sandbox-preflight.cjs` admite três modos explícitos sem alterar os dados históricos do jogo:

| Modo | Usuários consentidos | Regra |
| --- | --- | --- |
| `solo-ai` | Exatamente 1 | `aiOnly: true`, `inviteOnly: true`; testa IA e menus sem contas adicionais. |
| `closed-beta` | De 1 até o limite | `inviteOnly: true` e `participantCap` inteiro entre 20 e 50; os convites entram gradualmente, sem presumir consentimento dos ausentes. |
| `manual-four` | Pelo menos 4, até 50 | Compatível com o roteiro antigo de testes 2v2. |

Todos exigem `approved: true`, `dedicatedTestApplication: true`, IDs de aplicação/servidor/canal válidos, SHA completo, negação explícita de IDs da produção, banco SQLite vazio e isolado, ausência de symlinks e sentinela dotenv íntegra. O pré-teste offline não carrega tokens, módulos do bot, SQLite nem realiza requisições externas.

Ao executar o launcher manualmente **após** aprovação da aplicação de testes e do build, o processo recebe `SPEED_RPG_SANDBOX_GATE` com o modo e somente os IDs autorizados. O launcher carrega `scripts/sandbox-interaction-preload.cjs` **antes** do bot. Esse módulo valida a configuração e intercepta o evento `InteractionCreate` no cliente Discord, negando interações fora do servidor, canal ou lista de usuários **antes de chegarem ao handler do bot**, incluindo autocomplete, botões e menus. Convites PvP/2v2 e destinatários de eventos também são verificados, impedindo que o proprietário inicie uma operação para pessoas fora da lista. O arquivo principal `src/index.ts` e os demais módulos históricos permanecem byte a byte intactos, verificados pela proteção de integridade da Missão 8. Instalações normais, sem a pré-carga do sandbox, mantêm o comportamento histórico. A barra de acesso limita quem usa o bot, mas não prova capacidade da hospedagem, permissão do canal nem aceitação humana.

## Rotina de promoção

1. Continuar simulação offline e certificar cartas conforme regras; manter todas as cartas novas bloqueadas para distribuição.
2. Com build limpo e SHA aprovado, preparar ambiente isolado. Teste solo pode começar com um ID e comandos contra a IA; registrar p95 de recebimento, ACK, renderização e RAM **no host real**, não derivar do benchmark headless.
3. Para beta de 20–50 pessoas, atualizar arquivo local de autorização para `closed-beta` com `participantCap` até 50, adicionar somente participantes opt-in, reiniciar isoladamente e monitorar erros/limites. Conservar snapshots regulares do SQLite e plano de reversão.
4. Encerrar beta com retorno dos participantes, restauração testada, correções mecânicas/visuais e aceite antes de avaliar a abertura normal.

Limites: acesso humano ainda não executado; nenhum card passcode pendente, ruling não comprovado nem efeito incompleto se torna certificado por este procedimento. Não usar o banco real do bot já registrado sem backup e decisão de migração. Não há autorização implícita para vincular token ou servidor, nem para fazer deploy/merge.
