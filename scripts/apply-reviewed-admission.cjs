#!/usr/bin/env node
'use strict';
/** Applies a fully verified CI admission bundle to the SAME PR head only.
 * No force push, no merge, no deploy, no inventory mutations. The preparation
 * job uses a read-only token; this job uses only contents:write.
 */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {validateBundle}=require('./card-batch-ci.cjs');
const root=path.resolve(__dirname,'..');
function run(args){return cp.execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function safeBranch(branch){assert.match(branch??'',/^[A-Za-z0-9][A-Za-z0-9_./-]*$/);assert.ok(!branch.includes('..')&&!branch.startsWith('/')&&!branch.endsWith('/')&&!branch.includes('//')&&!branch.endsWith('.lock'));return branch;}
function verify(bundle,expected,rootDir=root){
 assert.match(expected??'',/^[a-f0-9]{40}$/);
 assert.equal(bundle.baseCommit,expected,'Stale admission bundle base');
 assert.equal(bundle.fullTests,bundle.results?.length>0,'Only a genuinely completed batch can be published');
 if(!bundle.results?.length){assert.equal(bundle.stage,'no-submissions');assert.deepEqual(bundle.files,[]);return false;}
 assert.equal(bundle.gate,'card-batch-automation.promote');
 for(const result of bundle.results){assert.equal(result.stage,'released');assert.ok(Number.isInteger(result.added)&&result.added>0);assert.equal(result.inventoryGranted,0);assert.equal(result.deployed,false);}
 assert.ok(bundle.testSummary?.fail===0&&bundle.testSummary?.pass>0&&bundle.testSummary?.exitCode===0,'Missing clean complete test summary');
 validateBundle(bundle,rootDir);
 return true;
}
// Consume exactly the proposals verified at this HEAD, in the certification commit.
function consumeQueue(queue,results){
 assert.equal(queue.format,1);assert.ok(Array.isArray(queue.batches));
 const expected=results.map(r=>{assert.match(r.batchId,/^[a-z][a-z0-9-]{2,50}$/);return 'catalog/proposed/'+r.batchId+'.json';});
 assert.equal(new Set(expected).size,expected.length);
 assert.deepEqual(queue.batches,expected,'Admission queue changed or was only partially verified');
 return {...queue,batches:[]};
}
function publish(file,expected,branch){
 const bundle=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!verify(bundle,expected))return {published:false,reason:'no-submissions'};
 const target=safeBranch(branch);
 assert.equal(run(['rev-parse','HEAD']),expected,'Checked-out head changed');
 // The downloaded CI attestation is intentionally untracked. Permit only
 // those two named files; never tolerate modified tracked sources.
 const dirty=run(['status','--porcelain']).split('\n').filter(Boolean);
 assert.ok(dirty.every(line=>line==='?? artifacts/admission-bundle.json'||line==='?? artifacts/admission-tests.log'),'Unexpected checkout changes: '+dirty.join('; '));
 const queuePath='catalog/proposed/queue.json',cleared=consumeQueue(JSON.parse(fs.readFileSync(path.join(root,queuePath),'utf8')),bundle.results);
 for(const f of bundle.files){const dest=path.join(root,f.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,f.content);}
 fs.writeFileSync(path.join(root,queuePath),JSON.stringify(cleared,null,2)+'\n');
 const staged=[queuePath,...bundle.files.map(f=>f.path)];
 run(['add','--',...staged]);
 const changed=run(['diff','--cached','--name-only']).split('\n').filter(Boolean);
 assert.deepEqual(changed.sort(),staged.sort(),'Unexpected staged file');
 run(['diff','--cached','--check']);
 run(['config','user.name','github-actions[bot]']);run(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
 run(['commit','-m',`certify(cards): ${bundle.results.reduce((n,r)=>n+r.added,0)} reviewed cards via isolated CI gate`]);
 // Fast-forward only. A concurrent branch update rejects this push.
 run(['push','origin','HEAD:refs/heads/'+target]);
 return {published:true,commit:run(['rev-parse','HEAD']),added:bundle.results.reduce((n,r)=>n+r.added,0)};
}
module.exports={verify,safeBranch,publish,consumeQueue};
if(require.main===module){try{const result=publish(process.argv[2]??'artifacts/admission-bundle.json',process.env.CARD_BATCH_BASE_COMMIT,process.env.CARD_BATCH_BRANCH);console.log('ADMISSION_PUBLISH_RESULT '+JSON.stringify(result));}catch(error){console.error('ADMISSION_PUBLISH_BLOCKED',error.message);process.exitCode=1;}}
