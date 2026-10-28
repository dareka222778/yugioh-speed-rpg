#!/usr/bin/env node
/** Offline gate: exact recipes, individual tests, existing materials, no distribution. */
const fs=require('node:fs'),assert=require('node:assert/strict'),
 {audit}=require('./audit-certification-pipeline.cjs'),
 {historicalFusionBatch10}=require('../dist/historicalFusionBatch10'),
 {enabledCardIds,getPlayableCard}=require('../dist/effectRegistry'),
 {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const history=require('../catalog/historical/2004-10-01/cards.json'),
 evidence=require('../docs/evidence/mission10-fusion-crosscheck.json'),
 reviews=require('../docs/evidence/mission10-individual-reviews.json'),
 executions=JSON.parse(fs.readFileSync('artifacts/certification-executions-fusion10.json','utf8')),
 historical=new Map(history.map(h=>[h.id,h])),
 cohort=new Map(historicalFusionBatch10.map(c=>[c.id,c]));
assert.equal(evidence.independentCrosschecked,31);
assert.match(evidence.sourceResponseSha256,/^[a-f0-9]{64}$/);
assert.equal(historicalFusionBatch10.length,31);
assert.equal(reviews.length,31);
assert.equal(executions.length,31);
assert.equal(evidence.cards.length,31);
assert.equal(new Set(reviews.map(x=>x.id)).size,31);
assert.equal(new Set(executions.map(x=>x.id)).size,31);
assert.ok(enabledCardIds.length>=723,'Mission 10 cohort must remain enabled');
for(const record of evidence.cards){
 const card=cohort.get(record.id),row=historical.get(record.canonicalId),review=reviews.find(r=>r.id===record.id);
 assert.ok(card&&row&&review,'Missing individual Fusion: '+record.id);
 assert.equal(row.passwords.length,1);assert.equal(row.passwords[0],record.id);
 assert.deepEqual(row.mechanics,['fusion']);assert.ok(row.firstObserved.ocg<='2004-09-30');
 assert.equal(record.type,'Fusion Monster');
 assert.equal(record.description,record.recipeNames.map(n=>'"'+n+'"').join(' + '),'Unexpected extra Fusion rules: '+record.id);
 assert.equal(record.factsMatch,true);
 for(const pair of [['level','level'],['atk','atk'],['defense','defense'],['attribute','attribute']])assert.equal(record[pair[0]],card[pair[1]]);
 assert.equal(record.race.toLowerCase().replace(/[\s_-]/g,''),card.race.toLowerCase().replace(/[\s_-]/g,''));
 assert.equal(record.id,card.id);assert.equal(record.konamiId,card.konamiId);
 assert.deepEqual(record.recipeIds,card.fusion);assert.deepEqual(record.recipeIds,review.recipeIds);
 assert.deepEqual(record.recipeNames,review.recipeNames);
 for(const id of card.fusion)assert.ok(getPlayableCard(id),'Unplayable exact material: '+id);
 assert.equal(cardDistributionAllowed(card.id),false,'Unapproved Fusion distribution: '+card.id);
}
const planning=audit({reviews,executions,region:'world'}),
 rows=planning.plan.filter(row=>cohort.has(row.id));
assert.equal(rows.length,31);
for(const row of rows)assert.equal(row.readyForIndividualCertification,true,JSON.stringify({id:row.id,issues:row.issues,reviewed:row.individualReview,regional:row.regionVerified,tested:row.tested,facts:row.factsMatchImplementation}));
const report={cohort:'mission10',previousCards:692,newFusions:31,certifiedTotal:enabledCardIds.length,
 exactRecipes:31,threeMaterialRecipes:historicalFusionBatch10.filter(c=>c.fusion.length===3).length,
 individualScenarioExecutions:executions.reduce((n,x)=>n+x.passed.length,0),
 failedExecutions:executions.reduce((n,x)=>n+x.failed.length,0),
 distributionEnabled:rows.filter(x=>x.distributionAuthorized).length,
 sourceResponseSha256:evidence.sourceResponseSha256};
fs.writeFileSync('artifacts/mission10-fusion-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
