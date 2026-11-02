# Missão 17 — lote de cinco efeitos inéditos no catálogo clássico

Base: `feat/rea-engine-recovery-20261026`, PR #12 (rascunho), Mission 16 (`9733dd1a167c0b4a77898a102462e7eee42350d1`).

## Escopo preservado

- A engine v8 e todos os resolvers históricos continuam congelados; apenas definições de dados foram acrescentadas à revisão **append-only** do catálogo v8.
- Nenhuma carta adicional foi liberada para distribuição: a allowlist permanece em **130**.
- Nenhum merge, deploy, alteração de produção, autenticação no Discord ou alteração do layout foi incluído.
- A revisão anterior do catálogo continua disponível para partidas persistidas antigas; as cinco novas cartas não aparecem em revisões antigas.

## Admissões individuais (27–28/10/2026)

| Passcode | Carta | CID Konami | Efeito integral representado na v8 |
| --- | --- | --- | --- |
| `45311864` | Goblin Thief | 5985 | Dano de 500 LP ao adversário e recuperação de 500 LP ao controlador |
| `46700124` | Machine King | 4413 | +100 ATK por Máquina exposta em ambos os campos, incluindo a própria |
| `82108372` | Mudora | 5356 | +200 ATK por monstro Fada no próprio Cemitério |
| `18891691` | Perfect Machine King | 5804 | +500 ATK por outra Máquina exposta em ambos os campos; exclui a própria |
| `42883273` | Wodan the Resident of the Forest | 4241 | +100 ATK por Planta exposta em ambos os campos |

Para cada carta, a identificação histórica local (nome, passcode, CID, data/região elegível) foi confrontada com o texto individual do [banco oficial Konami](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&request_locale=en). Os links com `cid` específicos constam no `src/mechanicalBatch17.ts`. Para Wodan, a base histórica não tinha nome em PT: o nome apresentado é localização editorial, não evidência de nome oficial.

**Identidades desduplicadas:** `73134082` (Final Flame) e `18144507` (Harpie's Feather Duster) foram excluídas após a auditoria histórica revelar que `73134081` e `18144506` já certificavam as mesmas cartas canônicas e seus efeitos completos. A contagem não incorpora variantes de passcode como cartas diferentes.

## Evidência reprodutível

- `src/mechanicalBatch17.ts`: somente descrições e operações v8 já existentes; nenhuma heurística baseada em nome/texto.
- `src/cardCertifications.ts`: cinco fingerprints mecânicos com referência explícita à suíte de regressão.
- `tests/mechanicalBatch17.test.cjs`: verificações de identidade, elegibilidade, compatibilidade, replay e cenário de efeito por carta; inclui contagens próprias/opostas, visibilidade, persistência, deduplicação e limite de distribuição.
- `catalog/engine-v8/manifest.json`: revisão append-only; não sobrescrever revisões anteriores.
- `scripts/freeze-catalog.cjs engine-v8`, `npm run check:cards`, `npm test`: procedimentos de validação e CI.

## Por que não admitir as demais cartas de uma vez

O catálogo histórico de cerca de **1.962 registros** está separado das cartas com **efeitos integrais executáveis**. Muitas pendências requerem semânticas ainda ausentes: escolha de alvos, tributos/custos, gatilhos de fase, eventos contínuos, rituais, controle, substituição de destruição, Equipamentos que retornam, restrições por nome e encadeamentos. Importar nomes ou imprimir um marcador `certified` nessas cartas não implementaria o jogo.

**Próximo bloco de maior retorno**: desenvolver isoladamente uma engine v9 para famílias de custo/alvo e gatilhos e suas correspondentes tabelas de decisão da IA, testar famílias inteiras, congelar o novo resolver e só então certificar grupos em massa. Manter a v8 imutável para partidas/recibos existentes. A liberação para beta/Discord depende separadamente do ambiente e de autorização explícita do proprietário.
