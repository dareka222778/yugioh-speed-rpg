const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {baselineBytes}=require('../scripts/mission15-reviewed-extensions.cjs'),proof=require('../docs/evidence/mission15-preserved-baseline.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const file of ['src/duelStore.ts','src/cardMetadata.ts','src/cardCertifications.ts'])test('reviewed append-only extension preserves the entire original file: '+file,()=>{
 const bytes=fs.readFileSync(file),expected=proof.files.find(f=>f.path===file);assert.equal(sha(baselineBytes(file,bytes)),expected.sha256);
 const changed=Buffer.concat([Buffer.from('// unrelated change\n'),bytes]);assert.notEqual(sha(baselineBytes(file,changed)),expected.sha256);
});
test('reviewed certificate boundary cannot hide executable code or unknown admissions',()=>{
 const source=fs.readFileSync('src/cardCertifications.ts','utf8');assert.throws(()=>baselineBytes('src/cardCertifications.ts',Buffer.from(source.replace('/* MISSION15:BEGIN */\n,','/* MISSION15:BEGIN */\n,(() => {})()'))));
 assert.throws(()=>baselineBytes('src/cardCertifications.ts',Buffer.from(source.replace(/(\/\* MISSION15:BEGIN \*\/\n,[\s\S]*?)"20101223"/,'$1"00000000"'))));
});
