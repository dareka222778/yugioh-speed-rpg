#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),{planHistoricalCatalog}=require('../dist/catalogCertification'),registry=require('../dist/effectRegistry'),{definitionFingerprint}=require('../dist/cardRegistry'),{getMonsterDefinition}=require('../dist/monsterEffects'),{getEffectModel}=require('../dist/effectModels'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy');
function audit({executions=[],reviews=[],region='world'}={}){
 const history=require('../catalog/historical/2004-10-01/cards.json'),admissions=registry.enabledCardIds.map(id=>({id,family:registry.getEffect(id).kind==='normal'?'normal-monster':registry.getEffect(id).kind,fingerprint:definitionFingerprint(registry.engineCard(id),registry.getEffect(id),{monster:getMonsterDefinition,model:getEffectModel}),certified:true,distributionAuthorized:cardDistributionAllowed(id)}));
 return planHistoricalCatalog(history,{cutoff:'2004-09-30',region,admissions,reviews,executions});
}
if(require.main===module){const read=p=>p?JSON.parse(fs.readFileSync(p,'utf8')):[],r=audit({reviews:read(process.argv[2]),executions:read(process.argv[3]),region:process.argv[4]??'world'});fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/certification-pipeline.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({kind:r.kind,automation:r.automation,families:r.families,covered:r.plan.filter(c=>c.tested).length,certified:r.plan.filter(c=>c.certified).length,distributionAuthorized:r.plan.filter(c=>c.distributionAuthorized).length},null,2));}
module.exports={audit};
