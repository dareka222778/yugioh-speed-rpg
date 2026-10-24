# Card metadata sources

Imported factual metadata (names, identifiers, type, level, ATK and DEF) from the YAML Yugi project's own aggregate: https://dawnbrandbots.github.io/yaml-yugi/cards.json

Retrieved: 2026-10-24. Aggregate SHA-256: `2ebff4057fb21dcc7582c0f53ab4713c80195404dd791d290d0595cb201532d6`.

Each catalog entry includes a Konami database link for checking the corresponding card. No upstream program code, card flavour text or effect text was copied. Short functional category labels are original summaries, not executable rules. Card names and artwork belong to their respective rights holders. This is an unofficial fan project.

The catalog is bundled locally, so commands do not query the API. Optional card images use YGOPRODeck CDN and are cached locally on first use; unavailable images never prevent text consultation. No card image is required for starter delivery or collection.

Starter sets v1 contain 20 cards each: two copies of eight Normal Monsters and one copy of each of four shared Spell/Trap cards. These are a small classic-themed prototype selection, not a claim to include every card shown in the first anime or to certify official Speed Duel legality. No duels or card effects are implemented in Phase 2.

Regenerate with `python scripts/import_catalog.py /path/to/cards.json`. Only the selected factual fields enter the project; the complete upstream aggregate is not bundled.


Fase 4.1: catálogo ampliado para 32 cartas, preservando os conjuntos iniciais de 20. Sogen, Polimerização, Manipulador de Chamas e Espadachim das Chamas foram selecionados do mesmo agregado; Campo/Fusão conferidos nas páginas oficiais Konami (CIDs 4339, 4837, 4148, 4021). A receita e os efeitos são implementados no motor; não são apenas descrições no catálogo.

## Fase 5 — cartas de duelistas clássicos

Catálogo ampliado de 32 para 35 cartas. Dados das três adições conferidos na base oficial da Konami:
- Dragão Branco de Olhos Azuis: ID 89631139, CID 4007, Normal, LIGHT/Dragon, nível 8, 3000/2500.
- Mago Negro: ID canônico 46986414, CID 4041, Normal, DARK/Spellcaster, nível 7, 2500/2100. O agregado contém uma impressão alternativa com senha diferente; usamos explicitamente 46986414.
- Dragão Negro de Olhos Vermelhos: ID 74677422, CID 4088, Normal, DARK/Dragon, nível 7, 2400/2000.

Links oficiais: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4007&ope=2&request_locale=pt ; https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4041&ope=2&request_locale=pt ; https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=4088&ope=2&request_locale=pt .

As três usam a regra já implementada de dois tributos e não têm efeitos adicionais. Os NPCs têm decks temáticos próprios do projeto, sem alegação de reproduzir os decks oficiais ou sua dificuldade.
