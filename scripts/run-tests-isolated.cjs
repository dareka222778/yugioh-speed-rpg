#!/usr/bin/env node
/** Never inherit production data paths or Discord credentials into test workers. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'speed-rpg-tests-')),args=process.argv.slice(2),serial=args.includes('--serial'),requested=args.filter(a=>a!=='--serial');
const files=requested.length?requested:fs.readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).sort().map(f=>path.join('tests',f));
const env={...process.env,DATABASE_PATH:path.join(dir,'game.sqlite')};for(const name of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID','NODE_TEST_CONTEXT'])delete env[name];
const compact=process.env.CI==='true',report=path.resolve('artifacts/test-results.xml');
if(compact)fs.mkdirSync(path.dirname(report),{recursive:true});
try{
 const reporters=compact?['--test-reporter=dot','--test-reporter-destination=stdout','--test-reporter=junit','--test-reporter-destination='+report]:[];
 const result=spawnSync(process.execPath,['--test',...reporters,...serial?['--test-concurrency=1']:[],...files],{env,stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status??1;
 if(compact){const summary={node:process.version,...require('./test-summary28.cjs').parseSummary(fs.readFileSync(report,'utf8')),exitCode:result.status};fs.writeFileSync('artifacts/test-summary.json',JSON.stringify(summary,null,2)+'\n');console.log('\nTEST_SUMMARY '+JSON.stringify(summary));}
}finally{fs.rmSync(dir,{recursive:true,force:true});}
