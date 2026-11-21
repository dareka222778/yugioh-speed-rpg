/** Single-process internal benchmark. No Discord, rendering, SQLite or user-capacity claim. */
const {performance}=require('node:perf_hooks'),fs=require('node:fs'),assert=require('node:assert/strict');
const e=require('../dist/resolverArchive').getArchivedDefinitionResolver('engine-v8'),{starterContents}=require('../dist/cardCatalog');
const {executeDestruction}=require('../dist/resolvers/v8/effectOperations'),{getDestructionModel}=require('../dist/resolvers/v8/effectModels');
const basic=starterContents.warrior.flatMap(c=>Array(c.quantity).fill(c.id));
const machine=require('../dist/effectRegistry').engineCatalog.find(c=>c.monsterType==='normal'&&c.race==='Machine').id;
const model=getDestructionModel({kind:'destroyFiltered',filter:{races:['Machine']}}),scenarios=[];
function game(i){const s=e.createDuel([{id:'a',name:'A',cards:basic},{id:'b',name:'B',cards:basic}],undefined,0,{randomSeed:(i+1).toString(16).padStart(64,'0')});s.turn=3;
 for(let p=0;p<2;p++)s.players[p].monsters=Array.from({length:3},(_,n)=>({uid:'extra-'+p+'-'+n,id:machine,owner:p,faceUp:true,position:'atk',entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0}));return s;}
for(const sessions of [50,100]){
 if(global.gc)global.gc();const before=process.memoryUsage(),cpu=process.cpuUsage(),started=performance.now(),states=Array.from({length:sessions},(_,i)=>game(i)),latencies=[];let destroyed=0;
 for(let round=0;round<10;round++)for(const s of states){const begin=performance.now(),input=JSON.stringify(s),copy=structuredClone(s);
  destroyed+=executeDestruction(copy,0,model,undefined,{kind:'spell',attack:()=>0,destroy:(state,uid)=>{for(const p of state.players){const m=p.monsters.find(m=>m.uid===uid);if(m){p.monsters=p.monsters.filter(m=>m.uid!==uid);state.players[m.owner].grave.push({uid:m.uid,id:m.id});}}}});
  assert.equal(copy.players.flatMap(p=>p.monsters).length,0);const action=e.legalActions(s,'a').find(a=>a.kind==='battle');assert.ok(action);e.step(s,'a',action);assert.equal(JSON.stringify(s),input);latencies.push(performance.now()-begin);
 }
 latencies.sort((a,b)=>a-b);assert.equal(destroyed,sessions*10*6);scenarios.push({sessions,operations:latencies.length,destroyed,latencyMs:{p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.floor(latencies.length*.95)],p99:latencies[Math.floor(latencies.length*.99)],max:latencies.at(-1)},elapsedMs:performance.now()-started,cpuMicros:process.cpuUsage(cpu),memory:{before,after:process.memoryUsage()}});
}
const report={node:process.version,resolver:'engine-v8',scope:'Internal: filtered six-monster mutation with minimal zone service, plus legal actions and a real phase transition; 50/100 interleaved resident fixtures, one process. No trigger/reward/SQLite/render/Discord timing.',hostingReference:{ramBytes:2*1024**3,cpuPercent:100,storageBytes:8*1024**3},gcAvailable:!!global.gc,scenarios,liveDiscordCertified:false,capacityCertified:false};
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/benchmark-v8-candidate15.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
