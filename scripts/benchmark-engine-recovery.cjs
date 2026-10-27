#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'engine-benchmark-'));process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');for(const name of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[name];
const e=require('../dist/duelEngine'),t=require('../dist/tagDuel'),{starterContents}=require('../dist/cardCatalog');
const cards=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id)),durations=[],samples=[],maximumSteps=500;
function choose(actions){return actions.find(a=>a.kind==='pass'||a.kind==='choose'||a.kind==='discard')??actions.find(a=>a.kind==='summon')??actions.find(a=>a.kind==='attack')??actions.find(a=>a.kind==='battle')??actions.find(a=>a.kind==='end')??actions[0];}
if(global.gc)global.gc();const memoryBefore=process.memoryUsage();let moves=0;
try{for(const mode of ['1v1','2v2'])for(let game=0;game<30;game++){
 let state=mode==='1v1'?e.createDuel([{id:'a',name:'A',cards},{id:'b',name:'B',cards}],undefined,0,{randomSeed:game.toString(16).padStart(64,'0')}):t.createTagDuel([0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,cards})),{classic:true,first:game%4,seed:'benchmark-'+game}),replay=JSON.parse(JSON.stringify(state));let steps=0;
 while((mode==='1v1'?state.phase:state.core.phase)!=='finished'&&steps++<maximumSteps){
  const started=performance.now(),actor=mode==='1v1'?state.players[e.decisionPlayer(state)].id:t.tagDecisionMember(state).id,action=choose(mode==='1v1'?e.legalActions(state,actor):t.tagActions(state,actor));assert.ok(action);
  state=mode==='1v1'?e.step(state,actor,action):t.stepTagDuel(state,actor,action);durations.push(performance.now()-started);
  replay=mode==='1v1'?e.step(JSON.parse(JSON.stringify(replay)),actor,action):t.stepTagDuel(JSON.parse(JSON.stringify(replay)),actor,action);assert.deepEqual(JSON.parse(JSON.stringify(state)),JSON.parse(JSON.stringify(replay)));moves++;
 }
 assert.ok(steps<maximumSteps,'long game exceeded explicit budget');samples.push({mode,steps,finished:(mode==='1v1'?state.phase:state.core.phase)==='finished'});
}
 if(global.gc)global.gc();const memoryAfter=process.memoryUsage(),sorted=durations.sort((a,b)=>a-b),percentile=p=>sorted[Math.floor((sorted.length-1)*p)];
 const report={scope:'headless legal-action selection and state transition; excludes Discord/network/rendering',node:process.version,games:samples.length,finished:samples.filter(s=>s.finished).length,moves,interruptedReplays:moves,latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:sorted.at(-1),budget:1500},memory:{gcAvailable:!!global.gc,before:memoryBefore,after:memoryAfter,heapDelta:memoryAfter.heapUsed-memoryBefore.heapUsed},samples};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/engine-recovery-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,samples:undefined},null,2));assert.ok(report.latencyMs.max<1500,'engine transition exceeded 1.5s budget');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
