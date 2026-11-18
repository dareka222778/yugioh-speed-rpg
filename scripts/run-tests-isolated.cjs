#!/usr/bin/env node
/** Never inherit production data paths or Discord credentials into test workers. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'speed-rpg-tests-')),args=process.argv.slice(2),serial=args.includes('--serial'),requested=args.filter(a=>a!=='--serial');
const files=requested.length?requested:fs.readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).sort().map(f=>path.join('tests',f));
const env={...process.env,DATABASE_PATH:path.join(dir,'game.sqlite')};for(const name of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID','NODE_TEST_CONTEXT'])delete env[name];
const compact=process.env.CI==='true'&&requested.length===0,report=path.resolve('artifacts/test-results.xml');
const tapReport=path.resolve('artifacts/engine-acceptance.tap'),tapFailure=path.resolve('artifacts/engine-acceptance-failure.tap');
if(compact){fs.mkdirSync(path.dirname(report),{recursive:true});fs.rmSync(tapReport,{force:true});fs.rmSync(tapFailure,{force:true});}
try{
 const reporters=compact?['--test-reporter=dot','--test-reporter-destination=stdout','--test-reporter=junit','--test-reporter-destination='+report,'--test-reporter=tap','--test-reporter-destination='+tapReport]:[];
 const result=spawnSync(process.execPath,['--test',...reporters,...serial?['--test-concurrency=1']:[],...files],{env,stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status??1;
 if(compact){
  if(fs.existsSync(tapReport)){if(result.status===0)fs.rmSync(tapReport,{force:true});else fs.renameSync(tapReport,tapFailure);}
  const summary={node:process.version,...require('./test-summary28.cjs').parseSummary(fs.readFileSync(report,'utf8')),exitCode:result.status};
  fs.writeFileSync('artifacts/test-summary.json',JSON.stringify(summary,null,2)+'\n');
  console.log('\nTEST_SUMMARY '+JSON.stringify(summary));
 }
}finally{fs.rmSync(dir,{recursive:true,force:true});}
