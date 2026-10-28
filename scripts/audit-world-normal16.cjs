/** Individual TCG/world admission, not an OCG first-release assertion. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {worldNormalBatch16:cards,worldNormalEffects16:effects}=require('../dist/worldNormalBatch16'),r=require('../dist/effectRegistry');
const {definitionFingerprint}=require('../dist/cardRegistry'),{getEffectModel}=require('../dist/effectModels'),{planHistoricalCatalog}=require('../dist/catalogCertification');
const reviews=require('../docs/evidence/mission16-world-normal-reviews.json'),history=require('../catalog/historical/2004-10-01/cards.json'),executions=JSON.parse(fs.readFileSync('artifacts/certification-executions-world-normal16.json','utf8'));
const admissions=cards.map(card=>({id:card.id,card,family:'normal-monster-world',fingerprint:definitionFingerprint(card,effects[card.id],{model:getEffectModel}),certified:r.getCardStatus(card.id)?.stage==='certified',distributionAuthorized:require('../dist/cardReleasePolicy').cardDistributionAllowed(card.id),requiredScenarios:['identity','summon','negative','battle','movement','replay','ai']}));
const plan=planHistoricalCatalog(history,{cutoff:'2004-09-30',region:'world',admissions,reviews,executions});
assert.equal(cards.length,10);assert.equal(reviews.length,10);assert.equal(executions.length,10);
for(const a of admissions){assert.equal(a.distributionAuthorized,false);const row=plan.plan.find(x=>x.id===a.id);assert.ok(row?.readyForIndividualCertification,JSON.stringify(row));assert.deepEqual(executions.find(x=>x.id===a.id).failed,[]);}
const manifest=require('../catalog/engine-v8/manifest.json'),loader=require('../dist/catalogArchive'),old=loader.getCatalogData(manifest.revisions[2].id,'engine-v8'),latest=loader.getCatalogData(manifest.current,'engine-v8');
assert.equal(old.cards.length,752);assert.ok(latest.cards.length>=762);
for(const card of old.cards){assert.deepEqual(latest.cards.find(c=>c.id===card.id),card);for(const section of ['effects','monsters','certificates'])assert.deepEqual(latest[section][card.id],old[section][card.id]);}
assert.ok(r.enabledCardIds.length>=762);assert.equal(r.enabledCardIds.filter(require('../dist/cardReleasePolicy').cardDistributionAllowed).length,require('../dist/releasedCardIds').releasedCardIds.size);
const report={engine:'engine-v8',previousCertified:752,totalCertified:762,newCertified:10,cards:cards.map(c=>({id:c.id,name:c.englishName,passed:executions.find(x=>x.id===c.id).passed})),previousRevisionsUnchanged:true,distributionAuthorized:0,region:'world via verified TCG printings; imported OCG dates not rewritten'};
fs.writeFileSync('artifacts/mission16-world-normal-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
