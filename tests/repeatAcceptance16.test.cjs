const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {repeat}=require('../scripts/repeat-acceptance16.cjs');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'repeat-test16-'));try{fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('M16 diagnostics persist each successful attempt with full TAP and source hashes',()=>fixture(dir=>{
 const r=repeat({attempts:2,output:dir,files:[__filename],commandArgs:['-e',"console.log('x'.repeat(100000)); console.log('# pass 1\\n# fail 0')"]});
 assert.equal(r.success,true);assert.equal(r.attempts.length,2);assert.ok(fs.statSync(r.attempts[0].tap).size>100000);assert.match(r.files[0].sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'report.json'))),r);
}));
test('M16 diagnostics retain failures, stderr and later attempts without claiming success',()=>fixture(dir=>{
 const r=repeat({attempts:2,output:dir,files:[__filename],commandArgs:['-e',"console.log('# pass 2\\n# fail 1'); console.error('actual failure'); process.exit(1)"]});
 assert.equal(r.success,false);assert.equal(r.attempts.length,2);assert.equal(r.attempts[0].status,1);assert.match(fs.readFileSync(r.attempts[0].stderr,'utf8'),/actual failure/);
}));
test('M16 diagnostics strip Discord secrets and replace inherited production database path',()=>fixture(dir=>{
 const old={token:process.env.DISCORD_TOKEN,db:process.env.DATABASE_PATH};process.env.DISCORD_TOKEN='sentinel-not-a-real-token';process.env.DATABASE_PATH='production-sentinel';
 try{const r=repeat({attempts:1,output:dir,files:[__filename],commandArgs:['-e',"if(process.env.DISCORD_TOKEN||process.env.DATABASE_PATH==='production-sentinel')process.exit(1); console.log('# pass 1\\n# fail 0')"]});assert.equal(r.success,true);}
 finally{for(const [key,value]of [['DISCORD_TOKEN',old.token],['DATABASE_PATH',old.db]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
}));
test('M16 diagnostics reject empty successful processes and invalid repetition counts',()=>fixture(dir=>{
 const r=repeat({attempts:1,output:dir,files:[__filename],commandArgs:['-e','process.exit(0)']});assert.equal(r.success,false);
 for(const attempts of [0,21,NaN,1.5])assert.throws(()=>repeat({attempts,output:dir}));
}));
