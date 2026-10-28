# Missão 21 — expansão em andamento

**A meta de +500 não foi concluída.** Base confirmada: 771 identidades certificadas. Primeiro bloco admitido: 11 novas, total 782. Restam 489 para a meta; progresso aritmético de 2,2%. Distribuição continua limitada às 130 cartas autorizadas.

## Implementação efetiva

Novos duelos usam engine-v9 e o núcleo evolutivo TypeScript da raiz. Isso integra de fato os seletores e operações preparados na M20: nomes de regra, marcadores de arquétipo, contagem bilateral e nominal no campo/Cemitério, equipamentos com limite de nível/categoria e modificadores condicionados à posição/fase. Não foi copiada outra engine completa. Os 277 módulos arquivados v1–v8 permanecem íntegros. A v9 é uma versão de desenvolvimento mutável; não há promessa de preservar a semântica de saves de teste v9 entre alterações futuras.

Cartas admitidas individualmente: Harpie Lady 1, Harpie's Pet Dragon, Swamp Battleguard, Lava Battleguard, Amazoness Paladin, Dark Magician Girl, Black Skull Dragon, Cyber Shield, Fusion Weapon, Chorus of Sanctuary e Banner of Courage. Senhas alternativas não são identidades adicionais. Nenhuma foi liberada na loja.

Corrigidos: bônus de Banner durante descarte final; limite de três cópias combinadas por nome de regra; ciclo de importação da fachada; rejeição indevida da v9 em fichas/Standby; uso do runtime de catálogo incorreto na avaliação tática de destruição; inclusão do catálogo v9 em backups. Os testes de recuperação de snapshots antigos continuam ativos.

## Evidência e automação

- `tests/mission21ActiveBatch.test.cjs`: 68 testes pela entrada pública de novos duelos, incluindo 66 cenários individuais e duas regressões cruzadas.
- `docs/evidence/mission21-individual-reviews.json`: revisão do efeito integral, fatos oficiais e impressão regional elegível. `reviewedTextSource` identifica o idioma efetivamente consultado; `primarySource` conserva a referência canônica do catálogo. Datas de impressão verificadas não são alegações de primeira publicação e não reescrevem datas importadas.
- `scripts/audit-mechanical-batch21.cjs`: cruza revisão, fingerprint, seis cenários por carta, versão ativa e bloqueio de distribuição.
- `scripts/triage-mission21.cjs`: percorre todos os 1.962 registros; distingue importação, identidade, representação, teste e certificação. Pistas limitadas da M13 continuam identificadas como incompletas.
- `scripts/mass-certification21.cjs`: produz somente propostas. Rejeita requisitos ausentes, revisão incompleta, execução de versão errada, testes faltantes/falhos, hashes antigos de suítes e duplicatas. Seus testes de gate usam fixtures explicitamente sintéticas, sem contabilizá-las como novas cartas.
- `scripts/index-full-text21.cjs`: índice completo dos textos secundários dos 1.180 pendentes. Nenhuma correspondência textual comprova equivalência mecânica.

O cache público secundário tem 1.180 textos integrais, zero falhas de coleta e zero conflitos entre nome/CID/passcodes importados e recuperados. Onze registros têm outros impedimentos, como falta de CID/passcode. O arquivo `docs/evidence/mission21-full-text-index.json` contém hashes de texto, pistas por operação e manifesto SHA-256 dos sete arquivos de cache. Os textos completos ficaram na pasta local irmã `mission21-text-cache`, fora do Git; o índice inclui URLs reproduzíveis. Não foram incluídos APK, dumps ou código proprietário.

## Verificações observadas

A CI do commit `c3b009fa` executou Node 22.23.4: tipagem/compilação aprovadas, **5.561 testes aprovados, zero falhas e zero TODO**, mais gate individual M21 aprovado. A execução parou posteriormente no gate de beta M7 por expectativa fixa de oito versões; o conjunto misto agora tem nove. Essa expectativa foi corrigida mantendo as demais asserções. A nova execução completa ainda precisa ser consultada após o próximo commit. Não declarar CI totalmente verde com base apenas na aprovação da suíte.

As falhas iniciais foram reproduzidas e corrigidas: 127 testes na primeira CI de integração, incluindo expectativas v8 e bloqueios reais em fichas/Standby. Os gates de preservação M3–M8 usam normalização delimitada das adições revisadas, mantendo os bytes históricos como referência; nenhuma suíte foi desabilitada.

## Métricas internas disponíveis

Na CI `40756801824`, a simulação de IA concluiu 50/50 e 100/100 sessões, com conservação e recuperação determinística. P95 por operação: 0,814 ms e 0,685 ms; RSS de pico: aproximadamente 166 e 220 MiB. São medições internas de um processo, sem renderização, SQLite por movimento ou Discord. O rótulo fixo v8 desse relatório foi corrigido para registrar a versão realmente utilizada. Não há homologação de 20–50 usuários reais.

## Dependências e continuação

O catálogo não tem centenas de monstros Normais restantes: os três importados assim ainda pendentes carecem de identidade/passcode oficial verificável. Entre os demais há 562 monstros de Efeito, 311 Magias, 253 Armadilhas, 31 Fusões e 20 monstros de Ritual pendentes.

A fila de textos completos identifica pistas amplas de destruição (392), LP (357), posição/controle (274), duração/fase (258), recuperação (187), compra/descarte (142), Tributo (127), estatísticas contínuas (114) e FLIP (108), com sobreposição. Esses números não representam cartas desbloqueadas nem famílias concluídas. Priorizar seletores/movimentos genéricos e escolhas durante resolução; revisar Rituais em conjunto antes de qualquer admissão. Custos, gatilhos, efeitos secundários e exceções continuam exigindo implementação e testes próprios.

Sem merge, deploy, Discord real ou distribuição. O PR #12 permanece em rascunho. A missão permanece aberta para novos blocos de implementação; não há evidência de catálogo completo.
