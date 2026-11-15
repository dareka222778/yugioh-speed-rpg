/** Reconstruct the Mission 16 preservation baseline from reviewed later additions only.
 * The M16 baseline already includes Mission 15's filtered-destruction AI and catalog.
 * Strip only later M15/NPC filter, M31 target-decision and M46 scoring hooks, then
 * use each mission's exact-once normalizer. Unknown changes remain hash-visible.
 */
const assert=require('node:assert/strict');
function once(text,part,replacement=''){
 assert.equal(text.split(part).length,2,'Reviewed M16-baseline extension must occur exactly once');
 return text.replace(part,replacement);
}
function baselineBytes(file,bytes){
 if(file==='src/duelStore.ts'){
  let text=bytes.toString('utf8');
  const npcImport="import {filterNpcRemoval} from './npcRemoval';\n";
  const npcCall=" const actions=filterNpcRemoval(s,id,legalActions(s,id));const p=";
  const baselineCall=" const actions=legalActions(s,id);const p=";
  const hasNpcImport=text.includes(npcImport),hasNpcCall=text.includes(npcCall);
  assert.equal(hasNpcImport,hasNpcCall,'Incomplete reviewed NPC-removal hook');
  if(hasNpcImport){text=once(text,npcImport);text=once(text,npcCall,baselineCall);}
  const discardHook="  if(effect.kind==='discardRemoval')return true; // already scored against its discard cost\n";
  if(text.includes(discardHook))text=once(text,discardHook);
  const targetImport="import {chooseReviewedTarget} from './targetDecision31';\n";
  const targetHook="  const reviewedTarget=chooseReviewedTarget(s,id,actions);if(reviewedTarget)return reviewedTarget;\n";
  const recruitPositionHook="  if(s.choice?.source==='monsterRecruitPosition'&&s.pending.kind==='monsterEffect'){const pending=s.pending,selected=p.deck.find(c=>c.uid===pending.target),info=selected&&getCard(selected.id);const threat=Math.max(0,...op.monsters.filter(m=>m.faceUp&&m.position==='atk').map(m=>atk(m,s)));const mode=(info?.atk??0)<threat?'__recruit_def__':'__recruit_atk__';return actions.find(a=>a.kind==='choose'&&a.target===mode)??actions[0];}\n";
  const m31=[targetImport,targetHook,recruitPositionHook],present=m31.map(part=>text.includes(part));
  assert.ok(present.every(Boolean)||present.every(x=>!x),'Incomplete reviewed M31 target-decision hook');
  if(present[0])for(const part of m31)text=once(text,part);
  bytes=Buffer.from(text,'utf8');
 }
 bytes=require('./mission29-reviewed-extensions.cjs').strip(file,bytes);
 bytes=require('./mission21-reviewed-extensions.cjs').strip(file,bytes);
 bytes=require('./mission19-reviewed-extensions.cjs').strip(file,bytes);
 bytes=require('./mission18-reviewed-extensions.cjs').strip(file,bytes);
 bytes=require('./mission17-reviewed-extensions.cjs').strip(file,bytes);
 bytes=require('./mission16-reviewed-extensions.cjs').strip(file,bytes);
 return bytes;
}
module.exports={baselineBytes};
