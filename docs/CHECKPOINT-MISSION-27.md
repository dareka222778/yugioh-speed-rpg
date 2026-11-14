# Missão 27 — liberação integral das cartas certificadas

## Resultado

O proprietário autorizou distribuir todas as cartas disponíveis. A lista explícita agora contém **832 identidades certificadas**, contra 136 antes: **696 novas autorizações de distribuição**. Não foram inventadas cartas, emitidos certificados novos ou concedidas coleções automaticamente. Os 1.130 registros históricos pendentes, IDs desconhecidos e Fichas continuam bloqueados.

O catálogo mecânico permanece em 832 (42,4% de 1.962), +61/500 desde o baseline 771; faltam 439 para a missão +500. A revisão de catálogo é a mesma da M26: `d827809a01521f86cf5f5e432a2e8b85e7d25c1fb00953df32fb2d676bdff701`.

`src/releasedCardIds.ts` recebeu somente as 696 identidades atualmente certificadas. A liberação é explícita: novas certificações futuras ainda precisam entrar na lista autorizada. O gate de execução de efeitos não foi enfraquecido. `cardDistributionAllowed` ainda exige carta jogável e autorização.

## Validação e correções

- **5.813 testes locais aprovados, zero falhas/ignorados/TODO**, Node 24.22.1 com SQLite nativo. Tipagem/compilação aprovadas.
- O caminho real de eventos aceita todos os 832 IDs, entrega uma carta antes bloqueada uma única vez e rejeita IDs importados sem implementação, inclusive registros de evento já persistidos.
- Testes e auditorias dos lotes atuais refletem a nova autorização; provas históricas, catálogos e engines v1–v8 não foram reescritos. O normalizador M27 confere o bloco exato por SHA-256 e recupera a lista anterior de 136 IDs para os gates históricos.
- `audit-release27.cjs` valida a igualdade entre autorizadas e certificadas, o hash da lista anterior e as exclusões. Os gates M3/M4/M5/M7/M8 passaram.
- A CI M26 anterior falhou em um teste de interação de treino 2v2: uma abertura aleatória pode encerrar legitimamente o duelo antes da primeira decisão humana, liberando o vínculo de `currentTag`. O teste agora recupera a sessão criada e verifica o resultado terminado e a liberação do vínculo; no ramo em andamento continua exigindo mão privada e decisão humana. A aleatoriedade do produto não foi alterada. O soak de 600 segundos daquela CI passou.
- A CI Node 22 deste novo commit deve ser consultada antes de afirmar aprovação remota integral.

## Hospedagem e retomada

Esta alteração precisa ser implantada para ter efeito no Discord. O painel Bot-Hosting.net foi aberto, mas a sessão disponível redirecionou para `https://legacy.bot-hosting.net/login`. Nenhuma alteração na instância hospedada foi realizada. O proprietário precisa reconectar a conta pelo fluxo seguro do navegador antes do deploy; não pedir credenciais no chat.

Continuar a expansão por famílias completas após consultar HEAD e CI. Próximas famílias sugeridas permanecem as da M26: mudanças com efeitos FLIP e recuperação múltipla. Não contar as 696 autorizações como novas implementações. Nem a loja nem o recebimento automático das 832 cartas foram declarados como entregues.
