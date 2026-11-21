#!/usr/bin/env node
'use strict';
/** Read-only triage. A family lead is never a full-effect specification or certificate. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const order=(a,b)=>a<b?-1:a>b?1:0;
const official=(url,cid)=>typeof url==='string'&&url.startsWith('https://www.db.yugioh-card.com/yugiohdb/card_search.action?')&&new URL(url).searchParams.get('cid')===String(cid);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const genericKinds=new Set(['continuous','equip','field','heal','burn','sequence','attackResponse','destroyFiltered','temporaryModifier','destroySpellTraps']);
const dependencies={
 'graveyard-interaction':{possible:['recover','bounce','specialSummon'],review:['zone-selector','movement-order','grave-restrictions']},
 'choice-or-cost':{possible:['choice','lp-cost','discard-cost','tribute-cost'],review:['cost-timing','choice-cancellation','conditional-continuation']},
 'turn-timing':{possible:['end-turn-modifier'],review:['phase-specific-duration','phase-trigger','expiration-order']},
 'continuous-lock':{possible:['continuous-modifier','monster-negation','trap-negation','immunity'],review:['scope-and-source-dependency','continuous-restriction']},
 'battle-modifier':{possible:['continuous-modifier','temporary-modifier','attack-response'],review:['damage-step-timing','battle-conditions','secondary-effects']},
 'field-or-equip':{possible:['field-modifier','equip-modifier','continuous-count'],review:['equip-eligibility','source-loss','secondary-effects']},
 'simple-burn-heal-draw':{possible:['damage','gainLP','draw'],review:['simultaneous-vs-sequential','activation-conditions','secondary-effects']},
 'deck-search':{possible:['stat-filter-search','attribute-filter-specialSummon'],review:['name-type-and-zone-filter','shuffle','hidden-information']},
 'hand-discard':{possible:['discard-cost','hand-replacement'],review:['discard-as-cost-vs-effect','random-vs-chosen','conditional-count']},
 'mass-destruction':{possible:['destroyMonsters','destroySpellTraps','destroyFiltered'],review:['filter-equivalence','immunity','destruction-events']}
};
function category(card){const mechanics=card.mechanics??[],classes=card.classifications??[];
 if(card.kind==='spell')return 'spell';if(card.kind==='trap')return 'trap';if(card.kind!=='monster')return 'unknown';
 if(mechanics.includes('fusion'))return 'fusion';if(mechanics.includes('ritual'))return 'ritual-monster';
 return classes.length===1&&classes[0]==='normal'&&!mechanics.length?'normal-monster':'effect-monster';
}
function evidenceRecords(value,source,out={reviews:[],executions:[],texts:[]}){
 if(Array.isArray(value)){for(const child of value)evidenceRecords(child,source,out);return out;}
 if(!value||typeof value!=='object')return out;
 if(typeof value.id==='string'){
  if(typeof value.canonicalId==='string'&&value.identityApproved===true&&value.primaryFacts)out.reviews.push({...value,evidenceFile:source});
  if(typeof value.fingerprint==='string'&&Array.isArray(value.passed)&&Array.isArray(value.failed))out.executions.push({...value,evidenceFile:source});
  if(value.fullTextComplete===true&&typeof value.fullText==='string'&&value.fullText.length>0&&value.fullTextSha256===digest(value.fullText)&&typeof value.source==='string')out.texts.push({...value,evidenceFile:source});
 }
 for(const child of Object.values(value))if(child&&typeof child==='object')evidenceRecords(child,source,out);
 return out;
}
function inventory(runtime){const counts={structural:0,declarative:0,specialized:0,registeredWithoutExecutableDefinition:0},operations=new Map(),kinds=new Map();
 for(const card of runtime.cards){const effect=runtime.effects[card.id],monster=runtime.monsters[card.id];let mode;
  if(!effect){counts.registeredWithoutExecutableDefinition++;continue;}
  kinds.set(effect.kind,(kinds.get(effect.kind)??0)+1);
  if(['normal','fusion'].includes(effect.kind))mode='structural';else if(genericKinds.has(effect.kind)||effect.kind==='monsterEffect'&&monster)mode='declarative';else mode='specialized';counts[mode]++;
  const values=effect.kind==='monsterEffect'&&monster?[monster.effect.operation]:effect.kind==='sequence'?effect.operations:[effect];
  for(const op of values??[]){const k=effect.kind==='monsterEffect'?'monster:'+op.kind:op.kind;operations.set(k,(operations.get(k)??0)+1);}
 }
 return {resolver:runtime.resolverVersion,counts,effectKinds:Object.fromEntries([...kinds].sort((a,b)=>order(a[0],b[0]))),observedOperations:Object.fromEntries([...operations].sort((a,b)=>order(a[0],b[0]))),
  interpretation:'Counts describe registered definitions. Structural Normal/Fusion data is not an effect. Declarative means the existing typed vocabulary; legacy kind-specific handlers remain specialized even when an activation model exists. Observed operation use does not prove every combination of conditions/costs is supported.'};
}
function triage(history,runtime,{prior={groups:[]},reviews=[],executions=[],texts=[],cutoff='2004-09-30'}={}){
 if(!validDate(cutoff))throw Error('Invalid cutoff');
 const enabled=new Set(runtime.enabled),cardMap=new Map(runtime.cards.map(c=>[c.id,c])),claims=new Map(),collisions=new Map();
 function claim(key,index){const values=claims.get(key)??[];values.push(index);claims.set(key,values);}
 history.forEach((h,i)=>{if(h.id)claim('canonical:'+h.id,i);if(h.konamiId!=null)claim('cid:'+h.konamiId,i);for(const id of new Set(h.passwords??[]))claim('passcode:'+id,i);});
 for(const [key,indexes]of claims)if(indexes.length>1)for(const i of indexes){const list=collisions.get(i)??[];list.push(key);collisions.set(i,list);}
 const leads=new Map();for(const group of prior.groups??[])for(const item of group.examples??[]){const list=leads.get(item.id)??[];list.push({family:group.family,text:item.description??null,mayBeTruncated:typeof item.description==='string'&&item.description.length>=300});leads.set(item.id,list);}
 const records=history.map((h,index)=>{
  const aliases=h.passwords??[],matches=aliases.filter(id=>cardMap.has(id)),id=matches.length===1?matches[0]:aliases.length===1?aliases[0]:null,card=id?cardMap.get(id):undefined,certificate=id?runtime.certificates[id]:undefined;
  const certified=aliases.some(id=>enabled.has(id)),identityIssues=[];
  if(aliases.length!==1||aliases.some(id=>typeof id!=='string'||!/^\d{8}$/.test(id)))identityIssues.push('primary-passcode-review');
  if(!Number.isSafeInteger(h.konamiId)||h.konamiId<1)identityIssues.push('missing-or-invalid-cid');
  if(!h.names?.en)identityIssues.push('missing-english-name');
  for(const conflict of collisions.get(index)??[])identityIssues.push('identity-collision:'+conflict);
  const dates=h.firstObserved??{},availableDates=['tcg','ocg'].flatMap(region=>validDate(dates[region])&&dates[region]<=cutoff?[{region,date:dates[region]}]:[]),eligible=availableDates.length>0;
  const reviewsForId=reviews.filter(r=>aliases.includes(r.id)&&r.canonicalId===h.id&&r.konamiId===h.konamiId&&r.identityApproved===true&&official(r.primarySource,h.konamiId)&&validDate(r.reviewedAt));
  const canonical=v=>typeof v==='string'?v.toLowerCase().replace(/[^a-z0-9]/g,''):v;
  const matchingReviews=reviewsForId.filter(r=>r.primaryFacts.level===h.level&&r.primaryFacts.atk===h.atk&&r.primaryFacts.defense===h.def&&canonical(r.primaryFacts.race)===canonical(h.race)&&canonical(r.primaryFacts.attribute)===canonical(h.attribute)&&(!card||r.primaryFacts.level===card.level&&r.primaryFacts.atk===card.atk&&r.primaryFacts.defense===card.defense&&r.primaryFacts.race===card.race&&r.primaryFacts.attribute===card.attribute));
  const approvedPrintings=matchingReviews.flatMap(r=>{const p=r.verifiedPrinting;return p&&['tcg','ocg'].includes(p.region)&&validDate(p.date)&&p.date<=cutoff&&p.set&&official(p.source,h.konamiId)?[{region:p.region,date:p.date,set:p.set,evidenceFile:r.evidenceFile}]:[];});
  const effect=id?runtime.effects[id]:undefined,monster=id?runtime.monsters[id]:undefined,represented=!!card&&!!effect&&runtime.validDefinitions?.[id]!==false&&(effect.kind!=='monsterEffect'||!!monster);
  const expectedFingerprint=id?runtime.fingerprints?.[id]??certificate?.fingerprint:undefined;
  const matchingExecution=represented&&expectedFingerprint?executions.filter(e=>e.id===id&&e.fingerprint===expectedFingerprint&&e.failed.length===0&&e.passed.length>0):[];
  const fullTexts=texts.filter(t=>aliases.includes(t.id)&&t.konamiId===h.konamiId&&t.fullTextComplete===true&&t.fullTextSha256===digest(t.fullText)&&official(t.source,h.konamiId));
  const hints=aliases.flatMap(a=>leads.get(a)??[]),families=[...new Set(hints.map(l=>l.family))].sort(order),possible=new Set(),reviewDependencies=new Set();
  const type=category(h);if(type==='normal-monster')possible.add('normal');if(type==='fusion'){possible.add('exactFusionRecipe');reviewDependencies.add('full-recipe-and-all-secondary-effects');}if(type==='ritual-monster')reviewDependencies.add('ritual-summoning-and-conditions');
  for(const family of families){const suffix=family.slice(family.indexOf(':')+1),rule=dependencies[suffix];for(const op of rule?.possible??[])possible.add(op);for(const dep of rule?.review??['full-effect-review'])reviewDependencies.add(dep);}
  if(h.atk==='?'||h.def==='?')reviewDependencies.add('dynamic-statistics');
  const evidenceGaps=[];if(!matchingReviews.length)evidenceGaps.push('approved-identity-review-not-recovered');if(!approvedPrintings.length)evidenceGaps.push('verified-pre-cut-printing-not-recovered');if(!fullTexts.length)evidenceGaps.push('complete-official-text-not-cached');if(!matchingExecution.length)evidenceGaps.push('fingerprinted-execution-manifest-not-recovered');
  const lifecycle={imported:true,identityVerified:identityIssues.length===0&&matchingReviews.length>0,mechanicRepresented:represented,tested:matchingExecution.length>0,certified};
  const mode=!effect?null:['normal','fusion'].includes(effect.kind)?'structural':genericKinds.has(effect.kind)||effect.kind==='monsterEffect'&&monster?'declarative':'specialized';
  const stage=certified?'certified':lifecycle.tested?'tested':represented?'mechanic-represented':lifecycle.identityVerified?'identity-verified':'imported';
  return {canonicalId:h.id,id,name:h.names?.en??null,category:type,aliases,konamiId:h.konamiId,eligibility:{importedRegionDates:dates,eligibleByImport:eligible,eligibleRegions:availableDates,verifiedPrintings:approvedPrintings,cutoff},identityIssues,lifecycle,highestRecordedStage:stage,
   evidence:{identityReviewFiles:[...new Set(matchingReviews.map(r=>r.evidenceFile))].sort(order),executionFiles:[...new Set(matchingExecution.map(r=>r.evidenceFile))].sort(order),completeOfficialTextFiles:[...new Set(fullTexts.map(t=>t.evidenceFile))].sort(order),gaps:evidenceGaps},
   mechanic:{mode,registeredKind:effect?.kind??null,representedOperations:effect?effect.kind==='monsterEffect'?[monster?.effect.operation.kind??'missing-monster-definition']:effect.kind==='sequence'?effect.operations.map(o=>o.kind):[effect.kind]:[],possibleFamilies:families,possibleReusableOperations:[...possible].sort(order),dependenciesRequiringReview:[...reviewDependencies].sort(order),keywordEquivalenceApproved:false},
   discoveryText:{cachedLeadCount:hints.length,truncatedLeadCount:hints.filter(h=>h.mayBeTruncated).length,fullOfficialTextCached:fullTexts.length>0},
   needsWork:!certified,certificationAllowed:false};
 });
 const pending=records.filter(r=>!r.lifecycle.certified),byCategory=Object.create(null),stages=Object.create(null),families=new Map();
 for(const row of records){byCategory[row.category]??={total:0,certified:0,pending:0};byCategory[row.category].total++;byCategory[row.category][row.lifecycle.certified?'certified':'pending']++;stages[row.highestRecordedStage]=(stages[row.highestRecordedStage]??0)+1;}
 for(const row of pending)for(const family of row.mechanic.possibleFamilies){const f=families.get(family)??{family,knownPendingLeads:[],possibleReusableOperations:new Set(),unreviewedDependencies:new Set()};f.knownPendingLeads.push(row.id??'canonical:'+row.canonicalId);row.mechanic.possibleReusableOperations.forEach(x=>f.possibleReusableOperations.add(x));row.mechanic.dependenciesRequiringReview.forEach(x=>f.unreviewedDependencies.add(x));families.set(family,f);}
 const familyQueue=[...families.values()].map(f=>({family:f.family,knownPendingLeadCount:new Set(f.knownPendingLeads).size,knownPendingLeads:[...new Set(f.knownPendingLeads)].sort(order),possibleReusableOperations:[...f.possibleReusableOperations].sort(order),unreviewedDependencies:[...f.unreviewedDependencies].sort(order),membershipComplete:false,reviewRequired:true})).sort((a,b)=>b.knownPendingLeadCount-a.knownPendingLeadCount||order(a.family,b.family));
 const queue=pending.map(r=>({canonicalId:r.canonicalId,id:r.id,name:r.name,category:r.category,priority:r.identityIssues.length||!r.eligibility.eligibleByImport?4:r.lifecycle.mechanicRepresented&&r.lifecycle.identityVerified?1:r.mechanic.possibleReusableOperations.length?2:3,
  reason:r.identityIssues.length?'identity-review-required':!r.eligibility.eligibleByImport?'regional-eligibility-not-recovered':r.lifecycle.mechanicRepresented?'represented-definition-requires-current-execution-gate':r.mechanic.possibleReusableOperations.length?'shared-operation-lead-requires-complete-text-review':'complete-text-and-family-membership-missing',families:r.mechanic.possibleFamilies})).sort((a,b)=>a.priority-b.priority||order(a.category,b.category)||order(a.name??'',b.name??'')||order(a.canonicalId,b.canonicalId));
 return {format:1,kind:'read-only-mission17-catalog-triage',cutoff,mutationPolicy:{admitsCards:false,grantsInventory:false,automaticCertifications:0},counts:{historical:history.length,certifiedHistoricalRecords:records.filter(r=>r.lifecycle.certified).length,certifiedRegistryIds:enabled.size,pending:pending.length,byCategory,highestRecordedStage:stages,pendingWithIdentityIssues:pending.filter(r=>r.identityIssues.length).length,pendingWithoutCompleteOfficialText:pending.filter(r=>!r.discoveryText.fullOfficialTextCached).length,pendingWithM13DiscoveryLeads:pending.filter(r=>r.discoveryText.cachedLeadCount).length},
  runtimeInventory:inventory(runtime),familyQueue,implementationQueue:queue,records,
  bottlenecks:[{operation:'complete-text-recovery',evidence:'M13 persisted at most 12 examples per family, with descriptions capped at 300 characters. Its group counts are overlapping historical leads, not full current membership.'},{operation:'evidence-reuse',evidence:'Cached approved reviews and fingerprinted successful executions are indexed separately. Missing archived execution manifests do not erase an existing registry certificate or fabricate test evidence.'}],
  caveats:['Lifecycle flags are independently evidenced. A registry certificate can exist while its historical review/execution artifact is absent from the local cache; those gaps stay explicit.','Possible operations are discovery leads, not verified effect equivalence. Every secondary effect, activation, cost, choice, restriction and duration needs complete-text review.','No generated row grants permission to certify or distribute a card.','Family queue membership is incomplete until full texts for all pending records are recovered.']};
}
function load(root=path.resolve(__dirname,'..')){
 const registry=require(path.join(root,'dist/effectRegistry')),monsters=require(path.join(root,'dist/monsterEffects')),certificates=require(path.join(root,'dist/cardCertifications')).cardCertifications;
 const cards=registry.engineCatalog,fp=require(path.join(root,'dist/cardRegistry')).definitionFingerprint,models=require(path.join(root,'dist/effectModels'));
 const runtime={resolverVersion:require(path.join(root,'dist/resolverArchive')).CURRENT_RESOLVER_VERSION,cards,enabled:registry.enabledCardIds,effects:Object.fromEntries(cards.flatMap(c=>registry.getEffect(c.id)?[[c.id,registry.getEffect(c.id)]]:[])),monsters:Object.fromEntries(cards.flatMap(c=>monsters.getMonsterDefinition(c.id)?[[c.id,monsters.getMonsterDefinition(c.id)]]:[])),certificates,
  fingerprints:Object.fromEntries(cards.flatMap(c=>registry.getEffect(c.id)?[[c.id,fp(c,registry.getEffect(c.id),{monster:monsters.getMonsterDefinition,model:models.getEffectModel})]]:[])),validDefinitions:Object.fromEntries(cards.map(c=>[c.id,(registry.getCardStatus(c.id)?.issues.length??1)===0]))};
 const evidence={reviews:[],executions:[],texts:[]},sourceHashes={};
 function read(relative){const bytes=fs.readFileSync(path.join(root,relative));sourceHashes[relative]=digest(bytes);return JSON.parse(bytes);}
 const history=read('catalog/historical/2004-10-01/cards.json'),prior=read('docs/evidence/mission13-remaining-families.json');
 for(const name of fs.readdirSync(path.join(root,'docs/evidence')).sort(order))if(/(?:review|reviews|crosscheck|executions|validation)\.json$/.test(name)){const relative='docs/evidence/'+name;evidenceRecords(read(relative),relative,evidence);}
 const artifacts=path.join(root,'artifacts');if(fs.existsSync(artifacts))for(const name of fs.readdirSync(artifacts).sort(order))if(/^certification-executions.*\.json$/.test(name)){const relative='artifacts/'+name;evidenceRecords(read(relative),relative,evidence);}
 const report=triage(history,runtime,{prior,...evidence});report.sourceHashes=sourceHashes;return report;
}
module.exports={triage,category,evidenceRecords,inventory,load};
if(require.main===module){const root=path.resolve(__dirname,'..'),report=load(root),out=path.join(root,'artifacts/mission21-triage.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({counts:report.counts,runtimeInventory:report.runtimeInventory,topFamilies:report.familyQueue.slice(0,8),output:path.relative(root,out)},null,2));}
