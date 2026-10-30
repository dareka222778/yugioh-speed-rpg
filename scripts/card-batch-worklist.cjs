#!/usr/bin/env node
'use strict';
/** Factual worklist. Category and structural grouping never claim effect equivalence. */
const fs=require('node:fs'),path=require('node:path');
function worklist({history,enabled,released=enabled,definitions={},reviews=[]}){
 const {normalizeHistoricalFacts}=require('../dist/catalogCertification');
 const active=new Set(enabled),authorized=new Set(released),reviewByCID=new Map(reviews.map(r=>[r.konamiId,r])),claims=new Map();
 for(const h of history)for(const key of [h.konamiId&&'cid:'+h.konamiId,...h.passwords.map(p=>'id:'+p)].filter(Boolean)){const bucket=claims.get(key)??[];bucket.push(h.id);claims.set(key,bucket);}
 const rows=history.map(h=>{const aliases=h.passwords??[],admitted=aliases.some(id=>active.has(id)),facts=normalizeHistoricalFacts(h),collision=[h.konamiId&&'cid:'+h.konamiId,...aliases.map(p=>'id:'+p)].filter(Boolean).some(k=>claims.get(k)?.length>1),issues=[...facts.issues,...aliases.length>1?['primary-passcode-review-required']:[],...collision?['identity-collision']:[]],review=reviewByCID.get(h.konamiId),definition=aliases.map(id=>definitions[id]).find(Boolean);
  const category=h.kind==='monster'?(h.mechanics.includes('fusion')?'fusion':h.mechanics.includes('ritual')?'ritual':h.classifications.includes('normal')?'normal':'effect-monster'):`${h.kind}:${h.subcategory??'unclassified'}`;
  return {canonicalId:h.id,konamiId:h.konamiId,name:h.names.en,aliases,category,firstObserved:h.firstObserved.world,identityIssues:issues,stage:admitted?'certified':issues.length?'identity-review-required':definition?'defined-awaiting-execution':review?'reviewed-awaiting-definition':'imported-awaiting-full-review',family:definition?structuralFamily(definition):null,equivalenceVerified:false,distributionAuthorized:admitted&&aliases.some(id=>authorized.has(id)),priority:issues.length?'blocked':definition?'executable-review':category==='fusion'?'check-material-dependencies':'mechanic-review'};
 });
 const pending=rows.filter(r=>r.stage!=='certified'),count=(items,key)=>Object.fromEntries([...new Set(items.map(r=>r[key]))].sort().map(v=>[v,items.filter(r=>r[key]===v).length]));
 return {format:1,scope:'Factual identities and exact executable structure, never text-keyword admissions',historical:rows.length,certified:rows.length-pending.length,pending:pending.length,identityReview:pending.filter(r=>r.identityIssues.length).length,categories:count(pending,'category'),stages:count(rows,'stage'),rows};
}
function structuralFamily(effect){const shape=v=>Array.isArray(v)?v.map(shape):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,shape(v[k])])):typeof v;return require('node:crypto').createHash('sha256').update(JSON.stringify(shape(effect))).digest('hex').slice(0,16);}
module.exports={worklist,structuralFamily};
if(require.main===module){const root=path.resolve(__dirname,'..'),r=require('../dist/effectRegistry');const result=worklist({history:JSON.parse(fs.readFileSync(path.join(root,'catalog/historical/2004-10-01/cards.json'))),enabled:r.enabledCardIds,released:[...require('../dist/releasedCardIds').releasedCardIds],definitions:Object.fromEntries(r.engineCatalog.map(c=>[c.id,r.getEffect(c.id)]))});const output=process.argv[2];if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify({...result,rows:undefined}));}
