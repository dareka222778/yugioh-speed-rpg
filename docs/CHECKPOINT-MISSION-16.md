# Checkpoint — retomada da Missão 16

**Estado consolidado:** engine-v8, **762 certificados (+13)**, **130 distribuíveis**, **5.410 testes aprovados, zero falhas/TODO**. REA 23/23 com limitação histórica I02. Nenhum merge, deploy, acesso Discord ou alteração de produção.

Último código validado: `4f9f0edfcabb77292b26eca821b74432c0bf7ee4`. [CI 40711583392](https://github.com/dareka222778/yugioh-speed-rpg/actions/runs/40711583392): test e extended-soak aprovados. A consolidação documental pode ter SHA posterior; verificar o HEAD/CI atuais no [PR #12](https://github.com/dareka222778/yugioh-speed-rpg/pull/12), sempre em rascunho. Branch: `feat/rea-engine-recovery-20261026`.

Workspace desta sessão: `C:\Users\Micro\Downloads\speed-rpg-rea-20261026\repo-mission16-8bcc05f9`. Foi materializado dos blobs e não é um checkout Git utilizável. Commits pela API usaram comparação condicional do HEAD, sem force. Não usar os workspaces das Missões 15 ou anteriores como fonte de envio. Há estado auxiliar em `../mission16-session.json`; o remoto e este checkpoint prevalecem sobre caches antigos.

## O que está concluído

- Três contínuos: Chaos Necromancer, Yellow Luster Shield, Buster Blader.
- Dez Normais: Mystical Shine Ball, Mikazukinoyaiba, Dancing Elf, Sealmaster Meisei, Gogiga Gagagigo, Metal Armored Bug, Cosmo Queen, Turu-Purun, Warrior of Zera, Dharma Cannon.
- Sete cenários individuais por carta; regressões de IA, Equipamento/imunidade, controle, fontes, movimento, replay e 2v2. **120 testes novos**.
- IA avalia estado prospectivo completo: retirada da mão, Tributos no Cemitério do dono, fontes próprias e mudanças de ameaça pública adversária. Não consulta identidades ocultas.
- Guardas de admissão rejeitam combinações sem execução suportada. Arquivos históricos v1–v8 intactos (277 módulos/oito manifestos).
- Diagnóstico SQLite não destrutivo, dbstat opcional, orçamento/alerta configuráveis e checkpoint PASSIVE explícito.
- Hash de backup em blocos de 64 KiB, compatível com manifestos anteriores.
- Repetição diagnóstica de aceitação (cinco vezes, 179 testes por tentativa), TAP/stderr íntegros.

Revisão v8 intermediária: `b84222a8334764cb6bc6f6f69c99eb7a4b3925b5dda2c754df8fd92a843e4c95` (752). Corrente: `f580081f728973259ab608d9ccfeca9938278a39708e9f0897e2c4da0946614c` (762). Não reescrever revisões ou executáveis congelados.

## Evidências e limites

Ler integralmente `docs/REA-MISSION-16.md`, `docs/evidence/mission16-validation.json`, as revisões individuais dos dois lotes e `mission16-priority-matrix.json`.

Soak final: 8.577 duelos, 509.676 commits, principal ~309 MiB, WAL ~4 MiB, checkpoint completo, conservação/economia/integridade aprovadas. Crescimento explicado nesta reprodução por retenção de eventos/estados/recibos/índices. Não foram removidas linhas nem aplicado VACUUM. Arquivamento com leitura/replay/recibos preservados permanece pendente.

A falha intermitente antiga continua sem causa recuperada; não foi reproduzida. A falha nova do comparador de simulação (undefined versus propriedade ausente em JSON) foi corrigida separadamente. Não confundir os casos.

Os Normais são elegíveis pela união mundial TCG; não se corrigiu retroativamente a primeira data OCG importada. Não certificar Rituais como Normais. Protótipos sem passcode, Vorse Raider conflitante e Slime Toad com ressalva de identidade/nome continuam fora do lote. Oito candidatos triados no começo já estavam certificados; não recontar.

## Próxima execução segura

1. Conferir HEAD/PR/CI e alterações posteriores, preservando trabalho local não registrado.
2. Node 22: `npm ci`, `npm run check`, `npm test`; todos os checks de preservação, `verify-catalog-revisions`, `audit-mission15`, `audit-mechanical-batch16` e `audit-world-normal16`; depois restante da CI completa.
3. Executar `scripts/simulate-mission16.cjs`, cargas persistentes 50/100 e soak 600 quando houver mudança de estado/persistência que justifique repetição. Não substituir auditorias por manifests fabricados.
4. Continuar pelas dependências compartilhadas da matriz (1.200 registros restantes): LP simultâneos, custo em gatilhos opcionais, seleção de jogador, busca/recrutamento por identidade e durações por fase. Goblin Thief não é simplesmente dano seguido de cura; Needle Ball não cabe no gatilho sem custo; Mooyan Curry exige escolha do beneficiário. Novas semânticas exigem resolver isolado, não editar v8.
5. Projetar arquivamento de eventos terminais publicados com leitura de arquivo e recuperação verificadas, mantendo recibos idempotentes. Não aplicar TTL/purga indiscriminada.
6. Atualizar evidências, commits e PR em rascunho. Não fazer merge/deploy/distribuição.

Beta: proprietário sozinho contra IA primeiro; depois convidados e 20–50 usuários. Ambiente Discord isolado e credencial segura ainda dependem de configuração/autorização específica. Benchmarks internos não homologam Discord nem capacidade Starter+.
