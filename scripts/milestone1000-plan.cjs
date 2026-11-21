#!/usr/bin/env node
'use strict';
/** Candidate triage for the 1,000-card milestone; never certifies, distributes or edits inventories. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function category(h){
 if(h.kind!=='monster')return h.kind+':'+(h.subcategory??'normal');
 if(h.mechanics?.includes('fusion'))return 'fusion';
 if(h.mechanics?.includes('ritual'))return 'ritual';
 return h.classifications?.includes('normal')?'normal':'effect-monster';
}
function plan({history,catalog,target=1000,batchSize=10}){
 assert.ok(Array.isArray(history)&&Array.isArray(catalog)&&Number.isSafeInteger(target)&&target>0&&Number.isSafeInteger(batchSize)&&batchSize>0&&batchSize<=50);
 const active=new Set(catalog.map(c=>c.id));assert.equal(active.size,catalog.length,'Duplicated certified card ID');
 const owners=new Map();
 for(const h of history)for(const alias of h.passwords??[]){const b=owners.get(alias)??[];b.push(h.id);owners.set(alias,b);}
 const pending=history.filter(h=>!(h.passwords??[]).some(id=>active.has(id))).map(h=>{
   const aliases=h.passwords??[],issues=[
     ...(!aliases.length?['missing-passcode']:[]),
     ...(aliases.length!==1?['ambiguous-passcode']:[]),
     ...(!h.konamiId?['missing-konami-identity']:[]),
     ...(aliases.some(id=>(owners.get(id)?.length??0)!==1)?['duplicate-passcode']:[])
   ];
   return {canonicalId:h.id,name:h.names?.en??'',id:aliases[0]??null,konamiId:h.konamiId??null,category:category(h),issues,stage:issues.length?'identity-review-required':'official-text-and-engine-review-required'};
 });
 const categories=Object.fromEntries([...new Set(pending.map(c=>c.category))].sort().map(c=>[c,pending.filter(x=>x.category===c).length]));
 const eligible=pending.filter(c=>!c.issues.length).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
 const needed=Math.max(0,target-catalog.length),preview=eligible.slice(0,Math.max(needed,batchSize)).map(x=>({...x,automaticCertification:false}));
 const batches=Array.from({length:Math.ceil(needed/batchSize)},(_,i)=>({batch:i+1,goal:Math.min(batchSize,needed-i*batchSize),sourceReviewRequired:true,realEngineTestsRequired:true}));
 return {format:1,target,certified:catalog.length,remainingToGoal:needed,historical:history.length,pending:pending.length,identityBlocked:pending.length-eligible.length,fullyUnreviewed:eligible.length,categories,plannedBatchSizes:batches,triageQueue:preview,automaticCertifications:0,inventoryGranted:0,releaseGranted:0,notes:'Factual triage only. Priority order is navigation, not mechanical equivalence or permission to publish. Complete official wording, individually reviewed definitions, deterministic duel scenarios, immutable-catalog audit, and passing CI are required before admission.'};
}
if(require.main===module){
 const root=path.resolve(__dirname,'..'),manifest=require('../catalog/engine-v9/manifest.json');
 const history=require('../catalog/historical/2004-10-01/cards.json'),catalog=require('../catalog/engine-v9/'+manifest.current+'.json');
 const result=plan({history,catalog:catalog.cards,target:Number(process.env.CARD_MILESTONE_TARGET??1000),batchSize:Number(process.env.CARD_MILESTONE_BATCH_SIZE??10)});
 const dest=path.resolve(root,process.argv[2]??'artifacts/milestone1000-plan.json');
 assert.ok(dest.startsWith(path.join(root,'artifacts')+path.sep),'Only artifacts/ destination allowed');
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### Speed RPG — meta de '+result.target+' cartas\n'+result.certified+' certificadas; '+result.remainingToGoal+' faltando; '+result.identityBlocked+' identidades precisam de revisão. A fila não libera cartas automaticamente.\n');
 console.log(JSON.stringify({target:result.target,certified:result.certified,remaining:result.remainingToGoal,historyPending:result.pending,identityBlocked:result.identityBlocked,batchSizes:result.plannedBatchSizes.map(x=>x.goal),automaticCertifications:0}));
}
module.exports={plan,category};
