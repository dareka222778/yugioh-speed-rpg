# Missão 11 — Magias de Equipamento, economia e ataque direto

Status: **candidata técnica verificada localmente**; CI completo no GitHub e homologação Discord real ainda exigidos após o commit. PR #12 permanece em rascunho. Nenhum merge, deploy, alteração de layout, concessão de carta ou distribuição ocorreu.

## Mudança executável

O catálogo `engine-v7` passou de **723 para 740 certificados**, preservando byte a byte as cinco revisões anteriores, incluindo saves de 203/225/243/692/723 cartas. Nenhuma semântica de resolver histórico foi editada; foram adicionadas definições individuais expressáveis pelas operações existentes:

| Família | Quantidade | Cartas |
| --- | ---: | --- |
| Equipamentos de ATK/DEF por Tipo ou Atributo | 12 | Silver Bow and Arrow, Insect Armor with Laser Cannon, Violet Crystal, Burning Spear, Electro-Whip, Elf's Light, Gust Fan, Laser Cannon Armor, Power of Kaishin, Raise Body Heat, Salamandra, Shine Palace |
| Economia por Magia Normal | 2 | Raimei (300 de dano); Rain of Mercy (+1000 PV para ambos) |
| Ataque direto contínuo | 2 | Servant of Catabolism; Nightmare Horse |
| Efeito ativado com Tributos | 1 | Hysteric Fairy (Tribute dois monstros, ganhe 1000 PV) |

Revisão imutável adicionada: `b4aff6aef433f583d8468a2ef43433b7614898842cdf1a44e9214359b7274917`. Identidades históricas e datas OCG foram comparadas com o snapshot importado; o texto **integral** de cada efeito foi comparado com uma segunda fonte independente, uma resposta da API YGOPRODeck. As descrições e hashes das respostas estão em `docs/evidence/mission11-rule-crosscheck.json`; as fichas e fingerprints estão em `docs/evidence/mission11-individual-reviews.json`. URLs de CID apontam para a base Konami, mas não representam comprovação de visita individual ao site nem equivalem a homologação de rulings históricos.

## Testes e auditoria

- `tests/mechanicalBatch11.test.cjs`: **103 testes** locais aprovados (seis cenários individuais por carta + isolamento de catálogo). O oráculo inclui restrições de Equipamento, bônus no alvo e não no adversário, recompilação de estado/JSON, corrente de negação com Magic Jammer, destruição real por Mystical Space Typhoon, ataque direto com defensor no campo, Skill Drain, Waboku, custo e resolução mesmo após Tributar a própria fonte.
- `scripts/audit-mechanical-batch11.cjs`: **102 cenários individuais** executados, zero falhas, todas as 17 fichas passam o pipeline de revisão por carta e permanecem **não distribuíveis**. O teste complementar é o 103º.
- `scripts/verify-catalog-revisions.cjs`: todas as **seis revisões** conferidas por SHA-256, identidade, schema executável congelado e preservação de definições/certificados anteriores.
- Auditorias das Missões 9 e 10: mantiveram os **449 Normais** e **31 Fusões** certificados, com respectivos 3.592 e 186 cenários individuais válidos.
- `scripts/check-mission7-integrity.cjs` e `scripts/check-mission8-integrity.cjs`: preservação íntegra.
- O CI remoto da base de 723 cartas terminou com sucesso em seus jobs `test` e `extended-soak`. O bloco de 740 exige seu próprio CI.

## Limites reais e continuidade

- **740/1.962 não significa 740 cartas autorizadas para o público**. Das 740, 130 continuam distribuíveis como antes; **610 permanecem bloqueadas**. A meta de beta completo exige cobertura mecânica do catálogo escolhido, testes integrais de 1v1/2v2, tradução PT-BR, revisão das diferenças TCG/OCG e 11 bloqueios de identidade.
- A homologação por 20–50 pessoas poderá acontecer na hospedagem de teste já usada pelo responsável, mas capacidade real, latência de Discord/renderização, RAM de todo o processo, retenção/backups, privacidade e recuperação precisam de medição no host. Benchmarks headless não homologam essas propriedades.
- Próximos lotes de alto valor: efeitos FLIP que exigem escolha de múltiplos alvos, recrutamento por Tipo/nível, efeitos em batalha e magias/armadilhas condicionais. Implementar qualquer nova operação com versão explícita do resolver e testes de saves antigos, nunca reescrevendo a versão arquivada.

## Gates do beta

1. Continuar garantindo compatibilidade, zero regressões, replay e integridade transacional.
2. Certificar todas as mecânicas e cartas do escopo do **beta completo**, isolando bloqueios factuais sem inventar comportamento.
3. Revisar apresentação/comandos e PT-BR sem alterar a identidade visual aceita para duelos.
4. Obter autorização operacional e medir o bot realmente conectado à hospedagem de teste com acesso controlado, backup e rollback.
5. Abrir beta de 20–50 participantes por convite, registrar incidentes e só depois considerar lançamento público.
