const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const audit=require('../docs/evidence/m363-historical-identity-reconciliation.json');
const historical=JSON.parse(fs.readFileSync(path.join(__dirname,'../catalog/historical/2004-10-01/cards.json'),'utf8'));
const cutoff=audit.cutoffExclusive;
const manifest=require('../catalog/engine-v9/manifest.json');
const catalog=require('../catalog/engine-v9/'+manifest.current+'.json');
const {plan}=require('../scripts/milestone1000-plan.cjs');

test('all 31 candidate identities resolve to exactly one canonical historical record',()=>{
 assert.equal(audit.cards.length,31);
 for(const candidate of audit.cards){
  const matches=historical.filter(card=>card.konamiId===candidate.konamiId&&card.passwords?.includes(candidate.id));
  assert.equal(matches.length,1,candidate.name+' identity must be unique');
  assert.equal(matches[0].id,candidate.historicalRecordId);
  assert.equal(matches[0].id,candidate.canonicalId);
  assert.equal(matches[0].names.en,candidate.name);
  assert.deepEqual(matches[0].firstObserved,candidate.firstObserved);
  assert.ok(candidate.presentInUnionSnapshot,candidate.name+' must have a pre-cutoff regional observation');
  const expectedRegions=['tcg','ocg','world'].filter(region=>matches[0].firstObserved?.[region]&&matches[0].firstObserved[region]<cutoff);
  assert.deepEqual(candidate.eligibleRegionsBeforeCutoff,expectedRegions);
  assert.ok(candidate.eligibleRegionsBeforeCutoff.length>0);
  assert.equal(candidate.officialSourceVerifiedInCandidateReview,true);
  assert.match(candidate.officialSourceUrl,/^https:\/\/www\.db\.yugioh-card\.com\//);
  assert.equal(candidate.certificationStatus,'not-certified');
  assert.equal(candidate.distributionAuthorized,false);
  assert.equal(candidate.inventoryGranted,0);
 }
});

test('regional first-observed dates reconcile the union snapshot without imposing a TCG-only cutoff',()=>{
 assert.deepEqual(audit.summary,{candidates:31,uniqueIdentityMatches:31,unresolvedIdentities:0,unionSnapshotPresent:31,tcgBeforeCutoff:23,ocgBeforeCutoff:28,bothTcgAndOcg:20,tcgOnly:3,ocgOnly:8,afterCutoffInAllRegions:0});
 assert.equal(audit.cards.filter(c=>c.eligibleRegionsBeforeCutoff.includes('tcg')).length,23);
 assert.equal(audit.cards.filter(c=>c.eligibleRegionsBeforeCutoff.includes('ocg')).length,28);
});

test('historical presence is not promoted into official release proof or behavioral certification',()=>{
 assert.match(audit.method.authorityLimit,/not an independently verified official release date/);
 assert.match(audit.status,/first-release source audit and behavioral certification remain pending/);
 assert.equal(audit.certificationStatus,'not-certified');
 assert.equal(audit.distributionAuthorized,false);
 assert.equal(audit.inventoryGranted,0);
});


test('the actual milestone planner admits these 31 identities to the unreviewed queue without certifying them',()=>{
 const result=plan({history:historical,catalog:catalog.cards,target:1000,batchSize:10});
 assert.equal(result.certified,969);
 assert.equal(result.pending,993);
 assert.equal(result.remainingToGoal,31);
 assert.equal(result.identityBlocked,27);
 assert.equal(result.fullyUnreviewed,966);
 const owners=new Map();
 for(const card of historical)for(const alias of card.passwords??[]){const ids=owners.get(alias)??[];ids.push(card.id);owners.set(alias,ids);}
 const active=new Set(catalog.cards.map(card=>card.id));
 for(const candidate of audit.cards){
  const aliases=historical.find(card=>card.id===candidate.historicalRecordId)?.passwords??[];
  const issues=[
   ...(!aliases.length?['missing-passcode']:[]),
   ...(aliases.length!==1?['ambiguous-passcode']:[]),
   ...(!candidate.konamiId?['missing-konami-identity']:[]),
   ...(aliases.some(id=>(owners.get(id)?.length??0)!==1)?['duplicate-passcode']:[])
  ];
  assert.deepEqual(issues,[],candidate.name+' must not be identity-blocked');
  assert.ok(!active.has(candidate.id),candidate.name+' must remain pending until behavior certification');
 }
 assert.equal(audit.milestonePlanCrosscheck.candidateIdentityIssues,0);
 assert.equal(audit.milestonePlanCrosscheck.candidatesAlreadyCertified,0);
});
