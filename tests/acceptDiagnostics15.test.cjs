const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('acceptance diagnostics preserve the failing TAP beyond Node error-inspection truncation and still fail closed',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'accept-diag15-'));
 try{
  fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'tests'));fs.copyFileSync(path.join(__dirname,'../scripts/accept-engine.cjs'),path.join(root,'scripts/accept-engine.cjs'));
  for(const name of fs.readdirSync(path.join(__dirname,'.')).filter(name=>name.endsWith('.test.cjs')))fs.writeFileSync(path.join(root,'tests',name),'');
  const tap='TAP version 13\n'+'# successful diagnostic context\n'.repeat(2000)+'not ok 999 - UNIQUE_FAILURE_AT_END\n# fail 1\n';
  const preload=path.join(root,'fault.cjs');fs.writeFileSync(preload,"require('node:child_process').execFileSync=()=>{throw Object.assign(Error('injected acceptance failure'),{stdout:"+JSON.stringify(tap)+",stderr:'injected-stderr\\n',status:1});};");
  const result=spawnSync(process.execPath,['--require',preload,path.join(root,'scripts/accept-engine.cjs')],{encoding:'utf8',maxBuffer:1024*1024});
  assert.equal(result.status,1);assert.equal(result.stdout,tap);assert.match(result.stderr,/injected-stderr/);assert.match(result.stderr,/Critical acceptance suite failed/);
  assert.equal(fs.readFileSync(path.join(root,'artifacts/engine-acceptance-failure.tap'),'utf8'),tap);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
