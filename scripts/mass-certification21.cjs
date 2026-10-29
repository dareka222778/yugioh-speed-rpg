#!/usr/bin/env node
'use strict';
/** Offline proposal gate. This module never edits registries, certificates, saves or inventory.
 * Human review proves complete-text equivalence; hashes bind that review and real
 * execution evidence to the definition. Scenario plans are not passing tests. */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {buildCardRegistry,definitionFingerprint}=require('../dist/cardRegistry');
const {planHistoricalCatalog,validCatalogDate}=require('../dist/catalogCertification');
const {getEffectModel}=require('../dist/effectModels');
const currentRegistry=require('../dist/effectRegistry');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const dimensions=['activation','conditions','costs','targets','choices','operations','duration','restrictions','negation'];
const effectKinds=['conditionalDestruction','destroyExtreme','ritualMonster','ritualSummon','searchZone','recoverMultiple','moveSelected','positionChange','choiceSequence','normal','fusion','monsterEffect','heal','burn','field','equip','continuous','temporaryModifier','destroyFiltered','destroySpellTraps','sequence','attackResponse','fissure','polymerization','darkHole','cardDestruction','giantTrunade','shieldSword','monsterReborn','changeHeart','blockAttack','deSpell','removeTrap','reinforcements','castleWalls','waboku','trapHole','justDesserts','magicJammer','sevenTools','potOfGreed','raigeki','mysticalSpaceTyphoon','bookOfMoon','torrentialTribute','bottomlessTrapHole','sakuretsuArmor','mirrorForce'];
const triggers=['quick','ignition','flip','onSummon','onOtherSummon','onBattleDestroyed','onSentToGrave','continuous'];
const monsterOps=['identityOnly','singleCard','searchFiltered','mill','positionChange','recruit','heal','burn','burnPerSpellTrap','burnPerHand','destroyByLevel','draw','destroy','bounce','recover','search','specialSummon','negateTraps','battleShield','directAttack','continuous'];
const ACTIVE_CAPABILITIES=Object.freeze({engineVersion:'engine-v9',operations:Object.freeze([
 ...effectKinds.map(k=>'effect:'+k),...triggers.map(k=>'trigger:'+k),...monsterOps.map(k=>'monster-operation:'+k),
 ...['lp','discard','tribute'].map(k=>'cost:'+k),...['draw','gainLP','damage','scaledLP'].map(k=>'economic:'+k),
 ...['combat','preventAttack','modifier','negateMonsters','negateTraps','immune'].map(k=>'continuous:'+k),
 ...['hand','grave','monsters','backrow'].map(k=>'count:'+k),'duration:end-turn','choice:ritual-materials','ritualSummonExplicitRecipe','ritualSummonAttributeRecipe','ritual:exact-level-total','ritual:minimum-level-total','ritual:monster'
])});
function inferCapabilities(candidate){
 const effect=candidate?.effect,monster=candidate?.monster,required=new Set();
 if(!effect||typeof effect.kind!=='string')return [];
 required.add('effect:'+effect.kind);
 if(effect.kind==='ritualMonster'||candidate?.card?.monsterType==='ritual')required.add('ritual:monster');
 if(effect.kind==='ritualSummon'){
  required.add('choice:ritual-materials');
  required.add(effect.ritual?.monsterId?'ritualSummonExplicitRecipe':'ritualSummonAttributeRecipe');
  required.add(effect.ritual?.exact===true?'ritual:exact-level-total':'ritual:minimum-level-total');
 }
 const count=c=>{if(c)required.add('count:'+c.zone);};
 const rules=rs=>{if(Array.isArray(rs))for(const r of rs){required.add('continuous:'+r.kind);count(r.count);}};
 if(effect.kind==='monsterEffect'&&monster?.effect){const e=monster.effect;required.add('trigger:'+e.trigger);if(e.operation?.kind){required.add('monster-operation:'+e.operation.kind);rules(e.operation.rules);}if(e.cost?.kind)required.add('cost:'+e.cost.kind);}
 if(effect.kind==='continuous')rules(effect.rules);
 if(effect.kind==='equip')count(effect.count);
 if(effect.kind==='sequence'&&Array.isArray(effect.operations))for(const op of effect.operations)required.add('economic:'+op.kind);
 if(effect.kind==='temporaryModifier')required.add('duration:end-turn');
 return [...required].sort();
}
function scenarioPlan(candidate){
 const effect=candidate?.effect??{},monster=candidate?.monster?.effect,kind=effect.kind;
 const scenarios=new Map(),add=(name,purpose)=>scenarios.set(name,{name,purpose,status:'execution-required'});
 add('identity','Verify passcode, canonical identity, official facts and eligible regional printing.');
 add('negative','Reject an invalid action without mutating the duel.');
 add('json-restore','Restore the actual pending/state representation without losing continuation.');
 add('deterministic-replay','Replay the same action after restoration and compare persisted state/events.');
 if(kind==='normal'){for(const [n,p]of [['normal-summon','Apply the printed Level and required Tributes.'],['set','Set legally without revealing hidden identity.'],['destroy','Move the same entity to its owner grave.'],['tribute-owner','Respect owner when a controlled entity is Tributed.'],['zone-capacity','Reject an occupied destination.']])add(n,p);}
 else if(kind==='ritualMonster')for(const [n,p]of [['ritual-summon','Summon through a compatible actual Ritual Spell.'],['no-normal-summon','Reject ordinary Normal Summon.'],['no-normal-set','Reject ordinary Normal Set.'],['ritual-wrong-recipe','Reject an incompatible Ritual recipe.'],['ritual-recovery','Preserve Ritual summon history and legal revival through recovery.']])add(n,p);
 else {add('activation','Exercise all activation conditions and timing.');add('resolution','Check an independent oracle for every operation and secondary effect.');add('negation','Prevent resolution under a supported negation window.');}
 if(kind==='ritualSummon'){
  for(const [n,p]of [['ritual-exact-recipe','Only the explicitly named monster is eligible for a named recipe.'],['ritual-level-total','Use minimum or exact Level total as defined, rejecting insufficient/redundant Tributes.'],['ritual-resolution-choice','Select the actual monster/material UIDs during resolution rather than targeting at activation.'],['ritual-negated-no-tribute','Negated activation/resolution must not Tribute materials as an activation cost.'],['ritual-invalid-choice','Reject stale or invalid selections without partially moving cards.'],['ritual-restore-choice','Restore a partially completed Ritual decision and continue deterministically.'],['ritual-material-owner','Send controlled Tributes to the correct owners, with supported Token policy.'],['ritual-zone-capacity','A full field can become legal if resolution Tributes free a zone.']])add(n,p);
 }
 if(kind==='fusion'){for(const n of ['exact-materials','illegal-materials','extra-capacity','zone-capacity','material-owner'])add(n,'Validate exact recipe, ownership and legal destination at activation/resolution.');}
 const cost=monster?.cost??effect.cost;
 if(cost||effect.lpCost){for(const n of ['cost-paid-once','cost-invalid','negation-cost-retained','restore-after-cost','duplicate-delivery'])add(n,'Verify paid cost is atomic, preserved after negation and never charged twice.');}
 const op=monster?.operation??{},targeted=op.kind==='singleCard'||!!op.target||['recover','search','specialSummon'].includes(op.kind)||['equip','fissure','monsterReborn','changeHeart','blockAttack','deSpell','removeTrap','mysticalSpaceTyphoon','bookOfMoon'].includes(kind);
 if(targeted)for(const n of ['target-activation','target-resolution','target-zone-change','target-unavailable'])add(n,'Validate target eligibility, lifetime and identity before/after the response chain.');
 if(['search','specialSummon','recover'].includes(op.kind)||['monsterReborn','giantTrunade'].includes(kind))for(const n of ['empty-source','zone-capacity','owner-controller','hidden-information'])add(n,'Exercise movement with missing/occupied destinations and correct public/private observations.');
 if(monster?.trigger&&['flip','onSummon','onOtherSummon','onBattleDestroyed','onSentToGrave'].includes(monster.trigger)){
  add('trigger-timing','Check the precise event and distinguish activation from resolution.');
  if(candidate.monster.activation?.policy==='optional')for(const n of ['optional-accept','optional-decline','restore-choice'])add(n,'Preserve the optional decision and execute only the selected continuation.');
 }
 const economic=effect.operations??[];
 if(op.kind==='draw'||economic.some(o=>o.kind==='draw')||kind==='potOfGreed')for(const n of ['deck-out','hand-overflow'])add(n,'Exercise mandatory/optional drawing and persisted hand-limit decisions.');
 if(['heal','burn'].includes(kind)||['heal','burn','burnPerSpellTrap','burnPerHand'].includes(op.kind)||economic.some(o=>['gainLP','damage'].includes(o.kind)))add('lp-victory','Check effect ordering and victory only at the documented semantic boundary.');
 if(kind==='continuous'||kind==='field'||kind==='equip'||op.kind==='continuous'||['directAttack','negateTraps'].includes(op.kind))for(const n of ['source-loss','continuous-negation','multiple-sources','dynamic-recalculation'])add(n,'Recalculate from live sources, respecting immunity, negation and source lifetime.');
 if(kind==='temporaryModifier'||effect.duration)for(const n of ['duration-expiry','duration-restore','zone-change-expiry'])add(n,'Expire at the exact phase/turn/source lifetime and preserve the deadline through recovery.');
 if(Array.isArray(candidate?.scenarios))for(const name of candidate.scenarios)if(typeof name==='string'&&name.trim())add(name,'Additional reviewed card-specific behavioral oracle.');
 return [...scenarios.values()];
}
function officialCardSource(url,cid){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='www.db.yugioh-card.com'&&u.pathname==='/yugiohdb/card_search.action'&&u.searchParams.get('cid')===String(cid)&&u.searchParams.get('ope')==='2';}catch{return false;}}
function index(items){const result=new Map();for(const item of Array.isArray(items)?items:[]){const key=item?.id;if(typeof key!=='string')continue;const bucket=result.get(key)??[];bucket.push(item);result.set(key,bucket);}return result;}
function planMassCertification({history,candidates,reviews=[],executions=[],capabilities=ACTIVE_CAPABILITIES,cutoff='2004-09-30',region='world',suiteRoot=path.resolve(__dirname,'..')}={}){
 if(!Array.isArray(history)||!Array.isArray(candidates)||!Array.isArray(reviews)||!Array.isArray(executions))throw Error('Expected history/candidates/reviews/executions arrays');
 if(!validCatalogDate(cutoff)||!['tcg','ocg','world'].includes(region))throw Error('Invalid historical cutoff/region');
 if(!capabilities||!/^engine-v[1-9]\d*$/.test(capabilities.engineVersion)||!Array.isArray(capabilities.operations)||capabilities.operations.some(x=>typeof x!=='string'||!x)||new Set(capabilities.operations).size!==capabilities.operations.length)throw Error('Explicit unique resolver capabilities required');
 const supported=new Set(capabilities.operations),reviewIndex=index(reviews),executionIndex=index(executions),candidateIndex=index(candidates.map(c=>({...c,id:c?.card?.id}))),identities=new Map();
 for(const c of candidates){const cid=c?.card?.konamiId;if(cid===undefined)continue;const bucket=identities.get(cid)??[];bucket.push(c);identities.set(cid,bucket);}
 const rows=candidates.map(rawCandidate=>{
  const candidate=rawCandidate&&typeof rawCandidate==='object'?rawCandidate:{};
  const card=candidate?.card,effect=candidate?.effect,id=card?.id??null,issues=[],rs=reviewIndex.get(id)??[],es=executionIndex.get(id)??[],review=rs.length===1?rs[0]:undefined,execution=es.length===1?es[0]:undefined;
  const stages={imported:false,identityVerified:false,mechanicallyRepresented:false,tested:false,certified:typeof id==='string'&&currentRegistry.getCardStatus(id)?.stage==='certified'};
  const existing=stages.certified;
  const imports=history.filter(h=>Array.isArray(h?.passwords)&&h.passwords.includes(id));stages.imported=imports.length===1;
  if(!stages.imported)issues.push(imports.length?'ambiguous-historical-identity':'historical-identity-not-found');
  if((candidateIndex.get(id)?.length??0)!==1||identities.get(card?.konamiId)?.length>1)issues.push('duplicate-candidate-identity');
  if(rs.length!==1)issues.push(rs.length?'duplicate-review':'missing-review');
  if(es.length>1)issues.push('duplicate-execution');
  let fingerprint=null,registryIssues=['missing-definition'];
  try{if(card&&effect){const context={monster:key=>key===id?candidate.monster:undefined,model:getEffectModel};fingerprint=definitionFingerprint(card,effect,context);registryIssues=buildCardRegistry([card],{[id]:effect},{},context).statuses.get(id).issues;}}catch(e){registryIssues=['invalid-definition:'+e.message];}
  const inferred=inferCapabilities(candidate),requirements=Array.isArray(candidate?.requirements)?candidate.requirements:[],unsupported=[...new Set([...inferred,...requirements].filter(x=>typeof x!=='string'||!supported.has(x)))];
  if(!Array.isArray(candidate?.requirements)||requirements.length===0||requirements.some(x=>typeof x!=='string')||new Set(requirements).size!==requirements.length)issues.push('invalid-explicit-requirements');
  if(inferred.some(x=>!requirements.includes(x)))issues.push('undeclared-definition-capability');
  if(unsupported.length)issues.push('unsupported-requirements');
  if(registryIssues.length)issues.push(...registryIssues);
  const text=candidate?.textEvidence;
  if(!text||typeof text.text!=='string'||!text.text.trim()||text.complete!==true||!['official-text','full-rule-paraphrase'].includes(text.format)||!/^([a-f0-9]{64})$/.test(text.sha256??'')||sha256(text.text)!==text.sha256||text.source!==card?.source||!officialCardSource(text.source,card?.konamiId))issues.push('missing-or-invalid-complete-text-evidence');
  if(review?.fullTextReviewed!==true||review.secondaryEffectsReviewed!==true||review.exceptionsReviewed!==true||review.textSha256!==text?.sha256)issues.push('incomplete-full-effect-review');
  if(review?.mechanicsApproved!==true)issues.push('mechanics-review-not-approved');
  const coverage=review?.semanticCoverage;
  if(!coverage||dimensions.some(d=>!['represented','not-applicable'].includes(coverage[d])))issues.push('incomplete-semantic-coverage');
  const requiredDimensions=new Set(['operations']);
  if(effect?.activation||candidate?.monster?.activation&&candidate.monster.effect?.trigger!=='continuous')requiredDimensions.add('activation');
  if(candidate?.monster?.effect?.cost||effect?.cost||effect?.lpCost)requiredDimensions.add('costs');
  if(candidate?.monster?.effect?.operation?.kind==='singleCard'||candidate?.monster?.effect?.operation?.target||['equip','monsterReborn','changeHeart','blockAttack','deSpell','removeTrap','mysticalSpaceTyphoon','bookOfMoon'].includes(effect?.kind))requiredDimensions.add('targets');
  if(candidate?.monster?.activation?.policy==='optional')requiredDimensions.add('choices');
  if(effect?.kind==='ritualSummon')requiredDimensions.add('choices');
  if(effect?.duration||effect?.kind==='temporaryModifier')requiredDimensions.add('duration');
  if(!['normal','ritualMonster'].includes(effect?.kind))requiredDimensions.add('negation');
  if([...requiredDimensions].some(d=>coverage?.[d]!=='represented'))issues.push('semantic-dimension-not-represented');
  const raw=imports.length===1?imports[0]:undefined,english=typeof raw?.names?.en==='string'?raw.names.en.trim().normalize('NFC'):null;
  if(card&&raw&&(typeof card.englishName!=='string'||card.englishName.trim().normalize('NFC')!==english))issues.push('english-identity-mismatch');
  if(!review?.verifiedPrinting||!officialCardSource(review.primarySource,card?.konamiId)||!officialCardSource(review.verifiedPrinting.source,card?.konamiId))issues.push('missing-official-regional-printing');
  const plan=scenarioPlan(candidate),requiredScenarios=plan.map(s=>s.name),suites=candidate?.suites;
  const validSuites=Array.isArray(suites)&&suites.length>0&&new Set(suites).size===suites.length&&suites.every(s=>typeof s==='string'&&/^tests\/[A-Za-z0-9_-]+\.test\.cjs$/.test(s)&&fs.existsSync(path.resolve(suiteRoot,s))&&fs.statSync(path.resolve(suiteRoot,s)).isFile());
  if(!validSuites)issues.push('invalid-or-missing-test-suites');
  const validExecution=!!execution&&execution.resolverVersion===capabilities.engineVersion&&execution.activePublicEngine===true&&validSuites&&execution.exitCode===0&&Array.isArray(execution.passed)&&Array.isArray(execution.failed)&&execution.failed.length===0&&execution.fingerprint===fingerprint&&Array.isArray(execution.suites)&&execution.suites.length===suites.length&&suites.every(s=>execution.suites.includes(s)&&typeof execution.suiteHashes?.[s]==='string'&&sha256(fs.readFileSync(path.resolve(suiteRoot,s)))===execution.suiteHashes[s])&&requiredScenarios.every(s=>execution.passed.includes(s));
  let historical;
  try{historical=planHistoricalCatalog(history,{cutoff,region,admissions:card&&fingerprint?[{id,card,family:candidate.family??effect?.kind??'unknown',fingerprint,certified:existing,distributionAuthorized:false,requiredScenarios}]:[],reviews:review?[review]:[],executions:validExecution?[execution]:[]}).plan.find(p=>p.id===id&&p.canonicalId===imports[0]?.id);}catch(e){issues.push('invalid-historical-evidence:'+e.message);}
  // Identity is a separate factual gate, not an alias for mechanics approval or
  // a successful test. The pre-existing planner's individualReview combines both.
  const primary=review?.primaryFacts,printing=review?.verifiedPrinting,norm=v=>typeof v==='string'?v.toLowerCase().replace(/[\s_-]/g,''):null;
  const identityFacts=!!card&&!!raw&&card.kind===raw.kind&&card.konamiId===raw.konamiId&&card.englishName===english&&raw.passwords.includes(id)&&(card.kind!=='monster'||card.level===raw.level&&card.atk===raw.atk&&card.defense===raw.def&&norm(card.race)===norm(raw.race)&&card.attribute===raw.attribute?.toUpperCase());
  const primaryFacts=!!primary&&!!card&&['level','atk','defense','race','attribute'].every(k=>primary[k]===card[k]);
  const printingRegion=!!printing&&['tcg','ocg'].includes(printing.region)&&validCatalogDate(printing.date)&&printing.date<=cutoff&&typeof printing.set==='string'&&!!printing.set.trim()&&(region==='world'||printing.region===region);
  const identityReviewed=review?.identityApproved===true&&typeof review.reviewer==='string'&&!!review.reviewer.trim()&&validCatalogDate(review.reviewedAt)&&review.canonicalId===raw?.id&&review.konamiId===card?.konamiId&&review.primarySource===card?.source;
  stages.identityVerified=!!historical?.normalized&&!!historical?.eligible&&identityFacts&&primaryFacts&&printingRegion&&identityReviewed&&!issues.some(i=>['duplicate-candidate-identity','english-identity-mismatch','missing-official-regional-printing'].includes(i));
  stages.mechanicallyRepresented=stages.identityVerified&&registryIssues.length===0&&unsupported.length===0&&inferred.every(x=>requirements.includes(x))&&!issues.some(i=>['invalid-explicit-requirements','incomplete-semantic-coverage','semantic-dimension-not-represented','missing-or-invalid-complete-text-evidence','incomplete-full-effect-review','mechanics-review-not-approved'].includes(i));
  stages.tested=stages.mechanicallyRepresented&&validExecution&&!!historical?.tested;
  if(!validExecution)issues.push('missing-stale-or-incomplete-execution');
  const ready=stages.tested&&historical?.readyForIndividualCertification===true&&issues.length===0;
  return {id,canonicalId:imports.length===1?imports[0].id:null,engineVersion:capabilities.engineVersion,stages,fingerprint,requirements,inferredCapabilities:inferred,unsupportedRequirements:unsupported,historicalIssues:historical?.issues??[],issues:[...new Set(issues)],scenarioPlan:plan,readyForCertificateProposal:ready&&!existing,proposal:ready&&!existing?{id,certificate:{fingerprint,suites:[...suites]}}:null,distributionAuthorized:existing?require('../dist/cardReleasePolicy').cardDistributionAllowed(id):false};
 });
 return {format:1,kind:'offline-mass-certification-proposals',engineVersion:capabilities.engineVersion,cutoff,region,changesRegistry:false,grantsInventory:false,distributesCards:false,automationScope:'Deterministic structure/evidence/execution consistency only; complete-effect equivalence remains an individual human/source review.',stages:Object.fromEntries(['imported','identityVerified','mechanicallyRepresented','tested','certified'].map(s=>[s,rows.filter(r=>r.stages[s]).length])),candidateCount:rows.length,proposals:rows.filter(r=>r.proposal).map(r=>r.proposal),rows};
}
module.exports={ACTIVE_CAPABILITIES,inferCapabilities,scenarioPlan,planMassCertification,sha256,dimensions};
if(require.main===module){try{if(process.argv.length!==3)throw Error('Usage: node scripts/mass-certification21.cjs INPUT.json (read-only; JSON proposals on stdout)');const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(planMassCertification(input),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
