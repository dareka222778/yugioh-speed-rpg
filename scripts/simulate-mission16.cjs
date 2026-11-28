/** Complete deterministic AI duels, interleaved in one process; no Discord/capacity claim. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'simulate-m16-'));process.env.DATABASE_PATH=path.join(dir,'isolated.sqlite');
for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])delete process.env[key];
const e=require('../dist/duelEngine'),{chooseNPC}=require('../dist/duelStore'),{duelCards,assertDuelState}=require('../dist/duelIntegrity');
const batch=require('../dist/mechanicalBatch16').mechanicalBatch16;
const basic=require('../dist/cardCatalog').starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const deck=[...basic.slice(0,8),...batch.flatMap(c=>[c.id,c.id,c.id]),'89631139','89631139','89631139'];
const identities=s=>duelCards(s).map(c=>c.uid+':'+c.id).sort(),scenarios=[];
try{for(const sessions of [50,100]){
 if(global.gc)global.gc();const start=performance.now(),cpu=process.cpuUsage(),memoryBefore=process.memoryUsage(),latencies=[],seen=Object.fromEntries(batch.map(c=>[c.id,0]));
 const states=Array.from({length:sessions},(_,i)=>e.createDuel([{id:'a',name:'A',cards:deck},{id:'b',name:'B',cards:deck}],undefined,0,{randomSeed:(i+1).toString(16).padStart(64,'0')}));
 const inventories=states.map(identities);let completed=0,moves=0,restores=0,peakRSS=process.memoryUsage.rss();
 for(let round=0;completed<sessions;round++){
  assert.ok(round<1500,'AI simulation stalled');
  for(let i=0;i<states.length;i++){
   let s=states[i];if(s.phase==='finished')continue;
   const actor=s.players[e.decisionPlayer(s)].id,at=performance.now(),action=chooseNPC(s,actor);assert.ok(action,'AI returned no action');
   const p=s.players.find(p=>p.id===actor),source='card'in action?[...p.hand,...p.monsters,...p.backrow].find(c=>c.uid===action.card):undefined;
   if(source&&Object.hasOwn(seen,source.id)&&(action.kind==='spell'||action.kind==='summon'))seen[source.id]++;
   const next=e.step(s,actor,action);
   // Saves are JSON: optional properties explicitly set to undefined are not
   // persisted. Compare every persisted field, not transient property presence.
   if(moves%7===0){assert.deepEqual(JSON.parse(JSON.stringify(e.step(JSON.parse(JSON.stringify(s)),actor,action))),JSON.parse(JSON.stringify(next)));restores++;}
   states[i]=next;assertDuelState(next);assert.deepEqual(identities(next),inventories[i]);
   latencies.push(performance.now()-at);moves++;if(next.phase==='finished')completed++;
   peakRSS=Math.max(peakRSS,process.memoryUsage.rss());
  }
 }
 for(const [id,count]of Object.entries(seen))assert.ok(count>0,'New card never exercised: '+id);
 latencies.sort((a,b)=>a-b);scenarios.push({sessions,completed,moves,restores,seen,elapsedMs:performance.now()-start,cpuMicros:process.cpuUsage(cpu),memoryBefore,memoryAfter:process.memoryUsage(),peakRSS,
  latencyMs:{p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.floor(latencies.length*.95)],max:latencies.at(-1)},cardConservation:true,deterministicRecovery:true});
 }
 const report={node:process.version,engine:require('../dist/resolverArchive').CURRENT_RESOLVER_VERSION,scope:'Full AI 1v1 duels with 50/100 interleaved resident sessions, one process. Timings include decision, step, conservation checks and periodic JSON recovery; no persistence writes, rewards, rendering or Discord latency.',scenarios,capacityCertified:false,liveDiscordCertified:false};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/mission16-ai-simulation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{require('../dist/database').db.close();fs.rmSync(dir,{recursive:true,force:true});}
