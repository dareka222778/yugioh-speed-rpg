# Checkpoint — Missão 16

Workspace: `C:\Users\Micro\Downloads\speed-rpg-rea-20261026\repo-mission16-8bcc05f9`.

Base remota conferida: `8bcc05f9796fdca4cee2562b26a709cd2fa7e691`. PR #12, branch `feat/rea-engine-recovery-20261026`, rascunho. Não usar o workspace da Missão 15 para enviar alterações. Esta cópia foi materializada de 680 blobs e não possui checkout Git; commits pela API devem usar comparação condicional do HEAD, sem force.

Implementado: diagnóstico SQLite não destrutivo e repetição diagnóstica das 17 suítes de aceitação. Novos testes: `tests/sqliteHealth16.test.cjs` e `tests/repeatAcceptance16.test.cjs`, 12 aprovados localmente em Node 24. A CI Node 22 precisa confirmar o conjunto completo. O soak agora publica composição do banco antes de remover sua fixture isolada.

Retomar:

1. Conferir HEAD remoto e CI, preservando qualquer mudança posterior. Se falhar, corrigir a causa; não relaxar testes.
2. Ler relatório desta missão e as evidências da Missão 15. Conferir `artifacts/acceptance16/report.json` e `artifacts/sqlite-health16-soak.json` nos dois jobs.
3. Conferir a matriz e as três admissões descritas abaixo. Rainbow Flower, Leghul, Ooguchi, Mystic Lamp, Queen's Double, Shadow Ghoul, Amazoness Archer e Cannon Soldier já existiam. Não repetir contabilização. Goblin Thief continua bloqueado.
4. Usar operações v8 existentes quando semanticamente equivalentes, acrescentando revisão de catálogo por dados. Novas semânticas exigem resolver isolado. Testar negação, movimento, múltiplas fontes, custos, replay e IA conforme aplicável.
5. Executar Node 22: npm ci, npm run check, npm test, todas as auditorias/preservações e CI completa. Localmente `node --test tests/sqliteHealth16.test.cjs tests/repeatAcceptance16.test.cjs` não depende do bot ou credenciais.
6. Atualizar relatório/checkpoint/evidências e manter PR rascunho. Sem merge, deploy, distribuição ou acesso Discord real.

## Segundo bloco implementado

Commit remoto `ec8d92c9afa5cb4f2852b739a88e275825196d83`: três admissões individuais (Chaos Necromancer, Yellow Luster Shield, Buster Blader), revisão v8 `b84222a8334764cb6bc6f6f69c99eb7a4b3925b5dda2c754df8fd92a843e4c95`, 752 certificados e 130 distribuíveis. As outras oito cartas da triagem já estavam certificadas; não repetir trabalho. Goblin Thief, Needle Ball e Mooyan Curry permanecem bloqueados por semânticas/decisões específicas.

CI `40705330464` aprovou tipagem, 5.328 testes e auditorias; falhou no comparador JSON do novo simulador (propriedade undefined omitida). A comparação foi corrigida localmente para a representação persistida. Não atribuir essa falha à engine nem à intermitência antiga. Nova CI deve confirmar o simulador completo.

Alterações seguintes: três guardas de admissão contra combinações não executáveis, três regressões cruzadas adicionais, opções CLI de orçamento SQLite e decomposição física via dbstat quando disponível. O relatório do soak também será impresso no log para auditoria. Validação local corrente: 33 testes de cartas/admissão, 12 operacionais; nove comandos de preservação/auditoria aprovados. Duas suítes que importam better-sqlite3 não rodam neste ambiente local sem npm ci; não confundir isso com resultados da CI Node 22.

Conferir a CI mais recente antes de iniciar outro lote. Não há suporte comprovado a custos de gatilhos, escolha de jogador ou LP simultâneos só porque o texto usa operações familiares. Não alterar v1–v8; as revisões antigas e os 749 certificados anteriores são comparados integralmente.

Beta real e capacidade de 20–50 jogadores continuam não homologados. I02 mantém a limitação histórica legítima.

## Quarto bloco

SHA-256 de snapshots passou a usar leitura limitada a 64 KiB, sem mudar hashes/formato. Testes `snapshotHash16` verificam arquivos binários, ausência de leitura integral e fechamento após I/O inválido. São **48 testes novos locais aprovados** no total; TAP completo persistido em `docs/evidence/mission16-local-tests.tap`.

CI `40706485447` do commit `f7a8d5912669908f3d5e0ff16dd065364ee7cd96` já passou a simulação corrigida de 50/100 sessões; aguardar os resultados completos. A próxima CI incluirá a otimização do hash. Consolidar métricas e HEAD final neste documento após verificar ambos os jobs.

## Lote mundial — estado corrente

O registro local corrente é **762 certificados (+13 desde a base), 130 distribuíveis, engine-v8**. Dez Monstros Normais foram admitidos por impressões TCG oficiais anteriores ao corte: Mystical Shine Ball, Mikazukinoyaiba, Dancing Elf, Sealmaster Meisei, Gogiga Gagagigo, Metal Armored Bug, Cosmo Queen, Turu-Purun, Warrior of Zera e Dharma Cannon. Fonte italiana oficial usada para Dancing Elf após timeout em inglês; não há entrada portuguesa e o nome inglês foi preservado. Não interpretar textos narrativos de Normais como efeitos.

Nova revisão de dados `f580081f728973259ab608d9ccfeca9938278a39708e9f0897e2c4da0946614c`. A revisão de 752 cartas e suas definições/certificados continuam intactas. Os dados importados OCG posteriores não impedem elegibilidade mundial quando há impressão TCG comprovada; não foram reescritos. Rituais, protótipos sem passcode, Vorse Raider com identidade conflitante e Slime Toad com ressalva de nome permanecem fora desse lote.

**120 testes novos locais aprovados**, zero falhas/TODO. Executar também `node scripts/audit-world-normal16.cjs`, consumindo o manifesto real `artifacts/certification-executions-world-normal16.json`. A CI Node 22 completa do novo lote ainda deve concluir. A matriz tem 1.200 registros restantes.

Commits posteriores já registrados: `496fdc84` (diagnóstico), `ec8d92c9` (contínuos/IA), `f7a8d591` (guardas/comparação JSON), `54c2b6fb` (hash limitado), `723aa111` (aura adversária na avaliação). CI `40707211361` aprovou ambos os jobs no código anterior ao último ajuste de aura. Não usar esse resultado como CI do lote mundial.
