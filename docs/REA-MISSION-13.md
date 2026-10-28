# Missão 13 — triagem reproduzível do catálogo clássico pendente

Status: **planejamento concluído, sem certificação mecânica ou distribuição**.

## Base e limites

- Base imutável: engine-v7, com **740 cartas certificadas**.
- Corte regional analisado: **OCG até 30/09/2004**, com **1.897 registros históricos**. Não confundir com a união TCG/OCG de 1.962 registros.
- Restam **1.157 registros OCG** fora do catálogo certificado: **1.076** com texto de referência independente associado, **52** sem fonte correspondente na amostra e **29** com identidade/passcode ambíguos.
- O inventário está em docs/evidence/mission13-remaining-families.json. Uma mesma carta pode aparecer em várias famílias: as somas **não** são aditivas.
- Texto moderno de uma fonte independente é **pista de investigação**, não decisão de regra histórica e não implementação.

## Áreas prioritárias para blocos de código

1. Famílias de efeitos contínuos com duração, múltiplas fontes e negação, separando a operação tipada de cada carta.
2. Escolhas de alvo/custo e decisões do NPC com testes negativos: alvo inexistente, cancelamento e rollback.
3. Busca, descarte, resgate e interações com Cemitério e Deck; múltiplas zonas e cartas simultâneas.
4. Alterações de batalha, Campo/Equipamento e destruições coletivas, cada uma validada por carta.
5. Identidades/passcodes bloqueados precisam de fonte alternativa antes de qualquer implementação.

## Reproduzir

O gerador local scripts/plan-remaining-families.cjs aceita arquivos JSON completos de referência de até seis categorias públicas independentes, iniciando por Spell Card e Effect Monster, opcionalmente Trap Card, Flip Effect Monster, Normal Monster e Fusion Monster. Sem a opção --write, apenas emite o plano em stdout; --write regenera o relatório na pasta de evidências. O programa rejeita fontes truncadas e IDs duplicados, e registra hash SHA-256 dos arquivos de entrada. O relatório de referência está preservado no Git e contém os hashes dos insumos usados na triagem.

Verificação offline (sem depender dos serviços externos): node --test tests/remainingFamiliesPlan.test.cjs.

## O que não foi liberado

- Nenhuma carta nova, saldo, loja, save, layout, economia, motor de duelo ou versão operacional foi alterado.
- Nenhuma partida de usuário real, autorização de acesso Discord, implantação, mesclagem de PR ou homologação de host foi feita.
- Permanecem os bloqueios existentes e a aprovação humana para qualquer beta fechado em ambiente controlado.
