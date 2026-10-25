/** Versioned rules: saved duels retain their original interpretation. */
export const RULES_VERSION='speed-rpg-classic-v1' as const;
export type RulesVersion=typeof RULES_VERSION|'speed-rpg-v1'|'speed-rpg-v2';
export const CARD_DEFINITIONS_VERSION=1 as const;
export const RULES_PROFILE=Object.freeze({
 id:RULES_VERSION,name:'Speed RPG Clássico v1',startingLP:4000,startingHand:4,mainDeckMin:20,mainDeckMax:30,
 copiesPerCard:3,extraDeckMax:5,monsterZones:3,spellTrapZones:3,handLimit:6,handCheck:'end' as const,skillsEnabled:false,afterBattlePhase:'end'
});
const legacySeven=Object.freeze({...RULES_PROFILE,id:'speed-rpg-v2',extraDeckMax:6,handLimit:7,handCheck:'before-draw' as const});
const legacySix=Object.freeze({...RULES_PROFILE,id:'speed-rpg-v1',extraDeckMax:6});
export const rulesFor=(s:{rulesVersion?:RulesVersion})=>s.rulesVersion===RULES_VERSION?RULES_PROFILE:s.rulesVersion==='speed-rpg-v2'?legacySeven:legacySix;
export const supportedRulesVersion=(v:unknown)=>v===undefined||v===RULES_VERSION||v==='speed-rpg-v1'||v==='speed-rpg-v2';
