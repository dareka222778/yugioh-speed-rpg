/** Objective routing of the admitted catalog, never a percentage of anime cards. */
const {enabledCardIds,getEffect,getCardStatus}=require('../dist/effectRegistry');
const {economicOperations,getDestructionModel}=require('../dist/effectModels');
const {spellExceptionIds}=require('../dist/spellExceptions');
const buckets={positionTemplate:[],ritualTemplate:[],normal:[],fusion:[],monsterDefinition:[],economicTemplate:[],searchTemplate:[],destructionTemplate:[],spellTrapGroupTemplate:[],attackResponseTemplate:[],equipTemplate:[],fieldTemplate:[],continuousTemplate:[],temporaryModifierTemplate:[],namedException:[],legacyHandler:[]};
const legacyKinds=new Set(['fissure','polymerization','giantTrunade','monsterReborn','changeHeart','blockAttack','deSpell','removeTrap','reinforcements','castleWalls','waboku','justDesserts','magicJammer','sevenTools','mysticalSpaceTyphoon','bookOfMoon']);
for(const id of enabledCardIds){
 const effect=getEffect(id);if(getCardStatus(id)?.stage!=='certified'||!effect)throw new Error('Uncertified coverage entry '+id);
 const kind=effect.kind;let bucket;
 if(kind==='ritualMonster'||kind==='ritualSummon')bucket='ritualTemplate';else if(kind==='normal')bucket='normal';else if(kind==='fusion')bucket='fusion';else if(kind==='monsterEffect')bucket='monsterDefinition';
 else if(economicOperations(effect)||kind==='choiceSequence')bucket='economicTemplate';else if(kind==='searchZone')bucket='searchTemplate';else if(getDestructionModel(effect))bucket='destructionTemplate';else if(kind==='destroySpellTraps')bucket='spellTrapGroupTemplate';else if(kind==='attackResponse')bucket='attackResponseTemplate';
 else if(kind==='positionChange')bucket='positionTemplate';else if(kind==='continuous')bucket='continuousTemplate';else if(kind==='temporaryModifier')bucket='temporaryModifierTemplate';else if(kind==='equip')bucket='equipTemplate';else if(kind==='field')bucket='fieldTemplate';else if(spellExceptionIds.includes(id))bucket='namedException';else if(legacyKinds.has(kind))bucket='legacyHandler';
 else throw new Error('No audited execution route for '+id+' '+kind);
 buckets[bucket].push(id);
}
const counts=Object.fromEntries(Object.entries(buckets).map(([name,ids])=>[name,ids.length]));
console.log(JSON.stringify({scope:'Current certified catalog only; not all classic/anime cards',total:enabledCardIds.length,counts,legacyKinds:[...new Set(buckets.legacyHandler.map(id=>getEffect(id).kind))].sort()},null,2));
