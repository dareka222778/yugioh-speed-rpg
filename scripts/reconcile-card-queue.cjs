#!/usr/bin/env node
'use strict';
/** Refresh a cached family worklist against the CURRENT frozen catalog.
 * An old navigation report is never evidence that a card is still pending.
 * No cards are certified, released or granted by this script.
 */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function reconcile(history,certifiedCards,cached){
 if(!Array.isArray(history)||!Array.isArray(certifiedCards)||!cached||!Array.isArray(cached.families))throw Error('Invalid catalog or cached family report');
 const enabled=new Set(certifiedCards.map(c=>c.id));
 const byIdentity=new Map(history.map(h=>[h.id,h]));
 if(byIdentity.size!==history.length)throw Error('Duplicate historical identity');
 const pending=history.filter(h=>!h.passwords?.some(id=>enabled.has(id)));
 const stillPending=new Set(pending.map(h=>h.id));
 const removed=new Set();
 const families=cached.families.map(g=>{
  const originals=[...(g.pending??[])];
  const live=originals.filter(row=>{
   const identity=byIdentity.get(row.canonicalId);
   if(!identity||!identity.passwords?.includes(row.id))throw Error('Stale identity no longer matches historical card: '+row.name);
   const active=stillPending.has(row.canonicalId);
   if(!active)removed.add(row.canonicalId);
   return active;
  });
  return {signature:g.signature,category:g.category,candidates:live,pending:live.length,retiredSinceCache:originals.length-live.length};
 }).filter(g=>g.candidates.length).sort((a,b)=>b.pending-a.pending||a.signature.localeCompare(b.signature));
 const categories=Object.fromEntries([...new Set(pending.map(h=>h.kind==='monster'?(h.mechanics.includes('fusion')?'fusion':h.mechanics.includes('ritual')?'ritual':h.classifications.includes('normal')?'normal':'effect-monster'):`${h.kind}:${h.subcategory??'unclassified'}`))].sort().map(k=>[k,0]));
 for(const h of pending){const k=h.kind==='monster'?(h.mechanics.includes('fusion')?'fusion':h.mechanics.includes('ritual')?'ritual':h.classifications.includes('normal')?'normal':'effect-monster'):`${h.kind}:${h.subcategory??'unclassified'}`;categories[k]++;}
 return {format:1,source:'current engine-v9 immutable catalog + historical union',historical:history.length,certified:history.length-pending.length,pending:pending.length,cachedCertified:cached.certified??null,cacheBehindBy:history.length-pending.length-(cached.certified??history.length-pending.length),staleFamilyIdentitiesRemoved:removed.size,automaticCertifications:0,inventoryGranted:0,method:'Navigation only; complete official text, source review and executable scenarios remain mandatory for each identity.',categories,families};
}
function current(){
 const manifest=require('../catalog/engine-v9/manifest.json');
 const catalog=require('../catalog/engine-v9/'+manifest.current+'.json');
 const history=require('../catalog/historical/2004-10-01/cards.json');
 const cached=require('../docs/evidence/mission32-family-queue-summary.json');
 return reconcile(history,catalog.cards,cached);
}
if(require.main===module){const result=current(),json=JSON.stringify(result,null,2)+'\n',output=process.argv[2];
 if(output){const target=path.resolve(root,output);if(!target.startsWith(path.join(root,'artifacts')+path.sep))throw Error('Only artifacts/ output is allowed');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,json);}
 process.stdout.write(json);
}
module.exports={reconcile,current};
