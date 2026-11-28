const fs=require('node:fs');
const assert=require('node:assert/strict');
const api=require('../dist/gravekeeperServantTagAdapter');
const evidence=JSON.parse(fs.readFileSync('docs/evidence/m667-gravekeeper-servant.json','utf8'));
const source=fs.readFileSync('tests/gravekeeperServantTagAdapter.test.cjs','utf8');
const testCount=(source.match(/\btest\(/g)||[]).length;
assert.equal(api.GRAVEKEEPERS_SERVANT_ID,'16762927');
assert.equal(api.GRAVEKEEPERS_SERVANT_KONAMI_CID,4893);
assert.deepEqual(api.lookupGravekeeperServantEffect(api.GRAVEKEEPERS_SERVANT_ID),{kind:'spell',effect:'gravekeepers-servant'});
assert.equal(evidence.cards.length,1);
assert.equal(evidence.cards[0].firstRelease,'2002-09-16');
assert.equal(evidence.newCertifications,0);
assert.equal(evidence.automaticCertifications,0);
assert.equal(evidence.inventoryGrants,0);
assert.ok(evidence.scenarioCount>=30);
assert.ok(testCount>=evidence.scenarioCount);
assert.equal(evidence.runtimeIntegration,'pending-explicit-handoff');
assert.equal(evidence.discordLive,false);
console.log(JSON.stringify({
 mission:evidence.mission,card:evidence.cards[0],scenarioCount:testCount,
 certification:'not promoted; isolated adapter evidence only',
 inventoryGrants:0,rules:evidence.rules,runtimeIntegration:evidence.runtimeIntegration
},null,2));
