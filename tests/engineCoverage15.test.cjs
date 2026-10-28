const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('coverage audit routes the complete filtered effect rather than losing its typed filter',()=>{
 const result=spawnSync(process.execPath,[...process.execArgv.filter(a=>!a.startsWith('--test')),'scripts/engine-coverage.cjs'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);assert.equal(report.total,762);assert.ok(report.counts.destructionTemplate>=8);assert.equal(Object.values(report.counts).reduce((a,b)=>a+b,0),762);
});
