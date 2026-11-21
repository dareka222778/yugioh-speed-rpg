#!/usr/bin/env node
/** Each REA case selects concrete assertions, not a source-text coverage count. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const matrix=require('../docs/rea-acceptance-cases.json'),root=path.resolve(__dirname,'..');
if(matrix.cases.length!==23||new Set(matrix.cases.map(c=>c.id)).size!==23)throw Error('REA matrix must contain 23 unique scenarios');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rea-acceptance-')),env={...process.env,DATABASE_PATH:path.join(temp,'isolated.sqlite')};for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID','NODE_TEST_CONTEXT'])delete env[key];
let report;
try{
 const cases=matrix.cases.map(c=>{
  const checks=c.checks.map(check=>{
   const result=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern='+check.pattern,check.file],{cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
   const output=result.stdout??'',count=key=>Number(output.match(new RegExp('^# '+key+' (\\d+)','m'))?.[1]??0);
   const passed=count('pass'),todo=count('todo'),failed=count('fail');const ok=!result.error&&result.status===0&&failed===0&&(c.expectedGap?todo>0:passed>0&&todo===0);
   return {...check,ok,passed,todo,failed,exitCode:result.status,error:result.error?.message,...!ok?{output:output.slice(-12000),stderr:result.stderr}: {}};
  });
  return {id:c.id,coverage:c.coverage,expectedGap:c.expectedGap,limitation:c.limitation,status:checks.every(x=>x.ok)?c.expectedGap?'known-gap':'passed':'failed',checks};
 });
 report={kind:'rea-acceptance-results',baselineCommit:matrix.baselineCommit,generatedAt:new Date().toISOString(),node:process.version,cases,totals:{scenarios:cases.length,passed:cases.filter(c=>c.status==='passed').length,knownGaps:cases.filter(c=>c.status==='known-gap').length,failed:cases.filter(c=>c.status==='failed').length,partialCoverage:cases.filter(c=>c.coverage==='partial').length}};
 const out=path.resolve(root,'artifacts/rea-acceptance.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 for(const c of cases)console.log(`${c.id}: ${c.status}${c.coverage==='partial'?' (partial scope)':''}${c.expectedGap?' — '+c.expectedGap:''}`);
 console.log(JSON.stringify(report.totals));console.log('Report: '+out);
 if(report.totals.failed||process.argv.includes('--strict')&&(report.totals.knownGaps||report.totals.partialCoverage))process.exitCode=1;
}finally{fs.rmSync(temp,{recursive:true,force:true});}
