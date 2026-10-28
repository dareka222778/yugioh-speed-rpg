/** Public identity + full-effect review + executed individual regression gate. */
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {mechanicalBatch16:cards,mechanicalEffects16:effects}=require('../dist/mechanicalBatch16'),r=require('../dist/effectRegistry');
const {definitionFingerprint}=require('../dist/cardRegistry'),{getMonsterDefinition}=require('../dist/monsterEffects'),{getEffectModel}=require('../dist/effectModels'),{planHistoricalCatalog}=require('../dist/catalogCertification');
const reviews=require('../docs/evidence/mission16-individual-reviews.json'),history=require('../catalog/historical/2004-10-01/cards.json');
const executions=JSON.parse(fs.readFileSync('artifacts/certification-executions-mission16.json','utf8'));
const admissions=cards.map(card=>({id:card.id,card,family:'continuous-count-or-modifier',fingerprint:definitionFingerprint(card,effects[card.id],{monster:getMonsterDefinition,model:getEffectModel}),certified:r.getCardStatus(card.id)?.stage==='certified',distributionAuthorized:require('../dist/cardReleasePolicy').cardDistributionAllowed(card.id),requiredScenarios:['identity','mechanic','negative','replay','negation','source-loss','dynamic']}));
const plan=planHistoricalCatalog(history,{cutoff:'2004-09-30',region:'world',admissions,reviews,executions});
assert.equal(cards.length,3);assert.equal(reviews.length,3);assert.equal(executions.length,3);assert.equal(r.enabledCardIds.length,752);
for(const a of admissions){assert.equal(a.distributionAuthorized,false);const row=plan.plan.find(p=>p.id===a.id);assert.ok(row?.readyForIndividualCertification,JSON.stringify(row));assert.deepEqual(executions.find(e=>e.id===a.id).failed,[]);}
const loader=require('../dist/catalogArchive'),manifest=require('../catalog/engine-v8/manifest.json'),old=loader.getCatalogData(manifest.revisions[1].id,'engine-v8'),latest=loader.getCatalogData(manifest.current,'engine-v8');
assert.equal(old.cards.length,749);assert.equal(latest.cards.length,752);
for(const card of old.cards){assert.deepEqual(latest.cards.find(c=>c.id===card.id),card);for(const section of ['effects','monsters','certificates'])assert.deepEqual(latest[section][card.id],old[section][card.id],section+': '+card.id);}
for(const f of require('../docs/evidence/mission16-preserved-baseline.json').files){const b=fs.readFileSync(f.path);assert.equal(crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),f.sha,f.path);}
const report={engine:'engine-v8',previousCertified:749,certified:752,newCertified:3,distributionAllowed:r.enabledCardIds.filter(require('../dist/cardReleasePolicy').cardDistributionAllowed).length,individualExecutions:executions,oldDefinitionsUnchanged:true,immutableResolversUnchanged:true};
assert.equal(report.distributionAllowed,130);fs.writeFileSync('artifacts/mission16-mechanical-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
