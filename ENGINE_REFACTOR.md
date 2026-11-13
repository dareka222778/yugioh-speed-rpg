# Refatoração incremental do motor — primeira entrega

> Registro da entrega anterior de 121 cartas. A continuidade atual, com 130
> cartas e cobertura por famílias, está em [ENGINE_CONTINUITY.md](ENGINE_CONTINUITY.md).

## Contrato preservado

Base de comparação: `e6840e13a40b590d9d98754faf6effe74acb9231`.
Mesmo formato, mesmas 121 cartas habilitadas (71 monstros Normais, 12 monstros
com efeito), mesmos decks de NPC e mesmo tabuleiro. Nenhuma dependência nova.
Não houve implantação nem alteração no banco de jogadores.

`src/duelRenderer.ts` continua com SHA-256
`01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c`.
`src/duelUI.ts` e `src/npcContent.ts` não foram alterados.

## Responsabilidades executáveis

| Módulo | Responsabilidade |
| --- | --- |
| `rulesProfile.ts` | Perfil fixo e versões das regras/definições; não cria outro formato de duelo |
| `cardMetadata.ts`, `cardCatalog.ts`, `classicEngineCards.ts` | Metadados locais, sem importar Discord, SQLite ou renderer |
| `effectDefinitions.ts` | Definições e validação de operações conhecidas |
| `monsterEffects.ts` | Gatilho, custo, operação e política/janela explícita de cada efeito de monstro |
| `effectModels.ts`, `effectTiming.ts` | Modelos de seleção/destruição e políticas de ativação, velocidade e Etapa de Dano |
| `effectOperations.ts` | Execução compartilhada, sem nomes ou IDs de cartas |
| `spellExceptions.ts` | Registro por ID de duas exceções extraídas: Destruição de Cards e Escudo & Espada |
| `cardRegistry.ts`, `cardCertifications.ts` | Cadastro separado de validação e habilitação auditada |
| `duelRandom.ts` | Sorteio privado, persistido e reproduzível |
| `duelTransitions.ts` | Resultado `{state, events}` e projeção pública/privada dos eventos de transição |
| `duelEngine.ts`, `duelIntegrity.ts`, `duelStore.ts` | Orquestração, contratos e persistência transacional |

O teste de importação isolada confirma que carregar `duelEngine` não carrega
Discord, coleção/UI, SQLite ou renderização. `getCard` da coleção continua
existindo para a interface; o núcleo agora usa o registro de cartas jogáveis.

## Operação compartilhada em uso real

Raigeki, Buraco Negro, Tributo Torrencial, Força do Espelho, Armadura Sakuretsu,
Buraco de Armadilha e Buraco Armadilha Sem Fundo usam `executeDestruction`.
As definições descrevem escopo, posição, exigência de face para cima, mínimo de
ATK e destino. O conjunto de alvos é capturado antes de modificar zonas.

Não se confundem as condições de ativação com as condições de resolução:
Buraco de Armadilha exige 1000 ATK na ativação; Sem Fundo verifica 1500 ATK na
ativação e na resolução. Destruir e banir não gera envio ao Cemitério. As funções
originais de zona conservam proprietário, histórico de Fusão, equipamentos e
coleta de gatilhos. Custos, prioridades e negações continuam no núcleo auditado.

Políticas de Invocação/declaração, adversário, velocidade e dano são consultadas
pelo runtime. Obrigatoriedade de gatilhos vem de `activation.policy`, e não da
suposição de que um determinado tipo de gatilho seja sempre opcional.

Os nomes antigos de `Effect.kind` e a API `getMonsterEffect` foram preservados
como compatibilidade. Esta entrega não converte todos os handlers antigos em
uma linguagem universal de efeitos. Outros efeitos de `classicEffects.ts` e
negações ainda usam caminhos específicos já testados.

## Cadastro não habilita uma carta

Estágios do registro:

1. `registered`: metadados presentes, mas há definição/campos ausentes ou inválidos.
2. `validated`: classificação e definição reconhecidas; continua indisponível.
3. `certified`: registro explícito de habilitação com referências a testes e
   fingerprint correspondente aos campos mecânicos, modelo e política do monstro.

A descrição traduzida não participa da concessão de capacidade. Monstros Normais
exigem `monsterType: 'normal'`, estatísticas válidas e certificação explícita.
O importador foi atualizado para conservar essa classificação estruturada.
Mudar ATK, operação ou política invalida o fingerprint anterior e impede que a
versão alterada seja carregada como certificada silenciosamente.

O fingerprint detecta mudanças em dados; **não prova correção de código**.
O manifesto também não é uma assinatura criptográfica de um revisor. A prova
executável continua sendo a suíte. O CI executa `npm test` antes de
`npm run check:cards`, que exige os arquivos de evidência referenciados.
Nenhum importador, build ou partida promove cartas automaticamente.

Os scripts de prontidão dos NPCs verificam `getPlayableCard`: ter metadados e
`getEffect` já não é suficiente. As 121 cartas existentes foram mantidas; nenhuma
carta adicional foi lançada. Adições futuras devem incluir definição, testes e
manifesto no mesmo PR. O Codex pode fazer esse trabalho; não há etapa de cadastro
manual pelo jogador nem configuração de plugin.

## Sorteio e compatibilidade de partidas

Novas partidas recebem um seed secreto de 256 bits, contador e algoritmo
`hmac-sha256-v1`. Abertura e buscas usam o fluxo persistido com amostragem sem
viés de módulo. O seed fica no estado privado do servidor, nunca em projeções
públicas ou eventos enviados ao rival.

Para reprodução local, `createDuel` aceita uma quarta opção `{randomSeed}`.
O RNG de abertura já existente continua aceito para laboratório/fixtures. Para
reproduzir também essa abertura personalizada é preciso usar as mesmas entradas.
O script de auditoria agora fixa seed de abertura, ações e embaralhamentos.

Snapshots antigos de versão 1 sem os novos campos continuam válidos. Se um
snapshot legado ainda não possui fluxo de sorteio, seu primeiro embaralhamento
inicializa e salva um: não se promete reproduzir essa primeira inicialização a
partir de um snapshot que nunca guardou o seed. Versões futuras desconhecidas
são recusadas sem apagar ou modificar o registro.

## Eventos sem acoplar interface às regras

`applyDuelAction(state, actor, action)` conserva `step` e devolve estado mais
notificações estruturadas: alteração de PV, contagens de zona, movimentação,
revelação, mudança de decisor e fim do duelo. O store real retorna essas
notificações no resultado da ação, inclusive o estado final após respostas da IA.

São **resumos de diferenças entre estados confirmados**, não um registro de
cada suboperação de uma corrente. Não servem como fita de replay nem contabilizam
movimentos intermediários que terminem na mesma zona. Replay usa estado, ações,
versões e sorteio persistido. Histórico traduzido e layouts continuam intactos.

Consumidores devem usar `projectTransitionEvents(events, viewer)` antes de enviar
notificações ao cliente. Compra/identidade de cartas ocultas é privada; contagens
são públicas. O evento não inclui estado completo, seed nem listas de escolhas.
Não foi acrescentada tabela ou histórico de eventos no banco nesta etapa.

## Verificação

- Tipagem sem emissão e build aprovados.
- **308 testes**, incluindo todos os 291 anteriores e 17 novos testes de
  admissão, isolamento, operação compartilhada, políticas, RNG, persistência e
  privacidade.
- **1.000 partidas completas** por execução de carga; UID e identidades conservados.
- Duas execuções independentes com as mesmas seeds produziram o mesmo digest
  de ações e estados completos: `778c489e5cf93a448e68cf9109f6133126aeddc087a55cf80336acfcfedf30dc`.
  Cada execução teve 49.155 decisões e 3.317 restaurações JSON.
- Comparação local com o motor anterior: **200 partidas / 9.184 transições**,
  mesmas ações legais e estados confirmados. Excluídos apenas novos campos
  internos; ordem dos decks foi normalizada depois de cada ação para isolar
  os sorteios criptográficos não reproduzíveis da implementação anterior.
  Essa comparação confirma os cenários amostrados, não equivalência matemática
  de todas as partidas. O harness usa a versão anterior localmente e não é uma
  segunda engine de produção nem um novo fluxo do jogador.
- Reabertura de busca no SQLite em outro processo produziu o mesmo estado e
  embaralhamento. Testes adversos recusam definições inválidas e cartões sem
  certificação; eventos públicos não expõem compras nem o seed.
- Os três decks atuais de NPC continuam válidos. Arena byte a byte preservada.

Comandos: `npm run check`, `npm test`, `npm run check:cards`,
`npm run progress`, `node scripts/duel-readiness.cjs --require-complete`,
`npm run audit:engine`. A auditoria abre somente um SQLite temporário próprio.
Medições locais de motor não certificam latência ou capacidade concorrente do
Discord/servidor. Aceite de produção continua separado.

## Próximo incremento

Migrar outras famílias repetidas para operações compartilhadas, a partir das
cartas prioritárias dos decks, preservando o vocabulário pequeno e o escape por
exceção. Não criar interpretador de texto, compilador de uma linguagem geral ou
novo catálogo paralelo. Efeitos adicionais continuam exigindo testes de cenário
e interação antes da habilitação. Layouts permanecem suspensos nesta entrega.
