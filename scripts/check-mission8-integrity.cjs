/** Explicit baseline pin: existing certificates, engines, stores and visuals. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),proof=require('../docs/evidence/mission8-preserved-baseline.json');
assert.equal(proof.baselineCommit,'1bbbdd3847b9455febabffc2351456982df438a6');
for(const f of proof.files){const b=fs.readFileSync(path.resolve(__dirname,'..',f.path));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),f.sha256,f.path);assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),f.gitBlobSha,f.path);}
assert.equal(proof.files.filter(f=>/^src\/resolvers\/v[1-6]\//.test(f.path)).length,198);
console.log(JSON.stringify({baseline:proof.baselineCommit,files:proof.files.length,oldArchivedModules:192,oldArchives:6,preservation:'exact bytes verified'}));
