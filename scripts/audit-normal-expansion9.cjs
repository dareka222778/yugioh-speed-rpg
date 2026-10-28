#!/usr/bin/env node
/** Fails closed unless every independently cross-checked Normal has an executed oracle. */
const fs=require('node:fs'),assert=require('node:assert/strict'),
 {audit}=require('./audit-certification-pipeline.cjs'),
 {historicalNormalBatch9}=require('../dist/historicalNormalBatch9'),
 {enabledCardIds}=require('../dist/effectRegistry'),
 {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const evidence=require('../docs/evidence/mission9-normal-crosscheck.json'),
 reviews=require('../docs/evidence/mission9-individual-reviews.json'),
 historical=require('../catalog/historical/2004-10-01/cards.json'),
 byCanonical=new Map(historical.map(c=>[c.id,c])),
 byId=new Map(historicalNormalBatch9.map(c=>[c.id,c])),
 results=[];
for(const suffix of ['a','b','c','d']){
 const file='artifacts/certification-executions-mission9'+suffix+'.json';
 results.push(...JSON.parse(fs.readFileSync(file,'utf8')));
}
assert.equal(evidence.independentCrosschecked,449);
assert.equal(evidence.sourceCount>=500,true);
assert.match(evidence.sourceResponseSha256,/^[a-f\d]{64}$/);
assert.equal(historicalNormalBatch9.length,449);
assert.equal(reviews.length,449);
assert.equal(results.length,449);
assert.equal(evidence.cards.length,449);
assert.equal(new Set(evidence.cards.map(x=>x.id)).size,449);
assert.equal(new Set(results.map(x=>x.id)).size,449);
assert.equal(enabledCardIds.length,723);
for(const check of evidence.cards){
 const h=byCanonical.get(check.canonicalId),card=byId.get(check.id),review=reviews.find(r=>r.id===check.id);
 assert.ok(h&&card&&review,'missing individual identity: '+check.id);
 assert.equal(h.passwords.length,1);
 assert.equal(h.passwords[0],check.id);
 assert.equal(h.normalMainCandidate,true);
 assert.ok(h.firstObserved.ocg&&h.firstObserved.ocg<='2004-09-30');
 assert.equal(check.kind,'Normal Monster');
 assert.equal(check.factsMatch,true);
 assert.equal(check.level,h.level);assert.equal(check.level,card.level);
 assert.equal(check.atk,h.atk);assert.equal(check.atk,card.atk);
 assert.equal(check.defense,h.def);assert.equal(check.defense,card.defense);
 assert.equal(check.race.toLowerCase().replace(/[\s_-]/g,''),h.race.toLowerCase().replace(/[\s_-]/g,''));
 assert.equal(check.race.toLowerCase().replace(/[\s_-]/g,''),card.race.toLowerCase().replace(/[\s_-]/g,''));
 assert.equal(check.attribute.toLowerCase(),h.attribute.toLowerCase());
 assert.equal(check.attribute,card.attribute);
 assert.equal(check.konamiId,card.konamiId);
 assert.equal(check.independentEnglishName,card.englishName);
 assert.equal(review.primarySource,card.source);
 assert.equal(cardDistributionAllowed(check.id),false,'unapproved distribution: '+check.id);
}
const plan=audit({reviews,executions:results,region:'world'});
const cohort=plan.plan.filter(x=>byId.has(x.id));
assert.equal(cohort.length,449);
for(const row of cohort)assert.equal(row.readyForIndividualCertification,true,JSON.stringify({id:row.id,issues:row.issues,reviewed:row.individualReview,region:row.regionVerified,tested:row.tested,facts:row.factsMatchImplementation}));
const report={cohort:'mission9',newCards:449,previousCards:243,certifiedTotal:enabledCardIds.length,verified:cohort.length,
 individualScenarioExecutions:results.reduce((n,r)=>n+r.passed.length,0),
 failedExecutions:results.reduce((n,r)=>n+r.failed.length,0),
 distributionEnabled:cohort.filter(r=>r.distributionAuthorized).length,
 sourceResponseSha256:evidence.sourceResponseSha256,previousRevisionsPreserved:true};
fs.writeFileSync('artifacts/mission9-normal-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
