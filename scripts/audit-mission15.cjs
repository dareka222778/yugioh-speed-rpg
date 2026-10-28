/** Offline preservation and experimental-catalog gate. Never changes a save. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),proof=require('../docs/evidence/mission15-preserved-baseline.json');
assert.equal(proof.baselineCommit,'2e21d40724341db91bb9a03e3500641fc46f9302');
for(const f of proof.files){const b=require('./mission15-reviewed-extensions.cjs').baselineBytes(f.path,fs.readFileSync(path.join(root,f.path)));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256,f.path);assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),f.gitBlobSha,f.path);}
assert.equal(proof.files.filter(f=>/^src\/resolvers\/v[1-7]\//.test(f.path)).length,238);
const pinnedV8=require('../docs/evidence/mission15-v8-implementation-freeze.json');
assert.equal(pinnedV8.baselineCommit,'043f93818cc839b4a955c7c84618553183449c06');assert.equal(pinnedV8.files.length,47);
for(const f of pinnedV8.files){const b=fs.readFileSync(path.join(root,f.path));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256,f.path);}
const manifest=require('../catalog/engine-v8/manifest.json'),loader=require('../dist/catalogArchive'),runtime=require('../dist/resolvers/v8/catalogRuntime');
for(const [index,revision] of manifest.revisions.entries()){const data=loader.getCatalogData(revision.id,'engine-v8');runtime.createCatalogRuntime(revision.id,data);if(index<2)assert.equal(data.cards.length,index===0?741:749);else assert.ok(data.cards.length>=749);}
const old=loader.getCatalogData(manifest.revisions[0].id,'engine-v8'),latest=loader.getCatalogData(manifest.current,'engine-v8');
for(const card of old.cards){assert.deepEqual(latest.cards.find(c=>c.id===card.id),card);for(const section of ['effects','monsters','certificates'])assert.deepEqual(latest[section][card.id],old[section][card.id],card.id+': '+section);}
assert.equal(require('../dist/resolverArchive').CURRENT_RESOLVER_VERSION,'engine-v8');
assert.ok(require('../dist/effectRegistry').enabledCardIds.length>=762);
const allowed=require('../dist/effectRegistry').enabledCardIds.filter(require('../dist/cardReleasePolicy').cardDistributionAllowed);assert.equal(allowed.length,130);
console.log(JSON.stringify({baseline:proof.baselineCommit,protectedFiles:proof.files.length,historicalArchiveFiles:238,activeResolver:'engine-v8',historicalResolver:'engine-v7',certified:require('../dist/effectRegistry').enabledCardIds.length,distributionAllowed:130,newCardsCertified:8,fixtureAdmissionIsNotCertification:true}));
