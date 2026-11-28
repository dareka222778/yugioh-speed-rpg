#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const suites=['classicTargetReview','historicalImport','classicPersistentReview','classicCardReview','npcStrategy','classicRulesV1','discordFlow','interactions','handFlow','duelIntegrity','classicCounterTraps','classicContinuousEffects','classicQuickMonsters','classicGraveTriggers','classicSummonTriggers','cardEvents','cardText'].map(n=>'tests/'+n+'.test.cjs');
function repeat({attempts=5,output='artifacts/acceptance16',files=suites,concurrent=false,commandArgs}={}){
 if(!Number.isInteger(attempts)||attempts<1||attempts>20)throw Error('Use 1..20 attempts');
 fs.mkdirSync(output,{recursive:true});
 const report={node:process.version,platform:process.platform,arch:process.arch,concurrent,files:files.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})),attempts:[]};
 for(let n=1;n<=attempts;n++){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'repeat-acceptance16-')),tap=path.join(output,`attempt-${n}.tap`),stderr=path.join(output,`attempt-${n}.stderr`);
  const out=fs.openSync(tap,'w'),err=fs.openSync(stderr,'w'),started=Date.now();
  const env={...process.env,DATABASE_PATH:path.join(folder,'game.sqlite'),NODE_TEST_REPORTER:'tap'};
  for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID','NODE_TEST_CONTEXT'])delete env[key];
  let result;
  try{result=spawnSync(process.execPath,commandArgs??['--test','--test-reporter=tap',...concurrent?[]:['--test-concurrency=1'],...files],{env,stdio:['ignore',out,err],timeout:180000});}
  finally{fs.closeSync(out);fs.closeSync(err);fs.rmSync(folder,{recursive:true,force:true});}
  const text=fs.readFileSync(tap,'utf8'),summary={attempt:n,status:result.status,signal:result.signal,elapsedMs:Date.now()-started,tap,stderr,
   pass:Number(/# pass (\d+)/.exec(text)?.[1]??0),fail:Number(/# fail (\d+)/.exec(text)?.[1]??0),error:result.error?.code??null};
  summary.success=summary.status===0&&summary.signal===null&&!summary.error&&summary.pass>0&&/# fail 0\b/.test(text);
  report.attempts.push(summary);report.success=report.attempts.every(a=>a.success);
  // Persist after every subprocess so interrupted sessions keep completed attempts.
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 }
 return report;
}
module.exports={repeat,suites};
if(require.main===module){const r=repeat({attempts:Number(process.argv[2]??5),concurrent:process.argv.includes('--concurrent')});console.log(JSON.stringify(r,null,2));if(!r.success)process.exitCode=1;}
