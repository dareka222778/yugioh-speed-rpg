/** Explicit release authorization is separate from mechanical certification. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const r=require('../dist/effectRegistry'),{releasedCardIds}=require('../dist/releasedCardIds'),{cardDistributionAllowed}=require('../dist/cardReleasePolicy');
const p=require('../docs/evidence/mission27-release.json'),manifest=require('../catalog/engine-v9/manifest.json');
assert.equal(p.baselineReleaseCount,136);assert.equal(p.newReleaseCount,696);assert.equal(p.certifiedCount,832);
assert.equal(p.catalogRevision,manifest.current);assert.equal(p.addedIds.length,696);assert.equal(new Set(p.addedIds).size,696);
assert.deepEqual(new Set(r.enabledCardIds),releasedCardIds);assert.equal(releasedCardIds.size,832);
for(const id of releasedCardIds){assert.equal(r.getCardStatus(id)?.stage,'certified');assert.equal(cardDistributionAllowed(id),true);}
for(const id of ['00000000','71625222','token:sheep'])assert.equal(cardDistributionAllowed(id),false);
const bytes=fs.readFileSync('src/releasedCardIds.ts');
const previous=require('./mission27-reviewed-extensions.cjs').strip('src/releasedCardIds.ts',bytes).toString('utf8');
assert.equal([...previous.matchAll(/"(\d{8})"/g)].length,136);
assert.equal(crypto.createHash('sha256').update(previous).digest('hex'),p.previousSourceSHA256);
console.log(JSON.stringify({certified:r.enabledCardIds.length,authorized:releasedCardIds.size,newlyAuthorized:p.newReleaseCount,uncertifiedReleased:0,pendingHistorical:1962-r.enabledCardIds.length,scope:'Release policy and event validation; no inventory grants or deployment implied.'}));
