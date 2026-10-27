const {test}=require('node:test'),assert=require('node:assert/strict'),p=require('../dist/catalogCertification');
const history=require('../catalog/historical/2004-10-01/cards.json'),normal=()=>structuredClone(history.find(c=>c.passwords.includes('53293545'))),options={cutoff:'2004-09-30',region:'world'};
test('normalization preserves leading zeros, structured classification, facts and regional dates without granting',()=>{
 const c=normal();c.passwords=['08944575'];c.race='Winged-Beast';c.attribute='wind';const n=p.normalizeHistoricalCard(c);assert.deepEqual(n.issues,[]);assert.equal(n.card.id,'08944575');assert.equal(n.card.race,'Winged Beast');assert.equal(n.card.attribute,'WIND');assert.equal(n.card.name,c.names.en);
 const before=structuredClone(c),r=p.planHistoricalCatalog([c],options);assert.deepEqual(c,before);assert.equal(r.enablesCards,false);assert.equal(r.grantsInventory,false);assert.equal(r.plan[0].normalized,true);assert.equal(r.plan[0].certified,false);assert.equal(r.plan[0].readyForIndividualCertification,false);assert.equal(r.automation.automaticCertifications,0);
});
test('calendar, unknown region, malformed stats and numeric passcodes fail closed',()=>{
 for(const date of ['2004-02-30','2003-02-29','2004-13-01','2004-1-01','garbage',null])assert.equal(p.validCatalogDate(date),false);assert.equal(p.validCatalogDate('2004-02-29'),true);
 for(const mutate of [c=>c.passwords=[8944575],c=>c.passwords=['08944575','11111111'],c=>c.atk=-1,c=>c.def=NaN,c=>c.level=0,c=>c.race='invented',c=>c.race='constructor',c=>c.attribute='void',c=>c.firstObserved.world='1900-01-01']){const c=normal();mutate(c);assert.ok(p.normalizeHistoricalCard(c).issues.length);}
 assert.throws(()=>p.planHistoricalCatalog([], {...options,region:'anime'}));assert.throws(()=>p.planHistoricalCatalog([], {...options,cutoff:'2004-02-31'}));assert.ok(p.normalizeHistoricalCard(null).issues.length);
});
for(const field of ['canonical','passcode','konami'])test(`identity collision ${field} blocks both rows instead of selecting the first`,()=>{
 const a=normal(),b=structuredClone(a);b.id='other';b.passwords=['08944575'];b.konamiId=4246;if(field==='canonical')b.id=a.id;if(field==='passcode')b.passwords=a.passwords;if(field==='konami')b.konamiId=a.konamiId;
 const r=p.planHistoricalCatalog([a,b],options);assert.ok(r.plan.every(c=>c.issues.includes('identity-collision')&&!c.readyForIndividualCertification));
});
test('TCG, OCG and world eligibility are separate; unknown regional date never becomes absence proof',()=>{
 const c=normal();c.firstObserved.tcg=null;assert.equal(p.planHistoricalCatalog([c],{...options,region:'tcg'}).plan[0].eligible,false);assert.equal(p.planHistoricalCatalog([c],{...options,region:'ocg'}).plan[0].eligible,true);
 c.firstObserved.tcg='2012-09-27';const row=p.planHistoricalCatalog([c],{...options,region:'tcg'}).plan[0];assert.ok(row.issues.includes('outside-cutoff'));assert.equal(row.normalized,true);
});
test('an existing admitted alias stays visible without auto-normalizing an ambiguous new identity',()=>{
 const c=normal();c.passwords=['00000000',...c.passwords];const row=p.planHistoricalCatalog([c],{...options,admissions:[{id:'53293545',family:'normal-monster',fingerprint:'old',certified:true,distributionAuthorized:true}]}).plan[0];assert.equal(row.id,'53293545');assert.equal(row.certified,true);assert.equal(row.normalized,false);assert.equal(row.readyForIndividualCertification,false);assert.ok(row.issues.includes('ambiguous-or-invalid-passcode'));
});
test('effect text and imported classifications do not manufacture implemented mechanics',()=>{
 const c=normal();c.classifications=['effect'];c.normalMainCandidate=false;c.mechanics=['ritual'];c.names.en='Normal monster without effect';const r=p.planHistoricalCatalog([c],options).plan[0];assert.equal(r.normalized,true);assert.equal(r.implemented,false);assert.ok(r.missingMechanics.includes('ritual'));assert.equal(r.family,'monster:curation-required');
 c.normalMainCandidate=true;assert.ok(p.normalizeHistoricalCard(c).issues.includes('conflicting-normal-classification'));
});
test('each reviewed identity, current fingerprint and every executed scenario are required individually',()=>{
 const c=normal(),n=p.normalizeHistoricalCard(c).card,admission={id:n.id,family:'normal-monster',fingerprint:'current',certified:false,distributionAuthorized:false},review={id:n.id,canonicalId:c.id,konamiId:n.konamiId,reviewer:'REA audit',reviewedAt:'2026-10-27',identityApproved:true,mechanicsApproved:true,primarySource:n.source,primaryFacts:{level:n.level,atk:n.atk,defense:n.defense,race:n.race,attribute:n.attribute,ocgDate:c.firstObserved.ocg},mechanicalFingerprint:'current'},execution={id:n.id,fingerprint:'current',passed:[...p.NORMAL_SCENARIOS],failed:[]};
 const fingerprint=require('../dist/cardRegistry').definitionFingerprint(n,{kind:'normal'},{});admission.fingerprint=fingerprint;review.mechanicalFingerprint=fingerprint;execution.fingerprint=fingerprint;
 const plan=(patch={})=>p.planHistoricalCatalog([c],{...options,admissions:[admission],reviews:[review],executions:[execution],...patch}).plan[0];assert.equal(plan().readyForIndividualCertification,true);assert.equal(plan().certified,false);assert.equal(plan().distributionAuthorized,false);
 assert.equal(plan({reviews:[]}).readyForIndividualCertification,false);assert.equal(plan({reviews:[review,review]}).readyForIndividualCertification,false);assert.equal(plan({executions:[{...execution,passed:execution.passed.slice(1)}]}).tested,false);assert.equal(plan({executions:[{...execution,failed:['destroy']}]}).tested,false);assert.equal(plan({executions:[{...execution,fingerprint:'old'}]}).tested,false);assert.equal(plan({reviews:[{...review,primaryFacts:{...review.primaryFacts,atk:9999}}]}).individualReview,false);
 const later=structuredClone(c);later.firstObserved={tcg:'2002-03-08',ocg:'2010-01-01',world:'2002-03-08'};const laterReview={...review,primaryFacts:{...review.primaryFacts,ocgDate:'2010-01-01'}};const region=p.planHistoricalCatalog([later],{...options,admissions:[admission],reviews:[laterReview],executions:[execution]}).plan[0];assert.equal(region.eligible,true);assert.equal(region.regionVerified,false);assert.equal(region.readyForIndividualCertification,false);
 const changed=structuredClone(c);changed.atk++;const mismatch=p.planHistoricalCatalog([changed],{...options,admissions:[admission],reviews:[{...review,primaryFacts:{...review.primaryFacts,atk:changed.atk}}],executions:[execution]}).plan[0];assert.equal(mismatch.factsMatchImplementation,false);assert.equal(mismatch.readyForIndividualCertification,false);
 assert.equal(plan({region:'tcg'}).regionVerified,false);assert.equal(plan({admissions:[{...admission,certified:true,distributionAuthorized:true}]}).distributionAuthorized,true);
});
