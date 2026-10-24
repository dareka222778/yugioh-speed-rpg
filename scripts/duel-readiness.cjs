#!/usr/bin/env node
/** Readiness of THIS RPG's currently playable NPC decks only.
 * This is not a claim of comprehensive card/TCG compatibility.
 */
const {getEffect,engineCard}=require('../dist/effectRegistry');
const {npcs}=require('../dist/npcContent');
const NPCS=npcs.map(npc=>{
 const copies=new Map(),invalid=[];
 for(const id of npc.cards)copies.set(id,(copies.get(id)??0)+1);
 for(const [id,count] of copies){
  if(count>3)invalid.push(`${id}: ${count} copies`);
  if(!engineCard(id)||!getEffect(id)||engineCard(id).fusion)invalid.push(`${id}: no playable main-deck implementation`);
 }
 for(const id of npc.extra)if(!engineCard(id)?.fusion||!getEffect(id))invalid.push(`${id}: extra-deck card not playable`);
 if(npc.cards.length<20||npc.cards.length>30)invalid.push('main deck must contain 20–30 cards');
 if(npc.extra.length>6)invalid.push('extra deck exceeds six cards');
 return {id:npc.id,name:npc.name,main:npc.cards.length,extra:npc.extra.length,unique:copies.size,ready:invalid.length===0,invalid};
});
const report={scope:'Only the three playable NPC decks belonging to this RPG',complete:NPCS.every(n=>n.ready),npcDecks:NPCS};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--require-complete')&&!report.complete)process.exitCode=1;
