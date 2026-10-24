# Card metadata sources

Imported factual metadata (names, identifiers, type, level, ATK and DEF) from the YAML Yugi project's own aggregate: https://dawnbrandbots.github.io/yaml-yugi/cards.json

Retrieved: 2026-10-24. Aggregate SHA-256: `2ebff4057fb21dcc7582c0f53ab4713c80195404dd791d290d0595cb201532d6`.

Each catalog entry includes a Konami database link for checking the corresponding card. No upstream program code, card flavour text or effect text was copied. Short functional category labels are original summaries, not executable rules. Card names and artwork belong to their respective rights holders. This is an unofficial fan project.

The catalog is bundled locally, so commands do not query the API. Optional card images use YGOPRODeck CDN and are cached locally on first use; unavailable images never prevent text consultation. No card image is required for starter delivery or collection.

Starter sets v1 contain 20 cards each: two copies of eight Normal Monsters and one copy of each of four shared Spell/Trap cards. These are a small classic-themed prototype selection, not a claim to include every card shown in the first anime or to certify official Speed Duel legality. No duels or card effects are implemented in Phase 2.

Regenerate with `python scripts/import_catalog.py /path/to/cards.json`. Only the selected factual fields enter the project; the complete upstream aggregate is not bundled.
