/** Public, declarative selection rules; no printed-card identifiers. */
export const destructionRaces=['Aqua','Beast','Beast-Warrior','Dinosaur','Dragon','Fairy','Fiend','Fish','Insect','Machine','Plant','Pyro','Reptile','Rock','Sea Serpent','Spellcaster','Thunder','Warrior','Winged Beast','Zombie'] as const;
export type DestructionFilter={races?:readonly string[];equipped?:true};
export function destructionFilterIssues(value:unknown):string[]{
 const f=value as DestructionFilter;if(!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).some(k=>!['races','equipped'].includes(k)))return ['invalid-destruction-filter'];
 if(!f.races&&!f.equipped)return ['empty-destruction-filter'];
 if(f.races!==undefined&&(!Array.isArray(f.races)||!f.races.length||f.races.length>20||new Set(f.races).size!==f.races.length||f.races.some((r:string)=>!destructionRaces.includes(r as typeof destructionRaces[number]))))return ['invalid-destruction-race'];
 if(f.equipped!==undefined&&f.equipped!==true)return ['invalid-equipped-condition'];return [];
}
