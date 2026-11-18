const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const audit=require('../docs/evidence/m363-historical-identity-reconciliation.json');
const historical=JSON.parse(fs.readFileSync(path.join(__dirname,'../catalog/historical/2004-10-01/cards.json'),'utf8'));
const cutoff=audit.cutoffExclusive;

test('all 31 candidate identities resolve to exactly one canonical historical record',()=>{
 assert.equal(audit.cards.length,31);
 for(const candidate of audit.cards){
  const matches=historical.filter(card=>card.konamiId===candidate.konamiId&&card.passwords?.includes(candidate.id));
  assert.equal(matches.length,1,candidate.name+' identity must be unique');
  assert.equal(matches[0].id,candidate.historicalRecordId);
  assert.equal(matches[0].names.en,candidate.name);
  assert.deepEqual(matches[0].firstObserved,candidate.firstObserved);
  assert.ok(candidate.presentInUnionSnapshot,candidate.name+' must have a pre-cutoff regional observation');
  const expectedRegions=['tcg','ocg','world'].filter(region=>matches[0].firstObserved?.[region]&&matches[0].firstObserved[region]<cutoff);
  assert.deepEqual(candidate.eligibleRegionsBeforeCutoff,expectedRegions);
  assert.ok(candidate.eligibleRegionsBeforeCutoff.length>0);
  assert.equal(candidate.officialSourceVerifiedInCandidateReview,true);
  assert.match(candidate.officialSourceUrl,/^https:\/\/www\\.db\\.yugioh-card\\.com\\//);
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
