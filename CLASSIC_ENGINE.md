# Classical engine expansion — first implementation batch

## Fixed product rules

The user's choice is final: **one existing engine, three monster zones, three
Spell/Trap zones, and 20–30 Main Deck cards**. This update does not introduce
an alternative game format, five-zone board, new deck recipes or visual redesign.
Keep 4000 LP, four-card openings and existing Speed turn rules.

The first factual batch is the 123 distinct cards in the verified SDY, SDK and
SDJ products. This is not an exhaustive list of every card ever seen in the
original anime. Use current official card text for executable effects; anime
presentation informs later deck identity, not undocumented exceptions to rules.

## Current result and release status

**Prototype, not a completed classical release and not installed on Botkeep.**
Do not merge this engine milestone into production merely because the tests pass.
All earlier 35 cards remain enabled. The expanded engine has 99 enabled cards
in total, including **88 of the 123 cards** in this first historical batch:
61 Normal monsters, 5 equipment cards, 3 fields, one existing Fusion and 18
other Spell/Trap cards. There are **34 pending** cards, and one intentionally
excluded card: Scapegoat requires four free monster zones and does not fit the
fixed three-zone format. Do not reduce its four Tokens or silently alter its effect.

The historical 50-card deck browser is still archival. The expanded engine
still validates 20–30 cards, no more than three copies, and six Extra Deck cards.
No player's inventory, starter grant, NPC recipe, DP, XP or rewards are changed.

## Implemented changes

- `effectRegistry.ts`: explicit effect and metadata registry, enabled IDs and
  machine-readable coverage. Unknown effects never fall through to Fissure.
- `classicEngineCards.ts`: factual metadata for the first enabled classical
  additions. It does not contain copied full card-effect prose.
- `classicEffects.ts`: explicit legal targets and resolution for cure, burn,
  mass destruction, simultaneous discard/draw, graveyard revival, temporary
  control, position changes, Spell/Trap removal, return to hand, equipment and
  original ATK/DEF switching. Field and equipment modifiers are computed from
  active cards rather than baked into temporary boosts.
- `duelEngine.ts`: summon-response context for Trap Hole, Waboku battle
  protection, Just Desserts damage, original-owner grave routing, automatic
  equipment cleanup, original Fusion summon tracking and new action labels.
- `duelStore.ts`: new defensive and targeted AI decisions. Scores use our hand,
  our monsters, face-up rival cards and public graveyards; hidden opponent IDs
  must not affect the choice.
- `collection.ts`: lookups/search include actually enabled engine metadata.
  Imported historical effect monsters remain unavailable until implemented.

Existing version-1 serialized duels remain readable; new optional fields use
safe defaults. No SQLite schema migration is needed. Proper Fusion summon
tracking starts with new Fusion resolutions; historical snapshots without that
flag cannot prove revival eligibility, so they are not guessed eligible.

## First-batch effects covered

Dian Keto, Red Medicine, Ookazi, Dark Hole, Card Destruction, Monster Reborn,
Change of Heart, Block Attack, De-Spell, Remove Trap, Giant Trunade,
Shield & Sword, Waboku, Trap Hole, Just Desserts, plus the previous Fissure,
Reinforcements, Castle Walls and Polymerization paths.

Equipment: Sword of Dark Destruction, Book of Secret Arts, Dark Energy,
Invigoration and Dragon Treasure. Fields: Sogen, Mountain and Yami.

Five equipment cards preserve their race/attribute restrictions. Removing a
monster clears its attached cards to the equipment owner's grave. A revived or
controlled opponent monster retains its original owner. Change of Heart returns
control during the End Phase; a full return side destroys it to the owner's grave.
A disappearing target does not silently select a different target.

De-Spell offers all rival set Spell/Trap positions without exposing their types
or names in action labels. Its resolution can reveal the selected set card.
Waboku does not prevent effect damage, destruction by effects, or deck-out, and
cannot be activated in the simplified damage-calculation response window.

## Validation and limits

`npm run build`
`node --test tests/*.test.cjs` — run with Node 22, matching the SQLite native ABI.

The regression suite includes the earlier duel, economy, ownership, privacy,
rendering and live-handler mock tests, plus explicit classical effect cases and
100 additional seeded, complete 30-card duels. Every move of those 100 games
checks that all 60 unique card references are conserved. Tests also reopen a real
SQLite record in a fresh Node process and reject a replayed old action revision.

These cases validate this implemented subset, not the entire TCG ruleset or every
possible timing interaction. This milestone deliberately leaves effect monsters,
trigger ordering, costs, counter-negation, private deck/hand inspection and
Token generation for later implementations. No live Discord test is claimed.

Readiness report:
`node scripts/classic-engine-coverage.cjs`

Release gate:
`node scripts/classic-engine-coverage.cjs --require-complete`

The release gate currently **exits 1 intentionally**, with 88 enabled, 34 pending
and 1 format-incompatible card. Passing unit tests must never be reported as
completion of the remaining classical effects.

## Remaining work before building the adapted decks

1. General trigger and optional-choice ordering for Flip, battle, summon,
   graveyard and End Phase effects, including simultaneous effects and source
   cards leaving the field before their effects resolve.
2. Monster effects and private information: Man-Eater Bug, Magician of Faith,
   Hane-Hane, Penguin Soldier, Time Wizard, Sangan, Lord of D., Gearfried,
   Wall of Illusion and the other entries explicitly marked pending by the report.
3. Costs, negation and persistent interactions: Seven Tools, Fake Trap,
   Ultimate Offering, Reverse Trap, Soul Exchange, Last Will, Malevolent Nuzzler,
   Reliable Guardian, and the remaining report entries.
4. Full compatibility regression, unchanged three-zone UI interaction tests,
   and a live deployment/Discord smoke test when the completed release is ready.
5. Only then adapt the character decks up to 30 cards and apply the blue visual
   command standard based on the profile. Do not alter current recipes meanwhile.

## Sources

Official product membership and current rules are available at:
- https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=13301000&rp=99999&request_locale=en
- https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=13301001&rp=99999&request_locale=en
- https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=13302000&rp=99999&request_locale=en

Factual import source: https://dawnbrandbots.github.io/yaml-yugi/cards.json.
Product membership matches the independent official CID fixture already stored
in `tests/fixtures/classic-official-cids.json`. The existing portrait/gallery
credits and archived-deck limitations remain in NPC_GALLERY.md.
