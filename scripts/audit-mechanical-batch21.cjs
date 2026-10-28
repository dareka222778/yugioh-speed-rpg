/** Bind individually reviewed definitions to actual public-engine executions. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const r=require('../dist/effectRegistry'),engine=require('../dist/duelEngine');
const {mechanicalBatch20:cards}=require('../dist/mechanicalBatch20');
const {definitionFingerprint}=require('../dist/cardRegistry');
const {getMonsterDefinition}=require('../dist/monsterEffects');
const {getEffectModel}=require('../dist/effectModels');
const {planHistoricalCatalog}=require('../dist/catalogCertification');
const {cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const reviews=require('../docs/evidence/mission21-individual-reviews.json');
const executions=JSON.parse(fs.readFileSync('artifacts/certification-executions-mission21.json','utf8'));
const requiredScenarios=['identity','mechanic','negative','replay','negation','source-loss'];
const admissions=cards.map(card=>({id:card.id,card,family:'m21-active-continuous-equipment-fusion',fingerprint:definitionFingerprint(card,r.getEffect(card.id),{monster:getMonsterDefinition,model:getEffectModel}),requiredScenarios:card.kind==='monster'&&card.monsterType!=='fusion'?[...requiredScenarios,'legal-summon']:requiredScenarios,certified:r.getCardStatus(card.id).stage==='certified',distributionAuthorized:cardDistributionAllowed(card.id)}));
const result=planHistoricalCatalog(require('../catalog/historical/2004-10-01/cards.json'),{region:'world',cutoff:'2004-09-30',reviews,executions,admissions});
assert.equal(cards.length,11);assert.equal(new Set(cards.map(c=>c.konamiId)).size,11);
assert.equal(reviews.length,11);assert.equal(executions.length,11);
for(const c of admissions){assert.equal(c.distributionAuthorized,false);assert.ok(result.plan.find(p=>p.id===c.id)?.readyForIndividualCertification,c.id);assert.equal(engine.getArchivedDefinitionResolver('engine-v9').getPlayableCard(c.id).id,c.id);assert.equal(engine.getArchivedDefinitionResolver('engine-v8').getPlayableCard(c.id),undefined);}
const active=require('../catalog/engine-v9/manifest.json');
const data=require('../dist/catalogArchive').getCatalogData(active.current,'engine-v9');
assert.ok(cards.every(c=>data.cards.some(d=>d.id===c.id)));
assert.equal(r.enabledCardIds.filter(cardDistributionAllowed).length,require('../dist/releasedCardIds').releasedCardIds.size);
const report={baselineCertified:771,currentCertified:r.enabledCardIds.length,newCertified:11,targetNew:500,remainingToTarget:489,goalProgressPercent:2.2,missionComplete:false,activeResolver:'engine-v9',catalogRevision:active.current,distributionAuthorized:r.enabledCardIds.filter(cardDistributionAllowed).length,individualExecutedScenarios:executions.reduce((n,e)=>n+e.passed.length,0),allIndividualGatesPassed:true};
fs.writeFileSync('artifacts/mission21-admission.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
