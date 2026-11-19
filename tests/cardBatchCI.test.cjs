const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {snapshot,delta,validateBundle,hash,shouldRelease}=require('../scripts/card-batch-ci.cjs');
const {verifyResult,verify}=require('../scripts/apply-reviewed-admission.cjs');
function isolated(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'batch-ci-unit-'));try{fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('admission patch preserves changed-file hashes and rejects overwriting later local work',()=>isolated(root=>{fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/x.ts'),'old');const before=snapshot(root);fs.writeFileSync(path.join(root,'src/x.ts'),'new');const files=delta(root,before);fs.writeFileSync(path.join(root,'src/x.ts'),'old');const bundle={format:1,baseCommit:'a'.repeat(40),files};assert.equal(validateBundle(bundle,root),true);fs.writeFileSync(path.join(root,'src/x.ts'),'later user change');assert.throws(()=>validateBundle(bundle,root),/Local work changed/);}));
test('admission patches reject deletion and unexpected persistent-data mutations',()=>isolated(root=>{fs.writeFileSync(path.join(root,'package.json'),'{}');const before=snapshot(root);fs.unlinkSync(path.join(root,'package.json'));assert.throws(()=>delta(root,before),/must not delete/);fs.writeFileSync(path.join(root,'package.json'),'changed');assert.throws(()=>delta(root,before),/Unexpected admission mutation/);}));
test('bundle validation rejects duplicate paths, traversal and changed content',()=>isolated(root=>{const file={path:'src/new.ts',beforeSHA256:null,sha256:hash('new'),content:'new'},bundle={format:1,baseCommit:'a'.repeat(40),files:[file]};assert.equal(validateBundle(bundle,root),true);for(const files of [[file,file],[{...file,path:'../outside'}],[{...file,path:'C:/outside'}],[{...file,content:'forged'}]])assert.throws(()=>validateBundle({...bundle,files},root));}));
test('snapshots exclude data, credentials, dependencies and generated test artifacts',()=>isolated(root=>{for(const dir of ['data','node_modules','dist','artifacts']){fs.mkdirSync(path.join(root,dir));fs.writeFileSync(path.join(root,dir,'private'),'private');}fs.writeFileSync(path.join(root,'.env'),'private');fs.writeFileSync(path.join(root,'package.json'),'{}');assert.deepEqual(snapshot(root),{'package.json':hash('{}')});}));
test('an empty queue performs no admissions and never claims full certification tests ran',()=>isolated(root=>{fs.mkdirSync(path.join(root,'catalog/proposed'),{recursive:true});fs.writeFileSync(path.join(root,'catalog/proposed/queue.json'),JSON.stringify({format:1,batches:[]}));const before=snapshot(root),out=require('../scripts/card-batch-ci.cjs').prepare({root,baseCommit:'a'.repeat(40)});assert.equal(out.stage,'no-submissions');assert.equal(out.fullTests,false);assert.deepEqual(out.results,[]);assert.deepEqual(out.files,[]);assert.deepEqual(snapshot(root),before);assert.throws(()=>validateBundle(out,root));}));
test('publisher refuses attested paths outside admission outputs',()=>isolated(root=>{
 for(const path of ['.git/config','.github/workflows/extra.yml','coordination/state.json','src/../package.json','src/.env','catalog/proposed/queue.json']){
  const b={format:1,baseCommit:'a'.repeat(40),files:[{path,beforeSHA256:null,sha256:hash('x'),content:'x'}]};
  assert.throws(()=>validateBundle(b,root),/Invalid bundle path/);
 }
}));
test('successful publication consumes only a fully matched queue',()=>{
 const {consumeQueue}=require('../scripts/apply-reviewed-admission.cjs');
 const queue={format:1,batches:['catalog/proposed/lote-a.json','catalog/proposed/lote-b.json']},results=[{batchId:'lote-a'},{batchId:'lote-b'}];
 assert.deepEqual(consumeQueue(queue,results),{format:1,batches:[]});
 for(const wrong of [results.slice(1),results.toReversed(),[results[0],results[0]]])assert.throws(()=>consumeQueue(queue,wrong));
 assert.equal(queue.batches.length,2);
});

test('distribution is opt-in and requires an owner-authored PR',()=>{
 assert.equal(shouldRelease({}, {releaseAuthorized:false}),false);
 assert.equal(shouldRelease({}, {releaseAuthorized:true}),false);
 assert.equal(shouldRelease({distributionAuthorized:false},{releaseAuthorized:true}),false);
 assert.equal(shouldRelease({distributionAuthorized:true},{releaseAuthorized:true}),true);
 assert.throws(()=>shouldRelease({distributionAuthorized:true},{releaseAuthorized:false}),/owner-authored/);
 assert.throws(()=>shouldRelease({distributionAuthorized:'true'},{releaseAuthorized:true}));
});
test('publisher accepts certification-only but rejects unauthorized or inconsistent release attestations',()=>{
 assert.equal(verifyResult({stage:'certified',distributionAuthorized:false,added:1,inventoryGranted:0,deployed:false},false),true);
 assert.equal(verifyResult({stage:'released',distributionAuthorized:true,added:1,inventoryGranted:0,deployed:false},true),true);
 assert.throws(()=>verifyResult({stage:'released',distributionAuthorized:true,added:1,inventoryGranted:0,deployed:false},false),/owner-authored/);
 assert.throws(()=>verifyResult({stage:'released',distributionAuthorized:false,added:1,inventoryGranted:0,deployed:false},true));
 assert.throws(()=>verifyResult({stage:'certified',distributionAuthorized:true,added:1,inventoryGranted:0,deployed:false},true));
});


test('publisher accepts certification without distribution and binds release to owner authorization',()=>isolated(root=>{
 const baseCommit='a'.repeat(40),content='export const reviewed = true;\\n';
 const file={path:'src/generated/reviewed.ts',beforeSHA256:null,sha256:hash(content),content};
 const result={batchId:'reviewed-batch',added:1,inventoryGranted:0,deployed:false};
 const bundle=(stage,distributionAuthorized)=>({format:1,baseCommit,fullTests:true,gate:'card-batch-automation.promote',testSummary:{fail:0,pass:1,exitCode:0},files:[file],results:[{...result,stage,distributionAuthorized}]});
 assert.equal(verify(bundle('certified',false),baseCommit,root,{releaseAuthorized:false}),true);
 assert.throws(()=>verify(bundle('released',true),baseCommit,root,{releaseAuthorized:false}),/owner-authored/);
 assert.equal(verify(bundle('released',true),baseCommit,root,{releaseAuthorized:true}),true);
 assert.throws(()=>verify(bundle('released',false),baseCommit,root,{releaseAuthorized:true}),/disagree/);
 assert.throws(()=>verify(bundle('certified',false), 'b'.repeat(40),root,{releaseAuthorized:false}),/Stale admission bundle base/);
}));
