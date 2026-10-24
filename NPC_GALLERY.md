# NPC gallery — v0.7.2

`/npc ver` now opens a private visual character selector: one portrait at a time,
cyclic previous/next controls, a challenge button for the selected character,
a complete historical deck browser, and a separate browser for the NPC's actual
playable adaptation. Deck pages show ten cards; selecting one opens a large card
with previous/next controls across the entire list, a return to the original page,
and a link to the official Konami rules. All controls validate the owner.

## Historical deck verification

The complete US-numbered products are SDY (2002), SDK (2002), SDJ (2003).
Each has 50 distinct numbered cards, one copy each. SDJ has 48 main cards and two
Fusion cards (Thousand Dragon, Flame Swordsman); SDY and SDK each have 50 main.

On 2026-10-24 all 50 Konami card IDs in each imported list were compared with the
corresponding official product page. All three comparisons returned zero missing
and zero unexpected IDs. Independently extracted official IDs are stored in
`tests/fixtures/classic-official-cids.json` and asserted by the tests.

- https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=13301000&rp=99999&request_locale=en
- https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=13301001&rp=99999&request_locale=en
- https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=13302000&rp=99999&request_locale=en

Names, set numbers and factual card metadata were imported from YAML Yugi's card
aggregate (https://dawnbrandbots.github.io/yaml-yugi/cards.json), then membership
was verified against Konami. The factual catalog is compressed into classicDecks.ts.
Portuguese names use that catalog's localization; English names are also displayed.
The official-rule links reflect current rules, not a promised 2002 errata snapshot.
Card images use the existing YGOPRODeck CDN/cache and may show later printings or
artwork. Exact original-print artwork is not guaranteed.

## Portraits and identity

Official Duel Links character artwork is bundled as optimized WebP in
npcPortraits.ts, converted by Sharp to PNG before embedding in SVG (librsvg did
not display embedded WebP in the first preview; this was corrected and tested).
Source page: https://www.konami.com/yugioh/duel_links/en/series/dm/
Assets: ../images/character/dm01.png (Yami Yugi), dm02.png (Seto Kaiba),
dm03.png (Joey Wheeler), relative to that page.

Illustrations and characters © Studio Dice / SHUEISHA, TV TOKYO, KONAMI.
This fan project is not affiliated with Konami. Bundling these illustrations
adds no license grant; commercial distribution needs an appropriate rights review.
The layout, colors and short characterization lines are original to this bot.
No Duel Links audio, game engine, UI screenshot or executable code is included.

## Boundaries and implementation

The full historical lists are **inspection-only**. They do not enter the owned
collection, grant cards, alter an active duel, or become enabled engine cards.
`Duelar` continues to use the tested 30-card Speed adaptation (Joey also has one
extra Fusion), and both the UI and the separate playable-deck browser identify it.
The engine currently has 35 enabled cards. Merely listing a historical effect
card must not make it playable: the existing spell dispatcher cannot safely
handle unknown effects. Full historical play still requires effects, target
selection, response timing, flip/graveyard triggers and additional zone/rule work.

Modules:
- classicDecks.ts: historical factual catalog, independent of enabled cards.
- npcPortraits.ts: bundled portrait assets; no runtime portrait download.
- npcRenderer.ts: Sharp/SVG presentation with embedded font outlines; bounded
  twelve-image render cache, in-flight de-duplication, existing disk card cache.
- npcUI.ts: owner-bound controls, validated page models, image attachments and
  text fallback when visual rendering fails.
- index.ts: immediate component acknowledgement before rendering, button and
  select routing. Existing `npc:lobby` controls remain accepted.
- cardArt.ts: allows only enabled or known archival card IDs, preserving arbitrary
  path/URL rejection. Missing image labels remain visible in deck pages.

No schema migration or change to DP, ownership, XP or reward claims is required.
Existing duel snapshots retain their saved names. New Yugi challenges use the
name Yami Yugi to match the selected official portrait.

## Validation

Build: `npm run build`.
Tests: Node 22 `node --test tests/*.test.cjs` (native SQLite dependency is ABI-specific).
The suite covers historical membership and counts, all 150 individually reachable
cards, page wrapping/return paths, real interaction dispatch, owner rejection,
invalid indexes, inventory nonmutation, the playable/archive boundary, Discord
component limits, offline portrait pixels and distinct character output.
Actual PNG previews were rendered and inspected for portraits, grid and large
Fusion detail. Live Discord message appearance still needs a real `/npc ver`
interaction after deployment; a successful unit test or bot login alone does not
prove Discord has shown the gallery to the user.
