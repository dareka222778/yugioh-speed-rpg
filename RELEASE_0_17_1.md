# 0.17.1 — revisão de alvos e correntes

A seleção e a resolução de Tufão Espacial Místico e Livro da Lua estavam duplicadas entre a ativação principal e os elos acrescentados. O Tufão acrescentado à corrente também anunciava destruição mesmo quando outro elo já havia removido o alvo. Agora as janelas usam `spellActions` e `resolveClassicSpell`, mantendo a validação de timing no motor e o UID escolhido na ativação. A mensagem só confirma destruição quando a carta foi encontrada; alvo perdido não seleciona outra carta. Remover a fonte continua sem negar sua ativação.

## Evidência delimitada

`tests/classicTargetReview.test.cjs` acrescenta oito cenários: Tufão com alvo perdido na raiz e em elo adicional; Livro da Lua com alvo já virado na raiz e em elo adicional; cada uma das duas Magias com sua própria fonte destruída; contracorrente com Bloqueador de Magia e duas Sete Ferramentas preservando custos; menu de Livro independente da identidade oculta e rejeição de alvos forjados. As transições são serializadas/restauradas antes das ações, com validação de estado e conservação de identidades nos cenários de resolução.

- 495 testes passaram, zero falhas; 28 cenários dedicados/existentes de alvos, Magias Rápidas e contra-armadilhas passaram.
- Aceitação crítica: 177 testes, 1000 duelos 1v1 completos, 70149 decisões e 4934 restaurações; identidades conservadas.
- `check:cards`: 130 cartas admitidas; quatro certificados recebem a referência da nova suíte, sem promoção de novas cartas.
- `audit:history`: snapshot e reprodução factual continuam válidos; 1962 históricas separadas das 130 jogáveis.
- Relatórios atualizados em `validation/engine-acceptance.json` e `validation/card-matrix-v016.json`.

Isso não certifica todos os efeitos possíveis, jogos humanos no Discord ou desempenho de 1,5 s. A fase 2 e a homologação humana permanecem abertas. Não há aumento de catálogo jogável, recompensa, migração de banco, mudança de regras ou layout. Próximo bloco: cemitério, controle e gatilhos com zonas ocupadas.

## Implantação e recuperação

Atualizar a mesma branch após backup SQLite consistente; executar os testes isolados na hospedagem, conferir estados persistidos e comparar perfis, coleção e decks com o backup. Reiniciar normalmente e verificar conexão/registro de comandos na nova versão. Eventual rollback é de código; não restaurar automaticamente o banco, evitando apagar progresso posterior.
