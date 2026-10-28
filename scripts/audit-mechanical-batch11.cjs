#!/usr/bin/env node
/** Individual evidence and actual execution gate; never grants distribution. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {mechanicalBatch11:cards,mechanicalEffects11:definitions,mechanicalMonsters11:monsters}=require('../dist/mechanicalBatch11');
const {enabledCardIds,getEffect,getCardStatus,engineCard}=require('../dist/effectRegistry');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {getEffectModel}=require('../dist/effectModels');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const {audit}=require('./audit-certification-pipeline.cjs');
const {getCatalogData}=require('../dist/catalogArchive');
const manifest=require('../catalog/engine-v7/manifest.json');
const crosscheck=require('../docs/evidence/mission11-rule-crosscheck.json');
const reviews=require('../docs/evidence/mission11-individual-reviews.json');
const executions=JSON.parse(fs.readFileSync('artifacts/certification-executions-mission11.json','utf8'));
const historical=require('../catalog/historical/2004-10-01/cards.json');
const historicalById=new Map(historical.map(x=>[x.id,x]));
const required=['identity','mechanic','negative','replay','counter-or-continuous-negation','source-loss-or-cost-recovery'];
assert.ok(manifest.revisions.length>=6);assert.equal(getCatalogData(manifest.revisions[4].id).cards.length,723);
assert.equal(getCatalogData(manifest.revisions[5].id).cards.length,740);
assert.equal(enabledCardIds.length,752);assert.equal(cards.length,17);assert.equal(reviews.length,17);assert.equal(executions.length,17);
assert.equal(crosscheck.cards.length,17);assert.equal(crosscheck.previousCertified,723);
assert.equal(crosscheck.independentSource.length,2);
for(const source of crosscheck.independentSource)assert.match(source.sha256,/^[a-f0-9]{64}$/);
assert.equal(new Set(cards.map(c=>c.id)).size,17);
assert.deepEqual(cards.reduce((a,c)=>(a[definitions[c.id].kind]=(a[definitions[c.id].kind]??0)+1,a),{}),
 {equip:12,monsterEffect:3,burn:1,sequence:1});
const plans=audit({reviews,executions,region:'world'}).plan;
let tested=0;
for(const card of cards){
 const review=reviews.find(x=>x.id===card.id),check=crosscheck.cards.find(x=>x.id===card.id),execution=executions.find(x=>x.id===card.id);
 const source=historicalById.get(review?.canonicalId),status=getCardStatus(card.id),definition=getEffect(card.id);
 assert.ok(review&&check&&execution&&source,'Individual evidence absent: '+card.id);
 assert.equal(source.passwords.length,1);assert.equal(source.passwords[0],card.id);
 assert.equal(check.englishName,card.englishName);assert.equal(check.konamiId,card.konamiId);
 assert.equal(check.exactFullTextMatched,true);assert.equal(check.description,review.expectedText);
 assert.equal(card.summary,check.description);
 assert.ok(source.firstObserved.ocg<='2004-09-30');
 assert.deepEqual(check.mechanicalDefinition,definition);
 assert.deepEqual(check.monsterDefinition,getMonsterDefinition(card.id)??null);
 assert.deepEqual(check.monsterDefinition,monsters[card.id]??null);
 assert.equal(status.stage,'certified');assert.deepEqual(status.issues,[]);
 assert.deepEqual(engineCard(card.id),card);
 assert.equal(cardDistributionAllowed(card.id),false);
 const fingerprint=definitionFingerprint(card,definition,{monster:getMonsterDefinition,model:getEffectModel});
 assert.equal(fingerprint,review.mechanicalFingerprint);assert.equal(fingerprint,execution.fingerprint);
 assert.deepEqual(execution.failed,[]);for(const scenario of required)assert.ok(execution.passed.includes(scenario),`${card.id}: ${scenario} not executed`);
 const plan=plans.find(x=>x.id===card.id);
 assert.ok(plan?.readyForIndividualCertification,JSON.stringify({id:card.id,plan}));
 tested+=execution.passed.length;
}
const report={cohort:'mission11',totalCertified:enabledCardIds.length,previousCards:723,newCertified:17,
 byFamily:{equip:12,spellLifePoints:2,monster:3},individualScenarioExecutions:tested,failedExecutions:0,
 distributionAuthorized:cards.filter(c=>cardDistributionAllowed(c.id)).length,
 previousCatalogRevision:manifest.revisions[4].id,currentCatalogRevision:manifest.revisions[5].id,legacyRevisionsPreserved:true};
fs.writeFileSync('artifacts/mission11-mechanical-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
