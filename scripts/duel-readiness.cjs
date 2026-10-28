#!/usr/bin/env node
/** Readiness of THIS RPG's currently playable NPC decks only.
 * This is not a claim of comprehensive card/TCG compatibility.
 */
const {getEffect,getPlayableCard}=require('../dist/effectRegistry');
const {npcs}=require('../dist/npcContent');
const {RULES_PROFILE}=require('../dist/rulesProfile');
function auditNPC(npc){
 const copies=new Map(),invalid=[];
 for(const id of npc.cards)copies.set(id,(copies.get(id)??0)+1);
 for(const [id,count] of copies){
  if(count>RULES_PROFILE.copiesPerCard)invalid.push(`${id}: ${count} copies`);
  if(!getPlayableCard(id)||!getEffect(id)||getPlayableCard(id).fusion)invalid.push(`${id}: no playable main-deck implementation`);
 }
 for(const id of npc.extra)if(!getPlayableCard(id)?.fusion||!getEffect(id))invalid.push(`${id}: extra-deck card not playable`);
 if(npc.cards.length<RULES_PROFILE.mainDeckMin||npc.cards.length>RULES_PROFILE.mainDeckMax)invalid.push('main deck must contain 20–30 cards');
 if(npc.extra.length>RULES_PROFILE.extraDeckMax)invalid.push('extra deck exceeds '+RULES_PROFILE.extraDeckMax+' cards');
 const extraCounts=new Map();for(const id of npc.extra)extraCounts.set(id,(extraCounts.get(id)??0)+1);for(const [id,count]of extraCounts)if(count>RULES_PROFILE.copiesPerCard)invalid.push(id+': extra deck exceeds copy limit');
 return {id:npc.id,name:npc.name,main:npc.cards.length,extra:npc.extra.length,unique:copies.size,ready:invalid.length===0,invalid};
}
const NPCS=npcs.map(auditNPC);
const report={scope:'Only the three playable NPC decks belonging to this RPG',complete:NPCS.every(n=>n.ready),npcDecks:NPCS};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--require-complete')&&!report.complete)process.exitCode=1;

module.exports={auditNPC};
