/** One fixed interpretation. This refactor does not introduce selectable formats. */
export const RULES_VERSION='speed-rpg-v1' as const;
export const CARD_DEFINITIONS_VERSION=1 as const;
export const RULES_PROFILE=Object.freeze({
 id:RULES_VERSION,startingLP:4000,startingHand:4,mainDeckMin:20,mainDeckMax:30,
 copiesPerCard:3,extraDeckMax:6,monsterZones:3,spellTrapZones:3,handLimit:6,afterBattlePhase:'end'
});
