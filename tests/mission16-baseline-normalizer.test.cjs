const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {baselineBytes}=require('../scripts/mission16-baseline-normalizer.cjs');
const proof=require('../docs/evidence/mission16-preserved-baseline.json');
const gitBlobSha=b=>crypto.createHash('sha1').update('blob '+b.length+'\\0').update(b).digest('hex');
test('M16 normalizer reconstructs the pre-M16 duelStore bytes without erasing M15 AI logic',()=>{
 const source=fs.readFileSync('src/duelStore.ts'),expected=proof.files.find(f=>f.path==='src/duelStore.ts');
 const normalized=baselineBytes('src/duelStore.ts',source),text=normalized.toString('utf8');
 assert.equal(gitBlobSha(normalized),expected.sha);
 assert.ok(text.includes("import {filteredDestructionUtility} from './filteredDestructionStrategy';"));
 assert.ok(text.includes("if(effect.kind==='destroyFiltered')return filteredDestructionUtility(s,p===s.players[0]?0:1,effect)>0;"));
});
test('M16 normalizer keeps Mission 15 catalog registrations in its historical baseline',()=>{
 const metadata=baselineBytes('src/cardMetadata.ts',fs.readFileSync('src/cardMetadata.ts')).toString('utf8');
 const certificates=baselineBytes('src/cardCertifications.ts',fs.readFileSync('src/cardCertifications.ts')).toString('utf8');
 assert.ok(metadata.includes("import {mechanicalBatch15} from './mechanicalBatch15';"));
 assert.ok(certificates.includes('"26725158"'));
});
test('M16 normalizer leaves unrelated duelStore changes visible',()=>{
 const source=fs.readFileSync('src/duelStore.ts'),expected=proof.files.find(f=>f.path==='src/duelStore.ts');
 const changed=Buffer.concat([Buffer.from('// unrelated unreviewed change\\n'),source]);
 assert.notEqual(gitBlobSha(baselineBytes('src/duelStore.ts',changed)),expected.sha);
});
