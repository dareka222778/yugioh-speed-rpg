# Missão 5 — expansão mecânica, normalização e memória

Base confirmada no PR #12: `6cf78e612a04254a0ddb43bb5752cabe394c2063`, 170 certificados, 791 testes e resolvedores v1–v4. Não havia alteração remota posterior. Nenhum banco ou recurso de produção foi aberto para esta investigação.

## 116 bloqueios: decisões por identidade

O inventário original está em `evidence/mission5-blockers-baseline.json`, vinculado ao hash do snapshot factual. `scripts/audit-normalization-blockers.cjs` gera uma decisão por cada uma das 116 identidades canônicas, com causas, aliases, resultado e justificativa. As contagens de causas se sobrepõem: 79 registros tinham categoria não projetável na engine; 40 tinham passcode ausente ou múltiplo; nove tinham CID ausente; três tinham tipo desconhecido; cinco tinham estatística não numérica. Não foram encontrados erros de data/região nesses 116 pelo validador; isso não transforma a fonte importada em comprovação primária de todos os lançamentos.

**105 bloqueios factuais/estruturais resolvidos; 11 permanecem.** O snapshot original não foi reescrito. A maior parte da correção é uma separação de responsabilidades: Fusão, Ritual, categoria ainda não curada e conjuntos de aliases podem conservar fatos normalizados sem possuir uma projeção executável. Não se atribui um efeito inexistente, não se escolhe o primeiro alias silenciosamente e não se promove a carta. Dependências mecânicas e seleção de identidade jogável permanecem gates separados.

Três casos adicionais tiveram pesquisa primária de estatísticas: Gren Maju Da Eiza, Maju Garzett e Gradius' Option têm `?` impresso. O normalizador factual preserva o símbolo e marca estatística dinâmica; a projeção numérica da engine continua bloqueada. Não foi usado zero como substituto e nenhuma dessas cartas foi certificada. As fórmulas, referência viva a outro monstro e captura de ATK de Tributos permanecem não implementadas. Fontes e decisões individuais estão em `evidence/mission5-unresolved-research.json`.

Restam onze identidades sem passcode recuperado; nove também não têm CID na fonte. Incluem versões originais dos três Deuses, Ulevo, Meteo the Matchless e registros antigos sem identidade jogável suficiente. Não foram mesclados com versões modernas pelo nome. As páginas oficiais de Ulevo/Meteo também mostram condições de três Tributos por tipo e vitória de Match, que não estão implementadas. Nenhum passcode sintético foi inventado.

O resultado é **1.951/1.962 registros factualmente normalizados**, mantendo os onze bloqueados. Isso mede o esquema factual, não 99,4% de implementação mecânica. Os 170 certificados curados anteriores continuam válidos. A distinção entre fato normalizado, projeção de engine, implementação, teste, certificado e distribuição está explícita no JSON do pipeline.

## 27 novas cartas: 170 → 197

Todos os novos certificados são de cartas com mecânicas; não houve novo lote de Normais. As páginas oficiais por CID sustentam regras/estatísticas e ao menos uma impressão OCG anterior a 30/09/2004. O relatório conserva separadamente a primeira observação importada: uma reedição verificada antes do corte prova elegibilidade, não a menor data mundial. Para regras, usou-se a base oficial TCG/OCG, sem extrair código ou dados privados do Duel Links. Descrições operacionais em português foram escritas a partir das definições, não transcritas.

| Família | Novas cartas |
|---|---|
| Ataque direto contínuo | Mystic Lamp, Jinzo #7, Rainbow Flower, Queen's Double, Ooguchi, Leghul |
| Recrutamento após destruição em batalha | Flying Kamakiri #1, Giant Rat, Shining Angel, UFO Turtle, Mother Grizzly |
| Virar com contagem na resolução | Princess of Tsurugi |
| Destruição em grupo de Magias/Armadilhas | Harpie's Feather Duster, Heavy Storm |
| Campo | Forest, Wasteland, Umi |
| Equipamento | Legendary Sword, Beast Fangs, Machine Conversion Factory, Vile Germs, Steel Shell, Follow Wind, Mystical Moon |
| Dano/recuperação parametrizados | Final Flame, Goblin's Secret Remedy |
| Fusão sem efeito adicional | Gaia the Dragon Champion |

Regras e identidades revisadas estão em `evidence/mission5-mechanical-reviews.json`; aprovações/fingerprints em `mission5-individual-reviews.json`. Cada carta executa quatro cenários independentes: identidade, mecânica, replay/restauração e caso negativo, totalizando **108 cenários**. O manifesto só é produzido pela execução dos testes. O pipeline exige seu fingerprint atual e todos os cenários, além de revisão individual. Nenhuma decisão de certificação é automática.

Os dois casos com ID de arte divergente, Final Flame e Harpie's Feather Duster, foram conferidos separadamente por passcode e CID. O ID de arte importado não substitui o passcode; todos os aliases originais foram preservados. O HTML oficial não publica passcodes, e essa concordância secundária não foi rotulada como extração oficial.

Black Skull Dragon foi pesquisado e **não certificado**: além da receita compatível, há a condição de identidade sempre tratada como Archfiend, ainda sem representação/testes específicos. Uma receita de Fusão que funciona não basta para certificar uma carta inteira. Ritual, Espíritos, estatísticas dinâmicas, Match winners e outras famílias não recuperadas continuam explicitamente dependentes de implementação.

## Semânticas e regressões

`directAttack` permite escolher ataque direto mesmo havendo defensores, preservando a opção de atacar um monstro e o limite de ataques. A resolução revalida o atacante e a repetição de ataque oferece os destinos corretos. Não se dá essa permissão a outros monstros. Waboku, Kuriboh e Livro da Lua continuam capazes de impedir o dano/ataque nas janelas existentes.

`burnPerSpellTrap` conta as zonas adversárias na resolução, incluindo Campo e cartas baixadas. Princess ainda resolve seu Virar após ser destruída na batalha; uma resposta que retire Magias/Armadilhas altera a contagem corretamente. Não se confunde declaração com mutação de PV.

`destroySpellTraps` captura o grupo de UIDs antes da mutação, distingue ambos os campos de somente o adversário, inclui Campo/equipamentos/cartas baixadas e respeita o envio da Magia Normal ativada ao Cemitério. Destruir uma carta não nega seu efeito já ativado. As regressões incluem Bloqueador de Magia com custo pago e uma corrente com Jar of Greed.

Os cinco recrutadores usam o adaptador de Mystic Tomato com atributo parametrizado, escolha opcional, zona livre, limite de ATK, Invocação em Ataque e embaralhamento persistido. Não ativam por destruição de efeito. Os equipamentos e Campos reutilizam filtros/penalidades existentes. Gaia exige os dois materiais exatos e o fluxo normal de Polimerização; não recebe condições de outras Fusões.

Há nove regressões adicionais de interações e compatibilidade, além dos cenários individuais. NPCs reconhecem o novo ataque direto letal e evitam destruir apenas seus próprios recursos; isso tem regressões próprias e não exige alteração dos decks NPC ou da economia. O texto de recrutamento foi generalizado para os novos atributos, conservando o comportamento histórico nos resolvedores anteriores.

## v5 e compatibilidade

Novas partidas selecionam explicitamente **engine-v5**, com 34 módulos e manifesto. A v5 foi consolidada como candidata nesta branch; não foi disponibilizada em produção. Os **123 módulos v1–v4, 170 certificados anteriores e 149 arquivos protegidos** são verificados por hash em `check-mission5-integrity.cjs`. Saves antigos continuam selecionando seus executáveis; não foram reescritos, migrados destrutivamente ou atualizados para v5 por conveniência.

O despacho carrega agora o resolvedor histórico sob demanda. A facade continua síncrona e devolve definições clonadas, com cache por versão. Um processo novo carrega v5; pedir v2 acrescenta somente v2. Validação e eventos também delegam à versão correta, sem imports antecipados de todos os módulos antigos. Os testes verificam o grafo carregado em processo novo e a continuidade de saves antigos; o gerador de fechamento foi adaptado para remover essas dependências de despacho nas futuras cópias fechadas.

Os cinco manifestos, testes de saves/replay e comparações de partidas históricas continuam obrigatórios. I02 mantém a limitação de épocas de zona nunca gravadas: não há reconstrução inventada desses dados.

## Memória, SQLite e a referência de 1 GB

SQLite continua em WAL e as entradas de ações usam IMMEDIATE, correção demonstrada na Missão 4. Não foi introduzida fila distribuída, novo banco ou arquitetura de workers no bot. As contagens de escritores abaixo são **configurações do harness de teste**, não uma alteração da implantação. BUSY é medido e recebe retry limitado com o mesmo request no harness; não se promete ausência de contenção.

`stress-persisted-duels.cjs` compara 50 sessões com quatro escritores e carregamento antecipado das versões, 50 com quatro sob demanda, 50 com dois e 100 com dois. Cada configuração conclui partidas, entrega duplicatas, rejeita falha transacional/ação inválida, reinicia um processo e verifica revisões, cartas, economia, assentos, integridade SQLite e chaves estrangeiras. O protocolo de jogo é o mesmo; só a configuração de carga muda.

A memória agregada é a soma do RSS do coordenador e dos escritores **vivos** amostrados nas respostas IPC/início/fim. Processos encerrados não são somados como ativos. Páginas compartilhadas podem ser contadas mais de uma vez e picos entre amostras podem escapar. Isso não é medição de cgroup nem limite rígido de hospedagem. CPU é registrada em microssegundos por processo. O limite de referência usado no relatório é 1 GiB, explicitamente em bytes.

Um checkpoint completo observou aproximadamente 906 MB agregados em 50/4 com carregamento antecipado, 886 MB em 50/4 sob demanda, 561 MB em 50/2 e 610 MB em 100/2. A redução isolada pelo carregamento sob demanda foi pequena nesse pico; reduzir replicação de escritores teve efeito maior. São amostras, não prova de ausência de vazamentos. Os valores finais devem ser consultados no CI do SHA final, sem misturar execuções.

O resultado apoia medir uma implantação pequena com poucos escritores, sem criar processos novos automaticamente. Faltam margem para Discord, imagens/Sharp, sistema operacional, outros serviços, partidas de longa duração e mistura de versões. Não se declara que qualquer carga de 100 duelos com renderização cabe em 1 GB. Engine, IPC/fila/transação e resposta real do Discord são métricas diferentes.

## Distribuição, reprodução e próximos passos

Há **197 certificados: 111 Normais, 24 monstros de efeito, duas Fusões e 60 Magias/Armadilhas**. As 67 adições das Missões 3–5 permanecem bloqueadas para distribuição. Não houve concessão, loja, recompensa, mudança de starter ou de deck NPC. Layout, verso, imagens, perfis, coleções, progresso, esquema e bancos existentes foram preservados. Somente bancos temporários de testes foram criados.

O workflow executa hashes/preservação, tipagem/build, todos os testes, auditorias de normalização e dos dois lotes, cargas comparativas, REA, benchmarks headless 32/50/100, simulações 1v1/2v2, treinos e prévias offline. O artefato REA conserva os JSON individuais, por família e de memória/latência/CPU. O CI do SHA final e o PR #12 são a referência para a contagem final de testes e medições; um checkpoint anterior não substitui essa verificação.

O ambiente local não dispõe de todas as dependências npm. Testes puros e validações headless foram executados em Node 24; tipagem, SQLite, Sharp e a suíte completa são verificados de fato na CI Node 22. Testes offline de componentes/imagens/partidas completas permanecem; **Discord real continua não homologado**, sem servidor ou credenciais novos acessados.

Próximas prioridades: resolver identidades restantes com fonte suficiente; implementar semânticas dinâmicas sem trocar `?` por zero; estudar rituais, seleção múltipla, identidades de arquétipo e efeitos contínuos ainda ausentes; ampliar manifestos por família; testar soak, crash abrupto no meio de transação e carga Discord representativa em ambiente autorizado. Agrupar lotes revisados em releases versionadas evita criar um snapshot por carta. Não há evidência para declarar conclusão total do catálogo ou estimar prazo linear para suas mecânicas complexas.

Sem merge, deploy, alteração de produção ou distribuição.
